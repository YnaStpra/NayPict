import { and, count, eq, inArray, isNull, or, sql } from 'drizzle-orm';
import { orm } from '@/server/infra/db';
import { photoTab } from '@/server/entity/photo';
import { albumTab } from '@/server/entity/album';
import { albumPhotoTab } from '@/server/entity/album-photo';
import { cache } from '@/server/infra/cache';
import { PhotoStatusEnum, PhotoVisibilityEnum } from '@/server/enums/photo-enum';
import { type CatalogSyncVersionVo } from '@/server/entity/vo/sync';

// This module provides real-time state version management and heartbeat synchronization for zero-refresh UI updates.

const SYNC_CACHE_KEY = 'naypict:sync:version';

// In-memory version state for zero-latency lookups on Vercel Serverless / Edge
let memoryVersion: CatalogSyncVersionVo | null = null;
let lastCountRefreshTime = 0;

export const syncService = {

  // Calculate current public gallery photo count from database (excluding archived albums and archived photos).
  async getActivePhotoCount(): Promise<number> {
    try {
      const [row] = await orm
        .select({ total: count() })
        .from(photoTab)
        .where(
          and(
            eq(photoTab.status, PhotoStatusEnum.NORMAL),
            or(
              inArray(photoTab.visibility, [PhotoVisibilityEnum.BOTH, PhotoVisibilityEnum.GALLERY_ONLY]),
              isNull(photoTab.visibility)
            ),
            sql`NOT EXISTS (
              SELECT 1 FROM ${albumPhotoTab}
              INNER JOIN ${albumTab} ON ${albumTab.albumId} = ${albumPhotoTab.albumId}
              WHERE ${albumPhotoTab.photoId} = ${photoTab.photoId}
              AND ${albumTab.isArchived} = 1
            )`
          )
        );

      return Number(row?.total ?? 0);
    } catch (err) {
      console.error('[SYNC-SERVICE] Failed to query active photo count:', err);
      return memoryVersion?.photoCount ?? 0;
    }
  },

  // Retrieve current catalog sync version vector, falling back to cache or database initialization.
  async getVersion(): Promise<CatalogSyncVersionVo> {
    const now = Date.now();

    // Fast-path: return memory version if valid and recent (recalculate count at most every 60s)
    if (memoryVersion) {
      if (now - lastCountRefreshTime > 60000) {
        lastCountRefreshTime = now;
        this.getActivePhotoCount()
          .then((freshCount) => {
            if (memoryVersion && memoryVersion.photoCount !== freshCount) {
              memoryVersion.photoCount = freshCount;
              memoryVersion.v = Date.now();
              void cache.set(SYNC_CACHE_KEY, memoryVersion, { ttl: 86400 });
            }
          })
          .catch(() => {});
      }
      return memoryVersion;
    }

    // Try reading persistent cache (Upstash Redis / DB cache)
    try {
      const cached = await cache.get<CatalogSyncVersionVo>(SYNC_CACHE_KEY);
      if (cached && typeof cached.v === 'number') {
        memoryVersion = cached;
        lastCountRefreshTime = now;
        return memoryVersion;
      }
    } catch {
      // Ignore cache lookup error and initialize
    }

    // Initial cold boot: compute active count and create baseline version
    const initialCount = await this.getActivePhotoCount();
    memoryVersion = {
      v: now,
      albumV: now,
      photoV: now,
      photoCount: initialCount,
    };
    lastCountRefreshTime = now;

    void cache.set(SYNC_CACHE_KEY, memoryVersion, { ttl: 86400 });
    return memoryVersion;
  },

  // Increment version vector for albums, photos, or all scopes and update photo count delta.
  async bump(scope: 'album' | 'photo' | 'all' = 'all', countDelta?: number): Promise<CatalogSyncVersionVo> {
    const now = Date.now();

    // Ensure memory version is loaded before applying delta
    if (!memoryVersion) {
      await this.getVersion();
    }

    const current = memoryVersion!;
    current.v = now;

    if (scope === 'album' || scope === 'all') {
      current.albumV = now;
    }

    if (scope === 'photo' || scope === 'all') {
      current.photoV = now;
    }

    if (countDelta !== undefined) {
      current.photoCount = Math.max(0, current.photoCount + countDelta);
    } else {
      // Asynchronously re-verify exact active photo count
      this.getActivePhotoCount()
        .then((fresh) => {
          if (memoryVersion) {
            memoryVersion.photoCount = fresh;
            void cache.set(SYNC_CACHE_KEY, memoryVersion, { ttl: 86400 });
          }
        })
        .catch(() => {});
    }

    // Persist to shared cache across serverless instances
    void cache.set(SYNC_CACHE_KEY, current, { ttl: 86400 });

    // Invalidate fast-path edge queries
    import('@/server/service/photo-service')
      .then((m) => m.invalidatePhotoFastPathCache())
      .catch(() => {});

    return current;
  },
};
