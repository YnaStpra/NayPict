import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { orm, readOrm } from '@/server/infra/db';
import { photoReactionTab } from '@/server/entity/reaction';
import { photoTab } from '@/server/entity/photo';
import { fileTab } from '@/server/entity/file';
import { commentTab } from '@/server/entity/comment';
import { photoViewTab } from '@/server/entity/insights';
import { storageTab } from '@/server/entity/storage';
import { PhotoStatusEnum } from '@/server/enums/photo-enum';
import { FileTypeEnum } from '@/server/enums/file-enum';
import { buildPreviewKey, buildThumbnailKey } from '@/server/lib/photo-path';
import { toMediaUrl, toProxyMediaUrl } from '@/lib/url';
import { type PhotoReactionAddBo, type ReactionType } from '@/server/entity/bo/reaction';
import { type PhotoReactionsVo, type ReactionTotalsVo, type UserReactionsVo } from '@/server/entity/vo/reaction';
import { type InsightsTopReactionPhotoVo } from '@/server/entity/vo/insights';
import { commentEventHub } from '@/server/lib/comment-event-hub';
import { v4 as uuidv4 } from 'uuid';
import { cache } from '@/server/infra/cache';
import BizError from '@/server/error/biz-error';

// This module handles visitor micro-reactions (Love, Fire, Camera, Place) and public claps/likes per photo.

const VALID_REACTION_TYPES: ReactionType[] = ['love', 'fire', 'camera', 'place', 'clap'];
const EMOJI_REACTION_TYPES: ReactionType[] = ['love', 'fire', 'camera', 'place'];

const reactionService = {
  // Query aggregated reaction totals and visitor personal reaction state for a photo.
  // When useMaster is true, queries primary connection directly to eliminate read-after-write replication lag.
  async getPhotoReactions(photoId: string, visitorId?: string, useMaster = false): Promise<PhotoReactionsVo> {
    const cleanPhotoId = photoId?.trim();
    if (!cleanPhotoId) {
      return {
        photoId: '',
        totals: { love: 0, fire: 0, camera: 0, place: 0, clap: 0 },
        userReactions: { love: false, fire: false, camera: false, place: false, clap: 0 },
      };
    }

    const dbClient = useMaster ? orm : readOrm;

    try {
      // 1. Fetch aggregated totals grouped by reaction_type
      const totalRows = await dbClient
        .select({
          reactionType: photoReactionTab.reactionType,
          total: sql<number>`COALESCE(SUM(${photoReactionTab.count}), 0)::int`,
        })
        .from(photoReactionTab)
        .where(eq(photoReactionTab.photoId, cleanPhotoId))
        .groupBy(photoReactionTab.reactionType);

      const totals: ReactionTotalsVo = { love: 0, fire: 0, camera: 0, place: 0, clap: 0 };
      totalRows.forEach((row) => {
        if (row.reactionType in totals) {
          totals[row.reactionType as keyof ReactionTotalsVo] = Number(row.total || 0);
        }
      });

      // 2. Fetch visitor's personal reactions if visitorId is provided
      const userReactions: UserReactionsVo = {
        love: false,
        fire: false,
        camera: false,
        place: false,
        clap: 0,
      };

      if (visitorId?.trim()) {
        const cleanVisitorId = visitorId.trim();
        const userRows = await dbClient
          .select({
            reactionType: photoReactionTab.reactionType,
            count: photoReactionTab.count,
          })
          .from(photoReactionTab)
          .where(
            and(
              eq(photoReactionTab.photoId, cleanPhotoId),
              eq(photoReactionTab.visitorId, cleanVisitorId)
            )
          );

        userRows.forEach((row) => {
          const type = row.reactionType as ReactionType;
          if (type === 'clap') {
            userReactions.clap = row.count > 0 ? 1 : 0;
          } else if (type in userReactions) {
            userReactions[type as 'love' | 'fire' | 'camera' | 'place'] = row.count > 0;
          }
        });
      }

      return {
        photoId: cleanPhotoId,
        totals,
        userReactions,
      };
    } catch (err) {
      console.warn('[REACTION] Failed to load photo reactions:', cleanPhotoId, err);
      return {
        photoId: cleanPhotoId,
        totals: { love: 0, fire: 0, camera: 0, place: 0, clap: 0 },
        userReactions: { love: false, fire: false, camera: false, place: false, clap: 0 },
      };
    }
  },

  // Record or toggle a visitor's reaction to a photo (enforcing 1 mutually exclusive emoji and 1 like).
  async addPhotoReaction(params: PhotoReactionAddBo): Promise<PhotoReactionsVo> {
    const photoId = params.photoId?.trim();
    const visitorId = params.visitorId?.trim();
    const reactionType = params.reactionType;

    if (!photoId) {
      throw new BizError('photo.notFound');
    }
    if (!visitorId) {
      throw new BizError('user.visitorIdRequired');
    }
    if (!VALID_REACTION_TYPES.includes(reactionType)) {
      throw new BizError('common.paramError');
    }

    // Mutually Exclusive Unified Reaction: A visitor can choose 1 reaction per photo (Love, Fire, Like)
    const existingReactions = await orm
      .select()
      .from(photoReactionTab)
      .where(
        and(
          eq(photoReactionTab.photoId, photoId),
          eq(photoReactionTab.visitorId, visitorId),
          inArray(photoReactionTab.reactionType, VALID_REACTION_TYPES)
        )
      );

    const sameExisting = existingReactions.find((r) => r.reactionType === reactionType);

    if (sameExisting) {
      // User clicked the currently active reaction -> Toggle OFF
      await orm.delete(photoReactionTab).where(eq(photoReactionTab.id, sameExisting.id));
    } else {
      // User selected a new/different reaction -> Remove previous reaction first
      if (existingReactions.length > 0) {
        const idsToDelete = existingReactions.map((r) => r.id);
        await orm.delete(photoReactionTab).where(inArray(photoReactionTab.id, idsToDelete));
      }

      // Insert new reaction
      await orm.insert(photoReactionTab).values({
        id: uuidv4(),
        photoId,
        visitorId,
        reactionType,
        count: 1,
      });
    }

    // Return the fresh aggregated reactions state using master client to avoid replication lag
    const freshState = await this.getPhotoReactions(photoId, visitorId, true);

    // Broadcast live reaction update to all active SSE subscribers for this photo
    commentEventHub.publish(photoId, {
      type: 'reaction_updated',
      photoId,
      totals: freshState.totals,
    });

    // Persist live reaction update into distributed cache so other serverless instances & SSE streams receive it
    await cache.set(`reaction_event:${photoId}`, {
      photoId,
      totals: freshState.totals,
      ts: Date.now(),
    }, { ttl: 86400 }).catch(() => {});

    return freshState;
  },

  // Query photos that have received reactions, sorted by total reactions descending (Admin).
  async getTopReactionPhotos(limit = 20): Promise<InsightsTopReactionPhotoVo[]> {
    try {
      // 1. Group reactions by photoId and aggregate totals per reaction type
      const reactionAggRows = await readOrm
        .select({
          photoId: photoReactionTab.photoId,
          totalReactions: sql<number>`COALESCE(SUM(${photoReactionTab.count}), 0)::int`,
          love: sql<number>`COALESCE(SUM(CASE WHEN ${photoReactionTab.reactionType} = 'love' THEN ${photoReactionTab.count} ELSE 0 END), 0)::int`,
          fire: sql<number>`COALESCE(SUM(CASE WHEN ${photoReactionTab.reactionType} = 'fire' THEN ${photoReactionTab.count} ELSE 0 END), 0)::int`,
          camera: sql<number>`COALESCE(SUM(CASE WHEN ${photoReactionTab.reactionType} = 'camera' THEN ${photoReactionTab.count} ELSE 0 END), 0)::int`,
          place: sql<number>`COALESCE(SUM(CASE WHEN ${photoReactionTab.reactionType} = 'place' THEN ${photoReactionTab.count} ELSE 0 END), 0)::int`,
          clap: sql<number>`COALESCE(SUM(CASE WHEN ${photoReactionTab.reactionType} = 'clap' THEN ${photoReactionTab.count} ELSE 0 END), 0)::int`,
        })
        .from(photoReactionTab)
        .groupBy(photoReactionTab.photoId)
        .orderBy(desc(sql`COALESCE(SUM(${photoReactionTab.count}), 0)`))
        .limit(limit);

      if (reactionAggRows.length === 0) {
        return [];
      }

      const photoIds = reactionAggRows.map((r) => r.photoId);

      // 2. Fetch photo metadata
      const photos = await readOrm
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
        .where(and(inArray(photoTab.photoId, photoIds), eq(photoTab.status, PhotoStatusEnum.NORMAL)));

      const photoMap = new Map<string, typeof photos[0]>();
      const storageIds = new Set<string>();
      for (const p of photos) {
        photoMap.set(p.photoId, p);
        if (p.storageId) storageIds.add(p.storageId);
      }

      // 3. Resolve storage domains
      const storageMap = new Map<string, string | null>();
      if (storageIds.size > 0) {
        const storageRows = await readOrm
          .select({ storageId: storageTab.storageId, domain: storageTab.domain })
          .from(storageTab)
          .where(inArray(storageTab.storageId, Array.from(storageIds)));
        for (const s of storageRows) {
          storageMap.set(s.storageId, s.domain);
        }
      }

      // 4. Resolve thumbnail, preview & original keys
      const fileRows = await readOrm
        .select({
          photoId: fileTab.photoId,
          type: fileTab.type,
          key: fileTab.key,
        })
        .from(fileTab)
        .where(inArray(fileTab.photoId, photoIds));

      const fileMap = new Map<string, { thumbnailKey?: string; previewKey?: string; originalKey?: string }>();
      for (const f of fileRows) {
        const cur = fileMap.get(f.photoId) || {};
        if (f.type === FileTypeEnum.THUMBNAIL) cur.thumbnailKey = f.key;
        if (f.type === FileTypeEnum.PREVIEW) cur.previewKey = f.key;
        if (f.type === FileTypeEnum.ORIGINAL) cur.originalKey = f.key;
        fileMap.set(f.photoId, cur);
      }

      // 5. Query view counts and comment counts for context
      const viewRows = await readOrm
        .select({
          photoId: photoViewTab.photoId,
          views: sql<number>`COUNT(*)::int`,
        })
        .from(photoViewTab)
        .where(and(inArray(photoViewTab.photoId, photoIds), eq(photoViewTab.type, 'view')))
        .groupBy(photoViewTab.photoId);

      const viewMap = new Map<string, number>();
      for (const v of viewRows) {
        viewMap.set(v.photoId, Number(v.views || 0));
      }

      const commentRows = await readOrm
        .select({
          photoId: commentTab.photoId,
          comments: sql<number>`COUNT(*)::int`,
        })
        .from(commentTab)
        .where(inArray(commentTab.photoId, photoIds))
        .groupBy(commentTab.photoId);

      const commentMap = new Map<string, number>();
      for (const c of commentRows) {
        commentMap.set(c.photoId, Number(c.comments || 0));
      }

      // 6. Build structured return array preserving sorted order
      const resultList: InsightsTopReactionPhotoVo[] = [];
      for (const agg of reactionAggRows) {
        const photo = photoMap.get(agg.photoId);
        if (!photo) continue; // Skip deleted photos

        const domain = photo.storageId ? storageMap.get(photo.storageId) : null;
        const checksum = photo.checksum || '';
        const files = fileMap.get(photo.photoId);
        const thumbnailKey = files?.thumbnailKey || (checksum ? buildThumbnailKey(checksum, photo.photoId) : '');
        const previewKey = files?.previewKey || (checksum ? buildPreviewKey(checksum, photo.photoId) : '');
        const isVideo = Boolean(photo.type?.startsWith('video/'));
        const originalKey = files?.originalKey;
        const key = originalKey
          ? (domain ? toMediaUrl(originalKey, domain) : toProxyMediaUrl(originalKey))
          : null;

        resultList.push({
          photoId: photo.photoId,
          name: photo.name,
          type: photo.type ?? null,
          key,
          thumbnail: toMediaUrl(thumbnailKey, domain),
          preview: toMediaUrl(previewKey, domain),
          width: photo.width,
          height: photo.height,
          totalReactions: Number(agg.totalReactions || 0),
          reactions: {
            love: Number(agg.love || 0),
            fire: Number(agg.fire || 0),
            camera: Number(agg.camera || 0),
            place: Number(agg.place || 0),
            clap: Number(agg.clap || 0),
          },
          viewCount: viewMap.get(photo.photoId) || 0,
          commentCount: commentMap.get(photo.photoId) || 0,
        });
      }

      return resultList;
    } catch (err) {
      console.error('[REACTION] Error fetching top reaction photos:', err);
      return [];
    }
  },

  // Reset all reactions for a specific photo (Admin only).
  async resetPhotoReactions(photoId: string): Promise<{ success: boolean }> {
    const cleanPhotoId = photoId?.trim();
    if (!cleanPhotoId) {
      throw new BizError('photo.notFound');
    }
    try {
      await orm.delete(photoReactionTab).where(eq(photoReactionTab.photoId, cleanPhotoId));

      // Broadcast live reset event to all active SSE subscribers for this photo
      commentEventHub.publish(cleanPhotoId, {
        type: 'reaction_updated',
        photoId: cleanPhotoId,
        totals: { love: 0, fire: 0, camera: 0, place: 0, clap: 0 },
      });

      return { success: true };
    } catch (err) {
      console.error('[REACTION] Error resetting reactions for photo:', cleanPhotoId, err);
      throw err;
    }
  },

  // Reset all reactions across the entire gallery (Admin only).
  async resetAllReactions(): Promise<{ success: boolean }> {
    try {
      await orm.delete(photoReactionTab);
      return { success: true };
    } catch (err) {
      console.error('[REACTION] Error resetting all gallery reactions:', err);
      throw err;
    }
  },
};

export { reactionService };

