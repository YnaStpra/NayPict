import { Hono, Context } from "hono";
import result from '@/server/model/result';
import { commentService } from '@/server/service/comment-service';
import { type CommentAddBo, type CommentDeleteBo, type CommentListAdminBo, type CommentReplyBo } from '@/server/entity/bo/comment';
import { getClientIp } from '@/server/lib/ip';
import type { HonoEnv } from '../hono/type';

// This module registers public and administrative photo comment interfaces.

export function registerCommentApi(app: Hono<HonoEnv>) {
  // Real-time Server-Sent Events (SSE) endpoint for live comment updates.
  // Decommissioned continuous 50-second serverless execution loop to preserve Vercel compute quotas.
  // Replaced with client-side adaptive polling and BroadcastChannel cross-tab synchronization.
  app.get('/photos/:photoId/comments/sse', async (c: Context) => {
    return c.body(null, 204);
  });

  // Query comments for a specific photo (RESTful route).
  app.get('/photos/:photoId/comments', async (c: Context) => {
    const photoId = c.req.param('photoId') ?? '';
    const data = await commentService.listByPhotoId(photoId);
    return c.json(result.ok(data));
  });

  // Query comments for a specific photo (RPC style POST route).
  app.post('/photo/comment/list', async (c: Context) => {
    const { photoId } = await c.req.json<{ photoId: string }>().catch(() => ({ photoId: '' }));
    const data = await commentService.listByPhotoId(photoId);
    return c.json(result.ok(data));
  });

  // Add a new comment to a photo (RESTful route).
  app.post('/photos/:photoId/comments', async (c: Context) => {
    const photoId = c.req.param('photoId') ?? '';
    const body = await c.req.json<CommentAddBo>().catch(() => ({ photoId: '', name: '', content: '' }));

    const clientIp = getClientIp(c);

    const data = await commentService.add({
      ...body,
      photoId,
    }, clientIp);

    return c.json(result.ok(data));
  });

  // Add a new comment to a photo (RPC style POST route).
  app.post('/photo/comment/add', async (c: Context) => {
    const body = await c.req.json<CommentAddBo>().catch(() => ({ photoId: '', name: '', content: '' }));

    const clientIp = getClientIp(c);

    const data = await commentService.add(body, clientIp);
    return c.json(result.ok(data));
  });

  // Query all comments for Admin management (Admin only).
  app.post('/photo/comment/admin/list', async (c: Context) => {
    const body = await c.req.json<CommentListAdminBo>().catch(() => ({}));
    const data = await commentService.listAllForAdmin(body);
    return c.json(result.ok(data));
  });

  // Admin replies to a comment (Admin only).
  app.post('/photo/comment/reply', async (c: Context) => {
    const body = await c.req.json<CommentReplyBo>().catch(() => ({ commentId: '', replyContent: '' }));
    const data = await commentService.reply(body);
    return c.json(result.ok(data));
  });

  // Admin deletes a reply from a comment (Admin only).
  app.post('/photo/comment/reply/delete', async (c: Context) => {
    const body = await c.req.json<{ commentId: string }>().catch(() => ({ commentId: '' }));
    await commentService.deleteReply(body.commentId);
    return c.json(result.ok());
  });

  // Delete a comment (Admin only).
  app.post('/photo/comment/delete', async (c: Context) => {
    const body = await c.req.json<CommentDeleteBo>().catch(() => ({ commentId: '' }));
    await commentService.delete(body.commentId);
    return c.json(result.ok());
  });

  // Toggle official photographer ❤️ heart on a comment (Admin only).
  app.post('/photo/comment/heart', async (c: Context) => {
    const body = await c.req.json<{ commentId: string }>().catch(() => ({ commentId: '' }));
    const isHearted = await commentService.toggleHeart(body.commentId);
    return c.json(result.ok({ isHearted }));
  });

  // Toggle pinning a comment to the top of the photo (Admin only).
  app.post('/photo/comment/pin', async (c: Context) => {
    const body = await c.req.json<{ commentId: string }>().catch(() => ({ commentId: '' }));
    const isPinned = await commentService.togglePin(body.commentId);
    return c.json(result.ok({ isPinned }));
  });
}
