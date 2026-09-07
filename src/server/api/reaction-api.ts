import type { Hono, Context } from 'hono';
import { getCookie, setCookie } from 'hono/cookie';
import result from '@/server/model/result';
import { reactionService } from '@/server/service/reaction-service';
import { type PhotoReactionAddBo, type PhotoReactionsQueryBo } from '@/server/entity/bo/reaction';
import { createId } from '@/server/lib/id';
import type { HonoEnv } from '../hono/type';

// This module registers endpoints for photo micro-reactions and public likes.

const VISITOR_COOKIE_NAME = 'naypict_vid';
const ONE_YEAR_SECONDS = 365 * 24 * 60 * 60;

// Resolve Cookie-First visitor identifier.
// Prioritizes the client's unique persistent cookie ('naypict_vid').
// Supports explicit client localStorage fallback to protect against cookie resets.
// Guarantees zero collisions between different users on the exact same WiFi network.
function resolveVisitorId(c: Context, explicitId?: string): string {
  let vid = getCookie(c, VISITOR_COOKIE_NAME);
  if (vid?.trim()) {
    return vid.trim();
  }

  if (explicitId?.trim()) {
    vid = explicitId.trim();
  } else {
    vid = createId();
  }

  setCookie(c, VISITOR_COOKIE_NAME, vid, {
    path: '/',
    maxAge: ONE_YEAR_SECONDS,
    httpOnly: true,
    sameSite: 'Lax',
    secure: process.env.NODE_ENV === 'production',
  });

  return vid;
}

export function registerReactionApi(app: Hono<HonoEnv>) {
  // Query photo reactions and visitor state (Public).
  app.post('/photo/reactions', async (c: Context) => {
    const body = await c.req.json<PhotoReactionsQueryBo>().catch(() => ({ photoId: '' } as PhotoReactionsQueryBo));
    const visitorId = resolveVisitorId(c, body.visitorId);
    const data = await reactionService.getPhotoReactions(body.photoId, visitorId);
    return c.json(result.ok(data));
  });

  // Add or toggle a photo reaction or like (Public).
  app.post('/photo/reaction/add', async (c: Context) => {
    const body = await c.req.json<PhotoReactionAddBo>().catch(() => ({ photoId: '', visitorId: '', reactionType: 'love' as const }));
    const visitorId = resolveVisitorId(c, body.visitorId);
    const data = await reactionService.addPhotoReaction({ ...body, visitorId });
    return c.json(result.ok(data));
  });
}
