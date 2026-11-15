/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
process.env.JWT_SECRET = process.env.JWT_SECRET || 'supersecretfornaypicttests1234567890';

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { Hono } from 'hono';
import { contextStorage } from 'hono/context-storage';
import { security } from '@/server/security/security';
import { registerLocationApi } from '@/server/api/location-api';
import { registerAnalyticsApi } from '@/server/api/analytics-api';
import { settingService } from '@/server/service/setting-service';
import { userService } from '@/server/service/user-service';
import { sessionService } from '@/server/service/session-service';
import { reactionService } from '@/server/service/reaction-service';
import { albumService } from '@/server/service/album-service';
import { analyticsService } from '@/server/service/analytics-service';
import { cache } from '@/server/infra/cache';
import { AUTH_CACHE_KEY } from '@/server/const/cache';
import { TOKEN_COOKIE_NAME } from '@/server/const/global';
import { createLoginToken } from '@/server/lib/jwt';
import { UserStatusEnum, UserTypeEnum } from '@/server/enums/user-enum';
import BizError from '@/server/error/biz-error';

describe('Round 16 Security Hardening Suite', () => {
  // In-memory cache simulation for hermetic test execution
  const memStore = new Map<string, any>();
  const origCacheGet = cache.get;
  const origCacheSet = cache.set;
  const origCacheDelete = cache.delete;
  const origGetRevokedUuids = sessionService.getRevokedUuids;
  const origGetTokenVersion = sessionService.getTokenVersion;

  beforeEach(() => {
    memStore.clear();
    cache.get = async <T = any>(key: string): Promise<T | null> => {
      const val = memStore.get(key);
      return val !== undefined ? val : null;
    };
    cache.set = async (key: string, val: any): Promise<void> => {
      memStore.set(key, val);
    };
    cache.delete = async (key: string): Promise<void> => {
      memStore.delete(key);
    };
    sessionService.getRevokedUuids = async () => [];
    sessionService.getTokenVersion = async () => null;
  });

  afterEach(() => {
    cache.get = origCacheGet;
    cache.set = origCacheSet;
    cache.delete = origCacheDelete;
    sessionService.getRevokedUuids = origGetRevokedUuids;
    sessionService.getTokenVersion = origGetTokenVersion;
    memStore.clear();
  });

  describe('Task 1: Cold-Start TokenVersion Validation Bypass Defense', () => {
    it('rejects stale token on cache cold-start when DB tokenVersion has been bumped', async () => {
      const app = new Hono();
      app.use('*', contextStorage());
      app.onError((err, c) => {
        if (err instanceof BizError) {
          return c.json({ code: err.code, message: err.message }, err.code as any);
        }
        return c.json({ code: 500, message: err.message }, 500);
      });
      app.use('*', security);
      app.get('/user/list', (c) => c.json({ ok: true }));

      const testUserId = 'test-coldstart-user-1';
      const testUuid = 'test-coldstart-uuid-1';

      // 1. JWT issued with old tokenVersion = 1
      const staleToken = await createLoginToken(testUserId, testUuid, 1);

      // 2. Mock DB returning user with bumped tokenVersion = 2 (e.g. after password reset)
      const origGetById = userService.getById;
      try {
        userService.getById = async (id: string) => {
          if (id === testUserId) {
            return {
              userId: testUserId,
              username: 'coldstart_admin',
              avatar: '',
              type: UserTypeEnum.ADMIN,
              status: UserStatusEnum.NORMAL,
              tokenVersion: 2, // DB is at version 2
              createTime: new Date().toISOString(),
            };
          }
          return null;
        };

        // 3. Request with stale token (version 1)
        const res = await app.request(
          new Request('https://naypict.my.id/user/list', {
            headers: { Cookie: `${TOKEN_COOKIE_NAME}=${staleToken}` },
          })
        );

        // Security requirement: Must be rejected with 401 Unauthorized!
        assert.equal(res.status, 401);
        const body = await res.json();
        assert.equal(body.code, 401);
        assert.equal(body.message, 'auth.failed');

        // Security requirement: The stale token version must NOT have been cached
        assert.equal(memStore.has(AUTH_CACHE_KEY + testUserId), false);
      } finally {
        userService.getById = origGetById;
      }
    });

    it('successfully authorizes and caches DB tokenVersion when tokenVersion matches', async () => {
      const app = new Hono();
      app.use('*', contextStorage());
      app.onError((err, c) => {
        if (err instanceof BizError) {
          return c.json({ code: err.code, message: err.message }, err.code as any);
        }
        return c.json({ code: 500, message: err.message }, 500);
      });
      app.use('*', security);
      app.get('/user/list', (c) => c.json({ ok: true }));

      const testUserId = 'test-coldstart-valid-user';
      const testUuid = 'test-coldstart-valid-uuid';

      // 1. JWT issued with tokenVersion = 2
      const validToken = await createLoginToken(testUserId, testUuid, 2);

      const origGetById = userService.getById;
      try {
        userService.getById = async (id: string) => {
          if (id === testUserId) {
            return {
              userId: testUserId,
              username: 'valid_admin',
              avatar: '',
              type: UserTypeEnum.ADMIN,
              status: UserStatusEnum.NORMAL,
              tokenVersion: 2, // Matches JWT!
              createTime: new Date().toISOString(),
            };
          }
          return null;
        };

        const res = await app.request(
          new Request('https://naypict.my.id/user/list', {
            headers: { Cookie: `${TOKEN_COOKIE_NAME}=${validToken}` },
          })
        );

        assert.equal(res.status, 200);
        const body = await res.json();
        assert.equal(body.ok, true);

        // Authoritative DB tokenVersion (2) should be persisted into cache
        const cached = memStore.get(AUTH_CACHE_KEY + testUserId);
        assert.ok(cached);
        assert.equal(cached.tokenVersion, 2);
      } finally {
        userService.getById = origGetById;
      }
    });
  });

  describe('Task 2: Reverse Geocoding Public GPS Policy Enforcement', () => {
    it('returns empty location data for public visitors when hidePublicGps is enabled', async () => {
      const app = new Hono();
      app.use('*', contextStorage());
      registerLocationApi(app as any);

      const origEnv = process.env.HIDE_PUBLIC_GPS;
      process.env.HIDE_PUBLIC_GPS = 'true';

      try {
        assert.equal(settingService.isPublicGpsHidden(), true);

        const res = await app.request(
          new Request('https://naypict.my.id/location/reverse?lat=-8.3405&lng=115.092', {
            headers: { 'x-forwarded-for': '203.0.113.195' },
          })
        );

        assert.equal(res.status, 200);
        const data = await res.json();
        assert.equal(data.code, 200);
        assert.deepEqual(data.data, {
          address: '',
          latitude: 0,
          longitude: 0,
          mapsUrl: '',
        });
      } finally {
        if (origEnv !== undefined) {
          process.env.HIDE_PUBLIC_GPS = origEnv;
        } else {
          delete process.env.HIDE_PUBLIC_GPS;
        }
      }
    });
  });

  describe('Task 3: Anti-Spam & Reaction Oscillation Debounce', () => {
    it('debounces rapid repeated reaction requests for same visitor and photo', async () => {
      const visitorId = 'visitor-rapid-toggle-r16';
      const photoId = 'photo-rapid-toggle-r16';
      const debounceKey = `reaction_debounce:${visitorId}:${photoId}`;

      // Simulate first reaction request having set the debounce lock
      memStore.set(debounceKey, true);

      let getReactionsCalled = false;
      const origGetReactions = reactionService.getPhotoReactions;
      reactionService.getPhotoReactions = async (pId: string, _vId?: string, _useMaster?: boolean) => {
        getReactionsCalled = true;
        return {
          photoId: pId,
          totals: { love: 1, fire: 0, camera: 0, place: 0, clap: 0 },
          userReactions: { love: true, fire: false, camera: false, place: false, clap: 0 },
        };
      };

      try {
        // Attempting another reaction toggle while debounce lock is active
        const result = await reactionService.addPhotoReaction({
          photoId,
          visitorId,
          reactionType: 'love',
        });

        // Should return existing state directly without error and without redundant DB write
        assert.equal(getReactionsCalled, true);
        assert.equal(result.totals.love, 1);
        assert.equal(result.userReactions.love, true);
      } finally {
        reactionService.getPhotoReactions = origGetReactions;
      }
    });
  });

  describe('Task 4: Album Batch Operations Query Chunking', () => {
    it('safely rejects photo batch requests exceeding 500 ceiling', async () => {
      const fakePhotoIds = Array.from({ length: 501 }, (_, i) => `photo-batch-${i}`);

      await assert.rejects(
        async () => {
          await albumService.addPhoto(
            {
              albumIds: ['album-1'],
              photoIds: fakePhotoIds,
            },
            'user-1'
          );
        },
        (err: any) => err instanceof BizError && err.message === 'photo.batchLimitExceeded'
      );

      await assert.rejects(
        async () => {
          await albumService.removePhoto(
            {
              albumId: 'album-1',
              photoIds: fakePhotoIds,
            },
            'user-1'
          );
        },
        (err: any) => err instanceof BizError && err.message === 'photo.batchLimitExceeded'
      );
    });
  });

  describe('Task 5: Telemetry Field Sanitization & Control Char Truncation', () => {
    it('sanitizes and truncates excessive strings in visitor session initialization', async () => {
      const app = new Hono();
      app.use('*', contextStorage());
      registerAnalyticsApi(app as any);

      // Malicious payload with control characters, null bytes, and excessive length (1,000+ chars)
      const dirtyReferrer = 'https://evil.com/\x00\r\n\t' + 'a'.repeat(800);
      const dirtyLocation = 'Bali\x00\x1f' + 'x'.repeat(400);

      let capturedParams: any = null;
      const origInit = analyticsService.initSession;
      analyticsService.initSession = async (params: any, _meta: any) => {
        capturedParams = params;
        return {
          sessionId: 'mock-session-id',
          visitorId: params.visitorId,
        };
      };

      try {
        const res = await app.request(
          new Request('https://naypict.my.id/analytics/session/init', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-forwarded-for': '203.0.113.88',
              'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
            },
            body: JSON.stringify({
              referrer: dirtyReferrer,
              userLocationName: dirtyLocation,
              landingPath: '/explore\x00' + 'p'.repeat(500),
            }),
          })
        );

        assert.equal(res.status, 200);
        const data = await res.json();
        assert.equal(data.code, 200);
        assert.ok(data.data.sessionId);

        // Verify truncation and control character removal
        assert.ok(capturedParams);
        assert.ok(capturedParams.referrer.length <= 255);
        assert.ok(!capturedParams.referrer.includes('\x00'));
        assert.ok(capturedParams.userLocationName.length <= 255);
        assert.ok(!capturedParams.userLocationName.includes('\x00'));
        assert.ok(capturedParams.landingPath.length <= 255);
        assert.ok(!capturedParams.landingPath.includes('\x00'));
      } finally {
        analyticsService.initSession = origInit;
      }
    });

    it('rejects media tracking with malformed or invalid action types', async () => {
      const app = new Hono();
      app.use('*', contextStorage());
      registerAnalyticsApi(app as any);

      let capturedAction: string | null = null;
      const origTrack = analyticsService.trackMedia;
      analyticsService.trackMedia = async (params: any) => {
        capturedAction = params.action;
        return true;
      };

      try {
        const res = await app.request(
          new Request('https://naypict.my.id/analytics/media/track', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-forwarded-for': '203.0.113.89',
            },
            body: JSON.stringify({
              photoId: 'valid-photo-id-123',
              action: 'malicious_sql_injection_action' as any,
            }),
          })
        );

        assert.equal(res.status, 200);
        const data = await res.json();
        assert.equal(data.code, 200);

        // Security requirement: Disallowed action must fall back to safe 'view'
        assert.equal(capturedAction, 'view');
      } finally {
        analyticsService.trackMedia = origTrack;
      }
    });
  });
});
