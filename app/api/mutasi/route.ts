import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { desc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { transactions } from '@/lib/schema';
import { logger } from '@/lib/logger';
import { withAuth } from '@/middleware/auth';
import { withRateLimit } from '@/middleware/rateLimit';
import { checkAndSettle } from '@/lib/settlement';

export const runtime = 'nodejs';

const schema = z.object({
  merchant_code: z.string().min(3).max(50),
  api_key:       z.string().min(10),
});

async function handler(req: NextRequest) {
  const t0 = Date.now();
  try {
    const parsed = schema.safeParse({
      merchant_code: req.nextUrl.searchParams.get('merchant_code'),
      api_key:       req.nextUrl.searchParams.get('api_key'),
    });
    if (!parsed.success) {
      return NextResponse.json(
        { status: 'error', message: 'merchant_code dan api_key wajib sebagai query parameter', errors: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { merchant_code, api_key } = parsed.data;
    const { synced, data } = await checkAndSettle(merchant_code, api_key);

    // Status transaksi terbaru milik merchant ini (pending IKUT disertakan —
    // kalau tidak, bot tetap harus cek tiap order satu-satu). Bot.poll cukup
    // satu panggilan per siklus, bukan satu per order.
    const orders = await db
      .select({
        id: transactions.id,
        status: transactions.status,
        amount: transactions.amount,
        settled_at: transactions.settledAt,
      })
      .from(transactions)
      .where(eq(transactions.merchantCode, merchant_code))
      .orderBy(desc(transactions.createdAt))
      .limit(50);

    return NextResponse.json({ status: 'success', data, synced, orders, timestamp: new Date().toISOString(), duration_ms: Date.now() - t0 });
  } catch (e: any) {
    logger.error('Mutasi error', { error: e?.message, cause: e?.cause?.message });
    return NextResponse.json({ status: 'error', message: e?.message || 'Gagal mengambil mutasi' }, { status: 500 });
  }
}

export const GET = withAuth(withRateLimit(handler, 60, 60_000));
