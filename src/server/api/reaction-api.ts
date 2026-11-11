import type { Hono, Context } from 'hono';
import { getCookie, setCookie } from 'hono/cookie';
import result from '@/server/model/result';
import BizError from '@/server/error/biz-error';
import { reactionService } from '@/server/service/reaction-service';
import { type PhotoReactionAddBo, type PhotoReactionsQueryBo } from '@/server/entity/bo/reaction';
import { createId } from '@/server/lib/id';
import { getClientIp } from '@/server/lib/ip';
import { reactionRateLimiter } from '@/server/lib/rate-limiter';
import { checkIsAdmin } from '@/server/security/security';
import type { HonoEnv } from '../hono/type';

// This module registers endpoints for photo micro-reactions and public likes.

import { resolveSignedVisitorId } from '@/server/lib/visitor-cookie';

export function registerReactionApi(app: Hono<HonoEnv>) {
  // Query photo reactions and visitor state (Public).
  app.post('/photo/reactions', async (c: Context) => {
    c.header('Cache-Control', 'public, max-age=5, s-maxage=15, stale-while-revalidate=60');
    c.header('CDN-Cache-Control', 'public, s-maxage=15, stale-while-revalidate=60');
    const body = await c.req.json<PhotoReactionsQueryBo>().catch(() => ({ photoId: '' } as PhotoReactionsQueryBo));
    const visitorId = resolveSignedVisitorId(c, body.visitorId);
    const data = await reactionService.getPhotoReactions(body.photoId, visitorId);
    return c.json(result.ok(data));
  });

  // Add or toggle a photo reaction or like (Public, rate limited).
  app.post('/photo/reaction/add', async (c: Context) => {
    const clientIp = getClientIp(c);
    const rateLimit = await reactionRateLimiter.consume(clientIp);
    if (!rateLimit.allowed) {
      throw new BizError('reaction.tooManyRequests');
    }

    const body = await c.req.json<PhotoReactionAddBo>().catch(() => ({ photoId: '', visitorId: '', reactionType: 'love' as const }));
    const visitorId = resolveSignedVisitorId(c, body.visitorId);

    // If request is from authenticated Admin, do NOT record reactions or mutate public insight stats
    const isAdmin = await checkIsAdmin(c);
    if (isAdmin) {
      const data = await reactionService.getPhotoReactions(body.photoId, visitorId);
      return c.json(result.ok(data));
    }

    const data = await reactionService.addPhotoReaction({ ...body, visitorId });
    return c.json(result.ok(data));
  });
}
