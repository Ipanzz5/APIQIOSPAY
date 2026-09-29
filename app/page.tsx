'use client';

import { useState, useEffect } from 'react';

type ModalType = 'qris-create' | 'mutasi' | 'health' | 'h2h-trx' | 'products' | 'categories' | null;

const endpointDefs: Record<string, {
  title: string; subtitle: string; method: string; action: string;
  fields: { name: string; placeholder: string; type: string; required: boolean; note?: string }[]
}> = {
  'qris-create': {
    title: 'Create QRIS Payment',
    subtitle: 'Generate QR Code dinamis untuk pembayaran via e-wallet',
    method: 'POST',
    action: '/api/qris/create',
    fields: [
      { name: 'merchant_code', placeholder: 'Kode merchant (min 3 karakter)', type: 'text', required: true },
      { name: 'api_key', placeholder: 'API Key merchant Qiospay', type: 'password', required: true },
      { name: 'qris_static', placeholder: 'QRIS Static string / NNID', type: 'text', required: true, note: 'QRIS statis milik merchant' },
      { name: 'amount', placeholder: 'Nominal (contoh: 50000)', type: 'number', required: true, note: 'Maksimal 10.000.000' },
      { name: 'description', placeholder: 'Deskripsi transaksi (opsional)', type: 'text', required: false },
      { name: 'telegram_id', placeholder: 'ID Telegram pengguna (opsional)', type: 'text', required: false },
    ],
  },
  mutasi: {
    title: 'Cek Mutasi QRIS',
    subtitle: 'Ambil riwayat transaksi QRIS dari Qiospay & settle otomatis',
    method: 'GET',
    action: '/api/mutasi',
    fields: [
      { name: 'merchant_code', placeholder: 'Kode merchant', type: 'text', required: true },
      { name: 'api_key', placeholder: 'API Key merchant Qiospay', type: 'password', required: true },
    ],
  },
  health: {
    title: 'Health Check',
    subtitle: 'Periksa status koneksi API & database',
    method: 'GET',
    action: '/api/health',
    fields: [],
  },
  'h2h-trx': {
    title: 'H2H Transaction',
    subtitle: 'Kirim transaksi PPOB (pulsa, paket data, token listrik)',
    method: 'GET',
    action: '/api/h2h/trx',
    fields: [
      { name: 'product', placeholder: 'Kode produk (contoh: sp2)', type: 'text', required: true, note: 'Dapatkan dari /api/product' },
      { name: 'dest', placeholder: 'Nomor HP / ID pelanggan', type: 'text', required: true },
      { name: 'refID', placeholder: 'Referensi unik (maks 20 karakter)', type: 'text', required: true },
      { name: 'memberID', placeholder: 'User ID dashboard Qiospay', type: 'text', required: false, note: 'Gunakan env default jika kosong' },
      { name: 'pin', placeholder: 'PIN transaksi', type: 'password', required: false },
      { name: 'password', placeholder: 'Password login Qiospay', type: 'password', required: false },
      { name: 'harga_max', placeholder: 'Batas harga maksimum (opsional)', type: 'number', required: false },
    ],
  },
  products: {
    title: 'Daftar Produk',
    subtitle: 'Ambil daftar produk PPOB dari Qiospay',
    method: 'GET',
    action: '/api/product',
    fields: [
      { name: 'produk', placeholder: 'Filter nama produk (opsional)', type: 'text', required: false },
      { name: 'kategori', placeholder: 'Filter kategori (opsional)', type: 'text', required: false },
      { name: 'page', placeholder: 'Halaman (default: 1)', type: 'number', required: false },
    ],
  },
  categories: {
    title: 'Daftar Kategori',
    subtitle: 'Ekstrak kategori unik dari data produk Qiospay',
    method: 'GET',
    action: '/api/category',
    fields: [
      { name: 'page', placeholder: 'Halaman awal (default: 1)', type: 'number', required: false },
      { name: 'max_pages', placeholder: 'Maks halaman yg discan (default: 5)', type: 'number', required: false },
    ],
  },
};

export default function Page() {
  const [modal, setModal] = useState<ModalType>(null);
  const [bearerToken, setBearerToken] = useState('');
  const [urlPreview, setUrlPreview] = useState('');
  const [response, setResponse] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [responseData, setResponseData] = useState<any>(null);

  const openModal = (type: ModalType) => {
    setModal(type);
    setUrlPreview('');
    setResponse('');
    setSubmitted(false);
    setResponseData(null);
  };

  const closeModal = () => setModal(null);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    const form = e.currentTarget;
    const formData = new FormData(form);

    if (!modal) return;

    const cfg = endpointDefs[modal];
    const isGet = cfg.method === 'GET';

    let body: BodyInit | undefined;
    let url = cfg.action;

    if (isGet) {
      const params = new URLSearchParams();
      formData.forEach((val, key) => params.set(key, val.toString()));
      url += '?' + params.toString();
    } else {
      body = JSON.stringify(Object.fromEntries(formData));
    }

    setUrlPreview(window.location.origin + url);
    setResponse('Waiting for response...');

    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (bearerToken) headers['Authorization'] = 'Bearer ' + bearerToken;

      const res = await fetch(url, {
        method: cfg.method,
        headers,
        body,
      });
      const text = await res.text();
      try {
        const parsed = JSON.parse(text);
        setResponse(JSON.stringify(parsed, null, 2));
        setResponseData(parsed);
      } catch {
        setResponse(text);
        setResponseData(null);
      }
      setSubmitted(true);
    } catch (err) {
      setResponse('Error: ' + (err as Error).message);
      setResponseData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (modal) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [modal]);

  const config = modal ? endpointDefs[modal] : null;

  return (
    <>
      <div className="bg-animate">
        <div className="blob blob-1" />
        <div className="blob blob-2" />
      </div>

      <nav className="glass sticky top-0 z-50 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 btn-primary rounded-xl flex items-center justify-center text-white shadow-lg shadow-emerald-200">
            <i className="fas fa-bolt text-lg" />
          </div>
          <div>
            <h1 className="font-bold text-sm tracking-tight">QRIS Deposit API</h1>
            <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">Multi-Tenant Payment Gateway</p>
          </div>
        </div>
        <div className="flex items-center gap-6">
          <button onClick={() => document.getElementById('section-docs')?.scrollIntoView({ behavior: 'smooth' })} className="text-xs font-bold text-slate-400 hover:text-emerald-600 transition-colors uppercase tracking-widest">
            Docs
          </button>
          <a href="/api/health" target="_blank" className="text-xs font-bold text-emerald-600 uppercase tracking-widest border-b-2 border-emerald-600 pb-1">
            Status
          </a>
        </div>
      </nav>

      <header className="max-w-6xl mx-auto px-6 pt-16 pb-12 text-center">
        <h2 className="text-4xl md:text-5xl font-extrabold tracking-tight text-slate-900 mb-4">
          Powerful <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-500 to-emerald-600">QRIS Payment</span> API
        </h2>
        <p className="text-slate-500 max-w-xl mx-auto text-sm md:text-base leading-relaxed">
          Integrasi pembayaran QRIS yang cepat, aman, dan mudah digunakan untuk multi-merchant dengan dokumentasi lengkap.
        </p>
      </header>

      <main className="max-w-6xl mx-auto px-6 pb-20">
        <div className="glass p-6 rounded-3xl mb-12 shadow-sm flex flex-col md:flex-row gap-4 items-center">
          <div className="flex-1 w-full">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 block">Bearer Token</label>
            <div className="relative">
              <i className="fas fa-lock absolute left-4 top-1/2 -translate-y-1/2 text-slate-300 text-xs" />
              <input
                type="text"
                value={bearerToken}
                onChange={(e) => setBearerToken(e.target.value)}
                placeholder="Isi API_BEARER_TOKEN untuk mengirim request..."
                className="w-full pl-10 pr-4 py-4 bg-white border border-slate-100 rounded-2xl text-xs font-medium outline-none focus:ring-2 focus:ring-emerald-100 focus:border-emerald-400 transition-all shadow-inner"
              />
            </div>
          </div>
          <div className="w-full md:w-auto pt-6">
            <div className="bg-emerald-50 px-4 py-4 rounded-2xl border border-emerald-100 flex items-center gap-3">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest">System Online</span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <div className="glass p-6 rounded-3xl card-hover flex flex-col justify-between h-full">
            <div>
              <div className="flex items-center gap-2 mb-4">
                <span className="text-[9px] font-black text-emerald-600 bg-emerald-50 px-2 py-1 rounded-md uppercase">POST</span>
                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Payments</span>
              </div>
              <h3 className="font-bold text-slate-800 mb-2">Create QRIS Payment</h3>
              <p className="text-[11px] text-slate-500 leading-relaxed mb-6">Buat transaksi QRIS dinamis. Merchant disimpan otomatis & mengembalikan callback URL untuk didaftarkan ke dashboard Qiospay.</p>
            </div>
            <button onClick={() => openModal('qris-create')} className="w-full py-3 btn-primary text-white rounded-xl font-bold text-[10px] uppercase tracking-widest flex items-center justify-center gap-2">
              <span>Try it Now</span>
              <i className="fas fa-arrow-right text-[8px]" />
            </button>
          </div>

          <div className="glass p-6 rounded-3xl card-hover flex flex-col justify-between h-full">
            <div>
              <div className="flex items-center gap-2 mb-4">
                <span className="text-[9px] font-black text-emerald-600 bg-emerald-50 px-2 py-1 rounded-md uppercase">GET</span>
                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Transactions</span>
              </div>
              <h3 className="font-bold text-slate-800 mb-2">Cek Mutasi QRIS</h3>
              <p className="text-[11px] text-slate-500 leading-relaxed mb-6">Ambil riwayat mutasi QRIS dari Qiospay. Transaksi pending yang cocok akan otomatis di-settle (FIFO).</p>
            </div>
            <button onClick={() => openModal('mutasi')} className="w-full py-3 btn-primary text-white rounded-xl font-bold text-[10px] uppercase tracking-widest flex items-center justify-center gap-2">
              <span>Try it Now</span>
              <i className="fas fa-arrow-right text-[8px]" />
            </button>
          </div>

          <div className="glass p-6 rounded-3xl card-hover flex flex-col justify-between h-full">
            <div>
              <div className="flex items-center gap-2 mb-4">
                <span className="text-[9px] font-black text-emerald-600 bg-emerald-50 px-2 py-1 rounded-md uppercase">GET</span>
                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">System</span>
              </div>
              <h3 className="font-bold text-slate-800 mb-2">Health Check</h3>
              <p className="text-[11px] text-slate-500 leading-relaxed mb-6">Periksa status layanan API, koneksi database, uptime server.</p>
            </div>
            <button onClick={() => openModal('health')} className="w-full py-3 btn-primary text-white rounded-xl font-bold text-[10px] uppercase tracking-widest flex items-center justify-center gap-2">
              <span>Try it Now</span>
              <i className="fas fa-arrow-right text-[8px]" />
            </button>
          </div>

          <div className="glass p-6 rounded-3xl card-hover flex flex-col justify-between h-full">
            <div>
              <div className="flex items-center gap-2 mb-4">
                <span className="text-[9px] font-black text-emerald-600 bg-emerald-50 px-2 py-1 rounded-md uppercase">GET</span>
                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">PPOB</span>
              </div>
              <h3 className="font-bold text-slate-800 mb-2">H2H Transaction</h3>
              <p className="text-[11px] text-slate-500 leading-relaxed mb-6">Kirim transaksi PPOB (pulsa, paket data, listrik, dll) via Qiospay H2H dengan signature otomatis.</p>
            </div>
            <button onClick={() => openModal('h2h-trx')} className="w-full py-3 btn-primary text-white rounded-xl font-bold text-[10px] uppercase tracking-widest flex items-center justify-center gap-2">
              <span>Try it Now</span>
              <i className="fas fa-arrow-right text-[8px]" />
            </button>
          </div>

          <div className="glass p-6 rounded-3xl card-hover flex flex-col justify-between h-full">
            <div>
              <div className="flex items-center gap-2 mb-4">
                <span className="text-[9px] font-black text-emerald-600 bg-emerald-50 px-2 py-1 rounded-md uppercase">GET</span>
                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Catalog</span>
              </div>
              <h3 className="font-bold text-slate-800 mb-2">Daftar Produk</h3>
              <p className="text-[11px] text-slate-500 leading-relaxed mb-6">Ambil daftar produk PPOB dari Qiospay (tanpa perlu kredensial). Filter berdasarkan nama atau kategori.</p>
            </div>
            <button onClick={() => openModal('products')} className="w-full py-3 btn-primary text-white rounded-xl font-bold text-[10px] uppercase tracking-widest flex items-center justify-center gap-2">
              <span>Try it Now</span>
              <i className="fas fa-arrow-right text-[8px]" />
            </button>
          </div>

          <div className="glass p-6 rounded-3xl card-hover flex flex-col justify-between h-full">
            <div>
              <div className="flex items-center gap-2 mb-4">
                <span className="text-[9px] font-black text-emerald-600 bg-emerald-50 px-2 py-1 rounded-md uppercase">GET</span>
                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Catalog</span>
              </div>
              <h3 className="font-bold text-slate-800 mb-2">Daftar Kategori</h3>
              <p className="text-[11px] text-slate-500 leading-relaxed mb-6">Ekstrak daftar kategori unik dari data produk Qiospay. Tidak memanggil API terpisah.</p>
            </div>
            <button onClick={() => openModal('categories')} className="w-full py-3 btn-primary text-white rounded-xl font-bold text-[10px] uppercase tracking-widest flex items-center justify-center gap-2">
              <span>Try it Now</span>
              <i className="fas fa-arrow-right text-[8px]" />
            </button>
          </div>
        </div>
      </main>

      <section id="section-docs" className="max-w-4xl mx-auto px-6 pb-20 mt-8">
        <div className="glass rounded-[2.5rem] p-8 md:p-12 shadow-sm">
          <h2 className="text-3xl font-black text-slate-800 mb-8 flex items-center gap-4">
            <i className="fas fa-book-open text-emerald-600" />
            Documentation
          </h2>

          <div className="space-y-12">
            <div>
              <h3 className="text-lg font-bold text-emerald-600 mb-4 tracking-tight uppercase tracking-[0.1em]">1. Authentication</h3>
              <p className="text-xs text-slate-500 mb-4 leading-relaxed">
                Semua endpoint (kecuali Health Check) mewajibkan header <code className="bg-emerald-50 text-emerald-600 px-2 py-1 rounded">Authorization: Bearer &lt;token&gt;</code>.
                Token diatur melalui environment variable <code className="bg-emerald-50 text-emerald-600 px-2 py-1 rounded">API_BEARER_TOKEN</code> di server.
              </p>
              <div className="bg-slate-950 rounded-2xl p-4 overflow-hidden shadow-xl">
                <div className="flex items-center justify-between mb-4 border-b border-slate-800 pb-3">
                  <span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Example Header</span>
                  <span className="text-[9px] text-emerald-400 font-bold">JSON</span>
                </div>
                <pre className="text-[11px] text-emerald-300 font-mono">"Authorization": "Bearer YOUR_API_BEARER_TOKEN"</pre>
              </div>
            </div>

            <div>
              <h3 className="text-lg font-bold text-emerald-600 mb-4 tracking-tight uppercase tracking-[0.1em]">2. Endpoints</h3>
              <div className="space-y-6">
                <div className="p-5 border border-slate-100 rounded-2xl bg-white/50">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-[9px] font-black text-emerald-600 bg-emerald-50 px-2 py-1 rounded uppercase">POST</span>
                    <h4 className="text-[10px] font-bold text-slate-700">/api/qris/create</h4>
                  </div>
                  <p className="text-[10px] text-slate-500 mb-2">Membuat transaksi QRIS dinamis. Merchant akan didaftarkan otomatis jika belum ada.</p>
                  <div className="bg-slate-50 rounded-xl p-3 text-[10px] font-mono text-slate-600">
                    <p className="font-bold text-slate-700 mb-1">Request Body (JSON):</p>
                    <pre className="text-emerald-600">{JSON.stringify({
  merchant_code: "merchant123",
  api_key: "qiospay_api_key_anda",
  qris_static: "0002010102112663000000...",
  amount: 50000,
  description: "Topup saldo",
  telegram_id: "123456789"
}, null, 2)}</pre>
                  </div>
                  <p className="text-[10px] text-slate-400 mt-2">
                    <span className="text-red-500">*</span> Required: merchant_code, api_key, qris_static, amount &nbsp;
                    <span className="text-slate-400">|</span> Optional: description, telegram_id
                  </p>
                  <div className="bg-emerald-50 rounded-xl p-3 mt-2 text-[10px] text-emerald-700">
                    <strong>Response:</strong> Menampilkan QR image URL &amp; callback URL yang harus didaftarkan ke dashboard Qiospay (cukup sekali per merchant_code).
                  </div>
                </div>

                <div className="p-5 border border-slate-100 rounded-2xl bg-white/50">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-[9px] font-black text-emerald-600 bg-emerald-50 px-2 py-1 rounded uppercase">GET</span>
                    <h4 className="text-[10px] font-bold text-slate-700">/api/mutasi</h4>
                  </div>
                  <p className="text-[10px] text-slate-500 mb-2">Menarik mutasi QRIS dari Qiospay. Transaksi pending yang cocok (berdasarkan amount & merchant) akan di-settle secara FIFO.</p>
                  <code className="text-[9px] font-mono text-emerald-500 break-all bg-slate-50 p-2 rounded-lg block">
                    /api/mutasi?merchant_code=merchant123&amp;api_key=qiospay_api_key_anda
                  </code>
                  <p className="text-[10px] text-slate-400 mt-2">
                    <span className="text-red-500">*</span> Required query params: merchant_code, api_key
                  </p>
                </div>

                <div className="p-5 border border-slate-100 rounded-2xl bg-white/50">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-[9px] font-black text-emerald-600 bg-emerald-50 px-2 py-1 rounded uppercase">POST</span>
                    <h4 className="text-[10px] font-bold text-slate-700">/api/callback/accept/{'{merchant_code}'}.{'{secret}'}</h4>
                  </div>
                  <p className="text-[10px] text-slate-500 mb-2">Endpoint callback internal yang dipanggil otomatis oleh Qiospay saat dana masuk. URL ini diperoleh dari response Create QRIS.</p>
                  <code className="text-[9px] font-mono text-emerald-500 break-all bg-slate-50 p-2 rounded-lg block">
                    /api/callback/accept/merchant123.abc123def456...
                  </code>
                  <p className="text-[10px] text-slate-400 mt-2">Tidak perlu dipanggil manual — daftarkan URL ini ke dashboard Qiospay.</p>
                </div>

                <div className="p-5 border border-slate-100 rounded-2xl bg-white/50">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-[9px] font-black text-emerald-600 bg-emerald-50 px-2 py-1 rounded uppercase">GET</span>
                    <h4 className="text-[10px] font-bold text-slate-700">/api/health</h4>
                  </div>
                  <p className="text-[10px] text-slate-500 mb-2">Cek status server, koneksi database, dan uptime. Satu-satunya endpoint yang tidak memerlukan autentikasi.</p>
                  <div className="bg-slate-50 rounded-xl p-3 text-[10px] font-mono text-slate-600">
                    <pre className="text-emerald-600">{JSON.stringify({
  status: "healthy",
  db_latency_ms: 2,
  uptime_s: 3600,
  timestamp: "2026-07-10T..."
}, null, 2)}</pre>
                  </div>
                </div>

                <div className="p-5 border border-slate-100 rounded-2xl bg-white/50">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-[9px] font-black text-emerald-600 bg-emerald-50 px-2 py-1 rounded uppercase">GET</span>
                    <h4 className="text-[10px] font-bold text-slate-700">/api/h2h/trx</h4>
                  </div>
                  <p className="text-[10px] text-slate-500 mb-2">Kirim transaksi PPOB (pulsa, paket data, token listrik, dll) ke Qiospay via H2H. Signature di-generate otomatis dari memberID, product, dest, refID, pin, dan password.</p>
                  <code className="text-[9px] font-mono text-emerald-500 break-all bg-slate-50 p-2 rounded-lg block">
                    /api/h2h/trx?product=sp2&amp;dest=085282756500&amp;refID=ORDER-001&amp;harga_max=3000
                  </code>
                  <p className="text-[10px] text-slate-400 mt-2">
                    <span className="text-red-500">*</span> Required: product, dest, refID &nbsp;
                    <span className="text-slate-400">|</span> Optional: memberID, pin, password, harga_max, sign
                  </p>
                  <div className="bg-emerald-50 rounded-xl p-3 mt-2 text-[10px] text-emerald-700">
                    <strong>Response:</strong> Teks status transaksi dari Qiospay (sukses diproses / harga_max ditolak / error).
                  </div>
                </div>

                <div className="p-5 border border-slate-100 rounded-2xl bg-white/50">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-[9px] font-black text-emerald-600 bg-emerald-50 px-2 py-1 rounded uppercase">GET</span>
                    <h4 className="text-[10px] font-bold text-slate-700">/api/product</h4>
                  </div>
                  <p className="text-[10px] text-slate-500 mb-2">Ambil daftar produk PPOB dari Qiospay via endpoint <code className="bg-slate-100 px-1 rounded">admin/modules/mapping/harga/{'{page}'}/reseller</code>. Mendukung filter lokal berdasarkan nama produk/kategori.</p>
                  <code className="text-[9px] font-mono text-emerald-500 break-all bg-slate-50 p-2 rounded-lg block">
                    /api/product?produk=Telkomsel&amp;kategori=pulsa&amp;page=1
                  </code>
                  <p className="text-[10px] text-slate-400 mt-2">
                    <span className="text-slate-400">Optional query params:</span> produk, kategori, page
                  </p>
                  <div className="bg-slate-50 rounded-xl p-3 mt-2 text-[10px] font-mono text-slate-600">
                    <pre className="text-emerald-600">{JSON.stringify({
  data: [{ kode: "BYRTSELQM", produk: "Telkomsel Omni", harga: "2050", status: "1" }],
  total: 100,
  page: 1
}, null, 2)}</pre>
                  </div>
                </div>

                <div className="p-5 border border-slate-100 rounded-2xl bg-white/50">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-[9px] font-black text-emerald-600 bg-emerald-50 px-2 py-1 rounded uppercase">GET</span>
                    <h4 className="text-[10px] font-bold text-slate-700">/api/category</h4>
                  </div>
                  <p className="text-[10px] text-slate-500 mb-2">Ekstrak kategori unik dari data produk Qiospay (diambil dari beberapa halaman). Tidak ada endpoint kategori terpisah di Qiospay.</p>
                  <code className="text-[9px] font-mono text-emerald-500 break-all bg-slate-50 p-2 rounded-lg block">
                    /api/category?page=1&amp;max_pages=5
                  </code>
                  <p className="text-[10px] text-slate-400 mt-2">
                    <span className="text-slate-400">Optional:</span> page (default 1), max_pages (default 5)
                  </p>
                  <div className="bg-slate-50 rounded-xl p-3 mt-2 text-[10px] font-mono text-slate-600">
                    <pre className="text-emerald-600">{JSON.stringify(["Telkomsel Omni", "Indosat", "XL", "Token Listrik"], null, 2)}</pre>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {modal && config && (
        <div
          className="fixed inset-0 z-[100] flex items-start justify-center p-6 bg-slate-900/40 backdrop-blur-md overflow-y-auto"
          onClick={(e) => { if (e.target === e.currentTarget) closeModal(); }}
        >
          <div className="modal-enter glass w-full max-w-lg rounded-[2.5rem] overflow-hidden shadow-2xl">
            <div className="px-8 py-6 border-b border-slate-100 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[9px] font-black text-emerald-600 bg-emerald-50 px-2 py-1 rounded uppercase">{config.method}</span>
                  <h3 className="font-black text-slate-800">{config.title}</h3>
                </div>
                <p className="text-[10px] text-slate-400 font-medium tracking-tight">{config.subtitle}</p>
              </div>
              <button onClick={closeModal} className="w-10 h-10 rounded-full bg-slate-50 flex items-center justify-center text-slate-400 hover:text-red-500 hover:bg-red-50 transition-all">
                <i className="fas fa-times" />
              </button>
            </div>

            <div className="p-8 space-y-6">
              {urlPreview && (
                <div className="mb-6">
                  <div className="flex items-center justify-between mb-2 px-1">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Request URL</span>
                    <span className="text-[9px] text-emerald-500 font-bold uppercase tracking-widest">{config.method}</span>
                  </div>
                  <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 overflow-hidden relative">
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 flex gap-2">
                      <button
                        onClick={() => navigator.clipboard.writeText(urlPreview)}
                        className="text-slate-300 hover:text-emerald-500 transition-colors"
                      >
                        <i className="fas fa-copy text-xs" />
                      </button>
                    </div>
                    <div className="text-[10px] font-mono text-slate-600 truncate pr-8 whitespace-nowrap overflow-x-auto">
                      {urlPreview}
                    </div>
                  </div>
                </div>
              )}

              {response && modal === 'qris-create' && responseData?.data?.qr_data_url ? (
                <QrisPaymentCard data={responseData.data} bearerToken={bearerToken} onClose={closeModal} />
              ) : response && (
                <div className="mb-6">
                  <div className="flex items-center justify-between mb-2 px-1">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Server Response</span>
                    <span className="text-[9px] text-emerald-500 font-bold uppercase tracking-widest">JSON</span>
                  </div>
                  <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100 min-h-[150px] max-h-[300px] overflow-auto">
                    <pre className="text-[11px] text-slate-700 font-mono leading-relaxed">{response}</pre>
                  </div>
                </div>
              )}

              {!submitted && !bearerToken && config.action !== '/api/health' && (
                <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3 text-[10px] text-amber-700">
                  <i className="fas fa-exclamation-triangle mr-1" />
                  Isi Bearer Token di atas agar request tidak ditolak (401).
                </div>
              )}

              {!submitted && <form onSubmit={handleSubmit} className="space-y-5">
                {config.fields.map((field) => (
                  <div key={field.name}>
                    <div className="flex items-center gap-1 mb-1">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{field.name}</label>
                      {field.required && <span className="text-red-400 text-[9px]">*</span>}
                      {field.note && <span className="text-[8px] text-slate-300 ml-auto">{field.note}</span>}
                    </div>
                    <input
                      type={field.type}
                      name={field.name}
                      placeholder={field.placeholder}
                      required={field.required}
                      className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl text-[11px] font-medium outline-none focus:ring-1 focus:ring-emerald-400 transition-all"
                    />
                  </div>
                ))}

                <div className="pt-4">
                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full py-4 btn-primary text-white rounded-2xl font-black text-xs uppercase tracking-[0.2em] shadow-xl shadow-emerald-100 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {loading ? 'Processing...' : 'Submit Request'}
                  </button>
                </div>
              </form>}
            </div>
          </div>
        </div>
      )}

      <footer className="py-10 text-center opacity-50">
        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-[0.2em]">
          &copy; {new Date().getFullYear()} QRIS Deposit API. All rights reserved.
        </p>
      </footer>
    </>
  );
}

function QrisPaymentCard({ data, bearerToken, onClose }: { data: any; bearerToken: string; onClose: () => void }) {
  const [timeLeft, setTimeLeft] = useState('');
  const [status, setStatus] = useState<string>(data.status);
  const [cancelling, setCancelling] = useState(false);

  useEffect(() => {
    const expired = new Date(data.expired_at).getTime();
    const update = () => {
      const diff = expired - Date.now();
      if (diff <= 0) { setTimeLeft('Kadaluarsa'); setStatus('expired'); return; }
      const m = Math.floor(diff / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setTimeLeft(`${m}:${s.toString().padStart(2, '0')}`);
    };
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [data.expired_at]);

  useEffect(() => {
    if (status !== 'pending') return;
    const poll = async () => {
      try {
        const res = await fetch(`/api/qris/status/${data.id}`, {
          headers: bearerToken ? { Authorization: 'Bearer ' + bearerToken } : {},
        });
        const json = await res.json();
        if (json.data?.status && json.data.status !== 'pending') setStatus(json.data.status);
      } catch { /* silent */ }
    };
    poll();
    const id = setInterval(poll, 3000);
    return () => clearInterval(id);
  }, [data.id, status, bearerToken]);

  const fmt = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  const handleCancel = async () => {
    setCancelling(true);
    try {
      const res = await fetch('/api/qris/cancel', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...(bearerToken ? { Authorization: 'Bearer ' + bearerToken } : {}) },
        body: JSON.stringify({ id: data.id }),
      });
      const json = await res.json();
      if (json.status === 'success') {
        setStatus('cancelled');
        setTimeout(onClose, 1500);
      } else {
        alert('Gagal membatalkan: ' + (json.message || 'Unknown error'));
      }
    } catch (e) {
      alert('Gagal membatalkan transaksi. Cek koneksi dan coba lagi.');
    }
    setCancelling(false);
  };

  const badgeClass = ({
    pending: 'bg-amber-100 text-amber-700',
    success: 'bg-emerald-100 text-emerald-700',
    cancelled: 'bg-red-100 text-red-600',
    expired: 'bg-slate-100 text-slate-500',
  } as Record<string, string>)[status] || 'bg-slate-100 text-slate-700';

  const isFinal = status === 'cancelled' || status === 'expired' || status === 'success';

  return (
    <div className="mb-6 space-y-5">
      <div className="flex items-center justify-between mb-2 px-1">
        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Payment Details</span>
        <span className="text-[9px] font-bold uppercase tracking-widest text-emerald-500">
          {status === 'success' ? 'PAID' : status === 'cancelled' ? 'CANCELLED' : 'SUCCESS'}
        </span>
      </div>

      {status === 'pending' && (
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100 text-center">
          <img
            src={data.qr_data_url}
            alt="QRIS"
            className="w-48 h-48 mx-auto rounded-xl shadow-sm border border-slate-100"
          />
        </div>
      )}

      {status === 'success' && (
        <div className="bg-emerald-50 rounded-2xl p-8 shadow-sm border border-emerald-200 text-center space-y-3">
          <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto">
            <i className="fas fa-check text-2xl text-emerald-600" />
          </div>
          <p className="text-lg font-black text-emerald-700">Pembayaran Berhasil!</p>
          <p className="text-xs text-emerald-500">Dana sudah masuk dan transaksi telah di-settle.</p>
        </div>
      )}

      {status === 'cancelled' && (
        <div className="bg-red-50 rounded-2xl p-8 shadow-sm border border-red-200 text-center space-y-3">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto">
            <i className="fas fa-times text-2xl text-red-500" />
          </div>
          <p className="text-lg font-black text-red-600">Transaksi Dibatalkan</p>
          <p className="text-xs text-red-400">Transaksi ini telah dibatalkan dan akan tertutup otomatis.</p>
        </div>
      )}

      <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100 space-y-4">
        <div className="flex justify-between items-center">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">ID Transaksi</span>
          <span className="text-[10px] font-mono text-slate-700 font-medium">{data.id}</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Jumlah</span>
          <span className={`text-lg font-black ${status === 'success' ? 'text-emerald-600' : 'text-slate-800'}`}>
            Rp{Number(data.amount).toLocaleString('id-ID')}
          </span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Status</span>
          <span className={`text-[9px] font-black uppercase tracking-widest px-3 py-1 rounded-full ${badgeClass}`}>
            {status}
          </span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Dibuat</span>
          <span className="text-[10px] text-slate-600">{fmt(data.created_at)}</span>
        </div>
        {status === 'pending' && (
          <div className="flex justify-between items-center">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Kadaluarsa</span>
            <span className={`text-[11px] font-bold ${timeLeft === 'Kadaluarsa' ? 'text-red-500' : 'text-slate-700'}`}>
              {timeLeft ? `${timeLeft}` : fmt(data.expired_at)}
            </span>
          </div>
        )}
      </div>

      {status === 'pending' && data.callback_url_to_register && (
        <div className="bg-blue-50 rounded-2xl p-5 shadow-sm border border-blue-200 space-y-3">
          <div className="flex items-center gap-2">
            <i className="fas fa-link text-xs text-blue-500" />
            <span className="text-[10px] font-bold text-blue-600 uppercase tracking-widest">Callback URL (daftarkan ke Qiospay)</span>
          </div>
          <div className="relative bg-white rounded-xl p-3 border border-blue-100 overflow-hidden">
            <div className="text-[9px] font-mono text-slate-600 break-all pr-6">
              {data.callback_url_to_register}
            </div>
            <button
              onClick={() => navigator.clipboard.writeText(data.callback_url_to_register)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-blue-400 hover:text-blue-600 transition-colors"
            >
              <i className="fas fa-copy text-xs" />
            </button>
          </div>
        </div>
      )}

      {status === 'pending' && (
        <button
          onClick={handleCancel}
          disabled={cancelling}
          className="w-full py-4 bg-white border-2 border-red-200 text-red-500 rounded-2xl font-black text-xs uppercase tracking-[0.2em] hover:bg-red-50 hover:border-red-300 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {cancelling ? 'Processing...' : 'Cancel Transaction'}
        </button>
      )}
    </div>
  );
}
