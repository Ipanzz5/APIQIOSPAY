/**
 * Contoh referensi Bot Telegram melakukan polling ke /api/mutasi.
 * Jalankan terpisah dari Next.js app (proses Node.js sendiri), mis. dengan node-telegram-bot-api.
 *
 * Catatan: jika endpoint callback (/api/callback/accept/[secret]) sudah aktif dan
 * terdaftar di dashboard Qiospay, bot idealnya cukup mendengarkan perubahan status
 * transaksi lewat DB Anda sendiri (mis. Postgres LISTEN/NOTIFY, atau query berkala ke
 * tabel transactions), bukan lewat endpoint /api/mutasi -- karena /api/mutasi
 * memanggil API Qiospay setiap kali dipanggil, jadi tidak efisien dipakai polling tinggi.
 * Contoh di bawah tetap disertakan sebagai fallback sesuai planning awal.
 */
import axios from 'axios';

const API_URL = process.env.API_URL || 'https://your-api.com';
const BEARER_TOKEN = process.env.API_BEARER_TOKEN || 'your_token';

async function pollMutasi() {
  try {
    const response = await axios.get(`${API_URL}/api/mutasi`, {
      headers: { Authorization: `Bearer ${BEARER_TOKEN}` },
    });

    const { synced } = response.data;
    if (synced > 0) {
      console.log(`${synced} transaksi baru berhasil disinkronkan`);
      // TODO: kirim notifikasi Telegram ke user/admin terkait di sini,
      // idealnya dengan query ke tabel transactions untuk detail per-transaksi
      // yang baru saja berstatus 'success', bukan dari payload mutasi mentah.
    }
  } catch (error) {
    console.error('Polling error:', error);
  }
}

setInterval(pollMutasi, 30_000); // setiap 30 detik
