import type { Context, Hono } from 'hono';
import { getCookie, setCookie } from 'hono/cookie';
import result from '@/server/model/result';
import { insightsService } from '@/server/service/insights-service';
import { getLoginInfo } from '@/lib/cookie';
import { userService } from '@/server/service/user-service';
import { UserTypeEnum } from '@/server/enums/user-enum';
import { createId } from '@/server/lib/id';
import BizError from '@/server/error/biz-error';
import { type PhotoViewRecordBo } from '@/server/entity/bo/insights';
import type { HonoEnv } from '../hono/type';

// This module handles API endpoints for photo analytics, view tracking, and admin insights.

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

// Register photo insights and view tracking routes onto Hono instance.
export function registerInsightsApi(app: Hono<HonoEnv>) {

  // Public endpoint to record photo view event (Admin interactions are excluded server-side)
  app.post('/photo/view', async (c: Context) => {
    const body = await c.req.json<PhotoViewRecordBo>().catch(() => ({} as PhotoViewRecordBo));
    const visitorId = getOrCreateVisitorId(c);
    const isAdmin = await checkIsAdmin(c);

    const res = await insightsService.recordEvent(
      { photoId: body.photoId, type: 'view' },
      visitorId,
      isAdmin
    );

    return c.json(result.ok(res));
  });

  // REST alias for public photo view tracking: POST /photos/:photoId/view
  app.post('/photos/:photoId/view', async (c: Context) => {
    const photoId = c.req.param('photoId') ?? '';
    const visitorId = getOrCreateVisitorId(c);
    const isAdmin = await checkIsAdmin(c);

    const res = await insightsService.recordEvent(
      { photoId, type: 'view' },
      visitorId,
      isAdmin
    );

    return c.json(result.ok(res));
  });

  // Public endpoint to record photo share event
  app.post('/photo/share', async (c: Context) => {
    const body = await c.req.json<PhotoViewRecordBo>().catch(() => ({} as PhotoViewRecordBo));
    const visitorId = getOrCreateVisitorId(c);
    const isAdmin = await checkIsAdmin(c);

    const res = await insightsService.recordEvent(
      { photoId: body.photoId, type: 'share' },
      visitorId,
      isAdmin
    );

    return c.json(result.ok(res));
  });

  // REST alias for photo share tracking: POST /photos/:photoId/share
  app.post('/photos/:photoId/share', async (c: Context) => {
    const photoId = c.req.param('photoId') ?? '';
    const visitorId = getOrCreateVisitorId(c);
    const isAdmin = await checkIsAdmin(c);

    const res = await insightsService.recordEvent(
      { photoId, type: 'share' },
      visitorId,
      isAdmin
    );

    return c.json(result.ok(res));
  });

  // Admin-only endpoint: Get gallery overview statistics
  app.get('/admin/insights/overview', async (c: Context) => {
    const overview = await insightsService.getOverview();
    return c.json(result.ok(overview));
  });

  // Admin-only endpoint: Get aggregated views trend chart
  app.get('/admin/insights/chart', async (c: Context) => {
    const rangeParam = c.req.query('range') as '7d' | '30d' | '90d' | undefined;
    const photoId = c.req.query('photoId') || undefined;
    const range = rangeParam === '90d' ? '90d' : rangeParam === '30d' ? '30d' : '7d';

    const chartData = await insightsService.getViewsChart(range, photoId);
    return c.json(result.ok(chartData));
  });

  // Admin-only endpoint: Get top viewed and top commented photos ranking
  app.get('/admin/insights/top-photos', async (c: Context) => {
    const limit = Number(c.req.query('limit')) || 10;
    const topPhotos = await insightsService.getTopPhotos(limit);
    return c.json(result.ok(topPhotos));
  });

  // Admin-only endpoint: Get detailed statistics for a specific photo
  app.get('/admin/insights/photo/:photoId', async (c: Context) => {
    const photoId = c.req.param('photoId') ?? '';
    const detail = await insightsService.getPhotoDetail(photoId);

    if (!detail) {
      throw new BizError('photo.notFound', 404);
    }

    return c.json(result.ok(detail));
  });
}
