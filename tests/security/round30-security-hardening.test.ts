/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
process.env.JWT_SECRET = process.env.JWT_SECRET || 'supersecretfornaypicttests1234567890';
import { describe, it, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { Hono } from 'hono';
import { getClientIp } from '@/server/lib/ip';
import { cronRateLimiter } from '@/server/lib/rate-limiter';
import { registerCronApi } from '@/server/api/cron-api';
import { sanitizeExifString } from '@/server/lib/photo-exif';
import { photoService } from '@/server/service/photo-service';
import { storageService } from '@/server/service/storage-service';
import { analyticsService } from '@/server/service/analytics-service';
import { insightsService } from '@/server/service/insights-service';
import { cache } from '@/server/infra/cache';
import BizError from '@/server/error/biz-error';
import type { HonoEnv } from '@/server/hono/type';

describe('Round 30 Security Hardening Suite', () => {
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

  describe('Item 1: Anti-Spoofing Cloudflare Edge Signature Verification in IP Resolution', () => {
    it('accepts cf-connecting-ip when cf-ray edge signature is present', () => {
      const mockContext = {
        req: {
          header: (name: string) => {
            const lower = name.toLowerCase();
            if (lower === 'cf-connecting-ip') return '203.0.113.50';
            if (lower === 'cf-ray') return '89abcdef01234567-SIN';
            return undefined;
          },
        },
      };

      assert.strictEqual(getClientIp(mockContext as any), '203.0.113.50');
    });

    it('rejects spoofed cf-connecting-ip and falls back to x-real-ip when cf-ray is absent', () => {
      const mockContext = {
        req: {
          header: (name: string) => {
            const lower = name.toLowerCase();
            if (lower === 'cf-connecting-ip') return '203.0.113.99'; // Attacker spoofing CF header
            if (lower === 'x-real-ip') return '198.51.100.25'; // True reverse proxy edge header
            return undefined;
          },
        },
      };

      assert.strictEqual(
        getClientIp(mockContext as any),
        '198.51.100.25',
        'Should ignore unverified cf-connecting-ip and use trusted x-real-ip'
      );
    });

    it('rejects spoofed cf-connecting-ip and falls back to x-forwarded-for when cf-ray is absent', () => {
      const mockContext = {
        req: {
          header: (name: string) => {
            const lower = name.toLowerCase();
            if (lower === 'cf-connecting-ip') return '203.0.113.99'; // Spoofed CF header
            if (lower === 'x-forwarded-for') return '192.0.2.10, 198.51.100.88';
            return undefined;
          },
        },
      };

      assert.strictEqual(
        getClientIp(mockContext as any),
        '198.51.100.88',
        'Should ignore unverified cf-connecting-ip and use rightmost x-forwarded-for'
      );
    });

    it('returns unknown when only unverified cf-connecting-ip is provided without cf-ray', () => {
      const mockContext = {
        req: {
          header: (name: string) => {
            const lower = name.toLowerCase();
            if (lower === 'cf-connecting-ip') return '203.0.113.99';
            return undefined;
          },
        },
      };

      assert.strictEqual(
        getClientIp(mockContext as any),
        'unknown',
        'Must return unknown when no trusted edge headers verify the client IP'
      );
    });
  });

  describe('Item 2: Fail-Closed Storage Resolution in Photo Upload Services', () => {
    const origGetStorageList = storageService.getStorageList;
    const origGetStorageById = storageService.getStorageById;

    const mockPrimaryStorage = {
      storageId: 'primary-storage-default',
      name: 'Default S3',
      type: 1,
      status: 1,
      bucket: 'naypict-bucket',
      sort: 0,
      createTime: '',
      updateTime: '',
    };

    beforeEach(() => {
      storageService.getStorageList = (async () => [mockPrimaryStorage]) as any;
      storageService.getStorageById = (async (id: string) => (id === mockPrimaryStorage.storageId ? mockPrimaryStorage : null)) as any;
    });

    after(() => {
      storageService.getStorageList = origGetStorageList;
      storageService.getStorageById = origGetStorageById;
    });

    it('throws storage.notFound in getPresignedUploadUrl when explicit storageId does not exist', async () => {
      await assert.rejects(
        async () => {
          await photoService.getPresignedUploadUrl(
            {
              filename: 'test.jpg',
              fileType: 'image/jpeg',
              storageId: 'invalid-nonexistent-storage',
            },
            'user123'
          );
        },
        (err: any) => {
          assert.strictEqual(err instanceof BizError, true);
          assert.strictEqual(err.message, 'storage.notFound');
          return true;
        }
      );
    });

    it('throws storage.notFound in getPresignedPhotoUploadUrls when explicit storageId does not exist', async () => {
      await assert.rejects(
        async () => {
          await photoService.getPresignedPhotoUploadUrls(
            {
              filename: 'test.jpg',
              fileType: 'image/jpeg',
              checksum: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
              storageId: 'invalid-nonexistent-storage',
            },
            'user123'
          );
        },
        (err: any) => {
          assert.strictEqual(err instanceof BizError, true);
          assert.strictEqual(err.message, 'storage.notFound');
          return true;
        }
      );
    });

    it('throws storage.notFound in initiateMultipartUpload when explicit storageId does not exist', async () => {
      await assert.rejects(
        async () => {
          await photoService.initiateMultipartUpload(
            {
              filename: 'video.mp4',
              fileType: 'video/mp4',
              storageId: 'invalid-nonexistent-storage',
            },
            'user123'
          );
        },
        (err: any) => {
          assert.strictEqual(err instanceof BizError, true);
          assert.strictEqual(err.message, 'storage.notFound');
          return true;
        }
      );
    });

    it('throws storage.notFound in addVideo when explicit storageId does not exist', async () => {
      await assert.rejects(
        async () => {
          await photoService.addVideo(
            {
              key: 'originals/user123/video.mp4',
              name: 'video.mp4',
              type: 'video/mp4',
              size: 1024,
              width: 1920,
              height: 1080,
              checksum: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
              storageId: 'invalid-nonexistent-storage',
            },
            'user123'
          );
        },
        (err: any) => {
          assert.strictEqual(err instanceof BizError, true);
          assert.strictEqual(err.message, 'storage.notFound');
          return true;
        }
      );
    });

    it('throws storage.notFound in addDirect when explicit storageId does not exist', async () => {
      await assert.rejects(
        async () => {
          await photoService.addDirect(
            {
              photoId: 'photo-uuid-direct-1',
              key: 'originals/user123/photo.jpg',
              name: 'photo.jpg',
              type: 'image/jpeg',
              size: 1024,
              width: 1920,
              height: 1080,
              checksum: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
              previewKey: 'previews/test.jpg',
              thumbnailKey: 'thumbnails/test.jpg',
              storageId: 'invalid-nonexistent-storage',
            },
            'user123'
          );
        },
        (err: any) => {
          assert.strictEqual(err instanceof BizError, true);
          assert.strictEqual(err.message, 'storage.notFound');
          return true;
        }
      );
    });
  });

  describe('Item 3: Maintenance Endpoint Rate Limiting & Abuse Defense', () => {
    const testIp = '198.51.100.99';

    beforeEach(async () => {
      await cronRateLimiter.reset(testIp);
    });

    it('enforces rate limit of 5 requests per 10 minutes on cronRateLimiter', async () => {
      for (let i = 1; i <= 5; i++) {
        const result = await cronRateLimiter.consume(testIp);
        assert.strictEqual(result.allowed, true, `Request ${i} should be allowed`);
        assert.strictEqual(result.remaining, 5 - i);
      }

      const blockedResult = await cronRateLimiter.consume(testIp);
      assert.strictEqual(blockedResult.allowed, false, '6th request must be blocked');
      assert.strictEqual(blockedResult.remaining, 0);
      assert.ok(blockedResult.resetMs > 0);
    });

    it('returns HTTP 429 and Retry-After header on /cron/cleanup when rate limited', async () => {
      const origCronSecret = process.env.CRON_SECRET;
      process.env.CRON_SECRET = 'naypict-test-cron-secret-30';

      const origClearExpired = photoService.clearExpired;
      const origCacheClearExpired = cache.clearExpired;
      const origCleanStaleSessions = analyticsService.cleanStaleSessions;
      const origCleanStaleViews = insightsService.cleanStaleViews;
      photoService.clearExpired = async () => {};
      cache.clearExpired = async () => {};
      analyticsService.cleanStaleSessions = (async () => ({})) as any;
      insightsService.cleanStaleViews = (async () => ({})) as any;

      const app = new Hono<HonoEnv>();
      registerCronApi(app);

      const cronIp = '203.0.113.77';
      await cronRateLimiter.reset(cronIp);

      try {
        // First 5 requests should pass auth & rate limiter
        for (let i = 0; i < 5; i++) {
          const res = await app.request('/cron/cleanup', {
            method: 'GET',
            headers: {
              authorization: 'Bearer naypict-test-cron-secret-30',
              'cf-ray': 'test-cf-ray-1234',
              'cf-connecting-ip': cronIp,
            },
          });
          assert.notStrictEqual(res.status, 429, `Attempt ${i + 1} should not be rate-limited`);
        }

        // 6th request should hit rate limiter and return 429
        const resBlocked = await app.request('/cron/cleanup', {
          method: 'GET',
          headers: {
            authorization: 'Bearer naypict-test-cron-secret-30',
            'cf-ray': 'test-cf-ray-1234',
            'cf-connecting-ip': cronIp,
          },
        });

        assert.strictEqual(resBlocked.status, 429, '6th request must be rate limited with HTTP 429');
        assert.ok(resBlocked.headers.get('Retry-After'), 'Must include Retry-After header');
        const json = await resBlocked.json();
        assert.strictEqual(json.code, 429);
        assert.ok(json.message.includes('Rate limit exceeded'));
      } finally {
        process.env.CRON_SECRET = origCronSecret;
        photoService.clearExpired = origClearExpired;
        cache.clearExpired = origCacheClearExpired;
        analyticsService.cleanStaleSessions = origCleanStaleSessions;
        insightsService.cleanStaleViews = origCleanStaleViews;
        await cronRateLimiter.reset(cronIp);
      }
    });
  });

  describe('Item 4: Enhanced EXIF Metadata Sanitization & XML Entity Neutralization', () => {
    it('strips HTML and XML tags from EXIF strings', () => {
      const input = '<script>alert("xss")</script>Sony A7IV';
      assert.strictEqual(sanitizeExifString(input), 'Sony A7IV');
    });

    it('neutralizes javascript and vbscript pseudo-protocols', () => {
      assert.strictEqual(sanitizeExifString('javascript:alert(1)'), 'alert(1)');
      assert.strictEqual(sanitizeExifString('VBScript:msgbox("hello")'), 'msgbox("hello")');
    });

    it('strips inline data URIs and svg/xml data payloads', () => {
      const payload = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciPjxzY3JpcHQ+YWxlcnQoMSk8L3NjcmlwdD48L3N2Zz4= Canon R5';
      assert.strictEqual(sanitizeExifString(payload), 'Canon R5');
    });

    it('neutralizes XML entity declarations and DOCTYPE blocks', () => {
      const xxeInput = '<!DOCTYPE foo [ <!ENTITY xxe SYSTEM "file:///etc/passwd"> ]>Nikon Z9';
      assert.strictEqual(sanitizeExifString(xxeInput), 'Nikon Z9');

      const entityInput = '<!ENTITY % file SYSTEM "file:///etc/shadow">Fujifilm X-T5';
      assert.strictEqual(sanitizeExifString(entityInput), 'Fujifilm X-T5');
    });

    it('neutralizes XML and HTML entity encodings', () => {
      const input = 'Leica &amp; Hasselblad &#x3C;Pro&#x3E;';
      assert.strictEqual(sanitizeExifString(input), 'Leica  Hasselblad Pro');
    });

    it('removes ASCII and Unicode non-printable control characters', () => {
      const input = '\u0000\u0001\u0007\u0008Sony \u000B\u000C\u000E\u001FA1\u007F';
      assert.strictEqual(sanitizeExifString(input), 'Sony A1');
    });

    it('strictly caps EXIF string length at 256 characters', () => {
      const longString = 'X'.repeat(500);
      const sanitized = sanitizeExifString(longString);
      assert.strictEqual(typeof sanitized, 'string');
      assert.strictEqual((sanitized as string).length, 256);
    });
  });
});
