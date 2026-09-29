import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { getProducts } from '@/lib/product';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const produk = req.nextUrl.searchParams.get('produk') || undefined;
    const kategori = req.nextUrl.searchParams.get('kategori') || undefined;
    const page = parseInt(req.nextUrl.searchParams.get('page') || '1', 10);

    const result = await getProducts({ produk, kategori }, page);

    return NextResponse.json(result);
  } catch (e: any) {
    const msg = e?.response?.data || e?.message || 'Gagal mengambil daftar produk';
    logger.error('Product fetch error', { error: msg });
    return NextResponse.json({ status: 'error', message: msg }, { status: 500 });
  }
}
