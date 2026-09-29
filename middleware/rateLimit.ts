import { NextRequest, NextResponse } from 'next/server';
import { sql } from 'drizzle-orm';
import { createHash } from 'crypto';
import { db } from '@/lib/db';

// Limiter per-kredensial, bukan per-IP: di serverless banyak instance berbagi
// satu IP, jadi limiter per-IP praktis tidak menahan apa pun. Disimpan di
// PostgreSQL supaya tetap berlaku lintas instance dan restart.
//
// Key diambil dari api_key (query/header) atau bearer token. Body sengaja TIDAK
// dibaca di sini: Consumption stream-nya akan merusak handler yang butuh body.
function credentialKey(req: NextRequest): string {
  const raw =
    req.nextUrl.searchParams.get('api_key') ||
    req.headers.get('x-api-key') ||
    req.headers.get('authorization') ||
    'anon';
  return createHash('sha256').update(raw).digest('hex').slice(0, 32);
}

export function withRateLimit<T extends any[]>(
  handler: (req: NextRequest, ...args: T) => Promise<NextResponse>,
  limit = 60,
  windowMs = 60_000
) {
  return async (req: NextRequest, ...args: T): Promise<NextResponse> => {
    const key = credentialKey(req);
    try {
      // Satu statement: catat hit, sekalian bersihkan bucket lama. Kalau bucket
      // belum ada, insert; kalau ada, count naik dan RETURNING yang baru.
      const rows = await db.execute(sql`
        WITH win AS (
          SELECT to_timestamp(
            floor(extract(epoch from now()) * 1000 / ${windowMs}) * ${windowMs} / 1000
          ) AS start
        ),
        hit AS (
          INSERT INTO rate_limit_buckets (key, window_start, count)
          SELECT ${key}, start, 1 FROM win
          ON CONFLICT (key, window_start) DO UPDATE SET count = rate_limit_buckets.count + 1
          RETURNING count
        ),
        purge AS (
          DELETE FROM rate_limit_buckets
          WHERE window_start < (SELECT start FROM win) - interval '1 hour'
        )
        SELECT (SELECT count FROM hit) AS count
      `);
      const count = Number((rows as unknown as { rows?: { count: number | string }[] }).rows?.[0]?.count ?? 0);
      if (count > limit) {
        return NextResponse.json(
          { status: 'error', message: 'Too many requests. Coba lagi nanti.' },
          { status: 429 }
        );
      }
    } catch (e: any) {
      // Limiter tidak boleh mematikan pembayaran: database yang sedang tidak
      // bisa dijangkau lebih baik request lewat daripada order tidak bisa dibuat.
      console.error('[ratelimit] gagal, request diizinkan:', e?.message);
    }
    return handler(req, ...args);
  };
}
