import cron from 'node-cron';
import { logger } from './logger';
import { db } from './db';
import { merchants } from './schema';
import { checkAndSettle } from './settlement';

let started = false;
let isRunning = false;

export function startMutationScheduler() {
  if (started) return;
  if (process.env.ENABLE_INTERNAL_SCHEDULER !== 'true') {
    logger.info('Internal scheduler disabled (ENABLE_INTERNAL_SCHEDULER != true). Relying on callback webhook.');
    return;
  }

  const cronExpr = process.env.SCHEDULER_CRON || '*/30 * * * * *';
  cron.schedule(cronExpr, async () => {
    if (isRunning) return;
    isRunning = true;
    try {
      const allMerchants = await db.select().from(merchants);
      for (const m of allMerchants) {
        try {
          const { synced } = await checkAndSettle(m.merchantCode, m.apiKey);
          if (synced > 0) logger.info(`Scheduler settled ${synced} for ${m.merchantCode}`);
        } catch (e: any) {
          logger.warn(`Scheduler error for ${m.merchantCode}: ${e?.message}`);
        }
      }
    } catch (e: any) {
      logger.error('Scheduler tick error', { error: e?.message });
    } finally {
      isRunning = false;
    }
  });
  started = true;
  logger.info(`Mutation scheduler started (cron: ${cronExpr})`);
}
