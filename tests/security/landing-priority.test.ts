import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Hono } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { contextStorage } from 'hono/context-storage';
import {
  invalidateLandingPriorityCache,
  sanitizeLandingPriorityPhotoIds,
  settingService,
} from '@/server/service/setting-service';
import { mergeLandingPhotoIds } from '@/server/service/photo-service';
import { LANDING_PRIORITY_MAX_COUNT } from '@/server/const/global';
import { security } from '@/server/security/security';
import { csrfProtection } from '@/server/security/csrf';
import { cache } from '@/server/infra/cache';
import { AUTH_CACHE_KEY } from '@/server/const/cache';
import { TOKEN_COOKIE_NAME } from '@/server/const/global';
import { UserStatusEnum, UserTypeEnum } from '@/server/enums/user-enum';
import { createLoginToken } from '@/server/lib/jwt';
import BizError from '@/server/error/biz-error';

describe('Landing Page Priority Photos Feature & Security Suite', () => {
  describe('Input Validation & Max 30 Cap', () => {
    it('deduplicates valid IDs and allows up to 30 photo IDs', () => {
      const ids = Array.from({ length: LANDING_PRIORITY_MAX_COUNT }, (_, i) => `photo_${i + 1}`);
      const withDuplicates = [...ids, 'photo_1', 'photo_5'];
      const cleaned = sanitizeLandingPriorityPhotoIds(withDuplicates);

      assert.equal(LANDING_PRIORITY_MAX_COUNT, 30);
      assert.equal(cleaned.length, 30);
      assert.deepEqual(cleaned, ids);
    });

    it('rejects selecting more than 30 unique photo IDs', () => {
      const tooManyIds = Array.from({ length: 31 }, (_, i) => `photo_${i + 1}`);
      assert.throws(
        () => sanitizeLandingPriorityPhotoIds(tooManyIds),
        (err: unknown) =>
          err instanceof BizError && err.message === 'landing.priorityLimitExceeded' && err.code === 400
      );
    });

    it('rejects non-array inputs and malformed or path-traversal photo IDs', () => {
      for (const badInput of ['photo_1', { id: 'p1' }, null, 123] as unknown[]) {
        assert.throws(
          () => sanitizeLandingPriorityPhotoIds(badInput),
          (err: unknown) =>
            err instanceof BizError && err.message === 'landing.invalidPhotoSelection' && err.code === 400
        );
      }

      for (const badId of ['../etc/passwd', 'photo/1', 'photo 1', '', 'a'.repeat(65)]) {
        assert.throws(
          () => sanitizeLandingPriorityPhotoIds([badId]),
          (err: unknown) =>
            err instanceof BizError && err.message === 'landing.invalidPhotoSelection' && err.code === 400
        );
      }
    });

    it('persists and retrieves priority IDs cleanly in offline/test mode without throwing', async () => {
      invalidateLandingPriorityCache();
      const origDb = process.env.DATABASE_URL;
      const origEnv = process.env.NODE_ENV;
      const env = process.env as Record<string, string | undefined>;
      try {
        delete env.DATABASE_URL;
        env.NODE_ENV = 'test';
        const saved = await settingService.setLandingPriorityPhotoIds(['p_a', 'p_b', 'p_a']);
        assert.deepEqual(saved, ['p_a', 'p_b']);

        const loaded = await settingService.getLandingPriorityPhotoIds();
        assert.deepEqual(loaded, ['p_a', 'p_b']);
      } finally {
        invalidateLandingPriorityCache();
        if (origDb !== undefined) env.DATABASE_URL = origDb;
        else delete env.DATABASE_URL;
        env.NODE_ENV = origEnv;
      }
    });
  });

  describe('Priority + Random Mixing Logic', () => {
    it('guarantees all eligible priority IDs (up to 30) appear inside the 50-photo landing slice alongside random fillers', () => {
      const priorityIds = Array.from({ length: 30 }, (_, i) => `prio_${i + 1}`);
      const otherIds = Array.from({ length: 120 }, (_, i) => `rand_${i + 1}`);
      const allEligible = [...otherIds, ...priorityIds];

      const merged = mergeLandingPhotoIds(priorityIds, allEligible, 50);

      assert.equal(merged.length, 50);
      assert.equal(new Set(merged).size, 50, 'Merged landing pool must contain 50 unique photo IDs');
      for (const pid of priorityIds) {
        assert.ok(merged.includes(pid), `Priority photo ${pid} must be guaranteed in landing pool`);
      }
    });

    it('filters out deleted, archived, or ineligible priority IDs while filling remaining slots cleanly', () => {
      const priorityIds = ['prio_1', 'deleted_prio', 'archived_prio', 'prio_2'];
      const eligiblePool = ['rand_1', 'prio_2', 'rand_2', 'prio_1', 'rand_3', 'rand_4'];

      const merged = mergeLandingPhotoIds(priorityIds, eligiblePool, 5);

      assert.equal(merged.length, 5);
      assert.ok(merged.includes('prio_1'));
      assert.ok(merged.includes('prio_2'));
      assert.equal(merged.includes('deleted_prio'), false);
      assert.equal(merged.includes('archived_prio'), false);
      assert.equal(new Set(merged).size, 5);
    });

    it('handles galleries smaller than target size without duplicates or errors', () => {
      const priorityIds = ['p1', 'p2'];
      const eligiblePool = ['p1', 'p2', 'r1'];

      const merged = mergeLandingPhotoIds(priorityIds, eligiblePool, 40);
      assert.equal(merged.length, 3);
      assert.deepEqual(new Set(merged), new Set(['p1', 'p2', 'r1']));
    });
  });

  describe('RBAC, CSRF & Gallery Scope Isolation', () => {
    it('blocks guests and NORMAL users from /api/setting/landing-priority while protecting POST with CSRF', async () => {
      const app = new Hono();
      app.onError((err, c) =>
        err instanceof BizError
          ? c.json({ code: err.code, message: err.message }, err.code as ContentfulStatusCode)
          : c.text('err', 500)
      );
      app.use('*', contextStorage());
      app.use('*', csrfProtection);
      app.use('*', security);
      app.get('/api/setting/landing-priority', (c) => c.json({ ok: true }));
      app.post('/api/setting/landing-priority', (c) => c.json({ ok: true }));

      // 1. Unauthenticated guest -> 401
      const guestRes = await app.request(new Request('https://naypict.my.id/api/setting/landing-priority'));
      assert.equal(guestRes.status, 401);

      // 2. Normal (non-admin) user -> 403 auth.forbidden
      const normalUserId = 'normal-user-lp';
      const normalUuid = 'uuid-normal-lp';
      const origCacheGet = cache.get;
      cache.get = (async (key: string) => {
        if (key === AUTH_CACHE_KEY + normalUserId) {
          return {
            userId: normalUserId,
            username: 'normaluser',
            avatar: null,
            type: UserTypeEnum.NORMAL,
            status: UserStatusEnum.NORMAL,
            tokenVersion: 1,
            uuidList: [normalUuid],
          };
        }
        return null;
      }) as typeof cache.get;

      try {
        const normalToken = await createLoginToken(normalUserId, normalUuid, 1);
        const normalGetRes = await app.request(
          new Request('https://naypict.my.id/api/setting/landing-priority', {
            headers: { Cookie: `${TOKEN_COOKIE_NAME}=${normalToken}` },
          })
        );
        assert.equal(normalGetRes.status, 403);

        // 3. POST without custom X-Requested-With / application/json -> 403 CSRF blocked
        const csrfRes = await app.request(
          new Request('https://naypict.my.id/api/setting/landing-priority', {
            method: 'POST',
            headers: {
              Host: 'naypict.my.id',
              Origin: 'https://naypict.my.id',
              'Content-Type': 'text/plain',
            },
          })
        );
        assert.equal(csrfRes.status, 403);
      } finally {
        cache.get = origCacheGet;
      }
    });

    it('applies landing priority strictly to landing page without altering /photos gallery logic', () => {
      const landingPageSource = fs.readFileSync(path.join(process.cwd(), 'src/app/page.tsx'), 'utf-8');
      const landingClientSource = fs.readFileSync(
        path.join(process.cwd(), 'src/components/landing/landing-client.tsx'),
        'utf-8'
      );
      const photosPageSource = fs.readFileSync(path.join(process.cwd(), 'src/app/photos/page.tsx'), 'utf-8');
      const adminPageSource = fs.readFileSync(path.join(process.cwd(), 'src/app/admin/page.tsx'), 'utf-8');

      assert.ok(landingPageSource.includes('photoService.getLandingPhotos(50)'));
      assert.ok(landingClientSource.includes('photoLandingList(50)'));
      assert.equal(landingClientSource.includes('isPaused={isNavigating}'), false);
      assert.equal(photosPageSource.includes('landing-priority'), false);
      assert.equal(photosPageSource.includes('photoLandingList'), false);
      assert.ok(adminPageSource.includes('LandingPriorityDialog'));
    });
  });
});

