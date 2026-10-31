import { type Hono } from 'hono';
import { photoService } from '@/server/service/photo-service';
import { cache } from '@/server/infra/cache';
import { analyticsService } from '@/server/service/analytics-service';
import { insightsService } from '@/server/service/insights-service';
import result from '@/server/model/result';
import { timingSafeEqual } from '@/server/lib/crypto';
import { getClientIp } from '@/server/lib/ip';
import { logSecurityAudit } from '@/server/lib/audit';
import type { HonoEnv } from '@/server/hono/type';

// This module exposes scheduled maintenance endpoints for Vercel Cron and external automation triggers.

// Register scheduled cron maintenance routes.
export function registerCronApi(app: Hono<HonoEnv>) {
  // Execute scheduled maintenance (expired Recycle Bin photos and expired cache cleanup).
  app.get('/cron/cleanup', async (c) => {
    const authHeader = c.req.header('authorization');
    const cronSecret = process.env.CRON_SECRET;

    if (cronSecret) {
      const expectedAuth = `Bearer ${cronSecret}`;
      if (!authHeader || !timingSafeEqual(authHeader, expectedAuth)) {
        return c.json(result.fail('Unauthorized', 401), 401);
      }
    } else if (process.env.NODE_ENV === 'production') {
      return c.json(result.fail('CRON_SECRET not configured on server.', 401), 401);
    }

    try {
      const clientIp = getClientIp(c);
      logSecurityAudit({
        action: 'CRON_CLEANUP_EXECUTE',
        clientIp,
      });

      await Promise.all([
        photoService.clearExpired(),
        cache.clearExpired(),
        analyticsService.cleanStaleSessions(90),
        insightsService.cleanStaleViews(90),
      ]);

      return c.json(result.ok({ message: 'Cleanup completed successfully.' }));
    } catch (err: unknown) {
      console.error('[cron/cleanup] Scheduled maintenance error:', err);
      return c.json(result.fail('Scheduled maintenance task failed.', 500), 500);
    }
  });
}
