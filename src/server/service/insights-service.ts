import { and, count, desc, eq, gte, inArray, sql } from 'drizzle-orm';
import { neon } from '@neondatabase/serverless';
import { createId } from '@/server/lib/id';
import { photoTab } from '@/server/entity/photo';
import { albumTab } from '@/server/entity/album';
import { albumPhotoTab } from '@/server/entity/album-photo';
import { fileTab } from '@/server/entity/file';
import { commentTab } from '@/server/entity/comment';
import { photoViewTab } from '@/server/entity/insights';
import { photoReactionTab } from '@/server/entity/reaction';
import { storageTab } from '@/server/entity/storage';
import { orm, readOrm } from '@/server/infra/db';
import { PhotoStatusEnum, PhotoVisibilityEnum } from '@/server/enums/photo-enum';
import { FileTypeEnum } from '@/server/enums/file-enum';
import { buildPreviewKey, buildThumbnailKey } from '@/server/lib/photo-path';
import { toMediaUrl, toProxyMediaUrl } from '@/lib/url';
import { toUtcIsoString } from '@/lib/date';
import { reactionService } from '@/server/service/reaction-service';
import { type PhotoViewRecordBo } from '@/server/entity/bo/insights';
import {
  type InsightsChartDataVo,
  type InsightsChartPointVo,
  type InsightsOverviewVo,
  type InsightsTopPhotoVo,
  type InsightsTopReactionPhotoVo,
  type PhotoInsightsDetailVo,
} from '@/server/entity/vo/insights';

// This module provides statistics, analytics aggregation, and public view tracking services for photos.

// Cooldown in seconds for repeat view tracking per visitor per photo.
const VIEW_COOLDOWN_SECONDS = 60;

let tableEnsured = false;
let ensureTablePromise: Promise<void> | null = null;

// Ensure photo_view table and its indexes exist before any analytics operations.
async function ensurePhotoViewTable(): Promise<void> {
  if (tableEnsured || !process.env.DATABASE_URL) return;
  if (ensureTablePromise) {
    return ensureTablePromise;
  }

  ensureTablePromise = (async () => {
    try {
      const rawSql = neon(process.env.DATABASE_URL!);
      await rawSql`
        CREATE TABLE IF NOT EXISTS "photo_view" (
          "id" text PRIMARY KEY NOT NULL,
          "photo_id" text NOT NULL REFERENCES "photo"("photo_id") ON DELETE CASCADE,
          "visitor_id" text NOT NULL,
          "type" text DEFAULT 'view' NOT NULL,
          "viewed_at" timestamptz DEFAULT now() NOT NULL
        );
      `;
      await rawSql`CREATE INDEX IF NOT EXISTS "photo_view_photo_id_idx" ON "photo_view" ("photo_id");`;
      await rawSql`CREATE INDEX IF NOT EXISTS "photo_view_viewed_at_idx" ON "photo_view" ("viewed_at");`;
      await rawSql`CREATE INDEX IF NOT EXISTS "photo_view_dedup_idx" ON "photo_view" ("photo_id", "visitor_id", "type", "viewed_at");`;
      tableEnsured = true;
    } catch (err) {
      console.warn('[INSIGHTS] Failed to ensure photo_view table:', err);
    } finally {
      ensureTablePromise = null;
    }
  })();

  return ensureTablePromise;
}

const insightsService = {

  // Record a public interaction event (view, share, download) with anti-inflation cooldown.
  async recordEvent(
    params: PhotoViewRecordBo,
    visitorId: string,
    isAdmin: boolean
  ): Promise<{ recorded: boolean; reason?: string }> {
    // Exclude Admin interactions: Insights is strictly dedicated to public visitor metrics.
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
      // Verify photo exists, is active and publicly visible
      const [photo] = await orm
        .select({
          photoId: photoTab.photoId,
          visibility: photoTab.visibility,
        })
        .from(photoTab)
        .where(and(eq(photoTab.photoId, photoId), eq(photoTab.status, PhotoStatusEnum.NORMAL)))
        .limit(1);

      if (!photo || photo.visibility === PhotoVisibilityEnum.ARCHIVED) {
        return { recorded: false, reason: 'photo_not_found' };
      }

      // Reject interaction records on ALBUM_ONLY photos that belong to an archived album
      if (photo.visibility === PhotoVisibilityEnum.ALBUM_ONLY) {
        const [archivedAlbumRel] = await orm
          .select({ id: albumPhotoTab.id })
          .from(albumPhotoTab)
          .innerJoin(albumTab, eq(albumTab.albumId, albumPhotoTab.albumId))
          .where(and(eq(albumPhotoTab.photoId, photoId), eq(albumTab.isArchived, 1)))
          .limit(1);

        if (archivedAlbumRel) {
          return { recorded: false, reason: 'photo_not_found' };
        }
      }

      // 60-second cooldown for views to prevent spam/refresh inflation
      if (type === 'view') {
        const cooldownThreshold = new Date(Date.now() - VIEW_COOLDOWN_SECONDS * 1000).toISOString();
        const [recentView] = await orm
          .select({ id: photoViewTab.id })
          .from(photoViewTab)
          .where(
            and(
              eq(photoViewTab.photoId, photoId),
              eq(photoViewTab.visitorId, visitorId),
              eq(photoViewTab.type, 'view'),
              gte(photoViewTab.viewedAt, sql`${cooldownThreshold}::timestamp`)
            )
          )
          .limit(1);

        if (recentView) {
          // Even during the 60s cooldown window, refresh the viewedAt timestamp so 'Recently Viewed' is always 100% current!
          await orm
            .update(photoViewTab)
            .set({ viewedAt: new Date().toISOString() })
            .where(eq(photoViewTab.id, recentView.id));
          return { recorded: true };
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
    let totalComments = 0;
    let totalViews = 0;
    let viewsToday = 0;
    let viewsThisWeek = 0;
    let viewsThisMonth = 0;
    let totalShares = 0;
    let totalDownloads = 0;
    let totalReactions = 0;
    const reactionsBreakdown = { love: 0, fire: 0, camera: 0, place: 0, clap: 0 };

    try {
      // Consolidate overview metrics into parallel single-roundtrip queries using SQL conditional aggregation
      const [photoRes, commentRes, viewStatsRes, reactionRows] = await Promise.all([
        readOrm
          .select({ count: count() })
          .from(photoTab)
          .where(eq(photoTab.status, PhotoStatusEnum.NORMAL)),
        readOrm
          .select({ count: count() })
          .from(commentTab),
        readOrm
          .select({
            totalViews: sql<number>`COALESCE(COUNT(*) FILTER (WHERE ${photoViewTab.type} = 'view'), 0)::int`,
            viewsToday: sql<number>`COALESCE(COUNT(*) FILTER (WHERE ${photoViewTab.type} = 'view' AND ${photoViewTab.viewedAt} >= ${todayStart}), 0)::int`,
            viewsThisWeek: sql<number>`COALESCE(COUNT(*) FILTER (WHERE ${photoViewTab.type} = 'view' AND ${photoViewTab.viewedAt} >= ${weekStart}), 0)::int`,
            viewsThisMonth: sql<number>`COALESCE(COUNT(*) FILTER (WHERE ${photoViewTab.type} = 'view' AND ${photoViewTab.viewedAt} >= ${monthStart}), 0)::int`,
            totalShares: sql<number>`COALESCE(COUNT(*) FILTER (WHERE ${photoViewTab.type} = 'share'), 0)::int`,
            totalDownloads: sql<number>`COALESCE(COUNT(*) FILTER (WHERE ${photoViewTab.type} = 'download'), 0)::int`,
          })
          .from(photoViewTab),
        readOrm
          .select({
            reactionType: photoReactionTab.reactionType,
            count: sql<number>`COALESCE(SUM(${photoReactionTab.count}), 0)::int`,
          })
          .from(photoReactionTab)
          .groupBy(photoReactionTab.reactionType)
          .catch(() => []),
      ]);

      totalPhotos = photoRes[0]?.count ?? 0;
      totalComments = commentRes[0]?.count ?? 0;

      const viewStats = viewStatsRes[0];
      if (viewStats) {
        totalViews = Number(viewStats.totalViews || 0);
        viewsToday = Number(viewStats.viewsToday || 0);
        viewsThisWeek = Number(viewStats.viewsThisWeek || 0);
        viewsThisMonth = Number(viewStats.viewsThisMonth || 0);
        totalShares = Number(viewStats.totalShares || 0);
        totalDownloads = Number(viewStats.totalDownloads || 0);
      }

      for (const row of reactionRows) {
        const c = Number(row.count || 0);
        totalReactions += c;
        if (row.reactionType in reactionsBreakdown) {
          reactionsBreakdown[row.reactionType as keyof typeof reactionsBreakdown] = c;
        }
      }
    } catch (err) {
      console.error('[INSIGHTS] Error fetching overview metrics:', err);
    }

    return {
      totalPhotos,
      totalViews,
      viewsToday,
      viewsThisWeek,
      viewsThisMonth,
      totalComments,
      totalShares,
      totalDownloads,
      totalReactions,
      reactionsBreakdown,
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
      const rows = await readOrm
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

  // Query top photos ranked by public view count, discussion comments, and visitor reactions.
  async getTopPhotos(limit = 1000): Promise<{
    mostViewed: InsightsTopPhotoVo[];
    mostCommented: InsightsTopPhotoVo[];
    mostReacted: InsightsTopReactionPhotoVo[];
  }> {
    await ensurePhotoViewTable();

    try {
      // Stage 1: Parallel ranking resolution (views, comments, reactions)
      const viewedLimit = Math.min(Math.max(1, limit), 500);
      const [mostViewedRaw, mostCommentedRaw, mostReacted] = await Promise.all([
        readOrm
          .select({
            photoId: photoTab.photoId,
            name: photoTab.name,
            type: photoTab.type,
            checksum: photoTab.checksum,
            width: photoTab.width,
            height: photoTab.height,
            storageId: photoTab.storageId,
            viewCount: count(photoViewTab.id),
            lastViewedAt: sql<string>`MAX(${photoViewTab.viewedAt})`,
          })
          .from(photoTab)
          .innerJoin(
            photoViewTab,
            and(eq(photoViewTab.photoId, photoTab.photoId), eq(photoViewTab.type, 'view'))
          )
          .where(eq(photoTab.status, PhotoStatusEnum.NORMAL))
          .groupBy(
            photoTab.photoId,
            photoTab.name,
            photoTab.type,
            photoTab.checksum,
            photoTab.width,
            photoTab.height,
            photoTab.storageId
          )
          .orderBy(desc(count(photoViewTab.id)))
          .limit(viewedLimit),

        readOrm
          .select({
            photoId: photoTab.photoId,
            name: photoTab.name,
            type: photoTab.type,
            checksum: photoTab.checksum,
            width: photoTab.width,
            height: photoTab.height,
            storageId: photoTab.storageId,
            commentCount: count(commentTab.commentId),
          })
          .from(photoTab)
          .innerJoin(commentTab, eq(commentTab.photoId, photoTab.photoId))
          .where(eq(photoTab.status, PhotoStatusEnum.NORMAL))
          .groupBy(
            photoTab.photoId,
            photoTab.name,
            photoTab.type,
            photoTab.checksum,
            photoTab.width,
            photoTab.height,
            photoTab.storageId
          )
          .orderBy(desc(count(commentTab.commentId)))
          .limit(limit),

        reactionService.getTopReactionPhotos(limit),
      ]);

      // Collect all referenced storageIds and photoIds
      const storageIds = Array.from(
        new Set(
          [...mostViewedRaw, ...mostCommentedRaw]
            .map((p) => p.storageId)
            .filter(Boolean) as string[]
        )
      );

      const allPhotoIds = Array.from(
        new Set([...mostViewedRaw, ...mostCommentedRaw].map((p) => p.photoId))
      );

      // Stage 2: Parallel metadata resolution (storage domains, files, comments, views)
      const [storageRows, fileRows, commentRows, viewRows] = await Promise.all([
        storageIds.length > 0
          ? readOrm
              .select({
                storageId: storageTab.storageId,
                domain: storageTab.domain,
              })
              .from(storageTab)
              .where(inArray(storageTab.storageId, storageIds))
          : Promise.resolve([]),

        allPhotoIds.length > 0
          ? readOrm
              .select({
                photoId: fileTab.photoId,
                type: fileTab.type,
                key: fileTab.key,
              })
              .from(fileTab)
              .where(inArray(fileTab.photoId, allPhotoIds))
          : Promise.resolve([]),

        allPhotoIds.length > 0
          ? readOrm
              .select({
                photoId: commentTab.photoId,
                count: count(),
              })
              .from(commentTab)
              .where(inArray(commentTab.photoId, allPhotoIds))
              .groupBy(commentTab.photoId)
          : Promise.resolve([]),

        allPhotoIds.length > 0
          ? readOrm
              .select({
                photoId: photoViewTab.photoId,
                count: count(),
              })
              .from(photoViewTab)
              .where(and(inArray(photoViewTab.photoId, allPhotoIds), eq(photoViewTab.type, 'view')))
              .groupBy(photoViewTab.photoId)
          : Promise.resolve([]),
      ]);

      const storageMap = new Map<string, string | null>();
      for (const s of storageRows) {
        storageMap.set(s.storageId, s.domain);
      }

      const fileMap = new Map<string, { thumbnailKey?: string; previewKey?: string; originalKey?: string }>();
      for (const f of fileRows) {
        const current = fileMap.get(f.photoId) || {};
        if (f.type === FileTypeEnum.THUMBNAIL) {
          current.thumbnailKey = f.key;
        } else if (f.type === FileTypeEnum.PREVIEW) {
          current.previewKey = f.key;
        } else if (f.type === FileTypeEnum.ORIGINAL) {
          current.originalKey = f.key;
        }
        fileMap.set(f.photoId, current);
      }

      const commentCountMap = new Map<string, number>();
      for (const c of commentRows) {
        commentCountMap.set(c.photoId, Number(c.count) || 0);
      }

      const viewCountMap = new Map<string, number>();
      for (const v of viewRows) {
        viewCountMap.set(v.photoId, Number(v.count) || 0);
      }

      const formatPhotoItem = (item: {
        photoId: string;
        name: string;
        type?: string | null;
        checksum: string | null;
        width: number | null;
        height: number | null;
        storageId: string | null;
        viewCount?: number;
        commentCount?: number;
        lastViewedAt?: string | null;
      }): InsightsTopPhotoVo => {
        const domain = item.storageId ? storageMap.get(item.storageId) : null;
        const checksum = item.checksum || '';
        const files = fileMap.get(item.photoId);
        const thumbnailKey = files?.thumbnailKey || (checksum ? buildThumbnailKey(checksum, item.photoId) : '');
        const previewKey = files?.previewKey || (checksum ? buildPreviewKey(checksum, item.photoId) : '');
        const originalKey = files?.originalKey;
        const key = originalKey
          ? (domain ? toMediaUrl(originalKey, domain) : toProxyMediaUrl(originalKey))
          : null;

        const formattedLastViewedAt = toUtcIsoString(item.lastViewedAt);

        return {
          photoId: item.photoId,
          name: item.name,
          type: item.type ?? null,
          key,
          thumbnail: toMediaUrl(thumbnailKey, domain),
          preview: toMediaUrl(previewKey, domain),
          width: item.width,
          height: item.height,
          viewCount: item.viewCount !== undefined ? Number(item.viewCount) : viewCountMap.get(item.photoId) ?? 0,
          commentCount: item.commentCount !== undefined ? Number(item.commentCount) : commentCountMap.get(item.photoId) ?? 0,
          lastViewedAt: formattedLastViewedAt,
        };
      };

      return {
        mostViewed: mostViewedRaw.map(formatPhotoItem),
        mostCommented: mostCommentedRaw.map(formatPhotoItem),
        mostReacted,
      };
    } catch (err) {
      console.error('[INSIGHTS] Error fetching top photos:', err);
      return { mostViewed: [], mostCommented: [], mostReacted: [] };
    }
  },

  // Query individual photo analytics details including metrics and 30-day views trend.
  async getPhotoDetail(photoId: string): Promise<PhotoInsightsDetailVo | null> {
    await ensurePhotoViewTable();

    try {
      const [photo] = await readOrm
        .select({
          photoId: photoTab.photoId,
          name: photoTab.name,
          type: photoTab.type,
          checksum: photoTab.checksum,
          width: photoTab.width,
          height: photoTab.height,
          storageId: photoTab.storageId,
        })
        .from(photoTab)
        .where(and(eq(photoTab.photoId, photoId), eq(photoTab.status, PhotoStatusEnum.NORMAL)))
        .limit(1);

      if (!photo) {
        return null;
      }

      let domain: string | null = null;
      if (photo.storageId) {
        const [s] = await readOrm
          .select({ domain: storageTab.domain })
          .from(storageTab)
          .where(eq(storageTab.storageId, photo.storageId))
          .limit(1);
        domain = s?.domain ?? null;
      }

      let thumbnailKey = '';
      let previewKey = '';
      let originalKey = '';

      const fileRows = await readOrm
        .select({
          type: fileTab.type,
          key: fileTab.key,
        })
        .from(fileTab)
        .where(eq(fileTab.photoId, photoId));

      for (const f of fileRows) {
        if (f.type === FileTypeEnum.THUMBNAIL) thumbnailKey = f.key;
        if (f.type === FileTypeEnum.PREVIEW) previewKey = f.key;
        if (f.type === FileTypeEnum.ORIGINAL) originalKey = f.key;
      }

      if (!thumbnailKey && photo.checksum) {
        thumbnailKey = buildThumbnailKey(photo.checksum, photo.photoId);
      }
      if (!previewKey && photo.checksum) {
        previewKey = buildPreviewKey(photo.checksum, photo.photoId);
      }

      const thumbnail = toMediaUrl(thumbnailKey, domain);
      const preview = toMediaUrl(previewKey, domain);
      const key = originalKey
        ? (domain ? toMediaUrl(originalKey, domain) : toProxyMediaUrl(originalKey))
        : null;

      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
      const weekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const monthStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

      // Parallel single-roundtrip query: consolidate all photo_view metrics via SQL conditional aggregation
      const [[viewStatsRow], [commentRes], totals] = await Promise.all([
        readOrm
          .select({
            totalViews: sql<number>`COALESCE(COUNT(*) FILTER (WHERE ${photoViewTab.type} = 'view'), 0)::int`,
            viewsToday: sql<number>`COALESCE(COUNT(*) FILTER (WHERE ${photoViewTab.type} = 'view' AND ${photoViewTab.viewedAt} >= ${todayStart}::timestamp), 0)::int`,
            viewsThisWeek: sql<number>`COALESCE(COUNT(*) FILTER (WHERE ${photoViewTab.type} = 'view' AND ${photoViewTab.viewedAt} >= ${weekStart}::timestamp), 0)::int`,
            viewsThisMonth: sql<number>`COALESCE(COUNT(*) FILTER (WHERE ${photoViewTab.type} = 'view' AND ${photoViewTab.viewedAt} >= ${monthStart}::timestamp), 0)::int`,
            downloads: sql<number>`COALESCE(COUNT(*) FILTER (WHERE ${photoViewTab.type} = 'download'), 0)::int`,
            shares: sql<number>`COALESCE(COUNT(*) FILTER (WHERE ${photoViewTab.type} = 'share'), 0)::int`,
          })
          .from(photoViewTab)
          .where(eq(photoViewTab.photoId, photoId)),
        readOrm
          .select({ count: count() })
          .from(commentTab)
          .where(eq(commentTab.photoId, photoId)),
        reactionService.getPhotoReactions(photoId),
      ]);

      const totalViews = Number(viewStatsRow?.totalViews || 0);
      const viewsToday = Number(viewStatsRow?.viewsToday || 0);
      const viewsThisWeek = Number(viewStatsRow?.viewsThisWeek || 0);
      const viewsThisMonth = Number(viewStatsRow?.viewsThisMonth || 0);
      const downloads = Number(viewStatsRow?.downloads || 0);
      const shares = Number(viewStatsRow?.shares || 0);
      const comments = Number(commentRes?.count || 0);
      const t = totals.totals;
      const reactions = {
        total: (t.love || 0) + (t.fire || 0) + (t.camera || 0) + (t.place || 0) + (t.clap || 0),
        love: t.love,
        fire: t.fire,
        camera: t.camera,
        place: t.place,
        clap: t.clap,
      };

      // 9. 30-day views trend chart for this photo
      const chart = await this.getViewsChart('30d', photoId);

      return {
        photoId: photo.photoId,
        name: photo.name,
        type: photo.type ?? null,
        key,
        thumbnail,
        preview,
        width: photo.width,
        height: photo.height,
        totalViews,
        viewsToday,
        viewsThisWeek,
        viewsThisMonth,
        comments,
        shares,
        downloads,
        reactions,
        chart,
      };
    } catch (err) {
      console.error('[INSIGHTS] Error fetching photo detail insights:', err);
      return null;
    }
  },

  // Prune photo view tracking records older than retention period (default 90 days).
  async cleanStaleViews(retentionDays = 90): Promise<void> {
    try {
      await ensurePhotoViewTable();
      const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000).toISOString();
      await orm.delete(photoViewTab).where(sql`${photoViewTab.viewedAt} < ${cutoff}`);
    } catch (err) {
      console.warn('[INSIGHTS] Stale views cleanup error:', err);
    }
  },

  // Reset all insights statistics and interaction records (Admin only).
  async resetInsights(): Promise<{ success: boolean }> {
    try {
      if (process.env.DATABASE_URL) {
        const rawSql = neon(process.env.DATABASE_URL);
        await rawSql`TRUNCATE TABLE "photo_view" CASCADE;`;
        return { success: true };
      }
    } catch (err: any) {
      if (String(err?.message || err).includes('does not exist')) {
        return { success: true };
      }
      console.warn('[INSIGHTS] TRUNCATE CASCADE failed, falling back to DELETE:', err);
    }

    try {
      await ensurePhotoViewTable();
      await orm.delete(photoViewTab);
      return { success: true };
    } catch (err: any) {
      if (String(err?.message || err).includes('does not exist')) {
        return { success: true };
      }
      console.error('[INSIGHTS] Error resetting insights statistics:', err);
      throw err;
    }
  },

  // Batch delete interaction records associated with specific photo IDs (called on photo deletion).
  async deleteByPhotoIds(photoIds: string[]): Promise<void> {
    if (!photoIds || photoIds.length === 0) {
      return;
    }

    const cleanIds = Array.from(new Set(photoIds.map((id) => id?.trim()).filter(Boolean)));
    if (!cleanIds.length) return;

    try {
      await ensurePhotoViewTable();
      const CHUNK_SIZE = 100;
      for (let i = 0; i < cleanIds.length; i += CHUNK_SIZE) {
        const chunk = cleanIds.slice(i, i + CHUNK_SIZE);
        await orm.delete(photoViewTab).where(inArray(photoViewTab.photoId, chunk)).catch(() => {});
      }
    } catch (err) {
      console.warn('[INSIGHTS] deleteByPhotoIds error:', err);
    }
  },
};

export { insightsService };
