import { and, count, desc, eq, gte, inArray, sql } from 'drizzle-orm';
import { neon } from '@neondatabase/serverless';
import { createId } from '@/server/lib/id';
import { photoTab } from '@/server/entity/photo';
import { commentTab } from '@/server/entity/comment';
import { photoViewTab } from '@/server/entity/insights';
import { storageTab } from '@/server/entity/storage';
import { orm } from '@/server/infra/db';
import { PhotoFavoriteEnum, PhotoStatusEnum } from '@/server/enums/photo-enum';
import { buildPreviewKey, buildThumbnailKey } from '@/server/lib/photo-path';
import { toMediaUrl } from '@/lib/url';
import { type PhotoViewRecordBo } from '@/server/entity/bo/insights';
import {
  type InsightsChartDataVo,
  type InsightsChartPointVo,
  type InsightsOverviewVo,
  type InsightsTopPhotoVo,
  type PhotoInsightsDetailVo,
} from '@/server/entity/vo/insights';

// This module provides statistics, analytics aggregation, and public view tracking services for photos.

// Cooldown in minutes for repeat view tracking per visitor per photo.
const VIEW_COOLDOWN_MINUTES = 30;

let tableEnsured = false;

// Ensure photo_view table and its indexes exist before any analytics operations.
async function ensurePhotoViewTable(): Promise<void> {
  if (tableEnsured || !process.env.DATABASE_URL) return;
  try {
    const rawSql = neon(process.env.DATABASE_URL);
    await rawSql`
      CREATE TABLE IF NOT EXISTS "photo_view" (
        "id" text PRIMARY KEY NOT NULL,
        "photo_id" text NOT NULL REFERENCES "photo"("photo_id") ON DELETE CASCADE,
        "visitor_id" text NOT NULL,
        "type" text DEFAULT 'view' NOT NULL,
        "viewed_at" timestamp DEFAULT now() NOT NULL
      );
    `;
    await rawSql`CREATE INDEX IF NOT EXISTS "photo_view_photo_id_idx" ON "photo_view" ("photo_id");`;
    await rawSql`CREATE INDEX IF NOT EXISTS "photo_view_viewed_at_idx" ON "photo_view" ("viewed_at");`;
    await rawSql`CREATE INDEX IF NOT EXISTS "photo_view_dedup_idx" ON "photo_view" ("photo_id", "visitor_id", "type", "viewed_at");`;
    tableEnsured = true;
  } catch (err) {
    console.warn('[INSIGHTS] Failed to ensure photo_view table:', err);
  }
}

const insightsService = {

  // Record a public interaction event (view, share, download) with anti-inflation cooldown.
  async recordEvent(
    params: PhotoViewRecordBo,
    visitorId: string,
    isAdmin: boolean
  ): Promise<{ recorded: boolean; reason?: string }> {
    // Strictly exclude authenticated admin interactions from analytics
    if (isAdmin) {
      return { recorded: false, reason: 'admin_excluded' };
    }

    const photoId = params.photoId?.trim();
    if (!photoId || !visitorId) {
      return { recorded: false, reason: 'invalid_params' };
    }

    await ensurePhotoViewTable();

    const type = params.type || 'view';

    try {
      // Verify photo exists and is active
      const [photo] = await orm
        .select({ photoId: photoTab.photoId })
        .from(photoTab)
        .where(and(eq(photoTab.photoId, photoId), eq(photoTab.status, PhotoStatusEnum.NORMAL)))
        .limit(1);

      if (!photo) {
        return { recorded: false, reason: 'photo_not_found' };
      }

      // Apply 30-minute cooldown for views to prevent spam/refresh inflation
      if (type === 'view') {
        const cooldownThreshold = new Date(Date.now() - VIEW_COOLDOWN_MINUTES * 60 * 1000).toISOString();
        const [recentView] = await orm
          .select({ id: photoViewTab.id })
          .from(photoViewTab)
          .where(
            and(
              eq(photoViewTab.photoId, photoId),
              eq(photoViewTab.visitorId, visitorId),
              eq(photoViewTab.type, 'view'),
              gte(photoViewTab.viewedAt, cooldownThreshold)
            )
          )
          .limit(1);

        if (recentView) {
          return { recorded: false, reason: 'cooldown_active' };
        }
      }

      // Insert public interaction record
      await orm.insert(photoViewTab).values({
        id: createId(),
        photoId,
        visitorId,
        type,
        viewedAt: new Date().toISOString(),
      });

      return { recorded: true };
    } catch (err) {
      console.error('[INSIGHTS] Error recording event:', err);
      return { recorded: false, reason: 'database_error' };
    }
  },

  // Calculate gallery-wide high-level insights overview metrics.
  async getOverview(): Promise<InsightsOverviewVo> {
    await ensurePhotoViewTable();

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const weekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const monthStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

    let totalPhotos = 0;
    let totalFavorites = 0;
    let totalComments = 0;
    let totalViews = 0;
    let viewsToday = 0;
    let viewsThisWeek = 0;
    let viewsThisMonth = 0;
    let totalShares = 0;
    let totalDownloads = 0;

    try {
      // 1. Total active photos count
      const [photoCountRes] = await orm
        .select({ count: count() })
        .from(photoTab)
        .where(eq(photoTab.status, PhotoStatusEnum.NORMAL));
      totalPhotos = photoCountRes?.count ?? 0;

      // 2. Total favorited photos count
      const [favoriteCountRes] = await orm
        .select({ count: count() })
        .from(photoTab)
        .where(and(eq(photoTab.status, PhotoStatusEnum.NORMAL), eq(photoTab.favorite, PhotoFavoriteEnum.YES)));
      totalFavorites = favoriteCountRes?.count ?? 0;

      // 3. Total comments count
      const [commentCountRes] = await orm
        .select({ count: count() })
        .from(commentTab);
      totalComments = commentCountRes?.count ?? 0;

      // 4. Total public views
      const [totalViewsRes] = await orm
        .select({ count: count() })
        .from(photoViewTab)
        .where(eq(photoViewTab.type, 'view'));
      totalViews = totalViewsRes?.count ?? 0;

      // 5. Views today
      const [viewsTodayRes] = await orm
        .select({ count: count() })
        .from(photoViewTab)
        .where(and(eq(photoViewTab.type, 'view'), gte(photoViewTab.viewedAt, todayStart)));
      viewsToday = viewsTodayRes?.count ?? 0;

      // 6. Views this week
      const [viewsWeekRes] = await orm
        .select({ count: count() })
        .from(photoViewTab)
        .where(and(eq(photoViewTab.type, 'view'), gte(photoViewTab.viewedAt, weekStart)));
      viewsThisWeek = viewsWeekRes?.count ?? 0;

      // 7. Views this month
      const [viewsMonthRes] = await orm
        .select({ count: count() })
        .from(photoViewTab)
        .where(and(eq(photoViewTab.type, 'view'), gte(photoViewTab.viewedAt, monthStart)));
      viewsThisMonth = viewsMonthRes?.count ?? 0;

      // 8. Total shares
      const [sharesRes] = await orm
        .select({ count: count() })
        .from(photoViewTab)
        .where(eq(photoViewTab.type, 'share'));
      totalShares = sharesRes?.count ?? 0;

      // 9. Total downloads
      const [downloadsRes] = await orm
        .select({ count: count() })
        .from(photoViewTab)
        .where(eq(photoViewTab.type, 'download'));
      totalDownloads = downloadsRes?.count ?? 0;
    } catch (err) {
      console.error('[INSIGHTS] Error fetching overview metrics:', err);
    }

    return {
      totalPhotos,
      totalViews,
      viewsToday,
      viewsThisWeek,
      viewsThisMonth,
      totalFavorites,
      totalComments,
      totalShares,
      totalDownloads,
    };
  },

  // Query views trend chart aggregated by day for the specified range.
  async getViewsChart(range: '7d' | '30d' | '90d' = '7d', photoId?: string): Promise<InsightsChartDataVo> {
    await ensurePhotoViewTable();

    const daysCount = range === '90d' ? 90 : range === '30d' ? 30 : 7;
    const now = new Date();
    const startDate = new Date(now.getTime() - (daysCount - 1) * 24 * 60 * 60 * 1000);
    startDate.setHours(0, 0, 0, 0);

    const conditions = [
      eq(photoViewTab.type, 'view'),
      gte(photoViewTab.viewedAt, startDate.toISOString()),
    ];

    if (photoId) {
      conditions.push(eq(photoViewTab.photoId, photoId));
    }

    const viewMap = new Map<string, number>();

    try {
      // Query aggregated views grouped by date formatted as YYYY-MM-DD
      const rows = await orm
        .select({
          day: sql<string>`TO_CHAR(${photoViewTab.viewedAt}, 'YYYY-MM-DD')`,
          views: count(),
        })
        .from(photoViewTab)
        .where(and(...conditions))
        .groupBy(sql`TO_CHAR(${photoViewTab.viewedAt}, 'YYYY-MM-DD')`)
        .orderBy(sql`TO_CHAR(${photoViewTab.viewedAt}, 'YYYY-MM-DD') ASC`);

      for (const r of rows) {
        if (r.day) {
          viewMap.set(r.day, Number(r.views) || 0);
        }
      }
    } catch (err) {
      console.error('[INSIGHTS] Error fetching views chart:', err);
    }

    // Generate unbroken sequence of dates from start to today (zero-filling gaps)
    const points: InsightsChartPointVo[] = [];
    for (let i = 0; i < daysCount; i++) {
      const d = new Date(startDate.getTime() + i * 24 * 60 * 60 * 1000);
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      const dateKey = `${year}-${month}-${day}`;

      let label = '';
      if (daysCount === 7) {
        label = d.toLocaleDateString('en-US', { weekday: 'short' });
      } else {
        label = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      }

      points.push({
        date: dateKey,
        label,
        views: viewMap.get(dateKey) ?? 0,
      });
    }

    return {
      range,
      points,
    };
  },

  // Query top photos ranked by public view count and favorite status.
  async getTopPhotos(limit = 10): Promise<{ mostViewed: InsightsTopPhotoVo[]; mostFavorited: InsightsTopPhotoVo[] }> {
    await ensurePhotoViewTable();

    try {
      // 1. Fetch top photos by public views
      const mostViewedRaw = await orm
        .select({
          photoId: photoTab.photoId,
          name: photoTab.name,
          checksum: photoTab.checksum,
          width: photoTab.width,
          height: photoTab.height,
          storageId: photoTab.storageId,
          favorite: photoTab.favorite,
          viewCount: count(photoViewTab.id),
        })
        .from(photoTab)
        .leftJoin(
          photoViewTab,
          and(eq(photoViewTab.photoId, photoTab.photoId), eq(photoViewTab.type, 'view'))
        )
        .where(eq(photoTab.status, PhotoStatusEnum.NORMAL))
        .groupBy(
          photoTab.photoId,
          photoTab.name,
          photoTab.checksum,
          photoTab.width,
          photoTab.height,
          photoTab.storageId,
          photoTab.favorite
        )
        .orderBy(desc(count(photoViewTab.id)))
        .limit(limit);

      // 2. Fetch top photos by favorites
      const mostFavoritedRaw = await orm
        .select({
          photoId: photoTab.photoId,
          name: photoTab.name,
          checksum: photoTab.checksum,
          width: photoTab.width,
          height: photoTab.height,
          storageId: photoTab.storageId,
          favorite: photoTab.favorite,
        })
        .from(photoTab)
        .where(and(eq(photoTab.status, PhotoStatusEnum.NORMAL), eq(photoTab.favorite, PhotoFavoriteEnum.YES)))
        .orderBy(desc(photoTab.createTime))
        .limit(limit);

      // Collect all referenced storageIds to resolve domain
      const storageIds = Array.from(
        new Set(
          [...mostViewedRaw, ...mostFavoritedRaw]
            .map((p) => p.storageId)
            .filter(Boolean) as string[]
        )
      );

      const storageMap = new Map<string, string | null>();
      if (storageIds.length > 0) {
        const storageRows = await orm
          .select({
            storageId: storageTab.storageId,
            domain: storageTab.domain,
          })
          .from(storageTab)
          .where(inArray(storageTab.storageId, storageIds));

        for (const s of storageRows) {
          storageMap.set(s.storageId, s.domain);
        }
      }

      // Collect all photoIds to fetch comment counts
      const allPhotoIds = Array.from(
        new Set([...mostViewedRaw, ...mostFavoritedRaw].map((p) => p.photoId))
      );

      const commentCountMap = new Map<string, number>();
      const viewCountMap = new Map<string, number>();

      if (allPhotoIds.length > 0) {
        const commentRows = await orm
          .select({
            photoId: commentTab.photoId,
            count: count(),
          })
          .from(commentTab)
          .where(inArray(commentTab.photoId, allPhotoIds))
          .groupBy(commentTab.photoId);

        for (const c of commentRows) {
          commentCountMap.set(c.photoId, Number(c.count) || 0);
        }

        const viewRows = await orm
          .select({
            photoId: photoViewTab.photoId,
            count: count(),
          })
          .from(photoViewTab)
          .where(and(inArray(photoViewTab.photoId, allPhotoIds), eq(photoViewTab.type, 'view')))
          .groupBy(photoViewTab.photoId);

        for (const v of viewRows) {
          viewCountMap.set(v.photoId, Number(v.count) || 0);
        }
      }

      const formatPhotoItem = (item: {
        photoId: string;
        name: string;
        checksum: string | null;
        width: number | null;
        height: number | null;
        storageId: string | null;
        favorite: number;
        viewCount?: number;
      }): InsightsTopPhotoVo => {
        const domain = item.storageId ? storageMap.get(item.storageId) : null;
        const checksum = item.checksum || '';
        const thumbnailKey = buildThumbnailKey(checksum, item.photoId);
        const previewKey = buildPreviewKey(checksum, item.photoId);

        return {
          photoId: item.photoId,
          name: item.name,
          thumbnail: toMediaUrl(thumbnailKey, domain),
          preview: toMediaUrl(previewKey, domain),
          width: item.width,
          height: item.height,
          viewCount: item.viewCount !== undefined ? Number(item.viewCount) : viewCountMap.get(item.photoId) ?? 0,
          favoriteCount: item.favorite === PhotoFavoriteEnum.YES ? 1 : 0,
          commentCount: commentCountMap.get(item.photoId) ?? 0,
        };
      };

      return {
        mostViewed: mostViewedRaw.map(formatPhotoItem),
        mostFavorited: mostFavoritedRaw.map(formatPhotoItem),
      };
    } catch (err) {
      console.error('[INSIGHTS] Error fetching top photos:', err);
      return { mostViewed: [], mostFavorited: [] };
    }
  },

  // Query individual photo analytics details including metrics and 30-day views trend.
  async getPhotoDetail(photoId: string): Promise<PhotoInsightsDetailVo | null> {
    await ensurePhotoViewTable();

    try {
      const [photo] = await orm
        .select({
          photoId: photoTab.photoId,
          name: photoTab.name,
          checksum: photoTab.checksum,
          width: photoTab.width,
          height: photoTab.height,
          storageId: photoTab.storageId,
          favorite: photoTab.favorite,
        })
        .from(photoTab)
        .where(and(eq(photoTab.photoId, photoId), eq(photoTab.status, PhotoStatusEnum.NORMAL)))
        .limit(1);

      if (!photo) {
        return null;
      }

      let domain: string | null = null;
      if (photo.storageId) {
        const [s] = await orm
          .select({ domain: storageTab.domain })
          .from(storageTab)
          .where(eq(storageTab.storageId, photo.storageId))
          .limit(1);
        domain = s?.domain ?? null;
      }

      const checksum = photo.checksum || '';
      const thumbnail = toMediaUrl(buildThumbnailKey(checksum, photo.photoId), domain);
      const preview = toMediaUrl(buildPreviewKey(checksum, photo.photoId), domain);

      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
      const weekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const monthStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

      // 1. Total views for this photo
      const [totalViewsRes] = await orm
        .select({ count: count() })
        .from(photoViewTab)
        .where(and(eq(photoViewTab.photoId, photoId), eq(photoViewTab.type, 'view')));
      const totalViews = totalViewsRes?.count ?? 0;

      // 2. Views today
      const [viewsTodayRes] = await orm
        .select({ count: count() })
        .from(photoViewTab)
        .where(
          and(
            eq(photoViewTab.photoId, photoId),
            eq(photoViewTab.type, 'view'),
            gte(photoViewTab.viewedAt, todayStart)
          )
        );
      const viewsToday = viewsTodayRes?.count ?? 0;

      // 3. Views this week
      const [viewsWeekRes] = await orm
        .select({ count: count() })
        .from(photoViewTab)
        .where(
          and(
            eq(photoViewTab.photoId, photoId),
            eq(photoViewTab.type, 'view'),
            gte(photoViewTab.viewedAt, weekStart)
          )
        );
      const viewsThisWeek = viewsWeekRes?.count ?? 0;

      // 4. Views this month
      const [viewsMonthRes] = await orm
        .select({ count: count() })
        .from(photoViewTab)
        .where(
          and(
            eq(photoViewTab.photoId, photoId),
            eq(photoViewTab.type, 'view'),
            gte(photoViewTab.viewedAt, monthStart)
          )
        );
      const viewsThisMonth = viewsMonthRes?.count ?? 0;

      // 5. Total comments on this photo
      const [commentsRes] = await orm
        .select({ count: count() })
        .from(commentTab)
        .where(eq(commentTab.photoId, photoId));
      const comments = commentsRes?.count ?? 0;

      // 6. Total shares
      const [sharesRes] = await orm
        .select({ count: count() })
        .from(photoViewTab)
        .where(and(eq(photoViewTab.photoId, photoId), eq(photoViewTab.type, 'share')));
      const shares = sharesRes?.count ?? 0;

      // 7. Total downloads
      const [downloadsRes] = await orm
        .select({ count: count() })
        .from(photoViewTab)
        .where(and(eq(photoViewTab.photoId, photoId), eq(photoViewTab.type, 'download')));
      const downloads = downloadsRes?.count ?? 0;

      // 8. 30-day views trend chart for this photo
      const chart = await this.getViewsChart('30d', photoId);

      return {
        photoId: photo.photoId,
        name: photo.name,
        thumbnail,
        preview,
        width: photo.width,
        height: photo.height,
        totalViews,
        viewsToday,
        viewsThisWeek,
        viewsThisMonth,
        favorites: photo.favorite === PhotoFavoriteEnum.YES ? 1 : 0,
        comments,
        shares,
        downloads,
        chart,
      };
    } catch (err) {
      console.error('[INSIGHTS] Error fetching photo detail insights:', err);
      return null;
    }
  },
};

export { insightsService };
