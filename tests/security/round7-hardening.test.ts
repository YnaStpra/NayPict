import { describe, it } from 'node:test';
import assert from 'node:assert';
import { csrfProtection } from '@/server/security/csrf';
import { sessionService } from '@/server/service/session-service';
import { storageCleanerService } from '@/server/service/storage-cleaner-service';
import { syncService } from '@/server/service/sync-service';
import { backupService } from '@/server/service/backup-service';
import { exifService } from '@/server/service/exif-service';
import { cache } from '@/server/infra/cache';
import { AUTH_CACHE_KEY } from '@/server/const/cache';
import BizError from '@/server/error/biz-error';

describe('Round 7 Security & Reliability Hardening Test Suite', () => {

  describe('Anti-CSRF Host Header Poisoning Defense', () => {
    it('strictly blocks cross-origin mutation even if X-Forwarded-Host is spoofed to match Origin', async () => {
      let nextCalled = false;
      const mockContext: any = {
        req: {
          method: 'POST',
          path: '/api/user/set',
          header: (name: string) => {
            const lower = name.toLowerCase();
            if (lower === 'origin') return 'https://attacker.evil.com';
            if (lower === 'x-forwarded-host') return 'attacker.evil.com'; // Spoofed forwarded host
            if (lower === 'host') return 'naypict.my.id'; // Real server host
            if (lower === 'content-type') return 'application/json';
            return undefined;
          },
        },
      };

      await assert.rejects(
        async () => {
          await csrfProtection(mockContext, async () => {
            nextCalled = true;
          });
        },
        (err: any) => {
          assert.strictEqual(err.message, 'csrf.originMismatch');
          assert.strictEqual(err.code, 403);
          return true;
        }
      );
      assert.strictEqual(nextCalled, false);
    });

    it('allows legitimate requests with valid Origin matching Host header', async () => {
      let nextCalled = false;
      const mockContext: any = {
        req: {
          method: 'POST',
          path: '/api/user/set',
          header: (name: string) => {
            const lower = name.toLowerCase();
            if (lower === 'origin') return 'https://naypict.my.id';
            if (lower === 'host') return 'naypict.my.id';
            if (lower === 'content-type') return 'application/json';
            return undefined;
          },
        },
      };

      await csrfProtection(mockContext, async () => {
        nextCalled = true;
      });
      assert.strictEqual(nextCalled, true);
    });

    it('allows legitimate localhost origin during development', async () => {
      let nextCalled = false;
      const mockContext: any = {
        req: {
          method: 'POST',
          path: '/api/photo/recycle',
          header: (name: string) => {
            const lower = name.toLowerCase();
            if (lower === 'origin') return 'http://localhost:3000';
            if (lower === 'host') return 'localhost:3000';
            if (lower === 'content-type') return 'application/json';
            return undefined;
          },
        },
      };

      await csrfProtection(mockContext, async () => {
        nextCalled = true;
      });
      assert.strictEqual(nextCalled, true);
    });
  });

  describe('Session Invalidation & Disabled User Revocation', () => {
    it('revokes all active sessions for a user and cleans cache', async () => {
      const testUserId = 'test-revoked-user-123';
      const testUuids = ['uuid-device-1', 'uuid-device-2'];

      let cacheDeletedKey = '';
      let persistedKey = '';
      let persistedList: string[] = [];

      const origGet = cache.get;
      const origDelete = cache.delete;
      const origGetRevoked = sessionService.getRevokedUuids;
      const origPersist = (sessionService as any).persistRevokedUuids;

      try {
        cache.get = async (k: string) => {
          if (k === AUTH_CACHE_KEY + testUserId) {
            return {
              userId: testUserId,
              username: 'test',
              avatar: '',
              type: 1,
              tokenVersion: 1,
              uuidList: testUuids,
            } as any;
          }
          return null;
        };
        cache.delete = async (k: string) => {
          cacheDeletedKey = k;
        };
        sessionService.getRevokedUuids = async () => ['old-revoked'];
        (sessionService as any).persistRevokedUuids = async (uid: string, list: string[]) => {
          persistedKey = uid;
          persistedList = list;
        };

        const res = await sessionService.revokeAllSessions(testUserId);
        assert.strictEqual(res, true);
        assert.strictEqual(cacheDeletedKey, AUTH_CACHE_KEY + testUserId);
        assert.strictEqual(persistedKey, testUserId);
        assert.ok(testUuids.every((u) => persistedList.includes(u)));
        assert.ok(persistedList.includes('old-revoked'));
      } finally {
        cache.get = origGet;
        cache.delete = origDelete;
        sessionService.getRevokedUuids = origGetRevoked;
        (sessionService as any).persistRevokedUuids = origPersist;
      }
    });
  });

  describe('Storage Cleaner Disabled & Missing Storage Guard', () => {
    it('rejects deleteOrphans when storageId is missing or empty', async () => {
      await assert.rejects(
        async () => {
          await storageCleanerService.deleteOrphans({
            storageId: '',
            keys: ['originals/u1/photo.jpg'],
          });
        },
        (err: any) => {
          assert.strictEqual(err.message, 'storage.notFound');
          return true;
        }
      );
    });

    it('rejects abortIncompleteUploads when storageId is missing or empty', async () => {
      await assert.rejects(
        async () => {
          await storageCleanerService.abortIncompleteUploads({
            storageId: '',
            uploads: [{ key: 'originals/u1/vid.mp4', uploadId: 'up-1' }],
          });
        },
        (err: any) => {
          assert.strictEqual(err.message, 'storage.notFound');
          return true;
        }
      );
    });
  });

  describe('Sync Service Delta Sanitization & NaN Guard', () => {
    it('safely handles non-finite or NaN countDelta without corrupting photoCount', async () => {
      const versionBefore = await syncService.getVersion();
      const initialCount = versionBefore.photoCount || 0;

      // Pass NaN delta
      const resNaN = await syncService.bump('photo', NaN as any);
      assert.strictEqual(typeof resNaN.photoCount, 'number');
      assert.ok(Number.isFinite(resNaN.photoCount));

      // Pass non-number delta
      const resString = await syncService.bump('photo', 'five' as any);
      assert.strictEqual(typeof resString.photoCount, 'number');
      assert.ok(Number.isFinite(resString.photoCount));

      // Pass valid delta
      const resValid = await syncService.bump('photo', 3);
      assert.strictEqual(resValid.photoCount, initialCount + 3);
    });
  });

  describe('Backup Secret Minimum Entropy Requirement', () => {
    it('rejects passwords shorter than 12 characters', async () => {
      await assert.rejects(
        async () => {
          await backupService.createEncryptedBackup('short');
        },
        (err: any) => {
          assert.strictEqual(err.message, 'backup.passwordTooShort');
          return true;
        }
      );
    });

    it('rejects empty password when no default encryption key configured or too short', async () => {
      const origKey = process.env.BACKUP_ENCRYPTION_KEY;
      const origJwt = process.env.JWT_SECRET;
      try {
        process.env.BACKUP_ENCRYPTION_KEY = 'short';
        process.env.JWT_SECRET = 'short';

        await assert.rejects(
          async () => {
            await backupService.createEncryptedBackup('');
          },
          (err: any) => {
            assert.strictEqual(err.message, 'backup.secretTooShort');
            return true;
          }
        );
      } finally {
        process.env.BACKUP_ENCRYPTION_KEY = origKey;
        process.env.JWT_SECRET = origJwt;
      }
    });
  });

  describe('EXIF Bulk Location Updates', () => {
    it('handles empty photoIds gracefully without throwing', async () => {
      await exifService.updateLocation([], 10.5, 20.5);
      assert.ok(true);
    });
  });

});
