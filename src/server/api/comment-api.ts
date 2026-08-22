import { Hono, Context } from "hono";
import { streamSSE } from "hono/streaming";
import result from '@/server/model/result';
import { commentService } from '@/server/service/comment-service';
import { commentEventHub, type CommentEvent } from '@/server/lib/comment-event-hub';
import { type CommentAddBo, type CommentDeleteBo, type CommentListAdminBo, type CommentReplyBo } from '@/server/entity/bo/comment';
import type { HonoEnv } from '../hono/type';

// This module registers public and administrative photo comment interfaces.

export function registerCommentApi(app: Hono<HonoEnv>) {
  // Real-time Server-Sent Events (SSE) endpoint for live comment updates.
  app.get('/photos/:photoId/comments/sse', async (c: Context) => {
    const photoId = c.req.param('photoId') ?? '';
    if (!photoId) {
      return c.text('photoId is required', 400);
    }

    return streamSSE(c, async (stream) => {
      await stream.writeSSE({
        event: 'connected',
        data: JSON.stringify({ photoId, status: 'connected' }),
      });

      const unsubscribe = commentEventHub.subscribe(photoId, async (event: CommentEvent) => {
        try {
          await stream.writeSSE({
            event: event.type,
            data: JSON.stringify(event),
          });
        } catch (err) {
          console.warn('[SSE] Failed to write event to stream:', err);
        }
      });

      const pingInterval = setInterval(async () => {
        try {
          await stream.writeSSE({
            event: 'ping',
            data: 'heartbeat',
          });
        } catch {
          clearInterval(pingInterval);
        }
      }, 15000);

      stream.onAbort(() => {
        clearInterval(pingInterval);
        unsubscribe();
      });

      while (!stream.aborted) {
        await stream.sleep(1000);
      }
    });
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

    const clientIp =
      c.req.header('x-forwarded-for')?.split(',')[0].trim() ||
      c.req.header('x-real-ip') ||
      'unknown';

    const data = await commentService.add({
      ...body,
      photoId,
    }, clientIp);

    return c.json(result.ok(data));
  });

  // Add a new comment to a photo (RPC style POST route).
  app.post('/photo/comment/add', async (c: Context) => {
    const body = await c.req.json<CommentAddBo>().catch(() => ({ photoId: '', name: '', content: '' }));

    const clientIp =
      c.req.header('x-forwarded-for')?.split(',')[0].trim() ||
      c.req.header('x-real-ip') ||
      'unknown';

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
}
