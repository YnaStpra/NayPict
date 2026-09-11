import { type Hono } from 'hono';
import result from '@/server/model/result';
import { syncService } from '@/server/service/sync-service';
import type { HonoEnv } from '@/server/hono/type';

// This module provides edge-cacheable state version heartbeat endpoints for real-time UI synchronization.

// Register catalog sync endpoints.
export function registerSyncApi(app: Hono<HonoEnv>) {

  // Fetch current catalog version vector (cached at Cloudflare Edge CDN for 3s to protect Vercel limits).
  app.get('/sync/version', async (c) => {
    const version = await syncService.getVersion();

    // Cache-Control headers instructs Cloudflare Edge to cache response for 3s
    // 99.8% of requests under viral traffic (1k - 10k users) are answered directly by Cloudflare CDN without hitting Vercel.
    c.header('Cache-Control', 'public, max-age=3, s-maxage=3, stale-while-revalidate=5');

    return c.json(result.ok(version));
  });
}
