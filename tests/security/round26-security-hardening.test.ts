/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
process.env.ENABLE_SUDO_MODE = 'true';
import { describe, it, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  logSecurityAudit,
  getRecentAuditLogs,
  clearMemoryAuditLogs,
  redactSensitiveDetails,
  type SecurityAuditRecord,
} from '@/server/lib/audit';
import { sudoService } from '@/server/service/sudo-service';
import { cache } from '@/server/infra/cache';
import { isPublicObjectKey } from '@/../workers/media-gateway/src/index.js';
import { S3StorageStrategy } from '@/server/storage/s3-storage';
import BizError from '@/server/error/biz-error';

describe('Round 26 Security Hardening Suite', () => {
  const inMemoryCache = new Map<string, any>();
  const origCacheGet = cache.get;
  const origCacheSet = cache.set;
  const origCacheDelete = cache.delete;

  beforeEach(() => {
    inMemoryCache.clear();
    cache.get = (async (k: string) => inMemoryCache.get(k)) as any;
    cache.set = (async (k: string, v: any) => { inMemoryCache.set(k, v); }) as any;
    cache.delete = (async (k: string) => { inMemoryCache.delete(k); }) as any;
  });

  after(() => {
    cache.get = origCacheGet;
    cache.set = origCacheSet;
    cache.delete = origCacheDelete;
  });

  describe('Item 1: Security Audit Trail & Live Forensic Feed', () => {
    beforeEach(() => {
      clearMemoryAuditLogs();
    });

    it('records security events with structured metadata, automatic UUID and ISO timestamp', async () => {
      logSecurityAudit({
        action: 'PHOTO_VIEW',
        userId: 'admin-1',
        clientIp: '192.168.1.100',
        targetId: 'photo-xyz',
        details: { referrer: 'https://naypict.my.id' },
      });

      const logs = await getRecentAuditLogs({ limit: 10 });
      assert.strictEqual(logs.length, 1);
      assert.strictEqual(logs[0].action, 'PHOTO_VIEW');
      assert.strictEqual(logs[0].userId, 'admin-1');
      assert.strictEqual(logs[0].clientIp, '192.168.1.100');
      assert.strictEqual(logs[0].targetId, 'photo-xyz');
      assert.strictEqual(logs[0].severity, 'INFO');
      assert.ok(logs[0].id.length >= 10);
      assert.ok(!Number.isNaN(Date.parse(logs[0].timestamp)));
      assert.strictEqual(logs[0].details?.referrer, 'https://naypict.my.id');
    });

    it('correctly maps event severity to CRITICAL, WARNING, and INFO', async () => {
      logSecurityAudit({ action: 'PHOTO_DELETE', userId: 'admin-1', clientIp: '127.0.0.1' });
      logSecurityAudit({ action: 'INSIGHTS_RESET', userId: 'admin-1', clientIp: '127.0.0.1' });
      logSecurityAudit({ action: 'USER_DELETED', userId: 'admin-1', clientIp: '127.0.0.1' });
      logSecurityAudit({ action: 'LOGIN_LOCKOUT', userId: 'anon', clientIp: '10.0.0.1' });
      logSecurityAudit({ action: 'SUDO_ELEVATION', userId: 'admin-1', clientIp: '127.0.0.1' });
      logSecurityAudit({ action: 'USER_PASSWORD_CHANGE', userId: 'admin-1', clientIp: '127.0.0.1' });
      logSecurityAudit({ action: 'BACKUP_EXPORT', userId: 'admin-1', clientIp: '127.0.0.1' });
      logSecurityAudit({ action: 'SESSION_REVOKED', userId: 'admin-1', clientIp: '127.0.0.1' });
      logSecurityAudit({ action: 'SETTINGS_UPDATE', userId: 'admin-1', clientIp: '127.0.0.1' });

      const logs = await getRecentAuditLogs({ limit: 20 });
      const criticalLogs = logs.filter((l) => l.severity === 'CRITICAL');
      const warningLogs = logs.filter((l) => l.severity === 'WARNING');
      const infoLogs = logs.filter((l) => l.severity === 'INFO');

      assert.strictEqual(criticalLogs.length, 4); // PHOTO_DELETE, INSIGHTS_RESET, USER_DELETED, LOGIN_LOCKOUT
      assert.strictEqual(warningLogs.length, 4);  // SUDO_ELEVATION, USER_PASSWORD_CHANGE, BACKUP_EXPORT, SESSION_REVOKED
      assert.strictEqual(infoLogs.length, 1);     // SETTINGS_UPDATE
    });

    it('recursively redacts credentials and sensitive tokens from audit details', () => {
      const rawDetails = {
        username: 'admin',
        password: 'SuperSecretPassword123!',
        nested: {
          sessionToken: 'jwt-token-value-here',
          apiKey: 'cf-api-key-here',
          safeField: 'normal-value',
        },
        safeList: [
          { secretKey: 'top-secret', label: 'production' },
          { cookie: 'auth_token=abc123xyz', description: 'test cookie' },
        ],
        sensitiveContainer: {
          credentialsList: ['should-be-masked'],
        },
      };

      const redacted = redactSensitiveDetails(rawDetails) as any;
      assert.strictEqual(redacted.username, 'admin');
      assert.strictEqual(redacted.password, '***REDACTED***');
      assert.strictEqual(redacted.nested.safeField, 'normal-value');
      assert.strictEqual(redacted.nested.sessionToken, '***REDACTED***');
      assert.strictEqual(redacted.nested.apiKey, '***REDACTED***');
      assert.strictEqual(redacted.safeList[0].secretKey, '***REDACTED***');
      assert.strictEqual(redacted.safeList[0].label, 'production');
      assert.strictEqual(redacted.safeList[1].cookie, '***REDACTED***');
      assert.strictEqual(redacted.safeList[1].description, 'test cookie');
      assert.strictEqual(redacted.sensitiveContainer.credentialsList, '***REDACTED***');
    });

    it('filters audit records by action and severity, and respects query limit', async () => {
      logSecurityAudit({ action: 'USER_DELETE', userId: 'admin', clientIp: '1.1.1.1' });
      logSecurityAudit({ action: 'PHOTO_DELETE', userId: 'admin', clientIp: '1.1.1.1' });
      logSecurityAudit({ action: 'USER_DELETE', userId: 'admin', clientIp: '1.1.1.1' });
      logSecurityAudit({ action: 'SUDO_ELEVATION', userId: 'admin', clientIp: '1.1.1.1' });

      const userDeleteLogs = await getRecentAuditLogs({ action: 'USER_DELETE' });
      assert.strictEqual(userDeleteLogs.length, 2);

      const criticalOnly = await getRecentAuditLogs({ severity: 'CRITICAL' });
      assert.strictEqual(criticalOnly.length, 3);

      const limited = await getRecentAuditLogs({ limit: 2 });
      assert.strictEqual(limited.length, 2);
    });
  });

  describe('Item 2: Sudo Mode Expansion on High-Risk Operations', () => {
    const testUserId = 'admin-user-sudo-test-99';

    beforeEach(async () => {
      await sudoService.clearSudo(testUserId);
    });

    it('blocks execution when user has not elevated to Sudo Mode', async () => {
      await assert.rejects(
        async () => {
          await sudoService.requireSudo(testUserId);
        },
        (err: unknown) => {
          assert.ok(err instanceof BizError);
          assert.strictEqual((err as BizError).message, 'auth.sudoRequired');
          assert.strictEqual((err as BizError).code, 403);
          return true;
        }
      );
    });

    it('permits execution when user is in active Sudo Mode', async () => {
      await cache.set('sudo_session_' + testUserId, {
        elevated: true,
        elevatedAt: Date.now(),
        expiresAt: Date.now() + 900000,
      }, { ttl: 900 });

      const status = await sudoService.isSudoActive(testUserId);
      assert.strictEqual(status.active, true);
      assert.ok(status.remainingSeconds > 0);

      // requireSudo must not throw
      await sudoService.requireSudo(testUserId);

      // Verify clearSudo re-locks sudo
      await sudoService.clearSudo(testUserId);
      const afterClear = await sudoService.isSudoActive(testUserId);
      assert.strictEqual(afterClear.active, false);
    });
  });

  describe('Item 3: Media Gateway Prefix Isolation & Path Traversal Prevention', () => {
    it('allows valid derivative previews and thumbnails', () => {
      assert.strictEqual(isPublicObjectKey('previews/photo1.jpg'), true);
      assert.strictEqual(isPublicObjectKey('previews/photo2.webp'), true);
      assert.strictEqual(isPublicObjectKey('thumbnails/photo1.webp'), true);
      assert.strictEqual(isPublicObjectKey('thumbnails/photo1.avif'), true);
    });

    it('allows standalone public videos with approved video extensions', () => {
      assert.strictEqual(isPublicObjectKey('video-clip.mp4'), true);
      assert.strictEqual(isPublicObjectKey('short-reel.webm'), true);
      assert.strictEqual(isPublicObjectKey('cinema.mov'), true);
    });

    it('strictly denies original assets and backup archives even if video extension is used', () => {
      // CRITICAL: Master original video in originals/ must NEVER bypass the gateway
      assert.strictEqual(isPublicObjectKey('originals/master-video.mp4'), false);
      assert.strictEqual(isPublicObjectKey('originals/camera-raw.mov'), false);
      assert.strictEqual(isPublicObjectKey('originals/high-res.jpg'), false);
      assert.strictEqual(isPublicObjectKey('originals/nested/file.mp4'), false);

      // CRITICAL: System backup files must NEVER be served
      assert.strictEqual(isPublicObjectKey('backups/database-export.json'), false);
      assert.strictEqual(isPublicObjectKey('backups/2026-backup.tar.gz'), false);
      assert.strictEqual(isPublicObjectKey('backups/media-archive.mp4'), false);
    });

    it('strictly denies path traversal attempts', () => {
      assert.strictEqual(isPublicObjectKey('../etc/passwd'), false);
      assert.strictEqual(isPublicObjectKey('previews/../originals/secret.jpg'), false);
      assert.strictEqual(isPublicObjectKey('thumbnails/..\\backups/dump.sql'), false);
      assert.strictEqual(isPublicObjectKey(''), false);
      assert.strictEqual(isPublicObjectKey(null as any), false);
      assert.strictEqual(isPublicObjectKey(undefined as any), false);
    });
  });

  describe('Item 4: S3 / Cloudflare R2 Presigned PUT Signed Content-Length', () => {
    const s3Storage = new S3StorageStrategy();
    const mockStorage: any = {
      storageId: 's3-test-1',
      type: 's3',
      bucket: 'naypict-test-bucket',
      endpoint: 'https://s3.us-east-1.amazonaws.com',
      region: 'us-east-1',
      accessKey: 'AKIAIOSFODNN7EXAMPLE',
      secretKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
    };

    it('binds ContentLength into SigV4 signature headers when contentLength is provided', async () => {
      const expectedSize = 10485760; // 10MB
      const url = await s3Storage.getPresignedPutUrl(
        'originals/test-photo.jpg',
        'image/jpeg',
        mockStorage,
        900,
        expectedSize
      );

      assert.ok(typeof url === 'string');
      assert.ok(url.includes('naypict-test-bucket'));
      // SigV4 signed headers must include content-length
      const parsedUrl = new URL(url);
      const signedHeaders = parsedUrl.searchParams.get('X-Amz-SignedHeaders') || '';
      assert.ok(
        signedHeaders.toLowerCase().includes('content-length'),
        `Expected content-length to be signed in headers: ${signedHeaders}`
      );
    });

    it('generates presigned URL without content-length in signed headers when omitted', async () => {
      const url = await s3Storage.getPresignedPutUrl(
        'previews/test-preview.jpg',
        'image/jpeg',
        mockStorage,
        900
      );

      assert.ok(typeof url === 'string');
      assert.ok(url.includes('naypict-test-bucket'));
      const parsedUrl = new URL(url);
      const signedHeaders = parsedUrl.searchParams.get('X-Amz-SignedHeaders') || '';
      assert.ok(
        !signedHeaders.toLowerCase().includes('content-length'),
        `Expected content-length NOT to be in signed headers when omitted: ${signedHeaders}`
      );
    });
  });
});
