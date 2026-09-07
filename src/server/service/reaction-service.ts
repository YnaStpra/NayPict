import { and, eq, sql } from 'drizzle-orm';
import { orm, readOrm } from '@/server/infra/db';
import { photoReactionTab } from '@/server/entity/reaction';
import { type PhotoReactionAddBo, type ReactionType } from '@/server/entity/bo/reaction';
import { type PhotoReactionsVo, type ReactionTotalsVo, type UserReactionsVo } from '@/server/entity/vo/reaction';
import { v4 as uuidv4 } from 'uuid';
import BizError from '@/server/error/biz-error';

// This module handles visitor micro-reactions (Love, Fire, Camera, Place) and public claps/likes per photo.

const VALID_REACTION_TYPES: ReactionType[] = ['love', 'fire', 'camera', 'place', 'clap'];
const MAX_CLAPS_PER_VISITOR = 5;

const reactionService = {
  // Query aggregated reaction totals and visitor personal reaction state for a photo.
  async getPhotoReactions(photoId: string, visitorId?: string): Promise<PhotoReactionsVo> {
    const cleanPhotoId = photoId?.trim();
    if (!cleanPhotoId) {
      return {
        photoId: '',
        totals: { love: 0, fire: 0, camera: 0, place: 0, clap: 0 },
        userReactions: { love: false, fire: false, camera: false, place: false, clap: 0 },
      };
    }

    try {
      // 1. Fetch aggregated totals grouped by reaction_type
      const totalRows = await readOrm
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
        const userRows = await readOrm
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
            userReactions.clap = Math.min(MAX_CLAPS_PER_VISITOR, Math.max(0, row.count));
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

  // Record or toggle a visitor's reaction to a photo.
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

    // Check existing record for this visitor & reaction
    const [existing] = await orm
      .select()
      .from(photoReactionTab)
      .where(
        and(
          eq(photoReactionTab.photoId, photoId),
          eq(photoReactionTab.visitorId, visitorId),
          eq(photoReactionTab.reactionType, reactionType)
        )
      )
      .limit(1);

    if (reactionType === 'clap') {
      // Claps: Increment up to MAX_CLAPS_PER_VISITOR
      const incrementBy = Math.max(1, Math.min(params.count ?? 1, 5));
      if (existing) {
        const nextCount = Math.min(MAX_CLAPS_PER_VISITOR, existing.count + incrementBy);
        await orm
          .update(photoReactionTab)
          .set({
            count: nextCount,
            updatedAt: sql`now()`,
          })
          .where(eq(photoReactionTab.id, existing.id));
      } else {
        await orm.insert(photoReactionTab).values({
          id: uuidv4(),
          photoId,
          visitorId,
          reactionType: 'clap',
          count: Math.min(MAX_CLAPS_PER_VISITOR, incrementBy),
        });
      }
    } else {
      // Emoji reaction: Toggle on or off
      if (existing && existing.count > 0) {
        // Toggle OFF (delete row or set count to 0)
        await orm.delete(photoReactionTab).where(eq(photoReactionTab.id, existing.id));
      } else if (existing && existing.count === 0) {
        // Toggle ON
        await orm
          .update(photoReactionTab)
          .set({ count: 1, updatedAt: sql`now()` })
          .where(eq(photoReactionTab.id, existing.id));
      } else {
        // Insert new ON
        await orm.insert(photoReactionTab).values({
          id: uuidv4(),
          photoId,
          visitorId,
          reactionType,
          count: 1,
        });
      }
    }

    // Return the fresh aggregated reactions state
    return this.getPhotoReactions(photoId, visitorId);
  },
};

export { reactionService };
