import QRCode from 'qrcode';

export async function generateQRBuffer(text: string): Promise<Buffer> {
  return QRCode.toBuffer(text, { type: 'png', width: 400, margin: 2 });
}

export async function generateQRDataUrl(text: string): Promise<string> {
  return QRCode.toDataURL(text, { type: 'image/png', width: 400, margin: 2 });
}
