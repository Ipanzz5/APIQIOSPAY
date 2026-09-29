📘 Dokumentasi & Planning Integrasi QiosPay (JavaScript/TypeScript)

Panduan ini menggabungkan:

· API H2H (Host‑to‑Host) untuk eksekusi transaksi PPOB (pulsa, paket data, token listrik, dll.)
· API Produk & QRIS (yang digunakan oleh SDK PHP reactmore/qiospay-sdk) – untuk manajemen produk dan pembayaran QRIS.

Semua contoh menggunakan JavaScript/TypeScript dengan axios atau fetch.
Tidak ada kode PHP – semua komunikasi dilakukan melalui REST API langsung.

---

0. Ringkasan Cepat (TL;DR)

Komponen Endpoint Dasar Fungsi
Produk https://qiospay.id/api/product (?) Mendapatkan daftar produk & kategori
QRIS https://qiospay.id/api/qris (?) Generate QR dinamis & cek mutasi
H2H Transaksi https://qiospay.id/api/h2h/trx Kirim transaksi pembelian PPOB

⚠️ Catatan: Endpoint untuk Produk & QRIS tidak didokumentasikan secara publik. Path yang digunakan di bawah ini merupakan hasil rekayasa dari SDK PHP dan harus diverifikasi dengan tim QiosPay atau melalui dokumentasi resmi terbaru.

---

1. Arsitektur Gabungan

```
┌─────────────────────────────────────────────────────┐
│              Aplikasi JavaScript/TypeScript          │
│  ┌───────────────┐  ┌───────────────┐             │
│  │  Service Layer│  │  Scheduler    │             │
│  │  (axios)      │  │  (polling)    │             │
│  └───────────────┘  └───────────────┘             │
└─────────────────────┬───────────────────────────────┘
                      │ HTTP Requests
                      ▼
┌─────────────────────────────────────────────────────┐
│                   API QiosPay                        │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────┐ │
│  │ /api/product │  │ /api/qris    │  │ /h2h/trx │ │
│  └──────────────┘  └──────────────┘  └──────────┘ │
└─────────────────────────────────────────────────────┘
                      │
                      ▼ (Callback)
┌─────────────────────────────────────────────────────┐
│             Endpoint Callback (server Anda)          │
│  Menerima notifikasi status transaksi               │
└─────────────────────────────────────────────────────┘
```

---

2. Persiapan

2.1 Kredensial yang Diperlukan

Kredensial Sumber Digunakan untuk
merchantCode Dashboard QiosPay API Produk & QRIS
apiKey Dashboard QiosPay API Produk & QRIS
qrisString Dashboard QiosPay (QRIS statis) Generate QRIS dinamis
memberId User ID (dari dashboard) H2H Transaksi
memberPin PIN transaksi (dibuat di dashboard) H2H Transaksi
memberPassword Password login akun H2H Transaksi
IP Address IP publik server Didaftarkan di dashboard agar request diizinkan
Callback URL Endpoint publik Anda Menerima notifikasi dari QiosPay

🔐 Simpan semua kredensial di environment variables (.env) – jangan hardcode.

2.2 Daftarkan IP & Callback

1. Login ke https://qiospay.id/mitra.
2. Buka Integrasi transaksi > Transaksi IP.
3. Isi:
   · User ID → sama dengan memberId
   · URL Callback → misal https://domain-anda.com/callback/qiospay
   · PIN → sama dengan memberPin
   · Password → sama dengan memberPassword
   · IP Address → IP publik server Anda

---

3. API Produk & Kategori (Estimasi)

🔍 Sumber: Berdasarkan SDK PHP reactmore/qiospay-sdk, endpoint ini digunakan untuk mengambil data produk dan kategori. Karena tidak ada dokumentasi resmi, contoh di bawah ini adalah perkiraan berdasarkan pola umum.

3.1 Ambil Daftar Produk

Endpoint: GET https://qiospay.id/api/product
Autentikasi: Menggunakan merchantCode dan apiKey (biasanya via header atau query).

Contoh Request (TypeScript):

```typescript
import axios from 'axios';

interface ProductFilter {
  produk?: string; // filter nama produk
  kategori?: string; // filter kategori
  // ... parameter lain sesuai kebutuhan
}

async function getProducts(filters: ProductFilter = {}, page: number = 1) {
  const response = await axios.get('https://qiospay.id/api/product', {
    params: {
      merchantCode: process.env.QIOSPAY_MERCHANT_CODE,
      apiKey: process.env.QIOSPAY_API_KEY,
      ...filters,
      page,
    },
  });
  return response.data; // biasanya { data: [...], pagination: ... }
}
```

Contoh Response (berdasarkan SDK):

```json
{
  "data": [
    {
      "kode": "BYRTSELQM",
      "produk": "Telkomsel Omni",
      "keterangan": "Bayar Telkomsel Combo Sakti",
      "harga": "2050",
      "status": "1"
    }
  ],
  "pagination": { "current_page": 1, "total": 100 }
}
```

3.2 Ambil Kategori Produk

Endpoint: GET https://qiospay.id/api/category

```typescript
async function getCategories() {
  const response = await axios.get('https://qiospay.id/api/category', {
    params: {
      merchantCode: process.env.QIOSPAY_MERCHANT_CODE,
      apiKey: process.env.QIOSPAY_API_KEY,
    },
  });
  return response.data;
}
```

---

4. API QRIS (Estimasi)

4.1 Generate QRIS Dinamis

Endpoint: POST https://qiospay.id/api/qris/generate (atau GET dengan parameter)

```typescript
async function generateDynamicQris(amount: number, note: string) {
  const response = await axios.post('https://qiospay.id/api/qris/generate', {
    merchantCode: process.env.QIOSPAY_MERCHANT_CODE,
    apiKey: process.env.QIOSPAY_API_KEY,
    qrisString: process.env.QIOSPAY_QRIS_STRING,
    amount,
    note,
  });
  return response.data; // { qrisData: '...', qrImage: 'data:image/png;base64,...' }
}
```

4.2 Cek Mutasi QRIS

Endpoint: GET https://qiospay.id/api/qris/mutation

```typescript
async function getQrisMutation(filters: { amount?: number; date?: string } = {}, page: number = 1) {
  const response = await axios.get('https://qiospay.id/api/qris/mutation', {
    params: {
      merchantCode: process.env.QIOSPAY_MERCHANT_CODE,
      apiKey: process.env.QIOSPAY_API_KEY,
      ...filters,
      page,
    },
  });
  return response.data;
}
```

---

5. API H2H – Transaksi PPOB

Ini adalah bagian yang didokumentasikan secara resmi oleh QiosPay.

5.1 Parameter

Parameter Wajib Deskripsi
product ✅ Kode produk (contoh: sp2 untuk Telkomsel 2000)
dest ✅ Nomor tujuan (HP / ID pelanggan)
refID ✅ Referensi unik transaksi di sistem Anda (maks 20 karakter)
memberID ✅ User ID (sama dengan di dashboard)
pin ✅ PIN transaksi (sama dengan di dashboard)
password ✅ Password login akun QiosPay
sign ❌ Signature (opsional, untuk keamanan)
harga_max ❌ Batas harga maksimum (Rupiah) – transaksi dibatalkan jika harga melebihi

5.2 Signature (Opsional)

```
encodeBase64( sha1( "OtomaX|" + memberID + "|" + product + "|" + dest + "|" + refID + "|" + pin + "|" + password ) )
```

Implementasi di TypeScript:

```typescript
import crypto from 'crypto';

function generateSignature(
  memberID: string,
  product: string,
  dest: string,
  refID: string,
  pin: string,
  password: string
): string {
  const raw = `OtomaX|${memberID}|${product}|${dest}|${refID}|${pin}|${password}`;
  const sha1 = crypto.createHash('sha1').update(raw, 'utf8').digest();
  return Buffer.from(sha1).toString('base64');
}
```

5.3 Mengirim Transaksi

```typescript
interface H2HParams {
  product: string;
  dest: string;
  refID: string;
  memberID: string;
  pin: string;
  password: string;
  harga_max?: number;
}

async function sendH2HTransaction(params: H2HParams): Promise<string> {
  const { product, dest, refID, memberID, pin, password, harga_max } = params;

  const query: Record<string, string | number> = {
    product,
    dest,
    refID,
    memberID,
    pin,
    password,
  };

  // Tambahkan signature
  query.sign = generateSignature(memberID, product, dest, refID, pin, password);

  if (harga_max !== undefined) {
    query.harga_max = harga_max;
  }

  const response = await axios.get('https://qiospay.id/api/h2h/trx', { params: query });
  return response.data; // berupa string
}
```

Contoh Pemanggilan:

```typescript
const result = await sendH2HTransaction({
  product: 'sp2',
  dest: '085282756500',
  refID: 'ORDER-001',
  memberID: 'testing',
  pin: '1234',
  password: '123456',
  harga_max: 3000,
});
console.log(result);
```

Contoh Response:

· Sukses (diproses):

```
R#ORDER-001 sp2 085282756500, Mohon tunggu transaksi sedang diproses. Saldo 15.501.485 @ 08/07/2025 20:45
```

· Dibatalkan karena harga_max:

```
R#ORDER-001 Pulsa Reguler Telkomsel 2000 SP2.085282756500, diabaikan karena Harga Voucher 3.290 lebih besar dari Harga Max anda 3000. Saldo 15.498.195 @08/07/2025 14:12
```

· Error:

```
Invalid Signature
```

---

6. Callback (Notifikasi Status)

Setelah transaksi diproses, QiosPay akan mengirimkan HTTP POST ke URL Callback yang telah didaftarkan.

6.1 Membuat Endpoint Callback (Node.js + Express)

```typescript
import express, { Request, Response } from 'express';

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.post('/callback/qiospay', (req: Request, res: Response) => {
  const data = req.body; // atau req.query, tergantung format QiosPay

  console.log('Callback received:', data);

  // 1. Verifikasi signature (jika ada)
  // 2. Update status transaksi di database berdasarkan refID
  // 3. Jika data.status === 'success' → tandai order sebagai PAID

  res.status(200).send('OK'); // Wajib respon 200
});

app.listen(3000, () => console.log('Callback server running on port 3000'));
```

6.2 Verifikasi Signature Callback

Jika callback menyertakan sign, Anda bisa memverifikasinya dengan fungsi yang sama.

```typescript
function verifyCallbackSignature(
  data: any,
  memberID: string,
  pin: string,
  password: string
): boolean {
  const { product, dest, refID, sign } = data;
  const raw = `OtomaX|${memberID}|${product}|${dest}|${refID}|${pin}|${password}`;
  const sha1 = crypto.createHash('sha1').update(raw, 'utf8').digest();
  const expected = Buffer.from(sha1).toString('base64');
  return expected === sign;
}
```

---

7. Rencana Implementasi (Planning)

Fase 0 – Persiapan (0.5 hari)

· Dapatkan semua kredensial dari dashboard QiosPay.
· Daftarkan IP server dan URL Callback.
· Siapkan environment variables (.env).

Fase 1 – Setup Project (0.5 hari)

· Inisialisasi project Node.js + TypeScript.
· Install dependencies: axios, express, crypto, dotenv, dll.
· Buat file konfigurasi untuk membaca .env.

Fase 2 – Modul Produk (1 hari)

· Buat fungsi getProducts() dan getCategories().
· Implementasikan caching (misal simpan di database atau Redis) agar tidak memanggil API setiap request.
· Buat scheduler (misal setiap 6 jam) untuk sinkronisasi produk.

Fase 3 – Modul QRIS (2 hari)

· Buat fungsi generateDynamicQris() dan getQrisMutation().
· Implementasikan alur pembayaran:
· Checkout → generate QRIS → simpan qrisData dan order_id.
· Tampilkan QR code ke customer (gunakan library seperti qrcode).
· Jalankan polling getQrisMutation() setiap 10 detik selama 15 menit.
· Jika mutasi ditemukan → update order status → PAID.
· Jika timeout → EXPIRED.

Fase 4 – Modul H2H Transaksi (2 hari)

· Buat fungsi sendH2HTransaction().
· Implementasikan alur:
· Customer pilih produk → buat refID unik.
· Simpan order dengan status pending.
· Panggil H2H API.
· Jika response awal = "Mohon tunggu..." → status processing.
· Jika error → status failed.
· Siapkan endpoint callback untuk menerima notifikasi.
· Proses callback: update status order menjadi success atau failed.

Fase 5 – Error Handling & Logging (1 hari)

· Bungkus semua panggilan API dengan try-catch.
· Implementasikan retry mechanism (exponential backoff) untuk H2H dan polling.
· Log semua request/response (redact data sensitif).

Fase 6 – Testing (1–2 hari)

· Unit test untuk fungsi-fungsi utama.
· Integration test menggunakan sandbox QiosPay (jika tersedia).
· Uji skenario: sukses, gagal, timeout, harga_max.

Fase 7 – Deployment (0.5 hari)

· Pastikan environment variables terisi dengan benar di production.
· Deploy aplikasi dan callback endpoint.
· Smoke test dengan transaksi nyata (nominal kecil).

Estimasi total: ± 8–10 hari kerja (1 developer).

---

8. Struktur Folder (Rekomendasi)

```
project/
├── .env
├── src/
│   ├── config/
│   │   └── qiospay.ts          # Baca env, export konstanta
│   ├── services/
│   │   ├── product.service.ts  # getProducts, getCategories
│   │   ├── qris.service.ts     # generateDynamicQris, getMutation
│   │   └── h2h.service.ts      # sendTransaction, generateSignature
│   ├── controllers/
│   │   ├── product.controller.ts
│   │   ├── payment.controller.ts
│   │   └── callback.controller.ts
│   ├── models/
│   │   └── order.model.ts      # Interface / ORM
│   ├── jobs/
│   │   ├── syncProducts.ts     # Scheduler
│   │   └── pollQrisPayment.ts
│   └── utils/
│       ├── logger.ts
│       └── retry.ts
├── package.json
├── tsconfig.json
└── README.md
```

---

9. FAQ

Q: Apakah endpoint produk dan QRIS di atas sudah pasti?
A: Tidak. Path tersebut adalah perkiraan berdasarkan SDK PHP. Harap verifikasi dengan tim QiosPay atau dokumentasi resmi terbaru. Jika berbeda, sesuaikan.

Q: Bagaimana jika callback tidak datang?
A: Pastikan endpoint callback dapat diakses publik dan merespons 200 OK. Jika tetap tidak ada, hubungi support QiosPay. Anda juga bisa mengimplementasikan fallback dengan memeriksa saldo atau riwayat transaksi.

Q: Apakah perlu menggunakan signature?
A: Sangat disarankan untuk mencegah modifikasi data. Gunakan signature di setiap request H2H dan verifikasi di callback.

Q: Bagaimana cara menampilkan QR code di frontend?
A: Gunakan library seperti qrcode untuk merender string QRIS menjadi gambar.

---

10. Kesimpulan

Dengan panduan ini, Anda dapat mengintegrasikan seluruh layanan QiosPay (produk, QRIS, dan H2H) menggunakan JavaScript/TypeScript tanpa ketergantungan pada SDK PHP. Pastikan untuk memverifikasi endpoint produk dan QRIS dengan dokumentasi resmi, karena bagian tersebut masih bersifat estimasi.

Selamat mengintegrasikan! 🚀

---

Dokumen ini disusun berdasarkan dokumentasi H2H resmi dan reverse engineering SDK PHP reactmore/qiospay-sdk v3.0.0.
