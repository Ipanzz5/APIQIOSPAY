import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { sql } from 'drizzle-orm';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const t = Date.now();
    await db.execute(sql`SELECT 1`);
    return NextResponse.json({ status: 'healthy', db_latency_ms: Date.now() - t, uptime_s: process.uptime(), timestamp: new Date().toISOString() });
  } catch (e: any) {
    return NextResponse.json({ status: 'unhealthy', error: e?.message }, { status: 500 });
  }
}
