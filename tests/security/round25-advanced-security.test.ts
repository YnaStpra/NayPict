/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
process.env.ENABLE_SUDO_MODE = 'true';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import exifr from 'exifr';
import { stripGpsFromImageBuffer } from '@/server/lib/exif-privacy';
import { createSignedDownloadToken, verifySignedDownloadToken, buildSignedDownloadUrl } from '@/server/lib/download-token';
import { sudoService } from '@/server/service/sudo-service';
import { cache } from '@/server/infra/cache';

// Helper to construct synthetic Little-Endian JPEG with EXIF IFD0, SubIFD, and GPS IFD
function buildSyntheticLittleEndianJpegWithGps(): Buffer {
  const buf = Buffer.alloc(2048);
  let pos = 0;

  // SOI
  buf.writeUInt16BE(0xFFD8, pos); pos += 2;

  // APP1
  buf.writeUInt16BE(0xFFE1, pos); pos += 2;
  const app1LenPos = pos; pos += 2;

  // Exif\0\0
  buf.write("Exif\0\0", pos); pos += 6;
  const tiffStart = pos;

  // TIFF Header: II (little-endian), 42, IFD0 offset = 8
  buf.write("II", pos); pos += 2;
  buf.writeUInt16LE(42, pos); pos += 2;
  buf.writeUInt32LE(8, pos); pos += 4;

  // IFD0 at tiffStart + 8 (3 tags: Make, ExifSubIFD, GPSInfo)
  buf.writeUInt16LE(3, pos); pos += 2;

  // Tag 1: Make (0x010F), ASCII (2), count 6, offset 500
  buf.writeUInt16LE(0x010F, pos); pos += 2;
  buf.writeUInt16LE(2, pos); pos += 2;
  buf.writeUInt32LE(6, pos); pos += 4;
  buf.writeUInt32LE(500, pos); pos += 4;

  // Tag 2: ExifSubIFD (0x8769), LONG (4), count 1, offset 300
  buf.writeUInt16LE(0x8769, pos); pos += 2;
  buf.writeUInt16LE(4, pos); pos += 2;
  buf.writeUInt32LE(1, pos); pos += 4;
  buf.writeUInt32LE(300, pos); pos += 4;

  // Tag 3: GPSInfo (0x8825), LONG (4), count 1, offset 400
  buf.writeUInt16LE(0x8825, pos); pos += 2;
  buf.writeUInt16LE(4, pos); pos += 2;
  buf.writeUInt32LE(1, pos); pos += 4;
  buf.writeUInt32LE(400, pos); pos += 4;

  // Next IFD = 0
  buf.writeUInt32LE(0, pos); pos += 4;

  // ExifSubIFD at tiffStart + 300 (ISO = 400)
  let p = tiffStart + 300;
  buf.writeUInt16LE(1, p); p += 2;
  buf.writeUInt16LE(0x8827, p); p += 2; // ISO tag
  buf.writeUInt16LE(3, p); p += 2; // SHORT
  buf.writeUInt32LE(1, p); p += 4;
  buf.writeUInt16LE(400, p); p += 2;
  buf.writeUInt16LE(0, p); p += 2;
  buf.writeUInt32LE(0, p); p += 4;

  // GPS IFD at tiffStart + 400 (GPSLatitudeRef: 'N', GPSLatitude: 37, 48, 30)
  p = tiffStart + 400;
  buf.writeUInt16LE(2, p); p += 2;
  buf.writeUInt16LE(0x0001, p); p += 2; // GPSLatitudeRef
  buf.writeUInt16LE(2, p); p += 2;
  buf.writeUInt32LE(2, p); p += 4;
  buf.write("N\0\0\0", p); p += 4;

  buf.writeUInt16LE(0x0002, p); p += 2; // GPSLatitude
  buf.writeUInt16LE(5, p); p += 2; // RATIONAL
  buf.writeUInt32LE(3, p); p += 4;
  buf.writeUInt32LE(600, p); p += 4;
  buf.writeUInt32LE(0, p); p += 4;

  // Write Make string at tiffStart + 500
  buf.write("Nikon\0", tiffStart + 500);

  // Write GPS rational values at tiffStart + 600
  p = tiffStart + 600;
  buf.writeUInt32LE(37, p); p += 4; buf.writeUInt32LE(1, p); p += 4;
  buf.writeUInt32LE(48, p); p += 4; buf.writeUInt32LE(1, p); p += 4;
  buf.writeUInt32LE(30, p); p += 4; buf.writeUInt32LE(1, p); p += 4;

  const app1End = tiffStart + 700;
  buf.writeUInt16BE(app1End - app1LenPos, app1LenPos);
  buf.writeUInt16BE(0xFFD9, app1End);

  return buf.subarray(0, app1End + 2);
}

// Helper to construct synthetic Big-Endian JPEG with EXIF IFD0 and GPS IFD
function buildSyntheticBigEndianJpegWithGps(): Buffer {
  const buf = Buffer.alloc(2048);
  let pos = 0;

  buf.writeUInt16BE(0xFFD8, pos); pos += 2;
  buf.writeUInt16BE(0xFFE1, pos); pos += 2;
  const app1LenPos = pos; pos += 2;

  buf.write("Exif\0\0", pos); pos += 6;
  const tiffStart = pos;

  buf.write("MM", pos); pos += 2;
  buf.writeUInt16BE(42, pos); pos += 2;
  buf.writeUInt32BE(8, pos); pos += 4;

  buf.writeUInt16BE(2, pos); pos += 2;

  // Tag 1: Make
  buf.writeUInt16BE(0x010F, pos); pos += 2;
  buf.writeUInt16BE(2, pos); pos += 2;
  buf.writeUInt32BE(5, pos); pos += 4;
  buf.writeUInt32BE(500, pos); pos += 4;

  // Tag 2: GPSInfo
  buf.writeUInt16BE(0x8825, pos); pos += 2;
  buf.writeUInt16BE(4, pos); pos += 2;
  buf.writeUInt32BE(1, pos); pos += 4;
  buf.writeUInt32BE(400, pos); pos += 4;
  buf.writeUInt32BE(0, pos); pos += 4;

  // GPS IFD
  let p = tiffStart + 400;
  buf.writeUInt16BE(1, p); p += 2;
  buf.writeUInt16BE(0x0001, p); p += 2;
  buf.writeUInt16BE(2, p); p += 2;
  buf.writeUInt32BE(2, p); p += 4;
  buf.write("S\0\0\0", p); p += 4;

  buf.write("Sony\0", tiffStart + 500);

  const app1End = tiffStart + 600;
  buf.writeUInt16BE(app1End - app1LenPos, app1LenPos);
  buf.writeUInt16BE(0xFFD9, app1End);

  return buf.subarray(0, app1End + 2);
}

describe('Round 25 Advanced Security Hardening Suite', () => {

  describe('Item 1: Binary EXIF Geolocation Privacy Shield on Public Media Downloads', () => {
    it('sanitizes binary GPS tags from Little-Endian JPEG while preserving Camera Make and ISO', async () => {
      const origJpeg = buildSyntheticLittleEndianJpegWithGps();

      // Verify before stripping
      const before = await exifr.parse(origJpeg, { tiff: true, exif: true, gps: true });
      assert.strictEqual(before?.Make, 'Nikon');
      assert.strictEqual(before?.ISO, 400);
      assert.strictEqual(before?.GPSLatitudeRef, 'N');

      // Strip GPS coordinates
      const sanitized = stripGpsFromImageBuffer(origJpeg, 'image/jpeg');
      assert.ok(Buffer.isBuffer(sanitized), 'Sanitized output must be a Buffer');

      // Verify after stripping: GPS tags removed, Camera specs intact
      const after = await exifr.parse(sanitized, { tiff: true, exif: true, gps: true });
      assert.strictEqual(after?.Make, 'Nikon', 'Camera Make must be preserved');
      assert.strictEqual(after?.ISO, 400, 'ISO shooting parameter must be preserved');
      assert.strictEqual(after?.GPSLatitudeRef, undefined, 'GPSLatitudeRef must be stripped');
      assert.strictEqual(after?.latitude, undefined, 'GPS latitude must be stripped');
      assert.strictEqual(after?.longitude, undefined, 'GPS longitude must be stripped');
    });

    it('sanitizes binary GPS tags from Big-Endian JPEG while preserving Camera Make', async () => {
      const origJpeg = buildSyntheticBigEndianJpegWithGps();

      const before = await exifr.parse(origJpeg, { tiff: true, gps: true });
      assert.strictEqual(before?.Make, 'Sony');
      assert.strictEqual(before?.GPSLatitudeRef, 'S');

      const sanitized = stripGpsFromImageBuffer(origJpeg, 'image/jpeg');
      const after = await exifr.parse(sanitized, { tiff: true, gps: true });
      assert.strictEqual(after?.Make, 'Sony', 'Camera Make must be preserved');
      assert.strictEqual(after?.GPSLatitudeRef, undefined, 'GPSLatitudeRef must be stripped');
    });

    it('verifies media.ts and photo-api.ts integrate stripGpsFromImageBuffer and settingService check', () => {
      const mediaPath = path.join(process.cwd(), 'src/server/hono/media.ts');
      const photoApiPath = path.join(process.cwd(), 'src/server/api/photo-api.ts');

      const mediaContent = fs.readFileSync(mediaPath, 'utf-8');
      assert.ok(mediaContent.includes('stripGpsFromImageBuffer'), 'media.ts must import and call stripGpsFromImageBuffer');
      assert.ok(mediaContent.includes('isPublicGpsHidden'), 'media.ts must check isPublicGpsHidden');

      const photoApiContent = fs.readFileSync(photoApiPath, 'utf-8');
      assert.ok(photoApiContent.includes('stripGpsFromImageBuffer'), 'photo-api.ts must call stripGpsFromImageBuffer for public downloads');
      assert.ok(photoApiContent.includes('isPublicGpsHidden'), 'photo-api.ts must check isPublicGpsHidden');
    });
  });

  describe('Item 2: Sudo Mode / Re-Authentication for High-Risk Administrative Actions', () => {
    it('manages sudo session elevation, expiration check, and manual revocation in sudoService', async () => {
      const testUserId = 'test_sudo_user_123';
      const memoryStore = new Map<string, any>();
      const origGet = cache.get;
      const origSet = cache.set;
      const origDelete = cache.delete;

      cache.get = async <T = any>(key: string): Promise<T | null> => {
        return (memoryStore.get(key) as T) ?? null;
      };
      cache.set = async (key: string, val: any): Promise<void> => {
        memoryStore.set(key, val);
      };
      cache.delete = async (key: string): Promise<void> => {
        memoryStore.delete(key);
      };

      try {
        // 1. Initially inactive
        const initial = await sudoService.isSudoActive(testUserId);
        assert.strictEqual(initial.active, false);
        assert.strictEqual(initial.remainingSeconds, 0);

        // 2. requireSudo throws 403 auth.sudoRequired
        await assert.rejects(
          async () => {
            await sudoService.requireSudo(testUserId);
          },
          (err: any) => {
            assert.strictEqual(err.message, 'auth.sudoRequired');
            assert.strictEqual(err.code, 403);
            return true;
          }
        );

        // 3. Elevate sudo mode in cache
        await cache.set(`sudo_session_${testUserId}`, {
          elevated: true,
          elevatedAt: Date.now(),
          expiresAt: Date.now() + 900 * 1000,
        }, { ttl: 900 });

        // 4. Now active
        const elevated = await sudoService.isSudoActive(testUserId);
        assert.strictEqual(elevated.active, true);
        assert.ok(elevated.remainingSeconds > 800, 'Remaining seconds should be close to 900');

        // 5. requireSudo now passes without error
        await assert.doesNotReject(async () => {
          await sudoService.requireSudo(testUserId);
        });

        // 6. Clear sudo resets status
        await sudoService.clearSudo(testUserId);
        const afterClear = await sudoService.isSudoActive(testUserId);
        assert.strictEqual(afterClear.active, false);
      } finally {
        cache.get = origGet;
        cache.set = origSet;
        cache.delete = origDelete;
      }
    });

    it('verifies destructive routes in photo-api and storage-cleaner-api are guarded by requireSudo', () => {
      const photoApiPath = path.join(process.cwd(), 'src/server/api/photo-api.ts');
      const photoApiContent = fs.readFileSync(photoApiPath, 'utf-8');
      assert.ok(photoApiContent.includes('sudoService.requireSudo(userId)'), 'photo/clear must require Sudo Mode');

      const cleanerApiPath = path.join(process.cwd(), 'src/server/api/storage-cleaner-api.ts');
      const cleanerApiContent = fs.readFileSync(cleanerApiPath, 'utf-8');
      assert.ok(cleanerApiContent.includes('sudoService.requireSudo(userId)'), 'storage cleaner must require Sudo Mode');

      const userApiPath = path.join(process.cwd(), 'src/server/api/user-api.ts');
      const userApiContent = fs.readFileSync(userApiPath, 'utf-8');
      assert.ok(userApiContent.includes("app.post('/user/sudo'"), 'user-api must expose POST /user/sudo');
      assert.ok(userApiContent.includes("app.get('/user/sudo/status'"), 'user-api must expose GET /user/sudo/status');
      assert.ok(userApiContent.includes('sudoRateLimiter'), 'user-api must enforce sudoRateLimiter');
    });
  });

  describe('Item 3: Short-Lived HMAC Signed Download URLs for Full-Res Media', () => {
    it('creates, verifies, and rejects tampered or expired HMAC signed download tokens', () => {
      const key = 'photos/2026/test-photo-fullres.jpg';

      // 1. Generate valid token
      const { token, exp } = createSignedDownloadToken(key, 900);
      assert.ok(token && typeof token === 'string' && token.length === 64, 'Token must be a 64-char hex string (HMAC-SHA256)');
      assert.ok(exp > Math.floor(Date.now() / 1000), 'Expiration must be in future');

      // 2. Validate valid token
      assert.strictEqual(verifySignedDownloadToken(key, token, exp), true, 'Valid token must verify successfully');

      // 3. Reject tampered token
      const tamperedToken = token.slice(0, -2) + 'aa';
      assert.strictEqual(verifySignedDownloadToken(key, tamperedToken, exp), false, 'Tampered token must be rejected');

      // 4. Reject tampered key
      assert.strictEqual(verifySignedDownloadToken('photos/other.jpg', token, exp), false, 'Wrong key must be rejected');

      // 5. Reject expired token
      const pastExp = Math.floor(Date.now() / 1000) - 100;
      assert.strictEqual(verifySignedDownloadToken(key, token, pastExp), false, 'Expired token must be rejected');

      // 6. Build full signed URL
      const signedUrl = buildSignedDownloadUrl(key, 900);
      assert.ok(signedUrl.includes('download=1'), 'Signed URL must include download=1');
      assert.ok(signedUrl.includes('token='), 'Signed URL must include token param');
      assert.ok(signedUrl.includes('exp='), 'Signed URL must include exp param');
    });

    it('verifies media.ts enforces signed download tokens on public download requests', () => {
      const mediaPath = path.join(process.cwd(), 'src/server/hono/media.ts');
      const mediaContent = fs.readFileSync(mediaPath, 'utf-8');

      assert.ok(mediaContent.includes('verifySignedDownloadToken'), 'media.ts must import and verify signed download token');
      assert.ok(mediaContent.includes('DOWNLOAD_TOKEN_REQUIRED'), 'media.ts must reject missing/invalid token with DOWNLOAD_TOKEN_REQUIRED');
    });

    it('verifies photo-api.ts exposes POST /photo/download-url', () => {
      const photoApiPath = path.join(process.cwd(), 'src/server/api/photo-api.ts');
      const photoApiContent = fs.readFileSync(photoApiPath, 'utf-8');

      assert.ok(photoApiContent.includes("app.post('/photo/download-url'"), 'photo-api.ts must register POST /photo/download-url');
      assert.ok(photoApiContent.includes('buildSignedDownloadUrl'), 'photo-api.ts must call buildSignedDownloadUrl');
    });
  });

  describe('Item 4: Admin Security Center & Active Sessions Widget', () => {
    it('verifies AdminSecurityCard component exists with active sessions, 2FA, and Sudo elevation', () => {
      const cardPath = path.join(process.cwd(), 'src/components/admin/admin-security-card.tsx');
      assert.ok(fs.existsSync(cardPath), 'AdminSecurityCard component must exist');

      const content = fs.readFileSync(cardPath, 'utf-8');
      assert.ok(content.includes('listSessions'), 'Must call listSessions to display connected devices');
      assert.ok(content.includes('revokeSession'), 'Must support revoking individual sessions');
      assert.ok(content.includes('revokeOtherSessions'), 'Must support 1-click Revoke All Other Sessions');
      assert.ok(content.includes('getTotpStatus'), 'Must check 2FA status');
      assert.ok(content.includes('Current Device'), 'Must highlight current active device');
    });

    it('verifies Admin page mounts AdminSecurityCard in layout', () => {
      const adminPagePath = path.join(process.cwd(), 'src/app/admin/page.tsx');
      const content = fs.readFileSync(adminPagePath, 'utf-8');

      assert.ok(content.includes('AdminSecurityCard'), 'src/app/admin/page.tsx must import and mount AdminSecurityCard');
      assert.ok(content.includes('<AdminSecurityCard'), 'Must render <AdminSecurityCard />');
    });
  });

});
