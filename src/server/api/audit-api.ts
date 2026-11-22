import { Hono, type Context } from 'hono';
import result from '@/server/model/result';
import { getUserId } from '@/server/security/context';
import { checkIsAdmin } from '@/server/security/security';
import { getRecentAuditLogs } from '@/server/lib/audit';
import BizError from '@/server/error/biz-error';
import type { HonoEnv } from '../hono/type';

// This module registers endpoints for querying administrative security audit trails and forensic logs.

export function registerAuditApi(app: Hono<HonoEnv>) {
  // Query recent security audit logs with optional filtering by action or severity (Admin only).
  app.get('/security/audit', async (c: Context) => {
    const userId = getUserId();
    if (!userId) {
      throw new BizError('auth.failed', 401);
    }

    const isAdmin = await checkIsAdmin(c);
    if (!isAdmin) {
      throw new BizError('auth.forbidden', 403);
    }

    const rawLimit = Number(c.req.query('limit'));
    const action = c.req.query('action')?.trim();
    const severity = c.req.query('severity')?.trim();

    const logs = await getRecentAuditLogs({
      limit: rawLimit,
      action: action || undefined,
      severity: severity || undefined,
    });

    return c.json(result.ok(logs));
  });
}
