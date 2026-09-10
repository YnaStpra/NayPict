import { type Hono } from 'hono';
import { photoService } from '@/server/service/photo-service';
import { cache } from '@/server/infra/cache';
import result from '@/server/model/result';
import type { HonoEnv } from '@/server/hono/type';

// This module exposes scheduled maintenance endpoints for Vercel Cron and external automation triggers.

// Register scheduled cron maintenance routes.
export function registerCronApi(app: Hono<HonoEnv>) {
  // Execute scheduled maintenance (expired Recycle Bin photos and expired cache cleanup).
  app.get('/cron/cleanup', async (c) => {
    const authHeader = c.req.header('authorization');
    const cronSecret = process.env.CRON_SECRET;

    if (cronSecret) {
      if (authHeader !== `Bearer ${cronSecret}`) {
        return c.json(result.fail('Unauthorized', 401), 401);
      }
    } else if (process.env.NODE_ENV === 'production') {
      return c.json(result.fail('CRON_SECRET not configured on server.', 401), 401);
    }

    try {
      await Promise.all([
        photoService.clearExpired(),
        cache.clearExpired(),
      ]);

      return c.json(result.ok({ message: 'Cleanup completed successfully.' }));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Cleanup task failed';
      console.error('[cron/cleanup] Scheduled maintenance error:', err);
      return c.json(result.fail(message, 500), 500);
    }
  });
}
