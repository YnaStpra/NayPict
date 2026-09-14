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

// Determine if request originates from automated bot, crawler, or serverless function
function isBotOrCrawler(c: Context): boolean {
  const ua = c.req.header('user-agent') || '';
  if (!ua || /bot|crawler|spider|slurp|headless|lighthouse|preview|healthcheck|uptime|monitor|curl|wget|python|go-http|axios/i.test(ua)) {
    return true;
  }
  if (c.req.header('cf-verified-bot') === 'true') {
    return true;
  }
  return false;
}

// Indonesian province code dictionary for edge geo-calibration
const ID_PROVINCES: Record<string, string> = {
  JK: 'Jakarta',
  JB: 'Jawa Barat',
  JT: 'Jawa Tengah',
  JI: 'Jawa Timur',
  BT: 'Banten',
  YO: 'DI Yogyakarta',
  BA: 'Bali',
  AC: 'Aceh',
  SU: 'Sumatera Utara',
  SB: 'Sumatera Barat',
  RI: 'Riau',
  KR: 'Kepulauan Riau',
  JA: 'Jambi',
  SS: 'Sumatera Selatan',
  BE: 'Bengkulu',
  LA: 'Lampung',
  BB: 'Bangka Belitung',
  KB: 'Kalimantan Barat',
  KT: 'Kalimantan Tengah',
  KS: 'Kalimantan Selatan',
  KI: 'Kalimantan Timur',
  KU: 'Kalimantan Utara',
  SA: 'Sulawesi Utara',
  ST: 'Sulawesi Tengah',
  SN: 'Sulawesi Selatan',
  SG: 'Sulawesi Tenggara',
  GO: 'Gorontalo',
  SR: 'Sulawesi Barat',
  MA: 'Maluku',
  MU: 'Maluku Utara',
  PA: 'Papua',
  PB: 'Papua Barat',
};

// Extract visitor IP and geographical metadata from Cloudflare and Vercel edge headers.
function extractVisitorMeta(c: Context) {
  const cfIp = c.req.header('cf-connecting-ip');
  const xForwardedFor = c.req.header('x-forwarded-for');
  const xRealIp = c.req.header('x-real-ip');
  const ip = cfIp || (xForwardedFor ? xForwardedFor.split(',')[0].trim() : '') || xRealIp || 'Unknown';

  const country = (c.req.header('cf-ipcountry') || c.req.header('x-vercel-ip-country') || 'Unknown').trim().toUpperCase();
  const rawCity = c.req.header('cf-ipcity') || c.req.header('x-vercel-ip-city') || 'Unknown';
  const rawRegion = c.req.header('cf-region') || c.req.header('x-vercel-ip-country-region') || 'Unknown';
  const rawRegionCode = (c.req.header('cf-region-code') || c.req.header('x-vercel-ip-country-region') || '').trim().toUpperCase();
  const timezone = c.req.header('cf-timezone') || c.req.header('x-vercel-ip-timezone') || '';

  // Clean and URL-decode city and region
  let city = 'Unknown';
  try {
    city = decodeURIComponent(rawCity.replace(/\+/g, ' ')).trim();
  } catch {
    city = rawCity;
  }

  let region = 'Unknown';
  try {
    region = decodeURIComponent(rawRegion.replace(/\+/g, ' ')).trim();
  } catch {
    region = rawRegion;
  }

  // Indonesian cellular IP anomaly calibration (Telkomsel/Indosat routing through Singapore IX)
  if (country === 'ID') {
    // Map province code if available
    if (rawRegionCode && ID_PROVINCES[rawRegionCode]) {
      region = ID_PROVINCES[rawRegionCode];
    }

    if (city.toLowerCase() === 'singapore' || city === 'Unknown' || city === '') {
      if (region && region !== 'Unknown' && region.toLowerCase() !== 'singapore') {
        city = region;
      } else if (timezone.includes('Jakarta') || timezone.includes('Pontianak')) {
        city = 'Jakarta';
      } else if (timezone.includes('Makassar') || timezone.includes('Ujung_Pandang')) {
        city = 'Makassar';
      } else if (timezone.includes('Jayapura')) {
        city = 'Jayapura';
      } else {
        city = 'Jakarta';
      }
    }
  }

  return { ip, country, city, region };
}

// Register visitor analytics API routes onto Hono instance.
export function registerAnalyticsApi(app: Hono<HonoEnv>) {

  // Public endpoint to initialize a new visitor session
  app.post('/analytics/session/init', async (c: Context) => {
    // Strictly drop automated bots, serverless healthchecks, and crawlers
    if (isBotOrCrawler(c)) {
      return c.json(result.ok({ sessionId: '', ignored: true }));
    }

    // Strictly drop authenticated administrators from visitor tracking
    const isAdmin = await checkIsAdmin(c);
    if (isAdmin) {
      return c.json(result.ok({ sessionId: '', ignored: true }));
    }

    const body = await c.req.json<InitVisitorSessionBo>().catch(() => ({} as InitVisitorSessionBo));
    const visitorId = getOrCreateVisitorId(c);
    const meta = extractVisitorMeta(c);

    // Calibrate Samsung Internet detection from User-Agent if reported as generic Chrome
    const ua = c.req.header('user-agent') || '';
    let browser = body.browser || 'Unknown';
    if (
      /SamsungBrowser|SBrowser|SAMSUNG/i.test(ua) ||
      (/SM-[A-Z0-9]+/i.test(ua) && !/Firefox|OPR|Edge/i.test(ua) && /Version\/[0-9.]+/i.test(ua))
    ) {
      browser = 'Samsung Internet';
    }

    const data = await analyticsService.initSession(
      {
        ...body,
        browser,
        visitorId,
      },
      {
        ...meta,
        isAdmin: false,
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
