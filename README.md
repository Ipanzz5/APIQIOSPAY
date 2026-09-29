# API PAYMENT GATEWAY - QIOSPAY

Backend API siap pakai untuk generate **QRIS dinamis** dan mendeteksi pembayaran masuk lewat Qiospay. Dibangun dengan **Next.js 14 + Neon PostgreSQL + Drizzle ORM**, dan dapat di-deploy gratis ke Vercel.

Bersifat **publik multi-tenant**: siapapun bisa menggunakan satu deployment API ini untuk merchant Qiospay masing-masing, cukup dengan menyertakan kredensial Qiospay sendiri di setiap request.

---

## Daftar Isi

1. [Perkenalan & Fitur](#1-perkenalan--fitur)
2. [Alur Kerja Sistem](#2-alur-kerja-sistem)
3. [Struktur Folder](#3-struktur-folder)
4. [Instalasi & Setup](#4-instalasi--setup)
5. [Konfigurasi Environment Variables](#5-konfigurasi-environment-variables)
6. [Autentikasi](#6-autentikasi)
7. [Dokumentasi Endpoint](#7-dokumentasi-endpoint)
8. [Contoh Kode — JavaScript](#8-contoh-kode--javascript)
9. [Contoh Kode — TypeScript](#9-contoh-kode--typescript)
10. [Setup Callback Real-time](#10-setup-callback-real-time)
11. [Deployment](#11-deployment)
12. [Troubleshooting](#12-troubleshooting)
13. [Keamanan](#13-keamanan)

---

## 1. Perkenalan & Fitur

API ini menangani:
- **Deposit via QRIS** — generate QR dinamis, deteksi pembayaran via callback real-time, update saldo otomatis
- **PPOB (H2H)** — transaksi pulsa, paket data, token listrik, dll via Qiospay H2H dengan signature otomatis
- **Katalog Produk** — daftar & filter produk PPOB, ekstrak kategori

#### Fitur QRIS
- **Generate QR dinamis** dari QRIS statis + nominal tertentu
- **QR image inline** (base64 data URL) — tampil langsung di browser tanpa hosting eksternal
- **Upload gambar QR** otomatis ke image hosting (Pixhost → Cloudinary → Catbox)
- **Simpan transaksi** ke database dengan status `pending`
- **Deteksi pembayaran** via callback real-time Qiospay (utama) / polling manual (fallback)
- **Update saldo** user secara atomik (anti double-credit)
- **Frontend interaktif** — monitoring status real-time, cancel transaksi, copy callback URL

#### Fitur H2H (PPOB)
- Kirim transaksi pulsa, paket data, token listrik, dll
- Signature SHA-1 otomatis sesuai format Qiospay
- Batas harga maksimal (`harga_max`) untuk proteksi overcharge
- Callback notifikasi status transaksi

#### Fitur Katalog Produk
- Ambil daftar produk PPOB langsung dari Qiospay
- Filter berdasarkan nama produk
- Ekstrak kategori unik dari seluruh data produk

### Fitur Teknis
| Fitur | Detail |
|---|---|
| ✅ QRIS Dinamis | Implementasi EMVCo benar (CRC16-CCITT, tag 01 dinamis) |
| ✅ Multi-tenant | Satu deployment untuk banyak merchant Qiospay |
| ✅ Callback Real-time | Webhook resmi Qiospay QRIS & H2H, instan tanpa polling |
| ✅ QR Inline Base64 | QR tampil langsung via data URL, tanpa hosting eksternal |
| ✅ 3 Layer Image Hosting | Pixhost → Cloudinary → Catbox (fallback otomatis) |
| ✅ Atomik | `FOR UPDATE SKIP LOCKED` — anti race condition & double-credit |
| ✅ Bearer Token Auth | Timing-safe comparison (anti timing attack) |
| ✅ Rate Limiting | Per-IP, in-memory |
| ✅ Retry & Backoff | Exponential backoff untuk panggilan ke Qiospay |
| ✅ Serverless-safe | Logger tidak crash di Vercel/Lambda |
| ✅ Lazy DB Init | Koneksi dibuat saat dipakai, bukan saat import |
| ✅ Auto-polling Status | Frontend polling tiap 3 detik, update real-time |
| ✅ Cancel Transaction | Batalkan transaksi pending dari frontend |
| ✅ Expired 5 Menit | QRIS otomatis kedaluwarsa setelah 5 menit |
| ✅ H2H PPOB | Transaksi pulsa/data/listrik via H2H Qiospay |
| ✅ Signature H2H | SHA-1 + Base64 otomatis |
| ✅ Katalog Produk | Ambil produk & kategori PPOB dari Qiospay |

---

## 2. Alur Kerja Sistem

```
┌─────────────────────────────────────────────────────────────┐
│  1. User buka website / bot panggil POST /api/qris/create   │
│     (sertakan merchant_code, api_key, qris_static, amount) │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│  2. Server:                                                 │
│     - Daftarkan merchant (jika baru) + generate secret     │
│     - Generate string QRIS dinamis (EMVCo + CRC16)        │
│     - Generate QR inline base64 (data URL)                 │
│     - Upload gambar QR ke hosting (fallback jika error)    │
│     - Simpan transaksi pending (expired 5 menit)           │
│     - Kembalikan data + callback_url_to_register           │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│  3. Frontend:                                               │
│     - Tampilkan QR image (dari data URL / qr_data_url)     │
│     - Tampilkan ID, amount, status, countdown 5 menit      │
│     - Tampilkan callback URL (bisa di-copy)                │
│     - Polling status tiap 3 detik ke /api/qris/status/[id] │
│     - Tombol "Cancel Transaction" untuk batalkan           │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│  3. User scan QR & bayar via e-wallet / mobile banking     │
└─────────────────────┬───────────────────────────────────────┘
                      │
            ┌─────────┴──────────┐
            ▼                     ▼
┌────────────────────┐  ┌──────────────────────────────────────┐
│  JALUR UTAMA       │  │  JALUR FALLBACK (manual)            │
│  Callback Qiospay  │  │  Panggil GET /api/mutasi            │
│  POST /api/        │  │  (sertakan merchant_code & api_key) │
│  callback/accept   │  └──────────┬───────────────────────────┘
│  /{mc}.{secret}    │             │
│  (real-time)       │             │
└──────┬─────────────┘             │
       └──────────┬────────────────┘
                  ▼
┌─────────────────────────────────────────────────────────────┐
│  4. Server settle transaksi:                                │
│     - Match mutasi ke transaksi pending (FIFO, atomik)     │
│     - Update status → success                              │
│     - Tambah saldo user (SQL atomic: balance + amount)     │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│  5. Frontend polling deteksi status "success"               │
│     - Hilangkan QR image                                   │
│     - Tampilkan "Pembayaran Berhasil" (card hijau)         │
│     - Status badge → success (hijau)                       │
└─────────────────────────────────────────────────────────────┘
```

---

## 3. Struktur Folder

```
ApiQiospay/
│
├── app/
│   ├── api/
│   │   ├── qris/
│   │   │   ├── create/
│   │   │   │   └── route.ts              # POST — generate QRIS dinamis
│   │   │   ├── cancel/
│   │   │   │   └── route.ts              # PATCH — batalkan transaksi pending
│   │   │   └── status/
│   │   │       └── [id]/
│   │   │           └── route.ts          # GET — cek status transaksi
│   │   ├── h2h/
│   │   │   └── trx/
│   │   │       └── route.ts              # GET — kirim transaksi PPOB (H2H)
│   │   ├── product/
│   │   │   └── route.ts                  # GET — daftar produk PPOB Qiospay
│   │   ├── category/
│   │   │   └── route.ts                  # GET — ekstrak kategori unik dari produk
│   │   ├── mutasi/
│   │   │   └── route.ts                  # GET — cek mutasi + logic settlement
│   │   ├── callback/
│   │   │   ├── accept/
│   │   │   │   └── [secret]/
│   │   │   │       └── route.ts          # POST — callback real-time QRIS Qiospay
│   │   │   └── h2h/
│   │   │       └── route.ts              # POST/GET — callback notifikasi H2H
│   │   └── health/
│   │       └── route.ts                  # GET — health check & DB ping
│   ├── layout.tsx
│   └── page.tsx                          # Frontend interaktif (modal, form, payment card)
│
├── lib/
│   ├── db.ts                             # Koneksi Neon (lazy init via Proxy)
│   ├── schema.ts                         # Skema Drizzle: users, merchants, transactions
│   ├── qrGenerator.ts                    # Generate string QRIS + CRC16-CCITT
│   ├── qrCode.ts                         # Generate buffer & data URL QR (PNG)
│   ├── imageUploader.ts                  # Upload QR ke Pixhost/Cloudinary/Catbox
│   ├── settlement.ts                     # Logic settlement: settleTransaction + checkAndSettle
│   ├── h2h.ts                            # generateH2HSignature, verifyH2HSignature, sendH2HTransaction
│   ├── product.ts                        # getProducts, getCategories (dari Qiospay)
│   ├── qiospay.ts                        # Konstanta base URL Qiospay
│   ├── retry.ts                          # Fetch dengan retry exponential backoff
│   ├── logger.ts                         # Winston logger (serverless-safe)
│   └── scheduler.ts                      # Polling fallback semua merchant (opsional)
│
├── middleware/
│   ├── auth.ts                           # Validasi Bearer Token (timing-safe)
│   └── rateLimit.ts                      # Rate limiting in-memory per-IP
│
├── drizzle/
│   └── init.sql                          # SQL migration (jalankan di Neon SQL Editor)
│
├── instrumentation.ts                    # Next.js startup hook (jalankan scheduler)
├── drizzle.config.ts
├── next.config.js
├── .env.local.example
└── README.md
```

---

## 4. Instalasi & Setup

```bash
# 1. Clone / download project
git clone https://github.com/irfanirsyad/ApiQiospay.git
cd ApiQiospay

# 2. Install dependency
npm install

# 3. Salin contoh env
cp .env.local.example .env.local
# Lalu edit .env.local, isi DATABASE_URL dan API_BEARER_TOKEN

# 4. Setup database (pilih salah satu):
npm run db:push                    # otomatis via drizzle-kit
# ATAU jalankan drizzle/init.sql manual di https://console.neon.tech

# 5. Jalankan
npm run dev                        # development (http://localhost:3000)
npm run build && npm start         # production
```

---

## 5. Konfigurasi Environment Variables

Salin `.env.local.example` ke `.env.local` lalu isi:

### Wajib Diisi

| Variabel | Cara Mendapatkan |
|---|---|
| `DATABASE_URL` | Daftar gratis di [neon.tech](https://neon.tech) → buat project → copy **Pooled connection string** |
| `API_BEARER_TOKEN` | Buat sendiri, contoh: `openssl rand -hex 32` |

### Tidak Perlu Diisi di Sini

`MERCHANT_CODE`, `API_KEY`, dan `QRIS_STATIC` **tidak ada di .env** karena API ini multi-tenant. Setiap pemanggil menyertakan kredensial Qiospay miliknya sendiri langsung di body/query request.

### Opsional

| Variabel | Keterangan |
|---|---|
| `CLOUDINARY_CLOUD_NAME` | Fallback image hosting kedua (dari [cloudinary.com](https://cloudinary.com) dashboard) |
| `CLOUDINARY_API_KEY` | Dari dashboard Cloudinary |
| `CLOUDINARY_API_SECRET` | Dari dashboard Cloudinary (klik ikon mata untuk lihat) |
| `ENABLE_INTERNAL_SCHEDULER` | `true` untuk aktifkan polling fallback (hanya Railway/VPS) |
| `QIOSPAY_MEMBER_ID` | User ID Qiospay (default untuk H2H, bisa di-override per request) |
| `QIOSPAY_PIN` | PIN transaksi Qiospay (default untuk H2H) |
| `QIOSPAY_PASSWORD` | Password login Qiospay (default untuk H2H) |
| `QIOSPAY_MERCHANT_CODE` | Merchant Code default untuk produk (jika perlu) |
| `QIOSPAY_API_KEY` | API Key default untuk produk (jika perlu) |

---

## 6. Autentikasi

Setiap request ke endpoint `/api/qris/create`, `/api/qris/cancel`, `/api/qris/status/[id]`, `/api/mutasi`, `/api/h2h/trx`, `/api/product`, dan `/api/category` membutuhkan **dua hal**:

### 1. Bearer Token (header — wajib)

Dikirim lewat header HTTP oleh semua pemanggil API:

```
Authorization: Bearer <API_BEARER_TOKEN>
```

Token ini milik **pemilik server** (kamu yang deploy), bukan dari Qiospay. Berguna untuk mencegah orang random membanjiri API-mu.

### 2. Kredensial Qiospay (per-request — wajib)

Setiap pemanggil menyertakan kredensial Qiospay **miliknya sendiri**:
- `merchant_code` — dari dashboard Qiospay
- `api_key` — dari dashboard Qiospay
- `qris_static` — string QRIS statis (bisa didapat dari scan QR statis milikmu, lalu decode jadi teks)

Server **tidak menyimpan** `qris_static` — hanya `merchant_code` dan `api_key` yang disimpan untuk keperluan cek mutasi otomatis.

---

## 7. Dokumentasi Endpoint

### `POST /api/qris/create`

Generate QRIS dinamis untuk satu nominal transaksi.

**Headers**
```
Authorization: Bearer <API_BEARER_TOKEN>
Content-Type: application/json
```

**Request Body**
```json
{
  "merchant_code": "QP019571",
  "api_key": "e283f5d697c9805c0a...",
  "qris_static": "00020101021126670016COM.NOBUBANK...",
  "amount": 15000,
  "description": "Topup saldo",
  "telegram_id": "123456789"
}
```

| Field | Tipe | Wajib | Keterangan |
|---|---|---|---|
| `merchant_code` | string | ✅ | Merchant Code dari dashboard Qiospay |
| `api_key` | string | ✅ | API Key dari dashboard Qiospay |
| `qris_static` | string | ✅ | String QRIS statis milikmu (format EMVCo, diawali `00020101`) |
| `amount` | number (or string) | ✅ | Nominal (1 – 10.000.000). Menerima string juga |
| `description` | string | ❌ | Deskripsi transaksi (default: "Topup saldo") |
| `telegram_id` | string | ❌ | ID Telegram user pemesan (opsional, untuk bot) |

**Response 200 — Sukses**
```json
{
  "status": "success",
  "data": {
    "id": "b1e2c3d4-0000-0000-0000-000000000000",
    "merchant_code": "QP019571",
    "amount": "15000.00",
    "qr_image_url": "https://pixhost.to/show/0/...",
    "qr_data_url": "data:image/png;base64,iVBORw0KGgo...",
    "qr_string": "00020101021226670016...",
    "status": "pending",
    "created_at": "2026-07-09T11:00:00.000Z",
    "expired_at": "2026-07-09T11:05:00.000Z",
    "callback_url_to_register": "https://domainmu.com/api/callback/accept/QP019571.a1b2c3d4..."
  }
}
```

> **Penting:**
> - `qr_data_url` adalah QR dalam format base64 — bisa langsung ditampilkan di browser tanpa hosting eksternal
> - `qr_image_url` adalah URL dari hosting gambar (jika upload berhasil)
> - Transaksi **kedaluwarsa dalam 5 menit** — setelah itu status otomatis `expired`
> - Salin `callback_url_to_register` dan daftarkan ke dashboard Qiospay **satu kali** untuk `merchant_code` tersebut. Lihat [bagian 10](#10-setup-callback-real-time)

**Response 400 — Validasi gagal**
```json
{
  "status": "error",
  "message": "Validasi gagal",
  "errors": { "amount": ["Expected number, received string"] }
}
```

---

### `PATCH /api/qris/cancel`

Batalkan transaksi pending. Hanya transaksi dengan status `pending` yang bisa dibatalkan.

**Headers**
```
Authorization: Bearer <API_BEARER_TOKEN>
Content-Type: application/json
```

**Request Body**
```json
{
  "id": "b1e2c3d4-0000-0000-0000-000000000000"
}
```

| Field | Tipe | Wajib | Keterangan |
|---|---|---|---|
| `id` | string (UUID) | ✅ | ID transaksi dari response create QRIS |

**Response 200 — Sukses**
```json
{
  "status": "success",
  "data": { "id": "b1e2c3d4-...", "status": "cancelled" }
}
```

**Response 404 — Tidak ditemukan**
```json
{
  "status": "error",
  "message": "Transaksi tidak ditemukan"
}
```

---

### `GET /api/qris/status/[id]`

Cek status terbaru transaksi. Endpoint ini **hanya membaca database** — tidak memicu settlement atau panggilan ke Qiospay. Settlement hanya terjadi melalui callback Qiospay atau endpoint `/api/mutasi`.

**Headers**
```
Authorization: Bearer <API_BEARER_TOKEN>
```

**Response 200**
```json
{
  "status": "success",
  "data": {
    "id": "b1e2c3d4-...",
    "status": "pending",
    "amount": "15000.00"
  }
}
```

Nilai `status` yang mungkin: `pending`, `success`, `cancelled`, `expired`.

---

### `GET /api/mutasi`

Cek mutasi terbaru dari Qiospay dan settle transaksi pending yang cocok (FIFO by amount).

**Headers**
```
Authorization: Bearer <API_BEARER_TOKEN>
```

**Query Parameters**
| Param | Wajib | Keterangan |
|---|---|---|
| `merchant_code` | ✅ | Merchant Code Qiospay |
| `api_key` | ✅ | API Key Qiospay |

**Contoh URL**
```
GET /api/mutasi?merchant_code=QP019571&api_key=e283f5d697...
```

**Response 200**
```json
{
  "status": "success",
  "data": [
    {
      "date": "2026-07-09 11:05:00",
      "amount": "15000",
      "type": "CR",
      "issuer_reff": "REF123",
      "buyer_reff": "BUY456"
    }
  ],
  "synced": 1,
  "timestamp": "2026-07-09T11:05:30.000Z",
  "duration_ms": 842
}
```

> `synced: 0` dengan `data: []` artinya normal — belum ada pembayaran masuk, bukan error.

---

### `POST /api/callback/accept/{merchant_code}.{callback_secret}`

Dipanggil otomatis oleh server Qiospay saat ada dana masuk (real-time). **Tidak butuh Bearer Token** — diverifikasi lewat `callback_secret` yang tertanam di URL.

URL lengkapnya didapat dari field `callback_url_to_register` di response `/api/qris/create`.

**Contoh payload yang dikirim Qiospay:**
```json
{
  "status": "success",
  "data": {
    "name": "John Doe",
    "nmid": "ID20253745537460",
    "amount": 15000,
    "type": "CR",
    "fee": 0,
    "refid": "123456789",
    "issuer": "BCA",
    "balance": "150000",
    "time": "09/07/2026 11:05"
  }
}
```

**Response yang diharapkan Qiospay:**
```json
{ "status": "accept", "message": "Data received successfully", "data": { ... } }
```

---

### `GET /api/h2h/trx`

Kirim transaksi PPOB (pulsa, paket data, token listrik, dll) via Qiospay H2H. Signature SHA-1 di-generate otomatis.

**Headers**
```
Authorization: Bearer <API_BEARER_TOKEN>
```

**Query Parameters**
| Param | Wajib | Keterangan |
|---|---|---|
| `product` | ✅ | Kode produk (contoh: `sp2` untuk Telkomsel 2000). Dapatkan dari `/api/product` |
| `dest` | ✅ | Nomor HP / ID pelanggan |
| `refID` | ✅ | Referensi unik transaksi Anda (maks 20 karakter) |
| `memberID` | ❌ | User ID Qiospay (default dari env `QIOSPAY_MEMBER_ID`) |
| `pin` | ❌ | PIN transaksi (default dari env `QIOSPAY_PIN`) |
| `password` | ❌ | Password login (default dari env `QIOSPAY_PASSWORD`) |
| `harga_max` | ❌ | Batas harga maksimum (Rupiah). Transaksi ditolak jika harga melebihi |
| `sign` | ❌ | Signature manual (kosongkan untuk auto-generate) |

**Contoh URL**
```
GET /api/h2h/trx?product=sp2&dest=085282756500&refID=ORDER-001&harga_max=3000
```

**Response 200 — Sukses diproses**
```json
{
  "status": "success",
  "data": "R#ORDER-001 sp2 085282756500, Mohon tunggu transaksi sedang diproses. Saldo 15.501.485 @ 08/07/2025 20:45"
}
```

**Response 200 — Dibatalkan karena harga_max**
```json
{
  "status": "success",
  "data": "R#ORDER-001 Pulsa Reguler Telkomsel 2000 SP2.085282756500, diabaikan karena Harga Voucher 3.290 lebih besar dari Harga Max anda 3000. Saldo 15.498.195 @08/07/2025 14:12"
}
```

---

### `GET /api/product`

Ambil daftar produk PPOB dari Qiospay. Memanggil endpoint internal `admin/modules/mapping/harga/{page}/reseller`. Filter dilakukan client-side.

**Headers**
```
Authorization: Bearer <API_BEARER_TOKEN>
```

**Query Parameters**
| Param | Wajib | Keterangan |
|---|---|---|
| `produk` | ❌ | Filter nama produk (case-insensitive, partial match) |
| `kategori` | ❌ | Filter kategori (jika tersedia di data) |
| `page` | ❌ | Nomor halaman (default: 1) |

**Contoh URL**
```
GET /api/product?produk=Telkomsel&page=1
```

**Response 200**
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
  "total": 100,
  "page": 1
}
```

> Endpoint ini **tidak memerlukan kredensial Qiospay** (akses publik ke server Qiospay).

---

### `GET /api/category`

Ekstrak daftar kategori unik dari data produk Qiospay. Tidak ada endpoint kategori terpisah — data diambil dengan menscan beberapa halaman produk.

**Headers**
```
Authorization: Bearer <API_BEARER_TOKEN>
```

**Query Parameters**
| Param | Wajib | Keterangan |
|---|---|---|
| `page` | ❌ | Halaman awal (default: 1) |
| `max_pages` | ❌ | Maksimal halaman yang discan (default: 5) |

**Contoh URL**
```
GET /api/category?page=1&max_pages=5
```

**Response 200**
```json
["Telkomsel Omni", "Indosat", "XL", "Token Listrik"]
```

---

### `GET/POST /api/callback/h2h`

Endpoint callback untuk notifikasi status transaksi H2H dari Qiospay. Didaftarkan di dashboard Qiospay pada menu **Integrasi transaksi > Transaksi IP > URL Callback**.

Menerima:
- `POST` — body JSON atau form-urlencoded
- `GET` — query parameters (fallback)

**Response yang diharapkan Qiospay (harus 200):**
```json
{ "status": "accept", "message": "OK" }
```

> **Tidak membutuhkan Bearer Token.** Selalu balas 200 OK agar Qiospay tidak retry.

---

### `GET /api/health`

Health check publik (tidak butuh autentikasi).

```json
{
  "status": "healthy",
  "db_latency_ms": 45,
  "uptime_s": 3600,
  "timestamp": "2026-07-09T11:00:00.000Z"
}
```

---

## 8. Contoh Kode — JavaScript

### Generate QRIS

```javascript
async function createQris({ merchantCode, apiKey, qrisStatic, amount, telegramId }) {
  const res = await fetch('https://domainmu.com/api/qris/create', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer API_BEARER_TOKEN_MU',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      merchant_code: merchantCode,
      api_key: apiKey,
      qris_static: qrisStatic,
      amount: amount,
      description: 'Topup saldo',
      telegram_id: telegramId,
    }),
  });

  const result = await res.json();
  if (result.status === 'success') {
    console.log('QR Data URL  :', result.data.qr_data_url); // base64 — langsung tampilkan
    console.log('Transaction ID:', result.data.id);
    console.log('Kadaluarsa   :', result.data.expired_at);
    // Simpan result.data.callback_url_to_register dan daftarkan ke dashboard Qiospay
    return result.data;
  }
  throw new Error(result.message);
}

// Penggunaan
createQris({
  merchantCode: 'QP019571',
  apiKey: 'e283f5d697c9805c0a...',
  qrisStatic: '00020101021126670016COM.NOBUBANK...',
  amount: 15000,
  telegramId: '123456789',
}).then(data => console.log(data));
```

### Cek Status Transaksi

```javascript
async function cekStatus(transactionId) {
  const res = await fetch(`https://domainmu.com/api/qris/status/${transactionId}`, {
    headers: { 'Authorization': 'Bearer API_BEARER_TOKEN_MU' },
  });
  const result = await res.json();
  if (result.status === 'success') {
    console.log('Status:', result.data.status); // "pending" | "success" | "cancelled" | "expired"
    return result.data;
  }
  throw new Error(result.message);
}
```

### Cancel Transaksi

```javascript
async function cancelTransaction(transactionId) {
  const res = await fetch('https://domainmu.com/api/qris/cancel', {
    method: 'PATCH',
    headers: {
      'Authorization': 'Bearer API_BEARER_TOKEN_MU',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ id: transactionId }),
  });
  const result = await res.json();
  if (result.status === 'success') {
    console.log('Transaksi dibatalkan');
    return result.data;
  }
  throw new Error(result.message);
}
```

### Cek Mutasi

```javascript
async function cekMutasi(merchantCode, apiKey) {
  const url = new URL('https://domainmu.com/api/mutasi');
  url.searchParams.set('merchant_code', merchantCode);
  url.searchParams.set('api_key', apiKey);

  const res = await fetch(url, {
    headers: { 'Authorization': 'Bearer API_BEARER_TOKEN_MU' },
  });

  const result = await res.json();
  if (result.status === 'success') {
    console.log(`Synced: ${result.synced} transaksi`);
    return result;
  }
  throw new Error(result.message);
}
```

### Testing Callback Manual

```javascript
// Simulasi server Qiospay memanggil callback (untuk testing saja)
async function testCallback(callbackUrl, amount) {
  const res = await fetch(callbackUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      status: 'success',
      data: {
        name: 'Test User',
        nmid: 'ID20253745537460',
        amount: amount,
        type: 'CR',
        fee: 0,
        refid: `TEST_${Date.now()}`,
        issuer: 'BCA',
        balance: '150000',
        time: new Date().toLocaleString('id-ID', {
          day: '2-digit', month: '2-digit', year: 'numeric',
          hour: '2-digit', minute: '2-digit', hour12: false
        }).replace(/\//g, '/'),
      },
    }),
  });
  return res.json();
}
```

### H2H Transaction

```javascript
async function sendH2HTransaction({ product, dest, refID, hargaMax }) {
  const url = new URL('https://domainmu.com/api/h2h/trx');
  url.searchParams.set('product', product);
  url.searchParams.set('dest', dest);
  url.searchParams.set('refID', refID);
  if (hargaMax) url.searchParams.set('harga_max', String(hargaMax));

  const res = await fetch(url, {
    headers: { 'Authorization': 'Bearer API_BEARER_TOKEN_MU' },
  });

  const result = await res.json();
  if (result.status === 'success') {
    console.log('Hasil:', result.data);
    return result.data;
  }
  throw new Error(result.message);
}

// Penggunaan
sendH2HTransaction({
  product: 'sp2',
  dest: '085282756500',
  refID: 'ORDER-001',
  hargaMax: 3000,
}).then(msg => console.log(msg));
```

### Daftar Produk

```javascript
async function getProducts(filter, page = 1) {
  const url = new URL('https://domainmu.com/api/product');
  if (filter) url.searchParams.set('produk', filter);
  url.searchParams.set('page', String(page));

  const res = await fetch(url, {
    headers: { 'Authorization': 'Bearer API_BEARER_TOKEN_MU' },
  });

  return res.json();
}

// Penggunaan
getProducts('Telkomsel', 1).then(result => {
  console.log(`Ditemukan ${result.total} produk`);
  console.log(result.data);
});
```

### Daftar Kategori

```javascript
async function getCategories(maxPages = 5) {
  const url = new URL('https://domainmu.com/api/category');
  url.searchParams.set('max_pages', String(maxPages));

  const res = await fetch(url, {
    headers: { 'Authorization': 'Bearer API_BEARER_TOKEN_MU' },
  });

  return res.json();
}

getCategories().then(cats => console.log('Kategori:', cats));
```

### cURL Lengkap

```bash
# Create QRIS
curl -X POST https://domainmu.com/api/qris/create \
  -H "Authorization: Bearer API_BEARER_TOKEN_MU" \
  -H "Content-Type: application/json" \
  -d '{
    "merchant_code": "QP019571",
    "api_key": "e283f5d697c9805c0a...",
    "qris_static": "00020101021126670016COM.NOBUBANK...",
    "amount": 15000,
    "telegram_id": "123456789"
  }'

# Cek Status Transaksi
curl "https://domainmu.com/api/qris/status/b1e2c3d4-... \
  -H "Authorization: Bearer API_BEARER_TOKEN_MU"

# Cancel Transaksi
curl -X PATCH https://domainmu.com/api/qris/cancel \
  -H "Authorization: Bearer API_BEARER_TOKEN_MU" \
  -H "Content-Type: application/json" \
  -d '{"id": "b1e2c3d4-..."}'

# Cek Mutasi
curl "https://domainmu.com/api/mutasi?merchant_code=QP019571&api_key=e283f5d697..." \
  -H "Authorization: Bearer API_BEARER_TOKEN_MU"

# H2H Transaction
curl "https://domainmu.com/api/h2h/trx?product=sp2&dest=085282756500&refID=ORDER-001&harga_max=3000" \
  -H "Authorization: Bearer API_BEARER_TOKEN_MU"

# Daftar Produk
curl "https://domainmu.com/api/product?produk=Telkomsel&page=1" \
  -H "Authorization: Bearer API_BEARER_TOKEN_MU"

# Daftar Kategori
curl "https://domainmu.com/api/category?max_pages=5" \
  -H "Authorization: Bearer API_BEARER_TOKEN_MU"

# Health Check
curl https://domainmu.com/api/health
```

---

## 9. Contoh Kode — TypeScript

```typescript
// types.ts
export interface CreateQrisPayload {
  merchant_code: string;
  api_key: string;
  qris_static: string;
  amount: number;
  description?: string;
  telegram_id?: string;
}

export interface QrisData {
  id: string;
  merchant_code: string;
  amount: string;
  qr_image_url: string;
  qr_data_url: string;         // base64 data URL — tampilkan langsung di <img>
  qr_string: string;
  status: 'pending' | 'success' | 'cancelled' | 'expired';
  created_at: string;
  expired_at: string;
  callback_url_to_register: string;
}

export interface ApiResponse<T> {
  status: 'success' | 'error';
  message?: string;
  data?: T;
  errors?: Record<string, string[]>;
}
```

```typescript
// qrisApi.ts
import type { CreateQrisPayload, QrisData, ApiResponse } from './types';

const BASE_URL = process.env.QRIS_API_URL!;
const BEARER  = process.env.QRIS_BEARER_TOKEN!;

const headers = {
  Authorization: `Bearer ${BEARER}`,
  'Content-Type': 'application/json',
};

export async function createQris(payload: CreateQrisPayload): Promise<QrisData> {
  const res = await fetch(`${BASE_URL}/api/qris/create`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });
  const json: ApiResponse<QrisData> = await res.json();
  if (json.status !== 'success' || !json.data) {
    throw new Error(json.message || 'Create QRIS failed');
  }
  return json.data;
}

export interface StatusData {
  id: string;
  status: string;
  amount: string;
}

export async function cekStatus(transactionId: string): Promise<StatusData> {
  const res = await fetch(`${BASE_URL}/api/qris/status/${transactionId}`, {
    headers: { Authorization: `Bearer ${BEARER}` },
  });
  const json: ApiResponse<StatusData> = await res.json();
  if (json.status !== 'success' || !json.data) {
    throw new Error(json.message || 'Status check failed');
  }
  return json.data;
}

export interface MutasiResponse {
  status: string;
  data: unknown[];
  synced: number;
  timestamp: string;
  duration_ms: number;
}

export async function cekMutasi(merchantCode: string, apiKey: string): Promise<MutasiResponse> {
  const url = new URL(`${BASE_URL}/api/mutasi`);
  url.searchParams.set('merchant_code', merchantCode);
  url.searchParams.set('api_key', apiKey);

  const res = await fetch(url.toString(), { headers: { Authorization: `Bearer ${BEARER}` } });
  const json: MutasiResponse = await res.json();
  return json;
}
```

```typescript
// h2hApi.ts
import type { ApiResponse } from './types';

const BASE_URL = process.env.QRIS_API_URL!;
const BEARER  = process.env.QRIS_BEARER_TOKEN!;
const headers = { Authorization: `Bearer ${BEARER}` };

export interface H2HPayload {
  product: string;
  dest: string;
  refID: string;
  memberID?: string;
  pin?: string;
  password?: string;
  harga_max?: number;
}

export async function sendH2H(payload: H2HPayload): Promise<string> {
  const url = new URL(`${BASE_URL}/api/h2h/trx`);
  Object.entries(payload).forEach(([k, v]) => {
    if (v !== undefined) url.searchParams.set(k, String(v));
  });
  const res = await fetch(url.toString(), { headers });
  const json: ApiResponse<string> = await res.json();
  if (json.status !== 'success') throw new Error(json.message);
  return json.data!;
}

export interface ProductData {
  kode: string;
  produk: string;
  keterangan: string;
  harga: string;
  status: string;
}

export interface ProductResponse {
  data: ProductData[];
  total: number;
  page: number;
}

export async function getProducts(produk?: string, page = 1): Promise<ProductResponse> {
  const url = new URL(`${BASE_URL}/api/product`);
  if (produk) url.searchParams.set('produk', produk);
  url.searchParams.set('page', String(page));
  const res = await fetch(url.toString(), { headers });
  return res.json();
}

export async function getCategories(maxPages = 5): Promise<string[]> {
  const url = new URL(`${BASE_URL}/api/category`);
  url.searchParams.set('max_pages', String(maxPages));
  const res = await fetch(url.toString(), { headers });
  return res.json();
}
```

```typescript
// Penggunaan di bot Telegram (node-telegram-bot-api)
import TelegramBot from 'node-telegram-bot-api';
import { createQris, cekStatus } from './qrisApi';

const bot = new TelegramBot(process.env.BOT_TOKEN!, { polling: true });

const MERCHANT_CODE = process.env.MERCHANT_CODE!;
const API_KEY       = process.env.QIOSPAY_API_KEY!;
const QRIS_STATIC   = process.env.QRIS_STATIC!;

bot.onText(/\/deposit (\d+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const amount = parseInt(match![1]);

  try {
    const qris = await createQris({
      merchant_code: MERCHANT_CODE,
      api_key: API_KEY,
      qris_static: QRIS_STATIC,
      amount,
      telegram_id: String(chatId),
    });

    await bot.sendPhoto(chatId, qris.qr_data_url, {
      caption:
        `💳 *QRIS Deposit Rp${amount.toLocaleString('id-ID')}*\n\n` +
        `🆔 ID: \`${qris.id}\`\n` +
        `⏳ Kadaluarsa: ${new Date(qris.expired_at).toLocaleTimeString('id-ID')}\n\n` +
        `Scan QR di atas dengan e-wallet / mobile banking Anda.`,
      parse_mode: 'Markdown',
    });

    // Polling status tiap 3 detik
    const pollId = setInterval(async () => {
      const status = await cekStatus(qris.id);
      if (status.status === 'success') {
        clearInterval(pollId);
        bot.sendMessage(chatId, `✅ Pembayaran Rp${amount} berhasil!`);
      } else if (status.status === 'expired' || status.status === 'cancelled') {
        clearInterval(pollId);
        bot.sendMessage(chatId, `❌ Transaksi ${status.status}`);
      }
    }, 3000);
  } catch (e: any) {
    bot.sendMessage(chatId, `❌ Gagal membuat QR: ${e.message}`);
  }
});
```

---

## 10. Setup Callback Real-time

### Callback QRIS

Callback real-time untuk deposit QRIS adalah cara yang **direkomendasikan** — tidak ada delay, tidak perlu polling manual. Qiospay langsung memberitahu server Anda saat dana masuk.

### Langkah-langkah:

1. **Deploy API ini** ke Vercel (atau platform lain dengan URL publik).

2. **Buka website frontend** → pilih **Create QRIS Payment** → isi form → klik **Submit Request**.

3. Setelah sukses, di halaman hasil akan muncul **box biru** berisi:
   ```
   Callback URL (daftarkan ke Qiospay)
   https://domainmu.com/api/callback/accept/QP019571.a1b2c3d4e5f6...
   ```
   Klik icon **copy** untuk menyalin URL.

4. **Daftarkan URL tersebut** ke dashboard Qiospay:
   - Login ke [qiospay.id](https://qiospay.id)
   - Buka menu **Integrasi / Webhook / Callback**
   - Paste URL yang sudah di-copy
   - Simpan

5. **Selesai.** Mulai sekarang setiap dana masuk ke QRIS Anda, Qiospay akan langsung memanggil URL tersebut dan:
   - Status transaksi di database berubah jadi `success`
   - Frontend mendeteksi perubahan dalam 3 detik (via polling)
   - Tampilan berubah jadi "Pembayaran Berhasil" (card hijau)

> URL callback hanya perlu didaftarkan **satu kali per merchant_code**, bukan per transaksi.

### Callback H2H (PPOB)

Untuk menerima notifikasi status transaksi PPOB dari Qiospay:

1. Login ke [qiospay.id/mitra](https://qiospay.id/mitra)
2. Buka menu **Integrasi transaksi > Transaksi IP**
3. Isi **URL Callback** dengan:
   ```
   https://domainmu.com/api/callback/h2h
   ```
4. Isi **User ID** = `memberId`, **PIN** = `memberPin`, **Password** = `memberPassword`
5. Isi **IP Address** = IP publik server Anda
6. Simpan

Server akan menerima notifikasi via `POST /api/callback/h2h` setiap kali transaksi H2H diproses.

---

## 11. Deployment

### Vercel (direkomendasikan)

```bash
npm install -g vercel
vercel deploy --prod
```

Lalu set environment variables di **Vercel Dashboard → Project → Settings → Environment Variables**:
- `DATABASE_URL`
- `API_BEARER_TOKEN`
- (opsional) `CLOUDINARY_*`

Callback webhook bekerja sempurna di Vercel. Scheduler fallback tidak perlu diaktifkan.

### Railway

```bash
railway login
railway up
```

Set env vars di Railway dashboard. Jika ingin aktifkan scheduler:
```
ENABLE_INTERNAL_SCHEDULER=true
SCHEDULER_CRON=*/30 * * * * *
```

### Docker (Self-hosted)

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build
EXPOSE 3000
CMD ["npm", "start"]
```

```bash
docker build -t qris-api .
docker run -p 3000:3000 --env-file .env.local qris-api
```

---

## 12. Troubleshooting

| Gejala | Penyebab | Solusi |
|---|---|---|
| `401 Unauthorized` | Header Authorization salah format | Gunakan `Authorization: Bearer <token>` — ada spasi antara `Bearer` dan token |
| `400 Validasi gagal` | Field wajib kosong atau tipe salah | Cek field `errors` di response |
| `500: qris_static tidak valid` | QRIS statis bukan format EMVCo | Pastikan string diawali `00020101`, didapat dari scan QR statis asli |
| `500: All image hosts failed` | Semua layanan hosting gambar gagal | Isi `CLOUDINARY_*` di env sebagai fallback. QR tetap tampil via `qr_data_url` (base64) |
| `502: Qiospay API error` | Kredensial Qiospay salah | Cek `merchant_code` dan `api_key` di dashboard Qiospay |
| `synced: 0` terus | Belum ada pembayaran / nominal tidak sama persis | Normal jika belum ada yang bayar. Pastikan transfer nominal = nominal QR |
| Callback tidak dipanggil | URL belum didaftarkan di dashboard Qiospay | Daftarkan `callback_url_to_register` dari response create QR |
| Status auto-success tanpa bayar | Versi lama: `checkAndSettle` di status endpoint | Update ke versi terbaru. Status endpoint sekarang read-only |
| QR tidak tampil di website | Menggunakan `qr_image_url` (hosting eksternal) | Gunakan `qr_data_url` (base64) — tampil tanpa hosting |
| Saldo tidak bertambah | Transaksi sudah expired (5 menit) | Generate QR baru, bayar sebelum expired |
| `H2H: Invalid Signature` | Parameter sign salah / credential tidak cocok | Pastikan memberID, pin, password benar. Biarkan sign auto-generate |
| `H2H: harga_max` | Harga produk melebihi batas | Naikkan harga_max atau hilangkan param untuk terima harga berapa pun |
| Produk 404 | Endpoint Qiospay berubah | Cek `lib/product.ts`, update URL endpoint produk Qiospay |
| Kategori kosong | Data produk dari Qiospay tidak memiliki field `produk` | Cek response `/api/product` langsung, sesuaikan field di `getCategories` |

---

## 13. Keamanan

- **Bearer Token** gunakan string acak minimal 32 karakter: `openssl rand -hex 32`
- **Callback Secret** di-generate otomatis oleh server (32 hex chars, unik per merchant)
- **`api_key` Qiospay** disimpan di database agar server bisa polling atas nama merchant — pastikan `DATABASE_URL` pakai SSL (Neon default sudah SSL)
- **Rate limiter** in-memory: akurat di single-instance (Railway/VPS). Untuk multi-instance Vercel, tambahkan Redis/Upstash untuk rate limit presisi
- **Timing-safe comparison** pada Bearer Token dan callback secret (mencegah timing attack)
- **`FOR UPDATE SKIP LOCKED`** di query settlement mencegah race condition dan double-credit
- **Status endpoint read-only** — tidak memicu settlement, aman dari false positive
- **Callback URL unik per merchant** — secret acak 32 karakter, tidak bisa ditebak merchant lain


Copyright By Irfan Web Developer
