// Helper murni untuk mencocokkan event pembayaran (callback & mutasi) ke transaksi.
// Tanpa import apa pun supaya bisa diuji tanpa database.

/** Ringkas amount ke 2 desimal agar cocok dengan kolom numeric(15,2). */
export function amountKey(v: unknown): string {
  const n = Number(v);
  return Number.isFinite(n) ? n.toFixed(2) : '';
}

/** Epoch-menit stabil dari komponen jam dinding. Komponen dibaca apa adanya,
 *  jadi tidak bergantung timezone server (mutasi & callback sama-sama jam WIB). */
export function wibMinute(y: number, mo: number, d: number, h: number, mi: number): number {
  return Math.floor(Date.UTC(y, mo - 1, d, h, mi) / 60000);
}

/** `2026-07-09 11:05:00` (mutasi) -> epoch-menit. */
export function minuteFromMutasi(s: string | null | undefined): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/.exec(String(s || ''));
  return m ? wibMinute(+m[1], +m[2], +m[3], +m[4], +m[5]) : null;
}

/** `09/07/2026 11:05` (callback) -> epoch-menit. */
export function minuteFromCallback(s: string | null | undefined): number | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})[ T](\d{2}):(\d{2})/.exec(String(s || ''));
  return m ? wibMinute(+m[3], +m[2], +m[1], +m[4], +m[5]) : null;
}

// ponytail: fingerprint per menit bisa menabrak dua pembayaran sah dengan nominal
// sama pada menit yang sama (satu jadi kurang credit, perlu /addakses manual).
// Naikkan ke id provider sendiri begitu mutasi menyediakan nmid.
export function eventFingerprint(
  merchantCode: string,
  amount: unknown,
  minute: number | null
): string | null {
  if (minute == null || !merchantCode) return null;
  const amt = amountKey(amount);
  return amt ? `${merchantCode}|${amt}|${minute}` : null;
}

/** Ambil kandidat id Telegram dari referensi yang diketik payer.
 *  Id Telegram tidak pernah diawali nol, jadi nomor telepon dibuang. */
export function telegramFromRef(ref: string | null | undefined): string | null {
  if (!ref) return null;
  for (const token of String(ref).split(/[_\s,;|/\\-]+/)) {
    if (/^[1-9]\d{4,14}$/.test(token)) return token;
  }
  return null;
}
