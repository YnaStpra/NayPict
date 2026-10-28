import { Hono, type Context } from 'hono';
import result from '@/server/model/result';
import { getUserId } from '@/server/security/context';
import { getClientIp } from '@/server/lib/ip';
import { logSecurityAudit } from '@/server/lib/audit';
import { backupExportRateLimiter } from '@/server/lib/rate-limiter';
import { backupService } from '@/server/service/backup-service';
import type { HonoEnv } from '../hono/type';

// This module registers database backup and disaster recovery endpoints for administrators.

export function registerBackupApi(app: Hono<HonoEnv>) {
  // Query SQLite database disk metrics and last modified timestamp.
  app.get('/backup/stats', async (c: Context) => {
    const stats = await backupService.getDatabaseStats();
    return c.json(result.ok(stats));
  });

  // Export encrypted AES-256-GCM database snapshot.
  app.post('/backup/export', async (c: Context) => {
    const userId = getUserId();
    const clientIp = getClientIp(c);
    const rateLimit = await backupExportRateLimiter.consume(`${userId}:${clientIp}`);
    if (!rateLimit.allowed) {
      c.header('Retry-After', String(Math.ceil(rateLimit.resetMs / 1000)));
      return c.json(result.fail('Backup export rate limit exceeded. Please try again later.', 429), 429);
    }

    const body = (await c.req.json().catch(() => ({}))) as { password?: string };
    const { buffer, fileName } = await backupService.createEncryptedBackup(body?.password);

    logSecurityAudit({
      action: 'BACKUP_EXPORT',
      userId,
      clientIp,
      details: { fileName, sizeBytes: buffer.length },
    });

    c.header('Content-Type', 'application/octet-stream');
    c.header('Content-Disposition', `attachment; filename="${fileName}"`);
    c.header('Content-Length', String(buffer.length));

    return c.body(new Uint8Array(buffer));
  });
}
