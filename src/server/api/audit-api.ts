import { Hono, type Context } from 'hono';
import crypto from 'node:crypto';
import result from '@/server/model/result';
import { getUserId } from '@/server/security/context';
import { checkIsAdmin } from '@/server/security/security';
import { getRecentAuditLogs, logSecurityAudit } from '@/server/lib/audit';
import { sudoService } from '@/server/service/sudo-service';
import { getClientIp } from '@/server/lib/ip';
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

  // Export complete security audit trail as structured forensic JSON (Admin + Sudo Mode required).
  app.get('/security/audit/export', async (c: Context) => {
    const userId = getUserId();
    if (!userId) {
      throw new BizError('auth.failed', 401);
    }

    const isAdmin = await checkIsAdmin(c);
    if (!isAdmin) {
      throw new BizError('auth.forbidden', 403);
    }

    // High-risk forensic export requires elevated Sudo Mode
    await sudoService.requireSudo(userId);

    const clientIp = getClientIp(c);
    const logs = await getRecentAuditLogs({ limit: 1000 });

    const serializedRecords = JSON.stringify(logs);
    const checksum = crypto.createHash('sha256').update(serializedRecords).digest('hex');

    const exportPayload = {
      exportVersion: '1.0',
      exportedAt: new Date().toISOString(),
      exportedBy: userId,
      recordCount: logs.length,
      sha256Checksum: checksum,
      records: logs,
    };

    logSecurityAudit({
      action: 'AUDIT_EXPORT',
      userId,
      clientIp,
      details: { count: logs.length, sha256: checksum },
    });

    const exportDateStr = new Date().toISOString().slice(0, 10);
    c.header('Content-Type', 'application/json; charset=utf-8');
    c.header('Content-Disposition', `attachment; filename="naypict-audit-forensic-${exportDateStr}.json"`);
    c.header('Cache-Control', 'no-store, private');
    c.header('X-Content-Type-Options', 'nosniff');

    return c.json(result.ok(exportPayload));
  });
}
