import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { transactions } from '@/lib/schema';
import { withAuth } from '@/middleware/auth';
import { withRateLimit } from '@/middleware/rateLimit';

export const runtime = 'nodejs';

async function handler(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const [trx] = await db.select({
      id: transactions.id,
      status: transactions.status,
      amount: transactions.amount,
    }).from(transactions).where(eq(transactions.id, params.id)).limit(1);

    if (!trx) {
      return NextResponse.json({ status: 'error', message: 'Transaksi tidak ditemukan' }, { status: 404 });
    }

    return NextResponse.json({ status: 'success', data: trx });
  } catch {
    return NextResponse.json({ status: 'error', message: 'Internal server error' }, { status: 500 });
  }
}

export const GET = withAuth(withRateLimit(handler, 60, 60_000));
