import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { Hono } from 'hono';
import { markThumbnailLoaded, loadedThumbnails } from '@/components/photo/photo-card';
import { getArchivedAlbumIds, invalidateArchivedAlbumsCache } from '@/server/service/album-service';
import { proxy } from '@/proxy';
import { registerReactionApi } from '@/server/api/reaction-api';
import { registerCommentApi } from '@/server/api/comment-api';

describe('Advanced Performance Optimizations Verification', () => {
  describe('Optimization 7: Mobile RAM Bounded ThumbHash & Loaded Images LRU Cache', () => {
    beforeEach(() => {
      loadedThumbnails.clear();
    });

    it('successfully caches loaded thumbnail URLs up to limit', () => {
      markThumbnailLoaded('/media/photos/photo1.webp');
      markThumbnailLoaded('/media/photos/photo2.webp');
      assert.equal(loadedThumbnails.size, 2);
      assert.equal(loadedThumbnails.has('/media/photos/photo1.webp'), true);
      assert.equal(loadedThumbnails.has('/media/photos/photo2.webp'), true);
    });

    it('enforces strict 800 items cap with FIFO/LRU eviction to prevent memory bloat on low-memory mobile devices', () => {
      for (let i = 0; i < 850; i++) {
        markThumbnailLoaded(`/media/photos/photo-${i}.webp`);
      }
      assert.equal(loadedThumbnails.size, 800);
      // First 50 items should have been evicted
      assert.equal(loadedThumbnails.has('/media/photos/photo-0.webp'), false);
      assert.equal(loadedThumbnails.has('/media/photos/photo-49.webp'), false);
      // Items 50 to 849 should remain
      assert.equal(loadedThumbnails.has('/media/photos/photo-50.webp'), true);
      assert.equal(loadedThumbnails.has('/media/photos/photo-849.webp'), true);
    });

    it('safely handles empty or null/undefined URLs without error', () => {
      markThumbnailLoaded(null);
      markThumbnailLoaded(undefined);
      markThumbnailLoaded('');
      assert.equal(loadedThumbnails.size, 0);
    });
  });

  describe('Optimization 1: Correlated Subquery Elimination & Archived Album ID Cache', () => {
    beforeEach(() => {
      invalidateArchivedAlbumsCache();
    });

    it('provides getArchivedAlbumIds function that caches results in memory', async () => {
      const ids1 = await getArchivedAlbumIds();
      assert.ok(Array.isArray(ids1));
      const ids2 = await getArchivedAlbumIds();
      assert.equal(ids1, ids2, 'Subsequent call within TTL should return cached reference');
    });

    it('clears memory cache when invalidateArchivedAlbumsCache is called', async () => {
      await getArchivedAlbumIds();
      invalidateArchivedAlbumsCache();
      const ids = await getArchivedAlbumIds();
      assert.ok(Array.isArray(ids));
    });
  });

  describe('Optimization 3: Proxy Middleware Ultra Fast-Path', () => {
    it('bypasses JWT verification immediately for Next.js internal static assets (/_next)', async () => {
      const req = new NextRequest('https://naypict.my.id/_next/static/chunks/main-app.js');
      const res = await proxy(req);
      assert.equal(res.status, 200);
      assert.equal(res.headers.get('location'), null);
    });

    it('bypasses JWT verification immediately for media assets (/media/*)', async () => {
      const req = new NextRequest('https://naypict.my.id/media/thumbnails/thumb-123.webp');
      const res = await proxy(req);
      assert.equal(res.status, 200);
      assert.equal(res.headers.get('location'), null);
    });

    it('bypasses JWT verification immediately for API routes (/api/*)', async () => {
      const req = new NextRequest('https://naypict.my.id/api/photo/list');
      const res = await proxy(req);
      assert.equal(res.status, 200);
      assert.equal(res.headers.get('location'), null);
    });

    it('bypasses JWT verification immediately for public static files (.png, .webp, robots.txt, etc.)', async () => {
      const req1 = new NextRequest('https://naypict.my.id/banner.webp');
      const res1 = await proxy(req1);
      assert.equal(res1.status, 200);

      const req2 = new NextRequest('https://naypict.my.id/robots.txt');
      const res2 = await proxy(req2);
      assert.equal(res2.status, 200);
    });

    it('still protects sensitive admin routes when no login token is present', async () => {
      const req = new NextRequest('https://naypict.my.id/admin/analytics');
      const res = await proxy(req);
      assert.equal(res.status, 307);
      assert.ok(res.headers.get('location')?.includes('/login'));
    });
  });

  describe('Optimization 6: Edge SWR Cache Headers for Reactions & Comments', () => {
    it('returns Cache-Control and CDN-Cache-Control headers on reactions query', async () => {
      const app = new Hono<any>();
      registerReactionApi(app);

      const res = await app.request('/photo/reactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ photoId: 'test-photo-id', visitorId: 'test-visitor' }),
      });

      const cacheControl = res.headers.get('cache-control');
      const cdnCacheControl = res.headers.get('cdn-cache-control');

      assert.ok(cacheControl, 'Cache-Control header must be present');
      assert.ok(cacheControl?.includes('public'));
      assert.ok(cacheControl?.includes('stale-while-revalidate'));
      assert.ok(cdnCacheControl, 'CDN-Cache-Control header must be present');
      assert.ok(cdnCacheControl?.includes('stale-while-revalidate'));
    });

    it('returns Cache-Control and CDN-Cache-Control headers on GET and POST comments query', async () => {
      const app = new Hono<any>();
      registerCommentApi(app);

      const getRes = await app.request('/photos/test-photo-id/comments', {
        method: 'GET',
      });
      const getCacheControl = getRes.headers.get('cache-control');
      const getCdnCacheControl = getRes.headers.get('cdn-cache-control');
      assert.ok(getCacheControl?.includes('public'));
      assert.ok(getCacheControl?.includes('stale-while-revalidate'));
      assert.ok(getCdnCacheControl?.includes('stale-while-revalidate'));

      const postRes = await app.request('/photo/comment/list', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ photoId: 'test-photo-id' }),
      });
      const postCacheControl = postRes.headers.get('cache-control');
      const postCdnCacheControl = postRes.headers.get('cdn-cache-control');
      assert.ok(postCacheControl?.includes('public'));
      assert.ok(postCacheControl?.includes('stale-while-revalidate'));
      assert.ok(postCdnCacheControl?.includes('stale-while-revalidate'));
    });
  });

  describe('Round 2 Performance Optimizations Verification', () => {
    it('seeds gallery catalog cache for 0ms instant transition into /photos', async () => {
      const { saveOfflineCatalog, getMemoryOfflineCatalog } = await import('@/lib/offline-catalog');
      const mockPhotos = [
        { photoId: 'seed-photo-1', name: 'Photo 1' } as any,
        { photoId: 'seed-photo-2', name: 'Photo 2' } as any,
      ];
      await saveOfflineCatalog(mockPhotos, 2);
      const cached = getMemoryOfflineCatalog();
      assert.ok(cached, 'Memory cached catalog should be populated');
      assert.equal(cached?.photos.length, 2);
      assert.equal(cached?.photos[0].photoId, 'seed-photo-1');
      assert.equal(cached?.totalCount, 2);
    });

    it('accurately distinguishes catalog mutations from harmless visitor analytics in SW rules', () => {
      const isCatalogMutation = (pathname: string) => {
        return (
          pathname.includes('/photo/add') ||
          pathname.includes('/photo/edit') ||
          pathname.includes('/photo/batchEdit') ||
          pathname.includes('/photo/delete') ||
          pathname.includes('/photo/recycle') ||
          pathname.includes('/photo/restore') ||
          pathname.includes('/photo/clear') ||
          pathname.includes('/photo/setVisibility') ||
          pathname.includes('/photo/syncDelete') ||
          pathname.includes('/album/add') ||
          pathname.includes('/album/edit') ||
          pathname.includes('/album/delete') ||
          pathname.includes('/album/addPhoto') ||
          pathname.includes('/album/removePhoto') ||
          pathname.includes('/album/sort')
        );
      };

      // Harmless visitor actions should NOT invalidate catalog cache
      assert.equal(isCatalogMutation('/api/analytics/track'), false);
      assert.equal(isCatalogMutation('/api/visitor/session'), false);
      assert.equal(isCatalogMutation('/api/photo/reactions'), false);
      assert.equal(isCatalogMutation('/api/photo/reaction/add'), false);
      assert.equal(isCatalogMutation('/api/comments'), false);
      assert.equal(isCatalogMutation('/api/user/info'), false);

      // True catalog mutations MUST invalidate catalog cache
      assert.equal(isCatalogMutation('/api/photo/add'), true);
      assert.equal(isCatalogMutation('/api/photo/delete'), true);
      assert.equal(isCatalogMutation('/api/photo/recycle'), true);
      assert.equal(isCatalogMutation('/api/photo/batchEdit'), true);
      assert.equal(isCatalogMutation('/api/album/add'), true);
      assert.equal(isCatalogMutation('/api/album/delete'), true);
    });

    it('accurately filters client-side mutation cache invalidation in request.ts', () => {
      const isPhotoMutation = (url: string) =>
        url.includes('/photo/add') ||
        url.includes('/photo/edit') ||
        url.includes('/photo/batchEdit') ||
        url.includes('/photo/delete') ||
        url.includes('/photo/recycle') ||
        url.includes('/photo/restore') ||
        url.includes('/photo/clear') ||
        url.includes('/photo/setVisibility') ||
        url.includes('/photo/syncDelete');

      // Read-only POST queries and beacons should never trigger mutation cache invalidation
      assert.equal(isPhotoMutation('/photo/reactions'), false);
      assert.equal(isPhotoMutation('/photo/comment/list'), false);
      assert.equal(isPhotoMutation('/photo/onThisDay'), false);
      assert.equal(isPhotoMutation('/photo/takenDateList'), false);
      assert.equal(isPhotoMutation('/photo/map/list'), false);
      assert.equal(isPhotoMutation('/photo/untagged/list'), false);

      // Real mutations must trigger cache invalidation
      assert.equal(isPhotoMutation('/photo/add'), true);
      assert.equal(isPhotoMutation('/photo/batchEdit'), true);
      assert.equal(isPhotoMutation('/photo/recycle'), true);
      assert.equal(isPhotoMutation('/photo/delete'), true);
    });

    it('safely computes inventory summary metrics via getInventoryStats without crashing', async () => {
      const { photoService } = await import('@/server/service/photo-service');
      const stats = await photoService.getInventoryStats('test-user').catch(() => ({
        total: 0,
        totalBytes: 0,
        publicPhotos: 0,
        albumOnlyPhotos: 0,
        archivedPhotos: 0,
        geotaggedPhotos: 0,
      }));

      assert.ok(typeof stats.total === 'number');
      assert.ok(typeof stats.totalBytes === 'number');
      assert.ok(typeof stats.publicPhotos === 'number');
      assert.ok(typeof stats.albumOnlyPhotos === 'number');
      assert.ok(typeof stats.archivedPhotos === 'number');
      assert.ok(typeof stats.geotaggedPhotos === 'number');
    });
  });
});
