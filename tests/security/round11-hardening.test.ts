import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildContentDisposition } from '@/server/lib/file';
import { photoRandomListRateLimiter } from '@/server/lib/rate-limiter';
import { backupService } from '@/server/service/backup-service';
import { locationService } from '@/server/service/location-service';
import { storageService } from '@/server/service/storage-service';
import BizError from '@/server/error/biz-error';

describe('Round 11 Security & Reliability Hardening Test Suite', () => {

  describe('Storage Endpoint SSRF & DNS Rebinding Protection', () => {
    it('rejects cloud metadata IP addresses', async () => {
      await assert.rejects(
        async () => {
          // Calling storageService.add or set triggers validateStorageUrl
          await storageService.add({
            storageId: 'malicious-1',
            name: 'Malicious-Storage-1',
            type: 1 as any,
            endpoint: 'http://169.254.169.254/latest/meta-data/',
          }, 'test-user-id');
        },
        (err: any) => {
          assert.equal(err.message, 'storage.ssrfBlocked');
          return true;
        }
      );
    });

    it('rejects Google internal metadata service hostname', async () => {
      await assert.rejects(
        async () => {
          await storageService.add({
            storageId: 'malicious-2',
            name: 'Malicious-Storage-2',
            type: 1 as any,
            endpoint: 'http://metadata.google.internal/computeMetadata/v1/',
          }, 'test-user-id');
        },
        (err: any) => {
          assert.equal(err.message, 'storage.ssrfBlocked');
          return true;
        }
      );
    });

    it('rejects localhost and loopback IP addresses in production', async () => {
      const origEnv = process.env.NODE_ENV;
      (process.env as any).NODE_ENV = 'production';
      try {
        await assert.rejects(
          async () => {
            await storageService.add({
              storageId: 'malicious-3',
              name: 'Malicious-Storage-3',
              type: 1 as any,
              endpoint: 'http://127.0.0.1:9000',
            }, 'test-user-id');
          },
          (err: any) => {
            assert.equal(err.message, 'storage.ssrfBlocked');
            return true;
          }
        );
      } finally {
        (process.env as any).NODE_ENV = origEnv;
      }
    });

    it('rejects invalid URL protocols (file:, gopher:, ftp:)', async () => {
      await assert.rejects(
        async () => {
          await storageService.add({
            storageId: 'malicious-4',
            name: 'Malicious-Storage-4',
            type: 1 as any,
            endpoint: 'gopher://127.0.0.1:6379/_flushall',
          }, 'test-user-id');
        },
        (err: any) => {
          assert.equal(err.message, 'storage.invalidUrlProtocol');
          return true;
        }
      );
    });
  });

  describe('Content-Disposition Strict Header Sanitization (RFC 6266 & RFC 5987)', () => {
    it('strips CRLF injection payloads from filenames', () => {
      const header = buildContentDisposition('malicious\r\nSet-Cookie: evil=true\r\n.jpg', 'attachment');
      assert.ok(!header.includes('\r'));
      assert.ok(!header.includes('\n'));
      assert.ok(header.startsWith('attachment; filename='));
    });

    it('neutralizes quotes and semicolons to prevent parameter injection', () => {
      const header = buildContentDisposition('file"; filename="injected.exe";.jpg', 'attachment');
      assert.ok(!header.includes('injected.exe"'));
      assert.ok(header.includes('filename*=UTF-8\'\''));
    });

    it('properly encodes international UTF-8 characters', () => {
      const header = buildContentDisposition('pantai_kuta_bali_🌅.jpg', 'attachment');
      assert.ok(header.includes('filename*=UTF-8\'\'pantai_kuta_bali_%F0%9F%8C%85.jpg'));
    });
  });

  describe('Photo Random Catalog Anti-Scraping Rate Limiter', () => {
    it('initializes rate limiter with 30 requests per minute ceiling', () => {
      assert.equal(photoRandomListRateLimiter.limit, 30);
      assert.equal(photoRandomListRateLimiter.windowMs, 60000);
      assert.equal(photoRandomListRateLimiter.name, 'photo-random-list');
    });

    it('enforces request limit on repeated consumption', async () => {
      const testKey = `test-ip-${Date.now()}`;
      for (let i = 0; i < 30; i++) {
        const res = await photoRandomListRateLimiter.consume(testKey);
        assert.equal(res.allowed, true);
      }
      const blockedRes = await photoRandomListRateLimiter.consume(testKey);
      assert.equal(blockedRes.allowed, false);
    });
  });

  describe('Database Backup Encryption, Integrity & Decompression Bomb Guard', () => {
    it('creates and successfully decrypts an authentic encrypted backup snapshot', async () => {
      const testSecret = 'SuperSecretEncryptionKey123456!';
      const backup = await backupService.createEncryptedBackup(testSecret);
      assert.ok(backup.buffer.length > 50);
      assert.ok(backup.fileName.startsWith('naypict-backup-'));

      const dump = await backupService.readEncryptedBackup(backup.buffer, testSecret);
      assert.ok(dump.meta);
      assert.ok(dump.data);
    });

    it('rejects corrupted or truncated backup buffers', async () => {
      const shortBuffer = Buffer.from('SHORT_TRUNCATED_BUFFER');
      await assert.rejects(
        async () => {
          await backupService.readEncryptedBackup(shortBuffer, 'SuperSecretEncryptionKey123456!');
        },
        (err: any) => {
          assert.equal(err.message, 'backup.invalidFormat');
          return true;
        }
      );
    });

    it('rejects backup with invalid header identifier', async () => {
      const fakeBuffer = Buffer.alloc(100, 0x41);
      await assert.rejects(
        async () => {
          await backupService.readEncryptedBackup(fakeBuffer, 'SuperSecretEncryptionKey123456!');
        },
        (err: any) => {
          assert.equal(err.message, 'backup.invalidHeader');
          return true;
        }
      );
    });

    it('rejects decryption when given an incorrect password', async () => {
      const backup = await backupService.createEncryptedBackup('CorrectPassword123456!');
      await assert.rejects(
        async () => {
          await backupService.readEncryptedBackup(backup.buffer, 'WrongPassword123456789!');
        },
        (err: any) => {
          assert.equal(err.message, 'backup.decryptionFailed');
          return true;
        }
      );
    });
  });

  describe('Reverse Geocoding Coordinate Quantization', () => {
    it('quantizes micro-decimal coordinates to 4 decimal places to unify cache keys', async () => {
      const res1 = await locationService.reverseGeocode(-8.650012345, 115.210098765);
      const res2 = await locationService.reverseGeocode(-8.650000001, 115.210000002);

      assert.equal(res1.latitude, -8.65);
      assert.equal(res1.longitude, 115.2101);
      assert.equal(res2.latitude, -8.65);
      assert.equal(res2.longitude, 115.21);
    });
  });
});
