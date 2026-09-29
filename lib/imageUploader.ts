import axios from 'axios';
import FormData from 'form-data';
import { v2 as cloudinary } from 'cloudinary';
import { logger } from './logger';

// Pixhost: tidak butuh API key sama sekali (dokumentasi resmi pixhost.to/api)
async function uploadToPixhost(buffer: Buffer, filename: string): Promise<string> {
  const form = new FormData();
  form.append('img', buffer, filename);
  form.append('content_type', '0'); // 0 = family safe
  const res = await axios.post('https://api.pixhost.to/images', form, {
    headers: { ...form.getHeaders(), Accept: 'application/json' },
    timeout: 15000,
  });
  if (!res.data?.show_url) throw new Error('Pixhost: no show_url in response');
  return String(res.data.show_url).replace(/^http:\/\//, 'https://');
}

// Cloudinary: butuh CLOUDINARY_CLOUD_NAME + API_KEY + API_SECRET
async function uploadToCloudinary(buffer: Buffer, filename: string): Promise<string> {
  if (!process.env.CLOUDINARY_CLOUD_NAME) throw new Error('Cloudinary: not configured');
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });
  return new Promise((resolve, reject) => {
    cloudinary.uploader.upload_stream(
      { folder: 'qris_payments', public_id: filename.replace('.png', '') },
      (err, result) => err || !result ? reject(err) : resolve(result.secure_url)
    ).end(buffer);
  });
}

// Catbox: sering blokir IP cloud/datacenter (termasuk Vercel) — fallback terakhir
async function uploadToCatbox(buffer: Buffer, filename: string): Promise<string> {
  const form = new FormData();
  form.append('reqtype', 'fileupload');
  form.append('fileToUpload', buffer, filename);
  const res = await axios.post('https://catbox.moe/user/api.php', form, {
    headers: { ...form.getHeaders(), 'User-Agent': 'Mozilla/5.0' },
    timeout: 15000,
  });
  const url = String(res.data).trim();
  if (!url.startsWith('http')) throw new Error(`Catbox: unexpected response: ${url}`);
  return url;
}

/**
 * Upload gambar QR dengan 3 layer fallback: Pixhost (utama, zero-config) →
 * Cloudinary (jika dikonfigurasi) → Catbox (upaya terakhir).
 */
export async function uploadImage(buffer: Buffer, filename: string): Promise<string> {
  const uploaders = [
    { name: 'Pixhost', fn: () => uploadToPixhost(buffer, filename) },
    { name: 'Cloudinary', fn: () => uploadToCloudinary(buffer, filename) },
    { name: 'Catbox', fn: () => uploadToCatbox(buffer, filename) },
  ];

  const errors: string[] = [];
  for (const u of uploaders) {
    try {
      const url = await u.fn();
      logger.info(`Image uploaded via ${u.name}`);
      return url;
    } catch (e: any) {
      const msg = e?.message || String(e);
      logger.warn(`${u.name} upload failed: ${msg}`);
      errors.push(`${u.name}: ${msg}`);
    }
  }
  throw new Error(`All image hosts failed: ${errors.join(' | ')}`);
}
