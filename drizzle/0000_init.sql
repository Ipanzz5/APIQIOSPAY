-- Jalankan file ini di Neon SQL Editor, atau otomatis via `npm run db:push`

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  telegram_id VARCHAR(20) UNIQUE NOT NULL,
  balance NUMERIC(15,2) DEFAULT 0 NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_users_telegram_id ON users(telegram_id);

CREATE TABLE IF NOT EXISTS transactions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE NOT NULL,
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

CREATE INDEX IF NOT EXISTS idx_transactions_pending_realtime
  ON transactions(status, created_at) WHERE status = 'pending';

-- unique agar 1 refid dari callback Qiospay tidak bisa dipakai dua kali (anti double-credit)
CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_refid ON transactions(refid);
