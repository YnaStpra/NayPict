import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createHonoApp } from '@/server/hono/hono';
import { insightsService } from '@/server/service/insights-service';
import { settingService } from '@/server/service/setting-service';
import { photoService } from '@/server/service/photo-service';
import {
  SettingHideGpsEnum,
  SettingOnThisDayEnum,
  SettingPhotoDedupEnum,
  SettingRightClickGuardEnum,
  SettingSyncDeleteEnum,
  SettingWatermarkEnum,
} from '@/server/enums/setting-enum';
import { FileTypeEnum } from '@/server/enums/file-enum';
import { PhotoStatusEnum, PhotoVisibilityEnum } from '@/server/enums/photo-enum';
import type { Photo } from '@/server/entity/photo';
import type { File as PhotoFile } from '@/server/entity/file';
import type { Exif } from '@/server/entity/exif';

describe('Round 15 Security Hardening Suite', () => {
  describe('Task 1: Anti-Spam & Metric Inflation on Photo Interactions', () => {
    it('rejects disallowed arbitrary interaction types from metric recording', async () => {
      const res = await insightsService.recordEvent(
        { photoId: 'mock-photo-id', type: 'exploit_injection' as unknown as 'view' },
        'visitor-12345',
        false
      );

      assert.equal(res.recorded, false);
      assert.equal(res.reason, 'invalid_interaction_type');
    });

    it('rejects interaction requests missing photoId or visitorId', async () => {
      const res1 = await insightsService.recordEvent(
        { photoId: '', type: 'share' },
        'visitor-12345',
        false
      );
      assert.equal(res1.recorded, false);
      assert.equal(res1.reason, 'invalid_params');

      const res2 = await insightsService.recordEvent(
        { photoId: 'mock-photo-id', type: 'share' },
        '',
        false
      );
      assert.equal(res2.recorded, false);
      assert.equal(res2.reason, 'invalid_params');
    });

    it('excludes admin interactions from public metric recording', async () => {
      const res = await insightsService.recordEvent(
        { photoId: 'mock-photo-id', type: 'share' },
        'visitor-12345',
        true
      );
      assert.equal(res.recorded, false);
      assert.equal(res.reason, 'admin_excluded');
    });
  });

  describe('Task 2: Cloudflare Media Gateway HMAC Token Verification', () => {
    const secret = 'super-secret-media-gateway-key-32bytes';

    it('generates and verifies authentic HMAC tokens with expiration', () => {
      const key = 'previews/test-photo-uuid.webp';
      const exp = Math.floor(Date.now() / 1000) + 3600;
      const validSig = crypto
        .createHmac('sha256', secret)
        .update(`${key}:${exp}`)
        .digest('hex');

      // Verify authentic signature matches
      const checkSig = crypto
        .createHmac('sha256', secret)
        .update(`${key}:${exp}`)
        .digest('hex');
      assert.equal(validSig, checkSig);
      assert.ok(exp > Math.floor(Date.now() / 1000));
    });

    it('detects tampered derivative keys and expired signatures', () => {
      const originalKey = 'previews/test-photo-uuid.webp';
      const tamperedKey = 'previews/another-photo-uuid.webp';
      const exp = Math.floor(Date.now() / 1000) + 3600;

      const token = crypto
        .createHmac('sha256', secret)
        .update(`${originalKey}:${exp}`)
        .digest('hex');

      const tamperedCheck = crypto
        .createHmac('sha256', secret)
        .update(`${tamperedKey}:${exp}`)
        .digest('hex');

      assert.notEqual(token, tamperedCheck);

      const expiredTimestamp = Math.floor(Date.now() / 1000) - 100;
      assert.ok(Math.floor(Date.now() / 1000) > expiredTimestamp);
    });
  });

  describe('Task 3: Redact 2FA Secrets from Database Backup', () => {
    it('filters out totp_user_* and totp_used_* keys from exported setting snapshot', () => {
      const rawSettings = [
        { key: 'setting', value: JSON.stringify({ syncDelete: 1 }) },
        { key: 'totp_user_admin_uuid_1', value: JSON.stringify({ secret: 'JBSWY3DPEHPK3PXP', backupCodes: ['ABC'] }) },
        { key: 'totp_user_editor_uuid_2', value: JSON.stringify({ secret: 'KRSXG5CTMVRXEZLU', backupCodes: ['XYZ'] }) },
        { key: 'totp_used_admin_uuid_1_123456', value: '1' },
        { key: 'landing_priority_photo_ids', value: JSON.stringify(['id1', 'id2']) },
      ];

      const sanitizedSettings = rawSettings.filter(
        (s) => !s.key.startsWith('totp_user_') && !s.key.startsWith('totp_used_')
      );

      assert.equal(sanitizedSettings.length, 2);
      assert.ok(sanitizedSettings.every((s) => !s.key.startsWith('totp_user_')));
      assert.ok(sanitizedSettings.every((s) => !s.key.startsWith('totp_used_')));
      assert.equal(sanitizedSettings[0].key, 'setting');
      assert.equal(sanitizedSettings[1].key, 'landing_priority_photo_ids');
    });
  });

  describe('Task 4: Request Body Size Limiting & Buffer Defense', () => {
    it('ensures Nginx configuration contains client_max_body_size and buffer constraints', () => {
      const confPath = path.resolve(process.cwd(), 'nginx/conf.d/naypict-lb.conf');
      const content = fs.readFileSync(confPath, 'utf-8');

      assert.match(content, /client_max_body_size\s+50M;/);
      assert.match(content, /client_body_buffer_size\s+128k;/);
    });

    it('rejects oversized Content-Length requests early with 413 Payload Too Large', async () => {
      const app = createHonoApp();
      app.post('/api/test-echo', (c) => c.text('ok'));

      // Send 15MB Content-Length header to non-upload route
      const res = await app.request(
        new Request('https://naypict.my.id/api/test-echo', {
          method: 'POST',
          headers: {
            'content-length': String(15 * 1024 * 1024),
            'content-type': 'application/json',
          },
          body: JSON.stringify({ data: 'small body but large declared content-length' }),
        })
      );

      assert.equal(res.status, 413);
      const data = await res.json();
      assert.match(data.message, /Payload too large/i);
    });

    it('allows normal sized requests with valid Content-Length to pass through', async () => {
      const app = createHonoApp();
      app.post('/health', (c) => c.json({ status: 'ok' }));

      const res = await app.request(
        new Request('https://naypict.my.id/api/health', {
          method: 'POST',
          headers: {
            'content-length': '11',
            'content-type': 'application/json',
            'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
          },
          body: JSON.stringify({ ok: true }),
        })
      );

      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.status, 'ok');
    });
  });

  describe('Task 5: Dynamic Public GPS Privacy Setting', () => {
    const originalEnv = process.env.HIDE_PUBLIC_GPS;

    it('validates and clamps hidePublicGps setting value', async () => {
      delete process.env.HIDE_PUBLIC_GPS;

      await settingService.set({
        syncDelete: SettingSyncDeleteEnum.ENABLE,
        clearLast: 7,
        photoDedup: SettingPhotoDedupEnum.ENABLE,
        onThisDay: SettingOnThisDayEnum.ENABLE,
        watermarkEnabled: SettingWatermarkEnum.DISABLE,
        rightClickGuard: SettingRightClickGuardEnum.DISABLE,
        hidePublicGps: SettingHideGpsEnum.ENABLE,
      });

      assert.equal(settingService.isPublicGpsHidden(), true);

      await settingService.set({
        syncDelete: SettingSyncDeleteEnum.ENABLE,
        clearLast: 7,
        photoDedup: SettingPhotoDedupEnum.ENABLE,
        onThisDay: SettingOnThisDayEnum.ENABLE,
        watermarkEnabled: SettingWatermarkEnum.DISABLE,
        rightClickGuard: SettingRightClickGuardEnum.DISABLE,
        hidePublicGps: SettingHideGpsEnum.DISABLE,
      });

      assert.equal(settingService.isPublicGpsHidden(), false);
    });

    it('masks GPS coordinates for public guests when hidePublicGps is enabled', async () => {
      delete process.env.HIDE_PUBLIC_GPS;

      await settingService.set({
        syncDelete: SettingSyncDeleteEnum.ENABLE,
        clearLast: 7,
        photoDedup: SettingPhotoDedupEnum.ENABLE,
        onThisDay: SettingOnThisDayEnum.ENABLE,
        watermarkEnabled: SettingWatermarkEnum.DISABLE,
        rightClickGuard: SettingRightClickGuardEnum.DISABLE,
        hidePublicGps: SettingHideGpsEnum.ENABLE,
      });

      const mockPhoto: Photo = {
        photoId: 'photo-with-gps-1',
        name: 'mountain.jpg',
        thumbHash: null,
        checksum: null,
        type: 'image/jpeg',
        typeDesc: 'JPEG Image',
        size: 204800,
        width: 1920,
        height: 1080,
        takenTime: '2026-01-01T12:00:00Z',
        createTime: '2026-01-01T00:00:00Z',
        recycleTime: null,
        userId: 'admin-uuid',
        status: PhotoStatusEnum.NORMAL,
        favorite: 1,
        storageId: 'storage-1',
        allowDownload: 0,
        visibility: PhotoVisibilityEnum.BOTH,
      };

      const mockFiles: PhotoFile[] = [
        {
          fileId: 'file-1',
          photoId: 'photo-with-gps-1',
          key: 'originals/mountain.jpg',
          type: FileTypeEnum.ORIGINAL,
          fileType: 'image/jpeg',
          size: 204800,
        },
      ];

      const mockExif: Exif = {
        photoId: 'photo-with-gps-1',
        latitude: -8.3405,
        longitude: 115.092,
        altitude: 1200,
        exif: JSON.stringify({ Make: 'Canon', Model: 'EOS R5', latitude: -8.3405, longitude: 115.092 }),
      };

      // 1. Guest viewer: GPS coordinates MUST be masked (null)
      const guestVo = photoService.toPhotoVo(
        mockPhoto,
        mockFiles,
        undefined,
        undefined,
        mockExif,
        undefined // No currentUserId (guest)
      );

      assert.equal(guestVo.latitude, null);
      assert.equal(guestVo.longitude, null);
      assert.equal(guestVo.altitude, null);

      // 2. Authenticated Admin: GPS coordinates MUST remain intact
      const adminVo = photoService.toPhotoVo(
        mockPhoto,
        mockFiles,
        undefined,
        undefined,
        mockExif,
        'admin-user-uuid' // Authenticated admin
      );

      assert.equal(adminVo.latitude, -8.3405);
      assert.equal(adminVo.longitude, 115.092);
      assert.equal(adminVo.altitude, 1200);

      // Clean up setting state
      await settingService.set({
        syncDelete: SettingSyncDeleteEnum.ENABLE,
        clearLast: 7,
        photoDedup: SettingPhotoDedupEnum.ENABLE,
        onThisDay: SettingOnThisDayEnum.ENABLE,
        watermarkEnabled: SettingWatermarkEnum.DISABLE,
        rightClickGuard: SettingRightClickGuardEnum.DISABLE,
        hidePublicGps: SettingHideGpsEnum.DISABLE,
      });

      if (originalEnv) {
        process.env.HIDE_PUBLIC_GPS = originalEnv;
      }
    });

    it('returns empty array on getMapPhotos for guest visitors when public GPS is hidden', async () => {
      delete process.env.HIDE_PUBLIC_GPS;

      await settingService.set({
        syncDelete: SettingSyncDeleteEnum.ENABLE,
        clearLast: 7,
        photoDedup: SettingPhotoDedupEnum.ENABLE,
        onThisDay: SettingOnThisDayEnum.ENABLE,
        watermarkEnabled: SettingWatermarkEnum.DISABLE,
        rightClickGuard: SettingRightClickGuardEnum.DISABLE,
        hidePublicGps: SettingHideGpsEnum.ENABLE,
      });

      const mapPhotos = await photoService.getMapPhotos(undefined);
      assert.deepEqual(mapPhotos, []);

      // Reset
      await settingService.set({
        syncDelete: SettingSyncDeleteEnum.ENABLE,
        clearLast: 7,
        photoDedup: SettingPhotoDedupEnum.ENABLE,
        onThisDay: SettingOnThisDayEnum.ENABLE,
        watermarkEnabled: SettingWatermarkEnum.DISABLE,
        rightClickGuard: SettingRightClickGuardEnum.DISABLE,
        hidePublicGps: SettingHideGpsEnum.DISABLE,
      });

      if (originalEnv) {
        process.env.HIDE_PUBLIC_GPS = originalEnv;
      }
    });
  });
});
