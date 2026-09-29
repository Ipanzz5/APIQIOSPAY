import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';

export const runtime = 'nodejs';

const MEMBER_ID = process.env.QIOSPAY_MEMBER_ID || '';
const PIN = process.env.QIOSPAY_PIN || '';
const PASSWORD = process.env.QIOSPAY_PASSWORD || '';

export async function POST(req: NextRequest) {
  try {
    const contentType = req.headers.get('content-type') || '';
    let data: Record<string, any>;

    if (contentType.includes('application/json')) {
      data = await req.json().catch(() => ({}));
    } else {
      const form = await req.formData().catch(() => new FormData());
      data = Object.fromEntries(form.entries());
    }

    const product = data.product || data.produk || '';
    const dest = data.dest || data.tujuan || '';
    const refID = data.refID || data.ref_id || '';
    const status = data.status || data.message || '';

    logger.info('H2H callback received', { product, dest, refID, status, raw: data });

    return NextResponse.json({ status: 'accept', message: 'OK' });
  } catch (e: any) {
    logger.error('H2H callback error', { error: e.message });
    return NextResponse.json({ status: 'accept', message: 'Received' });
  }
}

export async function GET(req: NextRequest) {
  try {
    const data = Object.fromEntries(req.nextUrl.searchParams.entries());
    const { product, dest, refID, status } = data;

    logger.info('H2H callback received (GET)', { product, dest, refID, status, raw: data });

    return NextResponse.json({ status: 'accept', message: 'OK' });
  } catch (e: any) {
    logger.error('H2H callback GET error', { error: e.message });
    return NextResponse.json({ status: 'accept', message: 'Received' });
  }
}
