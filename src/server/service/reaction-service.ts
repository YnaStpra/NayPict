import { and, eq, inArray, sql } from 'drizzle-orm';
import { orm, readOrm } from '@/server/infra/db';
import { photoReactionTab } from '@/server/entity/reaction';
import { type PhotoReactionAddBo, type ReactionType } from '@/server/entity/bo/reaction';
import { type PhotoReactionsVo, type ReactionTotalsVo, type UserReactionsVo } from '@/server/entity/vo/reaction';
import { v4 as uuidv4 } from 'uuid';
import BizError from '@/server/error/biz-error';

// This module handles visitor micro-reactions (Love, Fire, Camera, Place) and public claps/likes per photo.

const VALID_REACTION_TYPES: ReactionType[] = ['love', 'fire', 'camera', 'place', 'clap'];
const EMOJI_REACTION_TYPES: ReactionType[] = ['love', 'fire', 'camera', 'place'];

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

    if (reactionType === 'clap') {
      // 1-Like Toggle: A visitor can give at most 1 Like per photo
      const [existingClap] = await orm
        .select()
        .from(photoReactionTab)
        .where(
          and(
            eq(photoReactionTab.photoId, photoId),
            eq(photoReactionTab.visitorId, visitorId),
            eq(photoReactionTab.reactionType, 'clap')
          )
        )
        .limit(1);

      if (existingClap) {
        // Already liked -> Toggle OFF (Unlike)
        await orm.delete(photoReactionTab).where(eq(photoReactionTab.id, existingClap.id));
      } else {
        // Not liked yet -> Toggle ON (1 Like)
        await orm.insert(photoReactionTab).values({
          id: uuidv4(),
          photoId,
          visitorId,
          reactionType: 'clap',
          count: 1,
        });
      }
    } else {
      // Mutually Exclusive Emoji Reaction: A visitor can only choose 1 emoji reaction per photo
      const existingEmojis = await orm
        .select()
        .from(photoReactionTab)
        .where(
          and(
            eq(photoReactionTab.photoId, photoId),
            eq(photoReactionTab.visitorId, visitorId),
            inArray(photoReactionTab.reactionType, EMOJI_REACTION_TYPES)
          )
        );

      const sameExisting = existingEmojis.find((r) => r.reactionType === reactionType);

      if (sameExisting) {
        // User clicked the currently active emoji reaction -> Toggle OFF
        await orm.delete(photoReactionTab).where(eq(photoReactionTab.id, sameExisting.id));
      } else {
        // User selected a new/different emoji -> Remove previous emoji reaction first
        if (existingEmojis.length > 0) {
          const idsToDelete = existingEmojis.map((r) => r.id);
          await orm.delete(photoReactionTab).where(inArray(photoReactionTab.id, idsToDelete));
        }

        // Insert new emoji reaction
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
