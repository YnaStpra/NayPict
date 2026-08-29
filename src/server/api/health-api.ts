import { type Hono } from 'hono';
import { sql } from 'drizzle-orm';
import { orm } from '@/server/infra/db';
import { type HealthVo } from '@/server/entity/vo/health';
import type { HonoEnv } from '@/server/hono/type';

// This module exposes a health check endpoint for Load Balancers and uptime monitoring probes.

// Register health check routes for GET and HEAD methods.
export function registerHealthApi(app: Hono<HonoEnv>) {
  // Probe application and database connectivity for upstream load balancers.
  app.get('/health', async (c) => {
    try {
      if (process.env.DATABASE_URL) {
        // Quick query to confirm database responsiveness
        await orm.execute(sql`SELECT 1`);
      }

      const payload: HealthVo = {
        status: 'healthy',
        database: process.env.DATABASE_URL ? 'connected' : 'connected',
        timestamp: new Date().toISOString(),
        uptime: Math.floor(process.uptime()),
      };

      return c.json(payload, 200, {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      });
    } catch {
      const errorPayload: HealthVo = {
        status: 'unhealthy',
        database: 'disconnected',
        timestamp: new Date().toISOString(),
        uptime: Math.floor(process.uptime()),
      };

      return c.json(errorPayload, 503, {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      });
    }
  });

  // Fast-path zero-body HEAD probe for load balancer health checking.
  app.on('HEAD', '/health', async (c) => {
    try {
      if (process.env.DATABASE_URL) {
        await orm.execute(sql`SELECT 1`);
      }
      return c.body(null, 200, {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      });
    } catch {
      return c.body(null, 503, {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      });
    }
  });
}
