import type { Context, Hono } from 'hono';
import { getCookie, setCookie } from 'hono/cookie';
import result from '@/server/model/result';
import { analyticsService } from '@/server/service/analytics-service';
import { getLoginInfo } from '@/lib/cookie';
import { userService } from '@/server/service/user-service';
import { UserTypeEnum } from '@/server/enums/user-enum';
import { createId } from '@/server/lib/id';
import BizError from '@/server/error/biz-error';
import {
  type HeartbeatBo,
  type InitVisitorSessionBo,
  type TrackMediaBo,
  type VisitorSessionsQueryBo,
} from '@/server/entity/bo/analytics';
import type { HonoEnv } from '../hono/type';

// This module handles API endpoints for visitor session initialization, telemetry heartbeats, media tracking, and admin inspection.

const VISITOR_COOKIE_NAME = 'naypict_vid';
const ONE_YEAR_SECONDS = 365 * 24 * 60 * 60;

// Resolve or create an anonymous visitor identifier from request cookies.
function getOrCreateVisitorId(c: Context): string {
  let vid = getCookie(c, VISITOR_COOKIE_NAME);
  if (!vid) {
    vid = createId();
    setCookie(c, VISITOR_COOKIE_NAME, vid, {
      path: '/',
      maxAge: ONE_YEAR_SECONDS,
      httpOnly: true,
      sameSite: 'Lax',
      secure: process.env.NODE_ENV === 'production',
    });
  }
  return vid;
}

// Verify if the current request belongs to an authenticated Admin session.
async function checkIsAdmin(c: Context): Promise<boolean> {
  try {
    const rawCookie = c.req.header('cookie') ?? null;
    const { userId } = await getLoginInfo(rawCookie);
    if (!userId) return false;

    const user = await userService.getById(userId);
    return user?.type === UserTypeEnum.ADMIN;
  } catch {
    return false;
  }
}

// Extract visitor IP and geographical metadata from Cloudflare and Vercel edge headers.
function extractVisitorMeta(c: Context) {
  const cfIp = c.req.header('cf-connecting-ip');
  const xForwardedFor = c.req.header('x-forwarded-for');
  const xRealIp = c.req.header('x-real-ip');
  const ip = cfIp || (xForwardedFor ? xForwardedFor.split(',')[0].trim() : '') || xRealIp || 'Unknown';

  const country = c.req.header('cf-ipcountry') || c.req.header('x-vercel-ip-country') || 'Unknown';
  const city = c.req.header('cf-ipcity') || c.req.header('x-vercel-ip-city') || 'Unknown';
  const region = c.req.header('cf-region') || c.req.header('x-vercel-ip-country-region') || 'Unknown';

  return { ip, country, city, region };
}

// Register visitor analytics API routes onto Hono instance.
export function registerAnalyticsApi(app: Hono<HonoEnv>) {

  // Public endpoint to initialize a new visitor session
  app.post('/analytics/session/init', async (c: Context) => {
    const body = await c.req.json<InitVisitorSessionBo>().catch(() => ({} as InitVisitorSessionBo));
    const visitorId = getOrCreateVisitorId(c);
    const isAdmin = await checkIsAdmin(c);
    const meta = extractVisitorMeta(c);

    const data = await analyticsService.initSession(
      {
        ...body,
        visitorId,
      },
      {
        ...meta,
        isAdmin,
      }
    );

    return c.json(result.ok(data));
  });

  // Public endpoint for periodic heartbeat ping and duration update
  app.post('/analytics/session/ping', async (c: Context) => {
    const body = await c.req.json<HeartbeatBo>().catch(() => ({} as HeartbeatBo));
    const isAdmin = await checkIsAdmin(c);

    if (!body.sessionId) {
      return c.json(result.ok({ updated: false }));
    }

    const updated = await analyticsService.heartbeat(body, isAdmin);
    return c.json(result.ok({ updated }));
  });

  // Public endpoint to track media view or interaction within a session
  app.post('/analytics/media/track', async (c: Context) => {
    const body = await c.req.json<TrackMediaBo>().catch(() => ({} as TrackMediaBo));
    const isAdmin = await checkIsAdmin(c);

    if (!body.photoId) {
      return c.json(result.ok({ tracked: false }));
    }

    const tracked = await analyticsService.trackMedia(body, isAdmin);
    return c.json(result.ok({ tracked }));
  });

  // Admin-only endpoint for overview stats and metric aggregations
  app.get('/analytics/overview', async (c: Context) => {
    const isAdmin = await checkIsAdmin(c);
    if (!isAdmin) {
      throw new BizError('auth.failed', 403);
    }

    const overview = await analyticsService.getOverview();
    return c.json(result.ok(overview));
  });

  // Admin-only endpoint for paginated visitor sessions list
  app.get('/analytics/sessions', async (c: Context) => {
    const isAdmin = await checkIsAdmin(c);
    if (!isAdmin) {
      throw new BizError('auth.failed', 403);
    }

    const query = c.req.query() as VisitorSessionsQueryBo;
    const page = Number(query.page) || 1;
    const pageSize = Number(query.pageSize) || 20;

    const data = await analyticsService.getSessions({
      page,
      pageSize,
      search: query.search,
      device: query.device,
      browser: query.browser,
      country: query.country,
    });

    return c.json(result.ok(data));
  });

  // Admin-only endpoint for detailed session activity and media history
  app.get('/analytics/sessions/:id', async (c: Context) => {
    const isAdmin = await checkIsAdmin(c);
    if (!isAdmin) {
      throw new BizError('auth.failed', 403);
    }

    const id = c.req.param('id');
    if (!id) {
      throw new BizError('system.internalError', 400);
    }

    const detail = await analyticsService.getSessionDetail(id);
    if (!detail) {
      throw new BizError('system.internalError', 404);
    }


    return c.json(result.ok(detail));
  });
}
