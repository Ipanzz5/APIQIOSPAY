import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { randomBytes } from 'crypto';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { users, merchants, transactions } from '@/lib/schema';
import { generateQRISString } from '@/lib/qrGenerator';
import { generateQRBuffer, generateQRDataUrl } from '@/lib/qrCode';
import { uploadImage } from '@/lib/imageUploader';
import { logger } from '@/lib/logger';
import { withAuth } from '@/middleware/auth';
import { withRateLimit } from '@/middleware/rateLimit';

export const runtime = 'nodejs';

const schema = z.object({
  merchant_code: z.string().min(3, 'merchant_code minimal 3 karakter').max(50),
  api_key:       z.string().min(10, 'api_key minimal 10 karakter'),
  qris_static:   z.string().min(20, 'qris_static terlalu pendek'),
  amount:        z.coerce.number({ required_error: 'amount wajib diisi' }).positive().max(10_000_000),
  description:   z.string().max(200).optional(),
  telegram_id:   z.string().regex(/^\d+$/, 'telegram_id harus angka').max(30).optional(),
});

async function handler(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { status: 'error', message: 'Validasi gagal', errors: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { merchant_code, api_key, qris_static, amount, description, telegram_id } = parsed.data;

    // Upsert merchant — buat baru dengan callback_secret unik, atau update api_key
    const existing = await db.select().from(merchants).where(eq(merchants.merchantCode, merchant_code)).limit(1);
    let callbackSecret: string;
    if (existing.length === 0) {
      callbackSecret = randomBytes(16).toString('hex');
      await db.insert(merchants).values({ merchantCode: merchant_code, apiKey: api_key, callbackSecret });
      logger.info('New merchant registered', { merchant_code });
    } else {
      callbackSecret = existing[0].callbackSecret;
      if (existing[0].apiKey !== api_key) {
        await db.update(merchants).set({ apiKey: api_key, updatedAt: new Date() })
          .where(eq(merchants.merchantCode, merchant_code));
      }
    }

    // Upsert user berdasarkan telegram_id (atau identifier web sintetis)
    const tid = telegram_id || `web_${merchant_code}`;
    const existingUser = await db.select().from(users).where(eq(users.telegramId, tid)).limit(1);
    let userId: number;
    if (existingUser.length === 0) {
      const created = await db.insert(users).values({ telegramId: tid }).returning({ id: users.id });
      userId = created[0].id;
    } else {
      userId = existingUser[0].id;
    }

    // Generate QRIS + inline data URL + upload gambar
    const qrString = generateQRISString(amount, qris_static);
    const [qrDataUrl, qrBuffer] = await Promise.all([
      generateQRDataUrl(qrString),
      generateQRBuffer(qrString),
    ]);
    let qrImageUrl: string;
    try {
      qrImageUrl = await uploadImage(qrBuffer, `qris_${Date.now()}_${merchant_code}.png`);
    } catch {
      qrImageUrl = qrDataUrl;
    }

    // Order bot Telegram (ada telegram_id) GRANT-nya dilakukan bot dari sisi
    // sana, jadi saldo TIDAK boleh ikut naik di sini. Order tanpa telegram_id
    // = topup web, itu yang memang harus menambah saldo.
    const isBotOrder = Boolean(telegram_id);
    const expiredAt = new Date(Date.now() + 15 * 60 * 1000);
    const [trx] = await db.insert(transactions).values({
      userId,
      merchantCode: merchant_code,
      amount: amount.toFixed(2),
      description: description || (isBotOrder ? 'Akses bot Telegram' : 'Topup saldo'),
      qrString,
      qrImageUrl,
      status: 'pending',
      expiredAt,
      creditBalance: !isBotOrder,
    }).returning();

    logger.info('QRIS created', {
      transaction_id: trx.id, merchant_code, amount, is_bot_order: isBotOrder,
    });

    return NextResponse.json({
      status: 'success',
      data: {
        id: trx.id,
        merchant_code,
        amount: trx.amount,
        qr_image_url: trx.qrImageUrl,
        qr_data_url: qrDataUrl,
        qr_string: trx.qrString,
        status: trx.status,
        created_at: trx.createdAt,
        expired_at: trx.expiredAt,
        // Daftarkan URL ini ke dashboard Qiospay (cukup sekali per merchant_code)
        callback_url_to_register: `${req.nextUrl.origin}/api/callback/accept/${merchant_code}.${callbackSecret}`,
      },
    });
  } catch (e: any) {
    const msg = e?.message || '';
    logger.error('Create QRIS error', { error: msg, cause: e?.cause?.message });
    if (/Failed query/i.test(msg)) {
      return NextResponse.json({ status: 'error', message: 'Database gagal diakses. Pastikan DATABASE_URL sudah benar di Environment Variables Vercel dan database sudah di-initialize (npm run db:push).' }, { status: 503 });
    }
    return NextResponse.json({ status: 'error', message: 'Internal server error' }, { status: 500 });
  }
}

export const POST = withAuth(withRateLimit(handler, 20, 60_000));
