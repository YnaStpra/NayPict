import { and, desc, eq, inArray } from 'drizzle-orm';
import { commentTab } from '@/server/entity/comment';
import { photoTab } from '@/server/entity/photo';
import { PhotoStatusEnum } from '@/server/enums/photo-enum';
import { type CommentAddBo } from '@/server/entity/bo/comment';
import { type CommentVo } from '@/server/entity/vo/comment';
import BizError from '@/server/error/biz-error';
import { cache } from '@/server/infra/cache';
import { orm } from '@/server/infra/db';
import { createId } from '@/server/lib/id';

// This module handles business logic and storage operations for photo comments.

const commentService = {

  // Query all comments for a specific photo, ordered by newest first.
  async listByPhotoId(photoId: string): Promise<CommentVo[]> {
    const cleanPhotoId = photoId?.trim();
    if (!cleanPhotoId) {
      return [];
    }

    const rows = await orm
      .select()
      .from(commentTab)
      .where(eq(commentTab.photoId, cleanPhotoId))
      .orderBy(desc(commentTab.createTime));

    return rows.map((row) => ({
      commentId: row.commentId,
      photoId: row.photoId,
      name: row.name,
      content: row.content,
      createTime: row.createTime,
    }));
  },

  // Add a new comment to a photo with server-side validation and abuse rate limiting.
  async add(params: CommentAddBo, clientIp?: string): Promise<CommentVo> {
    const photoId = params.photoId?.trim();
    const name = params.name?.trim();
    const content = params.content?.trim();

    // 1. Validate Photo ID
    if (!photoId) {
      throw new BizError('photo.selectRequired');
    }

    const [photo] = await orm
      .select({ photoId: photoTab.photoId })
      .from(photoTab)
      .where(and(eq(photoTab.photoId, photoId), eq(photoTab.status, PhotoStatusEnum.NORMAL)))
      .limit(1);

    if (!photo) {
      throw new BizError('photo.notFound');
    }

    // 2. Validate Commenter Name (required, max 50 characters)
    if (!name) {
      throw new BizError('comment.nameRequired');
    }
    if (name.length > 50) {
      throw new BizError('comment.nameTooLong');
    }

    // 3. Validate Comment Content (required, max 500 characters)
    if (!content) {
      throw new BizError('comment.contentRequired');
    }
    if (content.length > 500) {
      throw new BizError('comment.contentTooLong');
    }

    // 4. Rate Limiting Protection: max 10 comments per minute per IP
    if (clientIp) {
      const rateLimitKey = `comment_ratelimit_${clientIp}`;
      const attempts = (await cache.get<number>(rateLimitKey)) ?? 0;
      if (attempts >= 10) {
        throw new BizError('comment.rateLimited');
      }
      await cache.set(rateLimitKey, attempts + 1, { ttl: 60 });
    }

    // 5. Insert new comment record
    const commentId = createId();
    const now = new Date().toISOString();

    await orm.insert(commentTab).values({
      commentId,
      photoId,
      name,
      content,
      createTime: now,
    });

    return {
      commentId,
      photoId,
      name,
      content,
      createTime: now,
    };
  },

  // Delete a specific comment by ID (Admin moderation).
  async delete(commentId: string): Promise<void> {
    const cleanCommentId = commentId?.trim();
    if (!cleanCommentId) {
      throw new BizError('comment.selectRequired');
    }

    await orm.delete(commentTab).where(eq(commentTab.commentId, cleanCommentId));
  },

  // Batch delete all comments associated with specific photo IDs (called on photo deletion).
  async deleteByPhotoIds(photoIds: string[]): Promise<void> {
    if (!photoIds || photoIds.length === 0) {
      return;
    }

    await orm.delete(commentTab).where(inArray(commentTab.photoId, photoIds));
  },
};

export { commentService };
