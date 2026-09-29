import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { fetchWithRetry } from '@/lib/retry';
import { logger } from '@/lib/logger';
import { amountKey, eventFingerprint, minuteFromMutasi, telegramFromRef } from '@/lib/qrisMatch';

interface QiospayMut {
  date: string; amount: string; type: 'CR' | 'DB';
  issuer_reff?: string; buyer_reff?: string;
}

export interface SettleResult {
  settled: boolean;
  transactionId?: string;
  duplicate?: boolean;
}

// Fingerprint yang sudah dilaporkan. Dibatasi supaya tidak tumbuh terus; batas
// 20 cukup karena yang perlu diperhatikan owner cuma order yatim terbaru.
const warned = new Set<string>();
const WARNED_MAX = 20;
function remember(fingerprint: string) {
  warned.add(fingerprint);
  if (warned.size > WARNED_MAX) warned.delete(warned.values().next().value as string);
}

/**
 * Satu statement: pilih transaksi pending paling lama yang cocok (dikonstrain user
 * bila referensi payer memuat id Telegram), tandai sukses, dan kredit saldo HANYA
 * untuk topup web — semuanya atomik.
 *
 * Anti double-credit: fingerprint hanya ditulis ke transaksi yang BENAR-BENAR
 * di-settle (kolom provider_fingerprint, unique), jadi event yang tidak match
 * order apa pun tidak meninggalkan jejak dan masih bisa dicoba lagi lewat mutasi.
 * Dua request dengan event sama yang datang bersamaan tidak bisa dua-duanya lulus:
 * yang kedua menabrak unique index, seluruh statement-nya (termasuk kredit saldo)
 * rollback dan dilaporkan sebagai duplikat. Berbeda dengan membaca snapshot,
 * yang bisa membiarkan keduanya lolos.
 */
export async function settleTransaction(
  merchantCode: string, amount: number, refid: string, settledAt: Date, fingerprint: string | null
): Promise<SettleResult> {
  const now = new Date();
  const amountStr = amountKey(amount);
  const telegramId = telegramFromRef(refid);

  let res;
  try {
    res = await db.execute(sql`
      WITH target_user AS (
        SELECT id FROM users
        WHERE ${telegramId}::text IS NOT NULL
          AND telegram_id = ${telegramId}
          AND NOT starts_with(telegram_id, 'web_')
        LIMIT 1
      ),
      candidate AS (
        SELECT t.id
        FROM transactions t
        WHERE t.merchant_code = ${merchantCode}
          AND t.amount = ${amountStr}
          AND t.status = 'pending'
          AND (t.expired_at IS NULL OR t.expired_at > ${now.toISOString()})
          AND t.created_at <= (${settledAt.toISOString()}::timestamptz + INTERVAL '3 minutes')
          AND ${settledAt.toISOString()}::timestamptz >= (t.created_at - INTERVAL '3 minutes')
          AND (
            NOT EXISTS (SELECT 1 FROM target_user)
            OR t.user_id = (SELECT id FROM target_user)
          )
          AND NOT EXISTS (
            SELECT 1 FROM transactions x
            WHERE x.provider_fingerprint = ${fingerprint}
          )
        ORDER BY t.created_at ASC
        LIMIT 1
        FOR UPDATE SKIP LOCKED
      ),
      claimed AS (
        UPDATE transactions t
           SET status = 'success',
               settled_at = ${settledAt},
               refid = ${refid},
               provider_fingerprint = ${fingerprint},
               last_check_at = ${now.toISOString()}
          FROM candidate c
         WHERE t.id = c.id
        RETURNING t.id, t.user_id, t.amount, t.credit_balance
      ),
      credited AS (
        UPDATE users u
           SET balance = u.balance + c.amount
          FROM claimed c
         WHERE u.id = c.user_id
           AND c.credit_balance
        RETURNING u.id
      )
      SELECT
        (SELECT id FROM claimed) AS id,
        (SELECT count(*) FROM credited) AS credited,
        EXISTS (
          SELECT 1 FROM transactions x
          WHERE x.provider_fingerprint = ${fingerprint}
        ) AS dup
    `);
  } catch (e: any) {
    // 23505 di statement ini pasti dari idx_transactions_fingerprint: tidak ada
    // kolom unik lain yang ditulis. Event-nya sudah dipakai request lain.
    const cause = e?.cause ?? e;
    const msg = String(cause?.message ?? e?.message ?? '');
    if (cause?.code === '23505' || /idx_transactions_fingerprint/.test(msg)) {
      if (!warned.has(fingerprint ?? '')) {
        remember(fingerprint ?? '');
        logger.info('Event duplikat diabaikan', { merchant_code: merchantCode, amount, fingerprint, reason: 'fingerprint terpakai' });
      }
      return { settled: false, duplicate: true };
    }
    throw e;
  }

  // Raw SQL tidak punya tipe kolom dari Drizzle, jadi bentuk barisnya
  // dideklarasikan manual di satu tempat ini.
  const row = (res as unknown as { rows?: { id: string | null; credited: number; dup: boolean }[] })
    .rows?.[0];

  if (!row?.id) {
    if (fingerprint) {
      // Event yang sama dipoll ulang tiap 3 detik, jadi log cukup SEKALI per
      // fingerprint: kalau tidak, satu order yatim membanjiri log selamanya.
      if (!warned.has(fingerprint)) {
        remember(fingerprint);
        const ctx = { merchant_code: merchantCode, amount, refid, fingerprint, telegram_id: telegramId };
        if (row?.dup) {
          // Sudah pernah di-settle -> normal, bot hanya perlu baca status.
          logger.info('Event duplikat diabaikan', { ...ctx, reason: 'sudah pernah di-settle' });
        } else {
          // Uang masuk tapi tidak ada order pending yang cocok (mis. order sudah
          // kadaluarsa). Akses HARUS diberikan manual — jangan diamkan.
          logger.error('Pembayaran tidak menemukan order pending', ctx);
        }
      }
    }
    return { settled: false, duplicate: row?.dup === true };
  }

  logger.info('Transaction settled', {
    transaction_id: row.id, merchant_code: merchantCode, amount, refid, fingerprint,
    balance_credited: row.credited > 0, telegram_scope: telegramId,
  });
  return { settled: true, transactionId: row.id };
}

/** Fingerprint bersama untuk callback & mutasi supaya event yang sama dihitung sekali. */
export function mutasiFingerprint(merchantCode: string, amount: unknown, date: string): string | null {
  return eventFingerprint(merchantCode, amount, minuteFromMutasi(date));
}

export async function checkAndSettle(merchantCode: string, apiKey: string): Promise<{ synced: number; data: QiospayMut[] }> {
  const url = `https://qiospay.id/api/mutasi/qris/${merchantCode}/${apiKey}`;
  const res = await fetchWithRetry<{ status: string; data?: QiospayMut[]; message?: string }>(url, {}, 3);

  if (res.status !== 'success') return { synced: 0, data: [] };

  const muts = res.data || [];
  let synced = 0;
  for (const m of muts) {
    if (m.type !== 'CR') continue;
    const amount = parseFloat(m.amount);
    if (!Number.isFinite(amount) || amount <= 0) continue;
    const refid = m.issuer_reff || m.buyer_reff
      ? `${m.issuer_reff || ''}_${m.buyer_reff || ''}`.replace(/^_|_$/g, '')
      : `MUT_${merchantCode}_${m.date}_${m.amount}`;
    const r = await settleTransaction(
      merchantCode, amount, refid, new Date(m.date.replace(' ', 'T')),
      mutasiFingerprint(merchantCode, amount, m.date)
    );
    if (r.settled) synced++;
  }
  return { synced, data: muts };
}
