import { Hono, type Context } from 'hono';
import result from '@/server/model/result';
import { getUserId } from '@/server/security/context';
import { getClientIp } from '@/server/lib/ip';
import { logSecurityAudit } from '@/server/lib/audit';
import { storageCleanerService } from '@/server/service/storage-cleaner-service';
import {
  type StorageCleanerDeleteOrphansBo,
  type StorageCleanerAbortUploadsBo,
  type StorageCleanerFixBrokenBo,
} from '@/server/entity/vo/storage-cleaner';
import type { HonoEnv } from '../hono/type';

export function registerStorageCleanerApi(app: Hono<HonoEnv>) {
  // Scans storage buckets and correlates with database to detect orphan files and broken records.
  app.post('/storage/cleaner/scan', async (c: Context) => {
    let storageId: string | undefined;
    try {
      const body = await c.req.json<{ storageId?: string }>();
      storageId = body.storageId;
    } catch {
      // Body is optional
    }

    const report = await storageCleanerService.scan(storageId);
    return c.json(result.ok(report));
  });

  // Permanently deletes orphan files from storage.
  app.post('/storage/cleaner/delete-orphans', async (c: Context) => {
    const userId = getUserId();
    const body = await c.req.json<StorageCleanerDeleteOrphansBo>();
    const res = await storageCleanerService.deleteOrphans(body);

    logSecurityAudit({
      action: 'STORAGE_ORPHANS_CLEAN',
      userId,
      clientIp: getClientIp(c),
      targetId: body.storageId,
      details: { count: res.deleted, keysSample: body.keys.slice(0, 5) },
    });

    return c.json(result.ok(res));
  });

  // Aborts abandoned / incomplete multipart uploads in storage.
  app.post('/storage/cleaner/abort-uploads', async (c: Context) => {
    const userId = getUserId();
    const body = await c.req.json<StorageCleanerAbortUploadsBo>();
    const res = await storageCleanerService.abortIncompleteUploads(body);

    logSecurityAudit({
      action: 'STORAGE_MULTIPART_ABORT',
      userId,
      clientIp: getClientIp(c),
      targetId: body.storageId,
      details: { count: res.aborted },
    });

    return c.json(result.ok(res));
  });

  // Fixes broken records in DB whose files are missing from storage.
  app.post('/storage/cleaner/fix-broken', async (c: Context) => {
    const userId = getUserId();
    const body = await c.req.json<StorageCleanerFixBrokenBo>();
    const res = await storageCleanerService.fixBrokenRecords(body, userId);

    logSecurityAudit({
      action: 'STORAGE_BROKEN_FIX',
      userId,
      clientIp: getClientIp(c),
      details: { count: res.fixed },
    });

    return c.json(result.ok(res));
  });
}
