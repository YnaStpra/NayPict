import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Hono } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { contextStorage } from 'hono/context-storage';
import type { Photo } from '@/server/entity/photo';
import type { File as PhotoFile } from '@/server/entity/file';
import nextConfig from '@/../next.config';
import {
  resolveSignedVisitorId,
  signVisitorId,
  verifySignedVisitorId,
  VISITOR_COOKIE_NAME,
} from '@/server/lib/visitor-cookie';
import {
  getCachedMediaFile,
  invalidateMediaFileCache,
  setCachedMediaFile,
} from '@/server/lib/media-cache';
import { photoService, invalidatePhotoFastPathCache } from '@/server/service/photo-service';
import { invalidateAlbumFastPathCache } from '@/server/service/album-service';
import { csrfProtection } from '@/server/security/csrf';
import { apiCors } from '@/server/security/cors';
import { checkIsAdmin, security } from '@/server/security/security';
import { analyticsService } from '@/server/service/analytics-service';
import { totpService } from '@/server/service/totp-service';
import { decryptStorageCredentials, getStorageMasterKey } from '@/server/service/storage-service';
import { S3StorageStrategy } from '@/server/storage/s3-storage';
import { UserStatusEnum, UserTypeEnum } from '@/server/enums/user-enum';
import { FileTypeEnum } from '@/server/enums/file-enum';
import { PhotoStatusEnum, PhotoVisibilityEnum } from '@/server/enums/photo-enum';
import { cache } from '@/server/infra/cache';
import { AUTH_CACHE_KEY } from '@/server/const/cache';
import { TOKEN_COOKIE_NAME } from '@/server/const/global';
import { createLoginToken } from '@/server/lib/jwt';
import BizError from '@/server/error/biz-error';

describe('Round 14 Security Hardening Suite', () => {
  describe('Task 1: Unsigned Visitor Cookie Rejection', () => {
    it('never adopts or re-signs attacker-forged unsigned visitor cookies', async () => {
      const app = new Hono();
      app.get('/visitor', (c) => {
        const vid = resolveSignedVisitorId(c);
        return c.json({ vid });
      });

      const forgedCookie = 'attacker_forged_session_123456';
      const res = await app.request(
        new Request('https://naypict.my.id/visitor', {
          headers: { Cookie: `${VISITOR_COOKIE_NAME}=${forgedCookie}` },
        })
      );
      const data = await res.json();

      assert.notEqual(data.vid, forgedCookie);
      assert.ok(data.vid.length >= 16);
    });

    it('continues honoring validly signed visitor cookies', async () => {
      const app = new Hono();
      app.get('/visitor', (c) => c.json({ vid: resolveSignedVisitorId(c) }));

      const legitId = 'legit_visitor_round14_9988';
      const signed = signVisitorId(legitId);
      const res = await app.request(
        new Request('https://naypict.my.id/visitor', {
          headers: { Cookie: `${VISITOR_COOKIE_NAME}=${signed}` },
        })
      );
      const data = await res.json();

      assert.equal(data.vid, legitId);
      assert.equal(verifySignedVisitorId(signed), legitId);
    });
  });

  describe('Task 2: Restricted Media Caching, Next Headers & Service Worker Isolation', () => {
    it('invalidates mediaFileCache via photo and album invalidation hooks', () => {
      invalidateMediaFileCache();
      setCachedMediaFile('thumbs/test-a.webp', { key: 'thumbs/test-a.webp', visibility: PhotoVisibilityEnum.BOTH });
      assert.ok(getCachedMediaFile('thumbs/test-a.webp'));

      invalidatePhotoFastPathCache();
      assert.equal(getCachedMediaFile('thumbs/test-a.webp'), undefined);

      setCachedMediaFile('thumbs/test-b.webp', { key: 'thumbs/test-b.webp', visibility: PhotoVisibilityEnum.BOTH });
      invalidateAlbumFastPathCache();
      assert.equal(getCachedMediaFile('thumbs/test-b.webp'), undefined);
    });

    it('never leaks archived/deleted media to CDN or gateway redirects in media.ts', () => {
      const mediaSource = fs.readFileSync(path.join(process.cwd(), 'src/server/hono/media.ts'), 'utf-8');
      assert.ok(mediaSource.includes('isRestrictedMedia'));
      assert.ok(mediaSource.includes('!isRestrictedMedia && (!isOriginal || isVideo)'));
      assert.ok(mediaSource.includes("'private, no-store'"));
      assert.ok(mediaSource.includes("headers['CDN-Cache-Control'] = 'no-store'"));
    });

    it('removes unconditional public edge cache headers from next.config.ts for dynamic /media/* routes', async () => {
      const rules = await nextConfig.headers?.();
      const hasThumbOverride = rules?.some((r) => r.source.includes('/media/thumbnails'));
      const hasPreviewOverride = rules?.some((r) => r.source.includes('/media/previews'));
      assert.equal(hasThumbOverride, false);
      assert.equal(hasPreviewOverride, false);
    });

    it('flushes API and media caches on logout and avoids caching private/no-store API responses in sw.js', () => {
      const swSource = fs.readFileSync(path.join(process.cwd(), 'public/sw.js'), 'utf-8');
      assert.ok(swSource.includes("url.pathname.includes('/logout')"));
      assert.ok(swSource.includes('caches.delete(MEDIA_CACHE_NAME)'));
      assert.ok(swSource.includes("cc.includes('no-store') || cc.includes('private')"));
    });
  });

  describe('Task 3: Direct Upload Thumbnail MIME & Video Thumbnail Key Validation', () => {
    it('rejects dangerous thumbnailType MIME types like text/html and image/svg+xml in addDirect', async () => {
      for (const badMime of ['text/html', 'image/svg+xml; charset=utf-8', 'application/javascript']) {
        await assert.rejects(
          async () => {
            await photoService.addDirect(
              {
                photoId: 'photo_123',
                key: 'originals/admin1/test.jpg',
                previewKey: 'previews/test.jpg',
                thumbnailKey: 'thumbnails/test.webp',
                storageId: 'st1',
                name: 'test.jpg',
                size: 1024,
                type: 'image/jpeg',
                width: 800,
                height: 600,
                checksum: 'abc123',
                thumbnailType: badMime,
              },
              'admin1'
            );
          },
          (err: unknown) => err instanceof BizError && err.message === 'photo.invalidFileType'
        );
      }
    });

    it('rejects path traversal and unauthorized prefixes in addVideo videoThumbnailKey', async () => {
      for (const badKey of ['../secret.png', 'originals/admin1/thumb.webp', 'thumbnails/..\\evil.mp4', 'thumbnails/a\0b.mp4']) {
        await assert.rejects(
          async () => {
            await photoService.addVideo(
              {
                key: 'originals/admin1/video.mp4',
                storageId: 'st1',
                name: 'video.mp4',
                size: 2048,
                type: 'video/mp4',
                width: 1280,
                height: 720,
                checksum: 'vid123',
                videoThumbnailKey: badKey,
              },
              'admin1'
            );
          },
          (err: unknown) => err instanceof BizError && err.message === 'photo.invalidStorageKey'
        );
      }
    });
  });

  describe('Task 4: CSRF Coverage on Direct Uploads/Logout & Strict JSON MIME Check', () => {
    it('enforces custom header or exact application/json MIME on newly covered sensitive mutations', async () => {
      const app = new Hono();
      app.onError((err, c) =>
        err instanceof BizError
          ? c.json({ code: err.code, message: err.message }, err.code as ContentfulStatusCode)
          : c.text('err', 500)
      );
      app.use('*', csrfProtection);
      app.post('/api/photo/add', (c) => c.json({ ok: true }));
      app.post('/api/photo/presignedUploadUrl', (c) => c.json({ ok: true }));
      app.post('/api/photo/presignedPhotoUploadUrls', (c) => c.json({ ok: true }));
      app.post('/api/logout', (c) => c.json({ ok: true }));

      // Spoofed substring Content-Type without X-Requested-With MUST be blocked
      for (const route of [
        '/api/photo/add',
        '/api/photo/presignedUploadUrl',
        '/api/photo/presignedPhotoUploadUrls',
        '/api/logout',
      ]) {
        const spoofedRes = await app.request(
          new Request(`https://naypict.my.id${route}`, {
            method: 'POST',
            headers: {
              Host: 'naypict.my.id',
              Origin: 'https://naypict.my.id',
              'Content-Type': 'application/jsonx/form-urlencoded',
            },
          })
        );
        assert.equal(spoofedRes.status, 403, `Expected 403 on spoofed Content-Type for ${route}`);

        // Exact JSON MIME essence with charset parameter passes
        const validJsonRes = await app.request(
          new Request(`https://naypict.my.id${route}`, {
            method: 'POST',
            headers: {
              Host: 'naypict.my.id',
              Origin: 'https://naypict.my.id',
              'Content-Type': 'application/json; charset=utf-8',
            },
          })
        );
        assert.equal(validJsonRes.status, 200, `Expected 200 on valid JSON Content-Type for ${route}`);
      }
    });
  });

  describe('Task 5: Telemetry Session Ownership (IDOR) Prevention', () => {
    it('refuses session heartbeat, location update, and session-scoped tracking without verified visitorId', async () => {
      const pingUpdated = await analyticsService.heartbeat({ sessionId: 'victim_sess_1', durationSeconds: 999 }, false);
      assert.equal(pingUpdated, false);

      const locUpdated = await analyticsService.updateLocation(
        { sessionId: 'victim_sess_1', latitude: 0, longitude: 0, isRevoked: true },
        false
      );
      assert.equal(locUpdated, false);

      const mediaTracked = await analyticsService.trackMedia(
        { photoId: 'photo_1', sessionId: 'victim_sess_1', action: 'view' },
        false
      );
      assert.equal(mediaTracked, false);
    });
  });

  describe('Task 6: 2FA Setup Lock & Cryptographic tempToken Generation', () => {
    it('prevents calling setupTotp when 2FA is already enabled on the account', async () => {
      const origGetTotpData = totpService.getTotpData;
      totpService.getTotpData = async () => ({
        enabled: true,
        secret: 'EXISTING_SECRET',
        createTime: new Date().toISOString(),
      });

      try {
        await assert.rejects(
          async () => {
            await totpService.setupTotp('admin', 'admin-id-1');
          },
          (err: unknown) => err instanceof BizError && err.message === 'totp.alreadyEnabled' && err.code === 403
        );
      } finally {
        totpService.getTotpData = origGetTotpData;
      }
    });

    it('uses cryptographic randomBytes instead of createId for 2FA tempToken in login-service', () => {
      const loginSource = fs.readFileSync(path.join(process.cwd(), 'src/server/service/login-service.ts'), 'utf-8');
      assert.ok(loginSource.includes("crypto.randomBytes(32).toString('base64url')"));
      assert.equal(/const tempToken = createId\(\)/.test(loginSource), false);
    });
  });

  describe('Task 7: RBAC Consolidation, Storage Fail-Closed & Presigned TTL Clamping', () => {
    it('blocks NORMAL users from accessing /photo/inventory/stats', async () => {
      const app = new Hono();
      app.onError((err, c) =>
        err instanceof BizError
          ? c.json({ code: err.code, message: err.message }, err.code as ContentfulStatusCode)
          : c.text('err', 500)
      );
      app.use('*', contextStorage());
      app.use('*', security);
      app.get('/api/photo/inventory/stats', (c) => c.json({ ok: true }));

      const userId = 'normal-user-r14';
      const uuid = 'uuid-normal-r14';
      const origCacheGet = cache.get;
      cache.get = (async (key: string) => {
        if (key === AUTH_CACHE_KEY + userId) {
          return {
            userId,
            username: 'normaluser',
            avatar: null,
            type: UserTypeEnum.NORMAL,
            status: UserStatusEnum.NORMAL,
            tokenVersion: 1,
            uuidList: [uuid],
          };
        }
        return null;
      }) as typeof cache.get;

      try {
        const token = await createLoginToken(userId, uuid, 1);
        const res = await app.request(
          new Request('https://naypict.my.id/api/photo/inventory/stats', {
            headers: { Cookie: `${TOKEN_COOKIE_NAME}=${token}` },
          })
        );
        assert.equal(res.status, 403);
        const payload = await res.json();
        assert.equal(payload.message, 'auth.forbidden');
      } finally {
        cache.get = origCacheGet;
      }
    });

    it('rejects disabled accounts or invalid sessions in centralized checkIsAdmin', async () => {
      const app = new Hono();
      let isAdminResult: boolean | null = null;
      app.get('/check', async (c) => {
        isAdminResult = await checkIsAdmin(c);
        return c.json({ isAdmin: isAdminResult });
      });

      const userId = 'disabled-admin-r14';
      const uuid = 'uuid-disabled-r14';
      const origCacheGet = cache.get;
      cache.get = (async (key: string) => {
        if (key === AUTH_CACHE_KEY + userId) {
          return {
            userId,
            username: 'disabledadmin',
            avatar: null,
            type: UserTypeEnum.ADMIN,
            status: UserStatusEnum.DISABLE,
            tokenVersion: 1,
            uuidList: [uuid],
          };
        }
        return null;
      }) as typeof cache.get;

      try {
        const token = await createLoginToken(userId, uuid, 1);
        await app.request(
          new Request('https://naypict.my.id/check', {
            headers: { Cookie: `${TOKEN_COOKIE_NAME}=${token}` },
          })
        );
        assert.equal(isAdminResult, false);
      } finally {
        cache.get = origCacheGet;
      }
    });

    it('fails closed in production when storage master key is missing or ciphertext is corrupted', async () => {
      const origEnv = process.env.NODE_ENV;
      const env = process.env as Record<string, string | undefined>;
      const origStorageKey = process.env.STORAGE_ENCRYPTION_KEY;
      const origJwt = process.env.JWT_SECRET;
      try {
        env.NODE_ENV = 'production';
        delete env.STORAGE_ENCRYPTION_KEY;
        delete env.JWT_SECRET;
        assert.throws(() => getStorageMasterKey(), /must be configured in production/i);

        env.STORAGE_ENCRYPTION_KEY = 'unit-test-storage-master-secret-32b';
        await assert.rejects(
          async () => {
            await decryptStorageCredentials({
              storageId: 's1',
              name: 'R2',
              type: 1,
              userId: 'u1',
              status: 1,
              sort: 1,
              endpoint: 'https://r2.example.com',
              bucket: 'b1',
              region: 'auto',
              domain: null,
              accessKey: 'enc:v1:corrupted-payload',
              secretKey: 'plain-secret',
            });
          }
        );
      } finally {
        env.NODE_ENV = origEnv;
        if (origStorageKey !== undefined) env.STORAGE_ENCRYPTION_KEY = origStorageKey;
        else delete env.STORAGE_ENCRYPTION_KEY;
        if (origJwt !== undefined) env.JWT_SECRET = origJwt;
        else delete env.JWT_SECRET;
      }
    });

    it('bounds S3 multipart part URL expiresIn between 60 and 900 seconds', () => {
      const strategy = new S3StorageStrategy();
      const fnStr = strategy.getPresignedPartUrl.toString();
      assert.ok(/expiresIn\s*=\s*900/.test(fnStr));
      assert.ok(/Math\.min\(Math\.max\(.*60\),\s*900\)/.test(fnStr));
    });
  });

  describe('Task 8: Archived Album SSR Scrubbing & Public PhotoVo Field Stripping', () => {
    it('strips userId, storageId, checksum, and recycleTime from unauthenticated PhotoVo payloads', () => {
      const samplePhoto: Photo = {
        photoId: 'p1',
        name: 'sunset.jpg',
        thumbHash: null,
        checksum: 'sha256-sensitive-hash',
        type: 'image/jpeg',
        typeDesc: 'JPEG',
        size: 12345,
        width: 1920,
        height: 1080,
        takenTime: '2026-01-01T00:00:00.000Z',
        createTime: '2026-01-01T00:00:00.000Z',
        recycleTime: '2026-01-02T00:00:00.000Z',
        userId: 'internal-admin-uuid',
        status: PhotoStatusEnum.NORMAL,
        favorite: 1,
        storageId: 'internal-storage-uuid',
        allowDownload: 0,
        visibility: PhotoVisibilityEnum.BOTH,
      };
      const files: PhotoFile[] = [
        {
          fileId: 'f1',
          photoId: 'p1',
          key: 'thumbnails/sunset.webp',
          type: FileTypeEnum.THUMBNAIL,
          fileType: 'image/webp',
          size: 5000,
        },
      ];

      const publicVo = photoService.toPhotoVo(samplePhoto, files, undefined, undefined, null, undefined);
      assert.equal(publicVo.userId, undefined);
      assert.equal(publicVo.storageId, undefined);
      assert.equal(publicVo.checksum, undefined);
      assert.equal(publicVo.recycleTime, undefined);

      const adminVo = photoService.toPhotoVo(samplePhoto, files, undefined, undefined, null, 'internal-admin-uuid');
      assert.equal(adminVo.userId, 'internal-admin-uuid');
      assert.equal(adminVo.storageId, 'internal-storage-uuid');
      assert.equal(adminVo.checksum, 'sha256-sensitive-hash');
      assert.equal(adminVo.recycleTime, '2026-01-02T00:00:00.000Z');
    });

    it('redacts archived album name in album layout SSR payload', () => {
      const layoutSource = fs.readFileSync(
        path.join(process.cwd(), 'src/app/albums/[albumId]/layout.tsx'),
        'utf-8'
      );
      assert.ok(layoutSource.includes("name: isArchived ? '' : album.name"));
    });
  });

  describe('Task 9: ALBUM_ONLY Comment Enforcement Against Archived or Orphaned Photos', () => {
    it('requires active non-archived album membership in both comment listing and creation', () => {
      const commentSource = fs.readFileSync(
        path.join(process.cwd(), 'src/server/service/comment-service.ts'),
        'utf-8'
      );
      assert.ok(commentSource.includes('async function hasActivePublicAlbum(photoId: string)'));
      assert.ok(commentSource.includes('eq(albumTab.isArchived, 0)'));
      assert.ok(
        commentSource.includes('PhotoVisibilityEnum.ALBUM_ONLY && !(await hasActivePublicAlbum(cleanPhotoId))')
      );
      assert.ok(commentSource.includes('PhotoVisibilityEnum.ALBUM_ONLY && !(await hasActivePublicAlbum(photoId))'));
    });
  });

  describe('Task 10: Production CORS Strictness & Open Redirect Prevention', () => {
    it('blocks localhost origins in production while permitting only authorized domains', async () => {
      const app = new Hono();
      app.use('*', apiCors);
      app.get('/api/ping', (c) => c.json({ ok: true }));

      const origEnv = process.env.NODE_ENV;
      const env = process.env as Record<string, string | undefined>;
      try {
        env.NODE_ENV = 'production';
        const localhostRes = await app.request(
          new Request('https://naypict.my.id/api/ping', {
            headers: { Origin: 'http://localhost:3000' },
          })
        );
        assert.equal(localhostRes.headers.get('access-control-allow-origin'), null);

        const prodRes = await app.request(
          new Request('https://naypict.my.id/api/ping', {
            headers: { Origin: 'https://naypict.my.id' },
          })
        );
        assert.equal(prodRes.headers.get('access-control-allow-origin'), 'https://naypict.my.id');
      } finally {
        env.NODE_ENV = origEnv;
      }
    });

    it('validates fallback download redirect target in photo-api.ts against open redirects', () => {
      const photoApiSource = fs.readFileSync(path.join(process.cwd(), 'src/server/api/photo-api.ts'), 'utf-8');
      assert.ok(photoApiSource.includes("!target.startsWith('//')"));
      assert.ok(photoApiSource.includes("!target.includes('\\\\')"));
      assert.ok(photoApiSource.includes("target.startsWith('https://')"));
    });
  });
});
