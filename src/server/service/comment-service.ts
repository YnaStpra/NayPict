import { and, desc, eq, ilike, inArray, isNotNull, isNull, or, sql } from 'drizzle-orm';
import { commentTab } from '@/server/entity/comment';
import { photoTab } from '@/server/entity/photo';
import { PhotoStatusEnum } from '@/server/enums/photo-enum';
import { type CommentAddBo, type CommentListAdminBo, type CommentReplyBo } from '@/server/entity/bo/comment';
import { type CommentAdminPageVo, type CommentVo } from '@/server/entity/vo/comment';
import BizError from '@/server/error/biz-error';
import { orm } from '@/server/infra/db';
import { createId } from '@/server/lib/id';
import { verifyTurnstileToken } from '@/server/lib/turnstile';
import { commentEventHub } from '@/server/lib/comment-event-hub';
import { type Storage } from '@/server/entity/storage';
import { type File as PhotoFile } from '@/server/entity/file';
import { fileService } from '@/server/service/file-service';
import { storageService } from '@/server/service/storage-service';
import { formatHttpUrl, toMediaUrl } from '@/lib/url';
import { FileTypeEnum } from '@/server/enums/file-enum';
import { commentRateLimiter } from '@/server/lib/rate-limiter';

// This module handles business logic and storage operations for photo comments and admin replies.

const commentService = {

  // Query all comments for a specific photo, ordered by newest first.
  async listByPhotoId(photoId: string): Promise<CommentVo[]> {
    const cleanPhotoId = photoId?.trim();
    if (!cleanPhotoId) {
      return [];
    }

    try {
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
        replyContent: row.replyContent,
        replyTime: row.replyTime,
        createTime: row.createTime,
      }));
    } catch (err) {
      // Return empty comments list gracefully if table is empty or not yet provisioned
      console.warn('[COMMENT] Could not retrieve comments for photoId:', cleanPhotoId, err);
      return [];
    }
  },

  // Query all comments across all photos with photo info and pagination for Admin moderation.
  async listAllForAdmin(params: CommentListAdminBo = {}): Promise<CommentAdminPageVo> {
    const page = Math.max(1, params.page || 1);
    const size = Math.max(1, Math.min(100, params.size || 20));
    const offset = (page - 1) * size;
    const keyword = params.keyword?.trim();
    const photoId = params.photoId?.trim();
    const status = params.status || 'all';

    try {
      const conditions = [];

      if (photoId) {
        conditions.push(eq(commentTab.photoId, photoId));
      }

      if (keyword) {
        const pattern = `%${keyword}%`;
        conditions.push(
          or(
            ilike(commentTab.name, pattern),
            ilike(commentTab.content, pattern),
            ilike(photoTab.name, pattern)
          )
        );
      }

      if (status === 'replied') {
        conditions.push(isNotNull(commentTab.replyContent));
      } else if (status === 'unreplied') {
        conditions.push(isNull(commentTab.replyContent));
      }

      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

      // Count total matching comments
      const [countRow] = await orm
        .select({ count: sql<number>`count(*)::int` })
        .from(commentTab)
        .leftJoin(photoTab, eq(commentTab.photoId, photoTab.photoId))
        .where(whereClause);

      const total = Number(countRow?.count || 0);

      if (total === 0) {
        return { list: [], total: 0 };
      }

      // Fetch paginated comments joined with photo info
      const rows = await orm
        .select({
          commentId: commentTab.commentId,
          photoId: commentTab.photoId,
          name: commentTab.name,
          content: commentTab.content,
          replyContent: commentTab.replyContent,
          replyTime: commentTab.replyTime,
          createTime: commentTab.createTime,
          photoName: photoTab.name,
          thumbHash: photoTab.thumbHash,
          typeDesc: photoTab.typeDesc,
          storageId: photoTab.storageId,
        })
        .from(commentTab)
        .leftJoin(photoTab, eq(commentTab.photoId, photoTab.photoId))
        .where(whereClause)
        .orderBy(desc(commentTab.createTime))
        .limit(size)
        .offset(offset);

      const photoIds = Array.from(new Set(rows.map((r) => r.photoId).filter(Boolean)));
      const [fileMap, storageList] = await Promise.all([
        fileService.listByPhotoIds(photoIds),
        storageService.getStorageList(),
      ]);

      return {
        list: rows.map((r) => {
          const files = fileMap.get(r.photoId) ?? [];
          const fileStorage = storageList.find((s: Storage) => s.storageId === r.storageId);
          const domain = formatHttpUrl(fileStorage?.domain);
          const previewKey = files.find((f: PhotoFile) => f.type === FileTypeEnum.PREVIEW)?.key;
          const thumbKey = files.find((f: PhotoFile) => f.type === FileTypeEnum.THUMBNAIL)?.key ?? previewKey;

          return {
            commentId: r.commentId,
            photoId: r.photoId,
            photoName: r.photoName || undefined,
            photoThumbnail: thumbKey ? toMediaUrl(thumbKey, domain) ?? undefined : undefined,
            photoPreview: previewKey ? toMediaUrl(previewKey, domain) ?? undefined : undefined,
            thumbHash: r.thumbHash,
            typeDesc: r.typeDesc || 'jpg',
            name: r.name,
            content: r.content,
            replyContent: r.replyContent,
            replyTime: r.replyTime,
            createTime: r.createTime,
          };
        }),
        total,
      };
    } catch (err) {
      console.warn('[COMMENT] Error fetching admin comments list:', err);
      return { list: [], total: 0 };
    }
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

    // 4. Invisible Honeypot Bot Detection (Anti-Spam)
    if (params.website && params.website.trim().length > 0) {
      console.warn(`[COMMENT BOT BLOCKED] Honeypot field filled by IP ${clientIp || 'unknown'}: "${params.website}"`);
      throw new BizError('comment.botDetected');
    }

    // 5. Minimum Interaction Timing Validation (Anti-bot automated submission < 1.5s)
    if (params.timestamp) {
      const now = Date.now();
      const elapsed = now - params.timestamp;
      // If submitted in less than 1.5 seconds from form initialization, reject as automated bot
      if (elapsed < 1500 && elapsed >= -5000) {
        console.warn(`[COMMENT BOT BLOCKED] Form submitted too fast (${elapsed}ms) by IP ${clientIp || 'unknown'}`);
        throw new BizError('comment.tooFast');
      }
    }

    // 6. Cloudflare Turnstile Bot Verification (if TURNSTILE_SECRET_KEY is configured)
    const isHuman = await verifyTurnstileToken(params.turnstileToken || '', clientIp);
    if (!isHuman) {
      throw new BizError('comment.captchaFailed');
    }

    // 7. Distributed Rate Limiting Protection: max 10 comments per minute per IP
    if (clientIp) {
      const rateLimit = await commentRateLimiter.consume(clientIp);
      if (!rateLimit.allowed) {
        throw new BizError('comment.rateLimited');
      }
    }

    // 6. Insert new comment record
    const commentId = createId();
    const now = new Date().toISOString();

    try {
      await orm.insert(commentTab).values({
        commentId,
        photoId,
        name,
        content,
        createTime: now,
      });
    } catch (insertErr) {
      console.warn('[COMMENT] Error inserting comment, ensuring table exists:', insertErr);
      if (process.env.DATABASE_URL) {
        try {
          const { neon } = await import('@neondatabase/serverless');
          const sql = neon(process.env.DATABASE_URL);
          await sql`
            CREATE TABLE IF NOT EXISTS "comment" (
              "comment_id" text PRIMARY KEY NOT NULL,
              "photo_id" text NOT NULL,
              "name" text NOT NULL,
              "content" text NOT NULL,
              "reply_content" text,
              "reply_time" timestamp,
              "create_time" timestamp DEFAULT now() NOT NULL
            );
          `;
          await sql`CREATE INDEX IF NOT EXISTS "comment_photo_id_idx" ON "comment" ("photo_id");`;
          await orm.insert(commentTab).values({
            commentId,
            photoId,
            name,
            content,
            createTime: now,
          });
        } catch (retryErr) {
          console.error('[COMMENT] Failed to insert comment after ensuring table:', retryErr);
          throw new BizError('system.internalError');
        }
      } else {
        throw new BizError('system.internalError');
      }
    }

    const newCommentVo: CommentVo = {
      commentId,
      photoId,
      name,
      content,
      replyContent: null,
      replyTime: null,
      createTime: now,
    };

    // Broadcast real-time SSE event to all connected viewers of this photo
    commentEventHub.publish(photoId, {
      type: 'comment_added',
      photoId,
      comment: newCommentVo,
    });

    return newCommentVo;
  },

  // Admin replies to a comment.
  async reply(params: CommentReplyBo): Promise<CommentVo> {
    const commentId = params.commentId?.trim();
    const replyContent = params.replyContent?.trim();

    if (!commentId) {
      throw new BizError('comment.selectRequired');
    }

    if (!replyContent) {
      throw new BizError('comment.contentRequired');
    }

    if (replyContent.length > 500) {
      throw new BizError('comment.contentTooLong');
    }

    const [existing] = await orm
      .select()
      .from(commentTab)
      .where(eq(commentTab.commentId, commentId))
      .limit(1);

    if (!existing) {
      throw new BizError('comment.selectRequired');
    }

    const now = new Date().toISOString();

    await orm
      .update(commentTab)
      .set({
        replyContent,
        replyTime: now,
      })
      .where(eq(commentTab.commentId, commentId));

    const updatedCommentVo: CommentVo = {
      commentId: existing.commentId,
      photoId: existing.photoId,
      name: existing.name,
      content: existing.content,
      replyContent,
      replyTime: now,
      createTime: existing.createTime,
    };

    // Broadcast real-time SSE reply event
    commentEventHub.publish(existing.photoId, {
      type: 'reply_added',
      photoId: existing.photoId,
      comment: updatedCommentVo,
    });

    return updatedCommentVo;
  },

  // Delete admin reply from a comment.
  async deleteReply(commentId: string): Promise<void> {
    const cleanCommentId = commentId?.trim();
    if (!cleanCommentId) {
      throw new BizError('comment.selectRequired');
    }

    const [existing] = await orm
      .select()
      .from(commentTab)
      .where(eq(commentTab.commentId, cleanCommentId))
      .limit(1);

    await orm
      .update(commentTab)
      .set({
        replyContent: null,
        replyTime: null,
      })
      .where(eq(commentTab.commentId, cleanCommentId));

    if (existing) {
      commentEventHub.publish(existing.photoId, {
        type: 'reply_deleted',
        photoId: existing.photoId,
        commentId: cleanCommentId,
      });
    }
  },

  // Delete a specific comment by ID (Admin moderation).
  async delete(commentId: string): Promise<void> {
    const cleanCommentId = commentId?.trim();
    if (!cleanCommentId) {
      throw new BizError('comment.selectRequired');
    }

    const [existing] = await orm
      .select()
      .from(commentTab)
      .where(eq(commentTab.commentId, cleanCommentId))
      .limit(1);

    await orm.delete(commentTab).where(eq(commentTab.commentId, cleanCommentId));

    if (existing) {
      commentEventHub.publish(existing.photoId, {
        type: 'comment_deleted',
        photoId: existing.photoId,
        commentId: cleanCommentId,
      });
    }
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
