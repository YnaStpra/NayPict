import { Hono, Context } from "hono";
import result from '@/server/model/result';
import { commentService } from '@/server/service/comment-service';
import { type CommentAddBo, type CommentDeleteBo } from '@/server/entity/bo/comment';
import type { HonoEnv } from '../hono/type';

// This module registers public and administrative photo comment interfaces.

export function registerCommentApi(app: Hono<HonoEnv>) {
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
    const body = await c.req.json<{ name: string; content: string }>().catch(() => ({ name: '', content: '' }));

    const clientIp =
      c.req.header('x-forwarded-for')?.split(',')[0].trim() ||
      c.req.header('x-real-ip') ||
      'unknown';

    const data = await commentService.add({
      photoId,
      name: body.name,
      content: body.content,
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

  // Delete a comment (Admin only).
  app.post('/photo/comment/delete', async (c: Context) => {
    const body = await c.req.json<CommentDeleteBo>().catch(() => ({ commentId: '' }));
    await commentService.delete(body.commentId);
    return c.json(result.ok());
  });
}
