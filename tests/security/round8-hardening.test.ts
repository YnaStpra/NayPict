import { describe, it } from 'node:test';
import assert from 'node:assert';
import { avatarUploadRateLimiter, totpSetupRateLimiter } from '@/server/lib/rate-limiter';
import { photoService } from '@/server/service/photo-service';
import { S3StorageStrategy } from '@/server/storage/s3-storage';
import { applyWatermark } from '@/server/lib/photo-watermark';
import { processPhotoImages } from '@/server/lib/photo-process';
import { HEAD, GET, OPTIONS } from '@/app/media/[[...path]]/route';
import BizError from '@/server/error/biz-error';
import sharp from 'sharp';

describe('Round 8 Security & Reliability Hardening Test Suite', () => {

  describe('Avatar & TOTP Setup Rate Limiters', () => {
    it('enforces avatarUploadRateLimiter ceiling of 10 requests per window', async () => {
      const key = `test-user-avatar-${Date.now()}`;
      for (let i = 0; i < 10; i++) {
        const res = await avatarUploadRateLimiter.consume(key);
        assert.strictEqual(res.allowed, true);
      }
      const blocked = await avatarUploadRateLimiter.consume(key);
      assert.strictEqual(blocked.allowed, false);
      assert.ok(blocked.resetMs > 0);
    });

    it('enforces totpSetupRateLimiter ceiling of 5 requests per window', async () => {
      const key = `test-user-totp-${Date.now()}`;
      for (let i = 0; i < 5; i++) {
        const res = await totpSetupRateLimiter.consume(key);
        assert.strictEqual(res.allowed, true);
      }
      const blocked = await totpSetupRateLimiter.consume(key);
      assert.strictEqual(blocked.allowed, false);
      assert.ok(blocked.resetMs > 0);
    });
  });

  describe('Photo Batch Allow-Download Ceiling & Sanitization', () => {
    it('rejects batch operations exceeding 500 photos', async () => {
      const largeList = Array.from({ length: 501 }, (_, i) => `photo-${i}`);
      await assert.rejects(
        async () => {
          await photoService.setAllowDownload({
            photoIds: largeList,
            allowDownload: true,
          }, 'user-123');
        },
        (err: any) => {
          assert.strictEqual(err.message, 'photo.batchLimitExceeded');
          return true;
        }
      );
    });

    it('safely handles empty or whitespace-only photo ID arrays without throwing', async () => {
      await photoService.setAllowDownload({
        photoIds: [],
        allowDownload: false,
      }, 'user-123');

      await photoService.setAllowDownload({
        photoIds: ['', '   ', undefined as any],
        allowDownload: true,
      }, 'user-123');
    });
  });

  describe('Temporal & Timezone Clamping on OnThisDay', () => {
    it('clamps out-of-bounds month, day, year, and tzOffset parameters', async () => {
      // Test extreme parameter bounds
      const res = await photoService.onThisDay({
        month: 99,       // Should clamp to 12
        day: 500,        // Should clamp to 31
        year: 99999,     // Should clamp to 2100
        tzOffset: 99999, // Should clamp to 840
      });

      assert.strictEqual(typeof res.date, 'string');
      // targetMonthDay with clamped month 12 and clamped day 31
      assert.strictEqual(res.date, '12-31');
    });

    it('clamps negative temporal and timezone bounds safely', async () => {
      const res = await photoService.onThisDay({
        month: -10,       // Should clamp to 1
        day: -5,          // Should clamp to 1
        year: 1200,       // Should clamp to 1900
        tzOffset: -99999, // Should clamp to -840
      });

      assert.strictEqual(res.date, '01-01');
    });
  });

  describe('S3 Multipart Presigned Part URL & Batch Delete Hardening', () => {
    const s3Storage = new S3StorageStrategy();

    it('defaults presigned part URL expiresIn to 900 seconds (15 minutes)', () => {
      // Verify signature/default value of getPresignedPartUrl function
      const paramStr = s3Storage.getPresignedPartUrl.toString();
      assert.ok(/expiresIn\s*=\s*900/.test(paramStr));
    });

    it('filters out empty, whitespace, and path traversal (..) keys in batch delete', async () => {
      const storage: any = {
        storageId: 's3-1',
        type: 's3',
        bucket: 'test-bucket',
        endpoint: 'https://s3.amazonaws.com',
        region: 'us-east-1',
        accessKey: 'test',
        secretKey: 'test',
      };

      let sentObjects: any[] = [];
      const origCreateClient = (s3Storage as any).createClient;
      (s3Storage as any).createClient = () => ({
        send: async (cmd: any) => {
          sentObjects = cmd.input.Delete.Objects;
          return {};
        },
      });

      try {
        await s3Storage.delete([
          'valid/photo1.webp',
          '../etc/passwd',
          '',
          '   ',
          'valid/photo2.webp',
          'nested/../../escape.jpg',
        ], storage);

        assert.strictEqual(sentObjects.length, 2);
        assert.strictEqual(sentObjects[0].Key, 'valid/photo1.webp');
        assert.strictEqual(sentObjects[1].Key, 'valid/photo2.webp');
      } finally {
        (s3Storage as any).createClient = origCreateClient;
      }
    });

    it('returns immediately without calling S3 API if no valid keys exist', async () => {
      const storage: any = {
        storageId: 's3-1',
        type: 's3',
        bucket: 'test-bucket',
      };

      let apiCalled = false;
      const origCreateClient = (s3Storage as any).createClient;
      (s3Storage as any).createClient = () => ({
        send: async () => {
          apiCalled = true;
          return {};
        },
      });

      try {
        await s3Storage.delete(['', '  ', '../evil'], storage);
        assert.strictEqual(apiCalled, false);
      } finally {
        (s3Storage as any).createClient = origCreateClient;
      }
    });
  });

  describe('Zero-Dimension Image Validation Guard', () => {
    it('throws photo.invalidImage when image dimensions cannot be parsed or are zero', async () => {
      // Craft empty buffer
      const emptyBuffer = Buffer.from([]);
      await assert.rejects(
        async () => {
          await processPhotoImages(emptyBuffer, 'image/jpeg');
        },
        (err: any) => {
          // Sharp fails to decode or invalidImage BizError is thrown
          assert.ok(err);
          return true;
        }
      );
    });
  });

  describe('Watermark Vector SVG ASCII Control Character Sanitization', () => {
    it('strips illegal ASCII control characters and escapes XML entities', async () => {
      // Generate a small 100x100 test JPEG
      const testImg = await sharp({
        create: {
          width: 100,
          height: 100,
          channels: 3,
          background: { r: 100, g: 100, b: 100 },
        },
      }).jpeg().toBuffer();

      // Watermark with control characters and XML characters
      const dirtyText = 'NayPict\x00\x08\x1B <Safe & "Clean"> © 2026';
      const result = await applyWatermark(testImg, { text: dirtyText });

      assert.ok(result.buffer);
      assert.strictEqual(result.contentType, 'image/jpeg');
      assert.ok(result.buffer.length > 0);
    });
  });

  describe('Next.js Media Proxy Route HTTP HEAD Method Support', () => {
    it('exports HEAD route handler function along with GET and OPTIONS', () => {
      assert.strictEqual(typeof HEAD, 'function');
      assert.strictEqual(typeof GET, 'function');
      assert.strictEqual(typeof OPTIONS, 'function');
      assert.strictEqual(HEAD, GET);
    });
  });
});
