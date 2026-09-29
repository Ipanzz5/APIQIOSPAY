// CRC16-CCITT (False): poly 0x1021, init 0xFFFF — sesuai spesifikasi QRIS EMVCo
function crc16ccitt(str: string): string {
  let crc = 0xffff;
  for (let i = 0; i < str.length; i++) {
    crc ^= str.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) : (crc << 1);
      crc &= 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

function buildTag(tag: string, value: string): string {
  return `${tag}${String(value.length).padStart(2, '0')}${value}`;
}

function findTag(payload: string, tag: string): { value: string; start: number; end: number } | null {
  let i = 0;
  while (i < payload.length - 4) {
    const t = payload.substring(i, i + 2);
    const len = parseInt(payload.substring(i + 2, i + 4), 10);
    if (Number.isNaN(len)) break;
    if (t === tag) return { value: payload.substring(i + 4, i + 4 + len), start: i, end: i + 4 + len };
    i += 4 + len;
  }
  return null;
}

/**
 * Generate string QRIS dinamis dari QRIS statis milik merchant + nominal pembayaran.
 * @param amount  Nominal pembayaran (rupiah, boleh desimal)
 * @param qrisStatic  String QRIS statis asli dari Qiospay/bank (EMVCo format)
 */
export function generateQRISString(amount: number, qrisStatic: string): string {
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('Amount harus angka positif');
  const staticQR = qrisStatic?.trim();
  if (!staticQR) throw new Error('qris_static wajib diisi');
  if (!staticQR.startsWith('00020101')) throw new Error('qris_static tidak valid (harus diawali 00020101)');

  // Hapus CRC lama (tag 63) sebelum diproses ulang
  const crcTag = findTag(staticQR, '63');
  let base = crcTag ? staticQR.substring(0, crcTag.start) : staticQR;

  // Tag 01 harus '12' (dinamis), bukan '11' (statis) — penting agar e-wallet
  // membaca QR sebagai dinamis dan nominal terisi otomatis
  const poi = findTag(base, '01');
  base = poi
    ? base.substring(0, poi.start) + buildTag('01', '12') + base.substring(poi.end)
    : buildTag('01', '12') + base;

  // Sisipkan tag 54 (Transaction Amount) — panjang field = panjang string apa adanya
  const amountStr = amount % 1 === 0 ? String(Math.trunc(amount)) : amount.toFixed(2);
  const amountTag = buildTag('54', amountStr);
  const existingAmount = findTag(base, '54');
  if (existingAmount) {
    base = base.substring(0, existingAmount.start) + amountTag + base.substring(existingAmount.end);
  } else {
    const country = findTag(base, '58');
    if (!country) throw new Error('qris_static tidak valid: tag 58 (Country Code) tidak ditemukan');
    base = base.substring(0, country.start) + amountTag + base.substring(country.start);
  }

  // Hitung CRC baru atas seluruh payload + placeholder '6304'
  const forCrc = `${base}6304`;
  return `${forCrc}${crc16ccitt(forCrc)}`;
}
