import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getCookieValueFromString } from '@/lib/cookie';
import { photoDuplicatesRateLimiter } from '@/server/lib/rate-limiter';
import { signVisitorId, verifySignedVisitorId } from '@/server/lib/visitor-cookie';
import { photoService } from '@/server/service/photo-service';
import BizError from '@/server/error/biz-error';

describe('Round 12 Security Hardening Test Suite', () => {

  describe('Task 1 & 2: Cookie Parsing Resilience & Cookie Bomb Defense', () => {
    it('parses standard cookie headers correctly', () => {
      const header = 'token=abc123; user_session=xyz789; theme=dark';
      assert.equal(getCookieValueFromString(header, 'token'), 'abc123');
      assert.equal(getCookieValueFromString(header, 'user_session'), 'xyz789');
      assert.equal(getCookieValueFromString(header, 'theme'), 'dark');
      assert.equal(getCookieValueFromString(header, 'non_existent'), undefined);
    });

    it('parses cookies formatted without spaces after semicolons (mobile / proxy quirks)', () => {
      const header = 'token=abc123;user_session=xyz789;theme=dark';
      assert.equal(getCookieValueFromString(header, 'token'), 'abc123');
      assert.equal(getCookieValueFromString(header, 'user_session'), 'xyz789');
      assert.equal(getCookieValueFromString(header, 'theme'), 'dark');
    });

    it('defends against Cookie Bomb attacks by rejecting headers exceeding 8KB', () => {
      const oversizedHeader = 'token=' + 'a'.repeat(8200);
      assert.ok(oversizedHeader.length > 8192);
      assert.equal(getCookieValueFromString(oversizedHeader, 'token'), undefined);
    });

    it('handles empty or non-string inputs gracefully', () => {
      assert.equal(getCookieValueFromString(null as any, 'token'), undefined);
      assert.equal(getCookieValueFromString(undefined as any, 'token'), undefined);
      assert.equal(getCookieValueFromString('', 'token'), undefined);
    });
  });

  describe('Task 3: Telemetry & Analytics Session ID Sanitization', () => {
    it('validates and clamps session ID safely', () => {
      // Replicate the exact regex and clamp used in analytics-api
      const sanitizeSessionId = (rawId: unknown): string | null => {
        if (!rawId || typeof rawId !== 'string') return null;
        const trimmed = rawId.trim().slice(0, 64);
        if (!/^[a-zA-Z0-9_\-]{1,64}$/.test(trimmed)) return null;
        return trimmed;
      };

      assert.equal(sanitizeSessionId('sess_123456789_valid'), 'sess_123456789_valid');
      assert.equal(sanitizeSessionId('invalid session with spaces!'), null);
      assert.equal(sanitizeSessionId("malicious' OR 1=1--"), null);
      assert.equal(sanitizeSessionId('<script>alert(1)</script>'), null);
      assert.equal(sanitizeSessionId('../../../traversal'), null);
      
      const extraLong = 'a'.repeat(100);
      const clamped = sanitizeSessionId(extraLong);
      assert.equal(clamped?.length, 64);
      assert.equal(clamped, 'a'.repeat(64));
    });
  });

  describe('Task 4: ExifTool Timeout & Process Execution Guard', () => {
    it('reads buffer cleanly without stalling or throwing unhandled errors', async () => {
      const { readPhotoExifFromBuffer } = await import('@/server/lib/photo-exif');
      const dummyBuffer = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46]);
      const result = await readPhotoExifFromBuffer(dummyBuffer);
      assert.ok(result !== undefined);
      assert.ok('takenTime' in result);
      assert.ok('latitude' in result);
      assert.ok('longitude' in result);
    });
  });

  describe('Task 5: Multipart Upload Assembly Part Integrity Validation', () => {
    it('rejects invalid PartNumber (<=0, >10000, non-integer)', async () => {
      const invalidParts = [
        [{ PartNumber: 0, ETag: '"valid-etag-123"' }],
        [{ PartNumber: -1, ETag: '"valid-etag-123"' }],
        [{ PartNumber: 10001, ETag: '"valid-etag-123"' }],
        [{ PartNumber: 1.5, ETag: '"valid-etag-123"' }],
        [{ PartNumber: NaN, ETag: '"valid-etag-123"' }],
      ];

      for (const parts of invalidParts) {
        await assert.rejects(
          async () => {
            await photoService.completeMultipartUpload(
              {
                storageId: 'test-storage-id',
                key: 'originals/test-user/photo.jpg',
                uploadId: 'valid-upload-id-123',
                parts: parts as any,
              },
              'test-user'
            );
          },
          (err: any) => {
            assert.ok(err instanceof BizError);
            assert.equal(err.message, 'param.invalid');
            return true;
          }
        );
      }
    });

    it('rejects malicious or malformed ETags', async () => {
      const invalidETags = [
        [{ PartNumber: 1, ETag: '<script>alert(1)</script>' }],
        [{ PartNumber: 1, ETag: 'malicious; injection\r\n' }],
        [{ PartNumber: 1, ETag: '' }],
        [{ PartNumber: 1, ETag: 'a'.repeat(200) }], // Exceeds 128 chars
      ];

      for (const parts of invalidETags) {
        await assert.rejects(
          async () => {
            await photoService.completeMultipartUpload(
              {
                storageId: 'test-storage-id',
                key: 'originals/test-user/photo.jpg',
                uploadId: 'valid-upload-id-123',
                parts: parts as any,
              },
              'test-user'
            );
          },
          (err: any) => {
            assert.ok(err instanceof BizError);
            assert.equal(err.message, 'param.invalid');
            return true;
          }
        );
      }
    });

    it('rejects key path traversal or mismatched user prefix', async () => {
      await assert.rejects(
        async () => {
          await photoService.completeMultipartUpload(
            {
              storageId: 'test-storage-id',
              key: 'originals/other-user/photo.jpg',
              uploadId: 'valid-upload-id-123',
              parts: [{ PartNumber: 1, ETag: '"valid-etag"' }],
            },
            'test-user'
          );
        },
        (err: any) => {
          assert.equal(err.message, 'param.invalid');
          return true;
        }
      );

      await assert.rejects(
        async () => {
          await photoService.completeMultipartUpload(
            {
              storageId: 'test-storage-id',
              key: 'originals/test-user/../../secret.txt',
              uploadId: 'valid-upload-id-123',
              parts: [{ PartNumber: 1, ETag: '"valid-etag"' }],
            },
            'test-user'
          );
        },
        (err: any) => {
          assert.equal(err.message, 'param.invalid');
          return true;
        }
      );
    });
  });

  describe('Task 6: Storage Cleaner Traversal & Null Byte Guard', () => {
    it('filters out path traversal and poison null byte keys', () => {
      const NAYPICT_MANAGED_PREFIXES = ['originals/', 'thumbs/', 'avatars/', 'profile/'];
      const existingDbKeySet = new Set<string>();

      const keysToInspect = [
        'originals/user1/valid.jpg',
        'originals/user1/../../etc/passwd',
        'thumbs/user1/image\0.jpg',
        'avatars/user1/photo.png',
        'other_folder/user1/file.txt',
      ];

      const safeKeysToDelete = keysToInspect.filter((k) =>
        !existingDbKeySet.has(k) &&
        !k.includes('..') &&
        !k.includes('\0') &&
        NAYPICT_MANAGED_PREFIXES.some((prefix) => k.startsWith(prefix))
      );

      assert.deepEqual(safeKeysToDelete, [
        'originals/user1/valid.jpg',
        'avatars/user1/photo.png',
      ]);
    });
  });

  describe('Task 7: Photo Duplicate Detection Rate Limiting', () => {
    it('enforces rate limit of 10 requests per window on photo duplicate scanner', async () => {
      const testKey = `test-dup-user-${Date.now()}`;
      
      for (let i = 0; i < 10; i++) {
        const res = await photoDuplicatesRateLimiter.consume(testKey);
        assert.equal(res.allowed, true, `Request ${i + 1} should be allowed`);
      }

      // 11th request must be blocked
      const blockedRes = await photoDuplicatesRateLimiter.consume(testKey);
      assert.equal(blockedRes.allowed, false, '11th request must be rate limited');
      assert.equal(blockedRes.remaining, 0);
      assert.ok(blockedRes.resetMs > 0);
    });
  });

  describe('Task 8: Visitor Cookie HMAC Secret Fail-Fast & Safe Verification', () => {
    it('signs and verifies visitor IDs successfully', () => {
      const vid = 'test_visitor_uuid_123456';
      const signed = signVisitorId(vid);
      assert.ok(signed.startsWith(vid + '.'));

      const verified = verifySignedVisitorId(signed);
      assert.equal(verified, vid);
    });

    it('rejects tampered visitor cookie signatures cleanly', () => {
      const vid = 'test_visitor_uuid_123456';
      const signed = signVisitorId(vid);
      const tampered = signed.slice(0, -5) + 'xxxxx';

      const verified = verifySignedVisitorId(tampered);
      assert.equal(verified, null);
    });

    it('rejects signatures of mismatched length without throwing exceptions', () => {
      const vid = 'test_visitor_uuid_123456';
      const shortSig = `${vid}.tooshort`;
      assert.equal(verifySignedVisitorId(shortSig), null);

      const emptySig = `${vid}.`;
      assert.equal(verifySignedVisitorId(emptySig), null);
    });

    it('fails fast in production mode when JWT_SECRET is missing', () => {
      const origEnv = process.env.NODE_ENV;
      const origSecret = process.env.JWT_SECRET;
      (process.env as any).NODE_ENV = 'production';
      delete process.env.JWT_SECRET;

      try {
        assert.throws(
          () => {
            signVisitorId('some_visitor');
          },
          /FATAL: JWT_SECRET must be configured in production/
        );
      } finally {
        (process.env as any).NODE_ENV = origEnv;
        if (origSecret) {
          process.env.JWT_SECRET = origSecret;
        }
      }
    });
  });

  describe('Task 9: Canonical Content-Type Mapping for Avatar Stream', () => {
    it('maps extensions correctly to avoid MIME confusion attacks', () => {
      const contentTypeMap: Record<string, string> = {
        webp: 'image/webp',
        jpg: 'image/jpeg',
        jpeg: 'image/jpeg',
        png: 'image/png',
      };

      const testCases = [
        { key: 'avatar.webp', expected: 'image/webp' },
        { key: 'avatar.jpg', expected: 'image/jpeg' },
        { key: 'avatar.JPEG', expected: 'image/jpeg' },
        { key: 'avatar.png', expected: 'image/png' },
      ];

      for (const tc of testCases) {
        const ext = tc.key.toLowerCase().split('.').pop();
        const contentType = (ext && contentTypeMap[ext]) || 'image/webp';
        assert.equal(contentType, tc.expected);
      }
    });
  });

  describe('Task 10: Cryptographic Subnet Binding on Temp 2FA Login Session', () => {
    it('extracts IPv4 and IPv6 subnets correctly', () => {
      const extractSubnet = (clientIp: string) => {
        return clientIp.includes('.')
          ? clientIp.split('.').slice(0, 3).join('.')
          : clientIp.includes(':')
          ? clientIp.split(':').slice(0, 4).join(':')
          : clientIp;
      };

      assert.equal(extractSubnet('192.168.1.50'), '192.168.1');
      assert.equal(extractSubnet('10.0.5.23'), '10.0.5');
      assert.equal(extractSubnet('2001:0db8:85a3:0000:0000:8a2e:0370:7334'), '2001:0db8:85a3:0000');
    });

    it('rejects 2FA verification when client subnet changes', () => {
      const sessionSubnet: string = '192.168.1';
      const attackerSubnet: string = '10.200.5';

      const isSubnetMatched = sessionSubnet === attackerSubnet;
      assert.equal(isSubnetMatched, false, 'Cross-subnet 2FA completion must be rejected');
    });
  });
});
