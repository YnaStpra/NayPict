import type { Hono, Context } from 'hono';
import { getCookie, setCookie } from 'hono/cookie';
import { createHash } from 'node:crypto';
import result from '@/server/model/result';
import { reactionService } from '@/server/service/reaction-service';
import { type PhotoReactionAddBo, type PhotoReactionsQueryBo } from '@/server/entity/bo/reaction';
import { createId } from '@/server/lib/id';
import type { HonoEnv } from '../hono/type';

// This module registers endpoints for photo micro-reactions and public likes.

const VISITOR_COOKIE_NAME = 'naypict_vid';
const ONE_YEAR_SECONDS = 365 * 24 * 60 * 60;

// Resolve hybrid visitor identifier from persistent cookie + device fingerprint (SHA-256 of IP + User-Agent).
// This prevents users from bypassing the single-reaction limit via incognito tabs or clearing cookies.
function resolveVisitorId(c: Context): string {
  // 1. Extract real client IP behind Cloudflare / Vercel proxy
  const clientIp =
    c.req.header('cf-connecting-ip') ||
    c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ||
    c.req.header('x-real-ip') ||
    '127.0.0.1';

  // 2. Extract browser User-Agent
  const userAgent = c.req.header('user-agent') || 'unknown-ua';

  // 3. Compute SHA-256 device & network fingerprint
  const deviceFingerprint = createHash('sha256')
    .update(`${clientIp}:${userAgent}`)
    .digest('hex')
    .slice(0, 24);

  // 4. Ensure persistent 1-year visitor tracking cookie is present
  let cookieVid = getCookie(c, VISITOR_COOKIE_NAME);
  if (!cookieVid) {
    cookieVid = createId();
    setCookie(c, VISITOR_COOKIE_NAME, cookieVid, {
      path: '/',
      maxAge: ONE_YEAR_SECONDS,
      httpOnly: true,
      sameSite: 'Lax',
      secure: process.env.NODE_ENV === 'production',
    });
  }

  // 5. Return hybrid visitor ID anchored to the device fingerprint
  return `h_${deviceFingerprint}`;
}

export function registerReactionApi(app: Hono<HonoEnv>) {
  // Query photo reactions and visitor state (Public).
  app.post('/photo/reactions', async (c: Context) => {
    const body = await c.req.json<PhotoReactionsQueryBo>().catch(() => ({ photoId: '' } as PhotoReactionsQueryBo));
    const visitorId = resolveVisitorId(c);
    const data = await reactionService.getPhotoReactions(body.photoId, visitorId);
    return c.json(result.ok(data));
  });

  // Add or toggle a photo reaction or like (Public).
  app.post('/photo/reaction/add', async (c: Context) => {
    const body = await c.req.json<PhotoReactionAddBo>().catch(() => ({ photoId: '', visitorId: '', reactionType: 'love' as const }));
    const visitorId = resolveVisitorId(c);
    const data = await reactionService.addPhotoReaction({ ...body, visitorId });
    return c.json(result.ok(data));
  });
}
