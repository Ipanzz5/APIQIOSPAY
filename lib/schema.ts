import {
  pgTable, serial, varchar, numeric, text,
  timestamp, uuid, integer, boolean, primaryKey, uniqueIndex, index,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  telegramId: varchar('telegram_id', { length: 50 }).notNull(),
  balance: numeric('balance', { precision: 15, scale: 2 }).notNull().default('0'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  telegramIdx: uniqueIndex('idx_users_telegram_id').on(t.telegramId),
}));

/**
 * Satu baris per Merchant Code Qiospay. Dibuat otomatis saat merchant_code pertama
 * kali muncul di POST /api/qris/create. callback_secret di-generate server, dipakai
 * sebagai bagian URL callback unik agar settlement tidak tertukar antar-merchant.
 */
export const merchants = pgTable('merchants', {
  merchantCode: varchar('merchant_code', { length: 50 }).primaryKey(),
  apiKey: text('api_key').notNull(),
  callbackSecret: varchar('callback_secret', { length: 64 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  secretIdx: uniqueIndex('idx_merchants_callback_secret').on(t.callbackSecret),
}));

/**
 * Bucket fixed-window untuk rate limit. Bertahan di restart & multi-instance
 * (serverless Vercel bisa menyalakan banyak instance), jadi limiter tidak bisa
 * di-bypass dengan memicu instance baru.
 */
export const rateLimitBuckets = pgTable('rate_limit_buckets', {
  key: varchar('key', { length: 200 }).notNull(),
  windowStart: timestamp('window_start', { withTimezone: true }).notNull(),
  count: integer('count').notNull().default(0),
}, (t) => ({
  pk: primaryKey({ columns: [t.key, t.windowStart] }),
  windowIdx: index('idx_rate_limit_window').on(t.windowStart),
}));

export const transactions = pgTable('transactions', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  userId: integer('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  merchantCode: varchar('merchant_code', { length: 50 })
    .references(() => merchants.merchantCode, { onDelete: 'cascade' })
    .notNull(),
  amount: numeric('amount', { precision: 15, scale: 2 }).notNull(),
  description: text('description'),
  qrString: text('qr_string').notNull(),
  qrImageUrl: text('qr_image_url').notNull(),
  refid: varchar('refid', { length: 100 }),
  // Jejak event pembayaran (merchant + nominal + menit, lihat lib/qrisMatch.ts).
  // UNIQUE: satu event hanya boleh men-settle satu transaksi. NULL = event tanpa
  // fingerprint (waktu tidak terparse), jadi tidak ikut didedupe.
  providerFingerprint: varchar('provider_fingerprint', { length: 120 }),
  // false = order bot Telegram; akses diberikan bot, jadi saldo TIDAK ikut naik.
  // Default true supaya baris lama (topup web) tetap benar saat migrasi.
  creditBalance: boolean('credit_balance').notNull().default(true),
  status: varchar('status', { length: 20 }).notNull().default('pending'),
  expiredAt: timestamp('expired_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  settledAt: timestamp('settled_at', { withTimezone: true }),
  retryCount: integer('retry_count').notNull().default(0),
  lastCheckAt: timestamp('last_check_at', { withTimezone: true }),
}, (t) => ({
  pendingIdx: index('idx_transactions_pending').on(t.status, t.createdAt),
  merchantPendingIdx: index('idx_transactions_merchant_pending').on(t.merchantCode, t.status, t.amount),
  // refid dipakai untuk audit saja: nilainya bisa sama antar pembayaran
  // (fallback berbasis nominal+waktu), jadi TIDAK boleh unique.
  refidIdx: index('idx_transactions_refid').on(t.refid),
  fingerprintIdx: uniqueIndex('idx_transactions_fingerprint').on(t.providerFingerprint),
}));
