import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { transactions } from '@/lib/schema';
import { logger } from '@/lib/logger';
import { withAuth } from '@/middleware/auth';
import { withRateLimit } from '@/middleware/rateLimit';

export const runtime = 'nodejs';

const schema = z.object({
  id: z.string().uuid('ID transaksi tidak valid'),
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

    const { id } = parsed.data;

    const [trx] = await db.update(transactions)
      .set({ status: 'cancelled' })
      .where(eq(transactions.id, id))
      .returning({ id: transactions.id, status: transactions.status });

    if (!trx) {
      return NextResponse.json({ status: 'error', message: 'Transaksi tidak ditemukan' }, { status: 404 });
    }

    logger.info('Transaction cancelled', { transaction_id: id });

    return NextResponse.json({
      status: 'success',
      data: { id: trx.id, status: trx.status },
    });
  } catch (e: any) {
    logger.error('Cancel QRIS error', { error: e?.message });
    return NextResponse.json({ status: 'error', message: 'Internal server error' }, { status: 500 });
  }
}

export const PATCH = withAuth(withRateLimit(handler, 20, 60_000));
