-- Jalankan di Neon SQL Editor, atau via: npm run db:push
-- Baseline. Setelah file ini, JALANKAN 0001_settlement_dedupe.sql juga
-- (sisa statement di file ini sengaja tidak diubah agar DB lama tidak perlu
-- di-reset; semua statement 0001 aman diulang).

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  telegram_id VARCHAR(50) UNIQUE NOT NULL,
  balance NUMERIC(15,2) DEFAULT 0 NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS merchants (
  merchant_code VARCHAR(50) PRIMARY KEY,
  api_key TEXT NOT NULL,
  callback_secret VARCHAR(64) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_merchants_callback_secret ON merchants(callback_secret);

CREATE TABLE IF NOT EXISTS transactions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  merchant_code VARCHAR(50) REFERENCES merchants(merchant_code) ON DELETE CASCADE NOT NULL,
  amount NUMERIC(15,2) NOT NULL,
  description TEXT,
  qr_string TEXT NOT NULL,
  qr_image_url TEXT NOT NULL,
  refid VARCHAR(100),
  status VARCHAR(20) DEFAULT 'pending' NOT NULL,
  expired_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  settled_at TIMESTAMPTZ,
  retry_count INTEGER DEFAULT 0 NOT NULL,
  last_check_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_transactions_pending ON transactions(status, created_at);
CREATE INDEX IF NOT EXISTS idx_transactions_merchant_pending ON transactions(merchant_code, status, amount);
CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_refid ON transactions(refid);
