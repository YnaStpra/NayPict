import cron from 'node-cron';
import { photoService } from '@/server/service/photo-service';

// This module uses node-cron Clean out expired Recycle Bin photos regularly。

// Every 5 Execute expired recycle bin cleaning every minute。
function clearExpiredPhotoTask() {
  cron.schedule('*/5 * * * *', () => {
    void photoService.clearExpired().catch((err) => {
      console.error('[task] clearExpired fail', err);
    });
  });
}

export { clearExpiredPhotoTask };
