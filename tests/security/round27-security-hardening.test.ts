/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
import { describe, it, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  logSecurityAudit,
  getRecentAuditLogs,
  clearMemoryAuditLogs,
  type SecurityAuditRecord,
} from '@/server/lib/audit';
import { sudoService } from '@/server/service/sudo-service';
import { cache } from '@/server/infra/cache';
import BizError from '@/server/error/biz-error';
import fs from 'node:fs';
import path from 'node:path';

describe('Round 27 Security Hardening Suite', () => {
  const inMemoryCache = new Map<string, any>();
  const origCacheGet = cache.get;
  const origCacheSet = cache.set;
  const origCacheDelete = cache.delete;

  beforeEach(() => {
    inMemoryCache.clear();
    cache.get = (async (k: string) => inMemoryCache.get(k)) as any;
    cache.set = (async (k: string, v: any) => { inMemoryCache.set(k, v); }) as any;
    cache.delete = (async (k: string) => { inMemoryCache.delete(k); }) as any;
    clearMemoryAuditLogs();
  });

  after(() => {
    cache.get = origCacheGet;
    cache.set = origCacheSet;
    cache.delete = origCacheDelete;
  });

  describe('Item 1: Zero-Trust Destructive Operations Guarded by Sudo Mode', () => {
    it('verifies POST /photo/delete strictly enforces requireSudo', () => {
      const filePath = path.join(process.cwd(), 'src/server/api/photo-api.ts');
      const content = fs.readFileSync(filePath, 'utf-8');
      assert.ok(
        content.includes("app.post('/photo/delete'"),
        'photo-api must expose POST /photo/delete'
      );
      // Ensure requireSudo is called within the handler
      const handlerSection = content.split("app.post('/photo/delete'")[1].slice(0, 300);
      assert.ok(
        handlerSection.includes('sudoService.requireSudo(userId)'),
        'POST /photo/delete must enforce sudoService.requireSudo(userId)'
      );
    });

    it('verifies POST /storage/cleaner/fix-broken strictly enforces requireSudo', () => {
      const filePath = path.join(process.cwd(), 'src/server/api/storage-cleaner-api.ts');
      const content = fs.readFileSync(filePath, 'utf-8');
      assert.ok(
        content.includes("app.post('/storage/cleaner/fix-broken'"),
        'storage-cleaner-api must expose POST /storage/cleaner/fix-broken'
      );
      const handlerSection = content.split("app.post('/storage/cleaner/fix-broken'")[1].slice(0, 300);
      assert.ok(
        handlerSection.includes('sudoService.requireSudo(userId)'),
        'POST /storage/cleaner/fix-broken must enforce sudoService.requireSudo(userId)'
      );
    });

    it('verifies POST /storage/set and POST /storage/delete strictly enforce requireSudo', () => {
      const filePath = path.join(process.cwd(), 'src/server/api/storage-api.ts');
      const content = fs.readFileSync(filePath, 'utf-8');
      
      const setHandler = content.split("app.post('/storage/set'")[1].slice(0, 300);
      assert.ok(
        setHandler.includes('sudoService.requireSudo(getUserId())'),
        'POST /storage/set must enforce sudoService.requireSudo'
      );

      const deleteHandler = content.split("app.post('/storage/delete'")[1].slice(0, 300);
      assert.ok(
        deleteHandler.includes('sudoService.requireSudo(getUserId())'),
        'POST /storage/delete must enforce sudoService.requireSudo'
      );
    });

    it('verifies POST /album/delete strictly enforces requireSudo', () => {
      const filePath = path.join(process.cwd(), 'src/server/api/album-api.ts');
      const content = fs.readFileSync(filePath, 'utf-8');
      
      const albumDeleteHandler = content.split("app.post('/album/delete'")[1].slice(0, 300);
      assert.ok(
        albumDeleteHandler.includes('sudoService.requireSudo(userId)'),
        'POST /album/delete must enforce sudoService.requireSudo(userId)'
      );
    });
  });

  describe('Item 2: Voluntary Sudo Mode Drop / Instant Lockout (POST /user/sudo/drop)', () => {
    const testUserId = 'admin-user-sudo-drop-test';

    it('allows an administrator to drop elevated Sudo privileges immediately', async () => {
      // 1. Elevate Sudo
      await inMemoryCache.set(`sudo_session_${testUserId}`, {
        elevated: true,
        elevatedAt: Date.now(),
        expiresAt: Date.now() + 900000,
      });

      const beforeDrop = await sudoService.isSudoActive(testUserId);
      assert.strictEqual(beforeDrop.active, true);

      // 2. Clear sudo (simulating POST /user/sudo/drop)
      await sudoService.clearSudo(testUserId);

      // 3. Status must immediately revert to inactive
      const afterDrop = await sudoService.isSudoActive(testUserId);
      assert.strictEqual(afterDrop.active, false);

      // 4. Subsequent high-risk calls must fail with 403
      await assert.rejects(
        async () => {
          await sudoService.requireSudo(testUserId);
        },
        (err: unknown) => {
          assert.ok(err instanceof BizError);
          assert.strictEqual((err as BizError).code, 403);
          assert.strictEqual((err as BizError).message, 'auth.sudoRequired');
          return true;
        }
      );
    });

    it('verifies user-api registers POST /user/sudo/drop with audit logging', () => {
      const filePath = path.join(process.cwd(), 'src/server/api/user-api.ts');
      const content = fs.readFileSync(filePath, 'utf-8');
      assert.ok(
        content.includes("app.post('/user/sudo/drop'"),
        'user-api must register POST /user/sudo/drop'
      );
      assert.ok(
        content.includes("action: 'USER_SUDO_DROP'"),
        'POST /user/sudo/drop must emit USER_SUDO_DROP audit log'
      );
    });

    it('verifies request client and UI provide userSudoDrop function and Lock Sudo button', () => {
      const reqPath = path.join(process.cwd(), 'src/request/user.ts');
      const reqContent = fs.readFileSync(reqPath, 'utf-8');
      assert.ok(
        reqContent.includes('export function userSudoDrop()'),
        'src/request/user.ts must export userSudoDrop()'
      );

      const uiPath = path.join(process.cwd(), 'src/components/admin/admin-security-card.tsx');
      const uiContent = fs.readFileSync(uiPath, 'utf-8');
      assert.ok(
        uiContent.includes('userSudoDrop'),
        'AdminSecurityCard must import userSudoDrop'
      );
      assert.ok(
        uiContent.includes('Lock Sudo Now'),
        'AdminSecurityCard must render Lock Sudo Now button when elevated'
      );
    });
  });

  describe('Item 3: Full-Resolution Media Download Audit Forensics (PHOTO_DOWNLOAD)', () => {
    it('verifies photo-api.ts logs PHOTO_DOWNLOAD and PHOTO_DOWNLOAD_INITIATE', () => {
      const filePath = path.join(process.cwd(), 'src/server/api/photo-api.ts');
      const content = fs.readFileSync(filePath, 'utf-8');
      
      assert.ok(
        content.includes("action: 'PHOTO_DOWNLOAD'"),
        'GET /photo/download/:id must emit PHOTO_DOWNLOAD audit event'
      );
      assert.ok(
        content.includes("action: 'PHOTO_DOWNLOAD_INITIATE'"),
        'POST /photo/download must emit PHOTO_DOWNLOAD_INITIATE audit event'
      );
    });

    it('emits structured audit records with size and file metadata on download', async () => {
      logSecurityAudit({
        action: 'PHOTO_DOWNLOAD',
        userId: 'admin-1',
        clientIp: '103.20.10.5',
        targetId: 'photo-999',
        details: {
          fileName: 'highres-landscape.jpg',
          sizeBytes: 15420100,
          isAdmin: true,
        },
      });

      const logs = await getRecentAuditLogs({ action: 'PHOTO_DOWNLOAD' });
      assert.strictEqual(logs.length, 1);
      assert.strictEqual(logs[0].action, 'PHOTO_DOWNLOAD');
      assert.strictEqual(logs[0].targetId, 'photo-999');
      assert.strictEqual(logs[0].clientIp, '103.20.10.5');
      assert.strictEqual(logs[0].details?.fileName, 'highres-landscape.jpg');
      assert.strictEqual(logs[0].details?.sizeBytes, 15420100);
      assert.strictEqual(logs[0].severity, 'INFO');
    });
  });

  describe('Item 4: Resilient Multi-Container / Serverless Audit Trail Merge', () => {
    it('preserves cached audit history across serverless cold starts without overwriting', async () => {
      // 1. Seed cache with existing audit logs (from other containers or previous runs)
      const existingLogs: SecurityAuditRecord[] = [
        {
          id: 'log-seed-1',
          timestamp: new Date(Date.now() - 60000).toISOString(),
          action: 'AUTH_LOGIN_SUCCESS',
          userId: 'admin',
          clientIp: '1.2.3.4',
          severity: 'INFO',
        },
        {
          id: 'log-seed-2',
          timestamp: new Date(Date.now() - 30000).toISOString(),
          action: 'USER_PASSWORD_CHANGE',
          userId: 'admin',
          clientIp: '1.2.3.4',
          severity: 'WARNING',
        },
      ];
      await inMemoryCache.set('security_audit_logs_v1', existingLogs);

      // 2. Cold-start in-memory state (empty)
      clearMemoryAuditLogs();

      // 3. Emit a new audit log in this fresh container
      logSecurityAudit({
        action: 'PHOTO_DELETE',
        userId: 'admin',
        clientIp: '1.2.3.4',
        targetId: 'photo-100',
      });

      // 4. Query recent logs: must merge cached logs with fresh in-memory log
      const logs = await getRecentAuditLogs();
      assert.ok(logs.length >= 3, 'Audit logs must contain both cached seeds and new log');
      const actionNames = logs.map((l) => l.action);
      assert.ok(actionNames.includes('PHOTO_DELETE'));
      assert.ok(actionNames.includes('USER_PASSWORD_CHANGE'));
      assert.ok(actionNames.includes('AUTH_LOGIN_SUCCESS'));
    });
  });
});
