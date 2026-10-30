import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { photoService } from '@/server/service/photo-service';
import { getClientIp, isValidIp } from '@/server/lib/ip';
import { decryptData, encryptData } from '@/server/lib/crypto';
import { downloadRateLimiter, mediaDownloadRateLimiter } from '@/server/lib/rate-limiter';
import { commentService } from '@/server/service/comment-service';
import BizError from '@/server/error/biz-error';
import nextConfig from '@/../next.config';

describe('Round 6 Security & Hardening Test Suite', () => {
  describe('Presigned URL Upload MIME-Type & Extension Hardening', () => {
    it('strictly blocks disallowed executable extensions in getPresignedUploadUrl', async () => {
      await assert.rejects(
        () =>
          photoService.getPresignedUploadUrl(
            {
              filename: 'payload.exe',
              fileType: 'application/x-msdownload',
            },
            'user_123'
          ),
        (err: any) => err instanceof BizError && err.message === 'photo.invalidFileType'
      );
    });

    it('strictly blocks disallowed scripts even if spoofing image MIME in getPresignedUploadUrl', async () => {
      await assert.rejects(
        () =>
          photoService.getPresignedUploadUrl(
            {
              filename: 'exploit.php',
              fileType: 'image/jpeg',
            },
            'user_123'
          ),
        (err: any) => err instanceof BizError && err.message === 'photo.invalidFileType'
      );
    });

    it('strictly blocks disallowed extensions in getPresignedPhotoUploadUrls', async () => {
      await assert.rejects(
        () =>
          photoService.getPresignedPhotoUploadUrls(
            {
              filename: 'malware.sh',
              checksum: 'abc123def456',
              fileType: 'application/x-sh',
            },
            'user_123'
          ),
        (err: any) => err instanceof BizError && err.message === 'photo.invalidFileType'
      );
    });

    it('strictly restricts initiateMultipartUpload to video MIME types', async () => {
      await assert.rejects(
        () =>
          photoService.initiateMultipartUpload(
            {
              filename: 'photo.jpg',
              fileType: 'image/jpeg',
            },
            'user_123'
          ),
        (err: any) => err instanceof BizError && err.message === 'photo.invalidFileType'
      );
    });
  });

  describe('Client IP Extraction & Header Injection Defense', () => {
    it('safely rejects injected HTML or script payloads in IP headers and falls back to unknown', () => {
      const mockContextWithInjection: any = {
        req: {
          header: (name: string) => {
            if (name.toLowerCase() === 'x-forwarded-for') {
              return '<script>alert(1)</script>, 10.0.0.1; DROP TABLE users;';
            }
            return undefined;
          },
        },
      };

      const resolved = getClientIp(mockContextWithInjection);
      assert.equal(resolved, 'unknown');
    });

    it('extracts legitimate valid IPv4 and IPv6 addresses accurately', () => {
      const mockContextValidIpv4: any = {
        req: {
          header: (name: string) => {
            if (name.toLowerCase() === 'cf-connecting-ip') {
              return '203.0.113.195';
            }
            return undefined;
          },
        },
      };

      assert.equal(getClientIp(mockContextValidIpv4), '203.0.113.195');

      const mockContextValidIpv6: any = {
        req: {
          header: (name: string) => {
            if (name.toLowerCase() === 'x-real-ip') {
              return '2001:db8::8a2e:370:7334';
            }
            return undefined;
          },
        },
      };

      assert.equal(getClientIp(mockContextValidIpv6), '2001:db8::8a2e:370:7334');
    });
  });

  describe('AES-256-GCM Decryption Error Handling & Crash Prevention', () => {
    it('safely handles corrupted or tampered ciphertext without crashing', async () => {
      const masterKey = 'test-master-secret-key-32chars!!';
      const corruptedCipher = 'enc:v1:0123456789abcdef01234567:baddeadbeefcafe12345678';

      // Must not throw an unhandled DOMException OperationError
      const result = await decryptData(corruptedCipher, masterKey);
      assert.equal(result, corruptedCipher);
    });

    it('correctly encrypts and decrypts legitimate plaintext', async () => {
      const masterKey = 'super-secret-master-key-32chars!';
      const original = 'my-r2-secret-key-value-12345';

      const encrypted = await encryptData(original, masterKey);
      assert.ok(encrypted.startsWith('enc:v1:'));

      const decrypted = await decryptData(encrypted, masterKey);
      assert.equal(decrypted, original);
    });
  });

  describe('Download Rate Limiter Verification', () => {
    it('configures downloadRateLimiter properly with 30 requests ceiling', () => {
      assert.equal(downloadRateLimiter.limit, 30);
      assert.equal(downloadRateLimiter.name, 'download');
      assert.equal(mediaDownloadRateLimiter.limit, 30);
    });
  });

  describe('Comment Service Archived Photo Protection', () => {
    it('rejects adding comments with empty or invalid photoId', async () => {
      await assert.rejects(
        () =>
          commentService.add({
            photoId: '',
            name: 'Visitor',
            content: 'Hello world',
          }),
        (err: any) => err instanceof BizError && err.message === 'photo.selectRequired'
      );
    });
  });

  describe('Next.js Global CORP Security Headers', () => {
    it('configures Cross-Origin-Resource-Policy in security headers', async () => {
      if (typeof nextConfig.headers === 'function') {
        const headerConfigs = await nextConfig.headers();
        const globalRoute = headerConfigs.find((h: any) => h.source === '/:path*');
        assert.ok(globalRoute);

        const corpHeader = globalRoute.headers.find(
          (h: any) => h.key.toLowerCase() === 'cross-origin-resource-policy'
        );
        assert.ok(corpHeader);
        assert.equal(corpHeader.value, 'same-origin');
      }
    });
  });
});

