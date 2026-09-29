import crypto from 'crypto';
import axios from 'axios';
import { QIOSPAY_BASE_URL } from './qiospay';
import { logger } from './logger';

export function generateH2HSignature(
  memberID: string,
  product: string,
  dest: string,
  refID: string,
  pin: string,
  password: string,
): string {
  const raw = `OtomaX|${memberID}|${product}|${dest}|${refID}|${pin}|${password}`;
  const sha1 = crypto.createHash('sha1').update(raw, 'utf8').digest();
  return Buffer.from(sha1).toString('base64');
}

export interface H2HTransactionParams {
  product: string;
  dest: string;
  refID: string;
  memberID?: string;
  pin?: string;
  password?: string;
  sign?: string;
  harga_max?: number;
}

export function verifyH2HSignature(
  data: { product: string; dest: string; refID: string; sign?: string },
  memberID: string,
  pin: string,
  password: string,
): boolean {
  if (!data.sign) return false;
  const expected = generateH2HSignature(memberID, data.product, data.dest, data.refID, pin, password);
  return expected === data.sign;
}

export async function sendH2HTransaction(params: H2HTransactionParams): Promise<string> {
  const { product, dest, refID, harga_max } = params;

  const memberID = params.memberID || process.env.QIOSPAY_MEMBER_ID;
  const pin = params.pin || process.env.QIOSPAY_PIN;
  const password = params.password || process.env.QIOSPAY_PASSWORD;

  if (!memberID || !pin || !password) {
    throw new Error('Missing Qiospay H2H credentials. Provide memberID, pin, password or set QIOSPAY_MEMBER_ID, QIOSPAY_PIN, QIOSPAY_PASSWORD env vars.');
  }

  const query: Record<string, string | number> = {
    product, dest, refID, memberID, pin, password,
  };

  query.sign = params.sign || generateH2HSignature(memberID, product, dest, refID, pin, password);

  if (harga_max !== undefined) {
    query.harga_max = harga_max;
  }

  const url = `${QIOSPAY_BASE_URL}/h2h/trx`;
  logger.info('Sending H2H transaction', { refID, product, dest });

  const response = await axios.get(url, { params: query, timeout: 15000 });
  return response.data;
}
