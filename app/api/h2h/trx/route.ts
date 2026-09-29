import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { logger } from '@/lib/logger';
import { sendH2HTransaction, generateH2HSignature } from '@/lib/h2h';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const schema = z.object({
  product: z.string().min(1, 'product wajib diisi (contoh: sp2)'),
  dest: z.string().min(1, 'dest wajib diisi (nomor HP / ID pelanggan)'),
  refID: z.string().min(1, 'refID wajib diisi').max(20, 'refID maksimal 20 karakter'),
  memberID: z.string().optional(),
  pin: z.string().optional(),
  password: z.string().optional(),
  sign: z.string().optional(),
  harga_max: z.coerce.number().positive().optional(),
});

export async function GET(req: NextRequest) {
  try {
    const parsed = schema.safeParse({
      product: req.nextUrl.searchParams.get('product'),
      dest: req.nextUrl.searchParams.get('dest'),
      refID: req.nextUrl.searchParams.get('refID'),
      memberID: req.nextUrl.searchParams.get('memberID'),
      pin: req.nextUrl.searchParams.get('pin'),
      password: req.nextUrl.searchParams.get('password'),
      sign: req.nextUrl.searchParams.get('sign'),
      harga_max: req.nextUrl.searchParams.get('harga_max') || undefined,
    });

    if (!parsed.success) {
      return NextResponse.json(
        { status: 'error', message: 'Validasi gagal', errors: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    const result = await sendH2HTransaction(parsed.data);

    logger.info('H2H transaction sent', { refID: parsed.data.refID, product: parsed.data.product, dest: parsed.data.dest });

    return NextResponse.json({ status: 'success', data: result });
  } catch (e: any) {
    const msg = e?.response?.data || e?.message || 'Gagal mengirim transaksi H2H';
    logger.error('H2H transaction error', { error: msg });
    return NextResponse.json({ status: 'error', message: msg }, { status: 500 });
  }
}
