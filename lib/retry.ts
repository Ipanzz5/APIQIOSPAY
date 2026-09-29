import axios from 'axios';
import pRetry from 'p-retry';
import { logger } from './logger';

export async function fetchWithRetry<T = any>(url: string, options?: Record<string, any>, retries = 3): Promise<T> {
  return pRetry(
    async () => {
      const res = await axios.get(url, { ...options, timeout: 15000 });
      return res.data as T;
    },
    {
      retries,
      factor: 2,
      minTimeout: 1000,
      maxTimeout: 10000,
      onFailedAttempt: (err) => {
        logger.warn(`Retry ${err.attemptNumber}/${retries + 1} for ${url}: ${err.message}`);
      },
    }
  );
}
