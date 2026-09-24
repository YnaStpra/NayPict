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

    // Cache-Control headers instructs edge caches to serve cached version for 30s
    // Eliminates redundant serverless function invocations while maintaining responsive synchronization.
    c.header('Cache-Control', 'public, max-age=15, s-maxage=30, stale-while-revalidate=60');
    c.header('CDN-Cache-Control', 'public, s-maxage=30, stale-while-revalidate=60');

    return c.json(result.ok(version));
  });
}
