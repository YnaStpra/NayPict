import cron from 'node-cron';
import { cache } from '@/server/infra/cache';

// This module uses node-cron Clean expired cache regularly.

// Every 10 Execute expired cache cleanup every minute.
function clearExpiredCacheTask() {
  cron.schedule('*/10 * * * *', () => {
    void cache.clearExpired().catch((err) => {
      console.error('[task] clearExpiredCache fail', err);
    });
  });
}

export { clearExpiredCacheTask };
