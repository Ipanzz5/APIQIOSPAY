import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { merchants } from '@/lib/schema';
import { settleTransaction } from '@/lib/settlement';
import { eventFingerprint, minuteFromCallback } from '@/lib/qrisMatch';
import { logger } from '@/lib/logger';

export const runtime = 'nodejs';

// URL format: /api/callback/accept/{merchant_code}.{callback_secret}
// Didaftarkan ke dashboard Qiospay. Dipanggil otomatis real-time saat dana masuk.

function safeCompare(a: string, b: string): boolean {
  const maxLen = Math.max(a.length, b.length, 1);
  const bufA = Buffer.alloc(maxLen); Buffer.from(a).copy(bufA);
  const bufB = Buffer.alloc(maxLen); Buffer.from(b).copy(bufB);
  return timingSafeEqual(bufA, bufB) && a.length === b.length;
}

function parseTime(time?: string): Date {
  if (!time) return new Date();
  const m = time.match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})$/);
  if (!m) return new Date();
  return new Date(`${m[3]}-${m[2]}-${m[1]}T${m[4]}:${m[5]}:00`);
}

export async function POST(req: NextRequest, { params }: { params: { secret: string } }) {
  try {
    const raw = params.secret || '';
    const dot = raw.indexOf('.');
    if (dot === -1) {
      return NextResponse.json({ status: 'reject', message: 'Format URL salah (harus {merchant_code}.{secret})' }, { status: 400 });
    }
    const merchantCode = raw.substring(0, dot);
    const providedSecret = raw.substring(dot + 1);

    const rows = await db.select().from(merchants).where(eq(merchants.merchantCode, merchantCode)).limit(1);
    if (!rows.length || !safeCompare(providedSecret, rows[0].callbackSecret)) {
      logger.warn('Callback rejected: invalid secret', { merchantCode });
      return NextResponse.json({ status: 'reject', message: 'Invalid secret' }, { status: 403 });
    }

    const json = await req.json().catch(() => null) as any;
    const d = json?.data;

    if (!d?.amount || d.type !== 'CR') {
      logger.info('Callback skipped (not CR or empty)', { merchantCode });
      return NextResponse.json({ status: 'accept', message: 'Skipped', data: null });
    }

    const amount = typeof d.amount === 'string' ? parseFloat(d.amount) : Number(d.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      // Amount rusak akan jadi parameter ke SQL numerik; tolak di sini.
      logger.warn('Callback ditolak: amount tidak valid', { merchantCode, amount: d.amount });
      return NextResponse.json({ status: 'reject', message: 'Invalid amount' }, { status: 400 });
    }
    const refid = String(d.refid || `CB_${merchantCode}_${Date.now()}`);
    // Fingerprint menempel ke mutasi: satu pembayaran yang callback-nya diproses
    // lalu muncul lagi di /api/mutasi hanya di-settle sekali.
    const fingerprint = eventFingerprint(merchantCode, amount, minuteFromCallback(d.time));
    const result = await settleTransaction(merchantCode, amount, refid, parseTime(d.time), fingerprint);

    logger.info('Callback processed', { merchantCode, settled: result.settled, amount, refid, fingerprint });
    return NextResponse.json({
      status: 'accept',
      message: 'Data received successfully',
      data: { name: d.name, nmid: d.nmid, amount: d.amount, type: d.type, refid: d.refid, issuer: d.issuer, time: d.time },
    });
  } catch (e: any) {
    logger.error('Callback error', { error: e?.message, cause: e?.cause?.message });
    // Tetap balas 'accept' agar Qiospay tidak retry berlebihan — kegagalan
    // settlement akan ditangkap polling /api/mutasi berikutnya sebagai fallback
    return NextResponse.json({ status: 'accept', message: 'Received, processing deferred' });
  }
}
