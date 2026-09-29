-- 0001: anti double-credit lintas sumber (callback + mutasi)
-- Jalankan di Neon SQL Editor, atau otomatis via `npm run db:push`
-- Semua statement IF NOT EXISTS -> aman dijalankan di DB lama maupun DB baru.

-- 1. Jejak event di transaksi. UNIQUE adalah penahan double-credit: satu event
--    hanya boleh men-settle satu transaksi. Ditulis HANYA pada transaksi yang
--    benar-benar ter-settle, jadi event yang tidak match order apa pun tidak
--    meninggalkan jejak dan masih bisa dicoba lagi lewat mutasi.
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS provider_fingerprint VARCHAR(120);
CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_fingerprint
  ON transactions(provider_fingerprint);

-- 2. false = order bot Telegram: akses diberikan bot, saldo TIDAK ikut naik.
--    Default TRUE supaya baris lama (topup web) tetap benar.
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS credit_balance BOOLEAN DEFAULT TRUE NOT NULL;

-- 3. Bucket rate limit. Di serverless banyak instance berbagi satu IP, jadi
--    limiter per-IP praktis tidak menahan apa pun; ini bertahan di database
--    sehingga berlaku lintas instance dan restart. Baris lama dibersihkan
--    oleh statement yang sama di middleware/rateLimit.ts.
CREATE TABLE IF NOT EXISTS rate_limit_buckets (
  key VARCHAR(200) NOT NULL,
  window_start TIMESTAMPTZ NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (key, window_start)
);
CREATE INDEX IF NOT EXISTS idx_rate_limit_window ON rate_limit_buckets(window_start);

-- 4. refid turun dari UNIQUE ke index biasa. Nilainya bisa sama antar
--    pembayaran (fallback MUT_<merchant>_<tanggal>_<nominal> memakai nominal +
--    tanggal), jadi UNIQUE di sini justru bisa menggagalkan pembayaran sah.
--    Peran anti-duplikat pindah ke idx_transactions_fingerprint (langkah 1).
DROP INDEX IF EXISTS idx_transactions_refid;
CREATE INDEX IF NOT EXISTS idx_transactions_refid ON transactions(refid);
