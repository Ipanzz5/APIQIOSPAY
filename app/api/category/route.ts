import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { getCategories } from '@/lib/product';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  try {
    const page = parseInt(req.nextUrl.searchParams.get('page') || '1', 10);
    const maxPages = parseInt(req.nextUrl.searchParams.get('max_pages') || '5', 10);
    const result = await getCategories(page, maxPages);
    return NextResponse.json(result);
  } catch (e: any) {
    const msg = e?.response?.data || e?.message || 'Gagal mengambil daftar kategori';
    logger.error('Category fetch error', { error: msg });
    return NextResponse.json({ status: 'error', message: msg }, { status: 500 });
  }
}
