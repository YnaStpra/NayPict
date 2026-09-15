import type { Context, Hono } from 'hono';
import { getCookie, setCookie } from 'hono/cookie';
import result from '@/server/model/result';
import { analyticsService } from '@/server/service/analytics-service';
import { getLoginInfo } from '@/lib/cookie';
import { userService } from '@/server/service/user-service';
import { UserTypeEnum } from '@/server/enums/user-enum';
import { createId } from '@/server/lib/id';
import BizError from '@/server/error/biz-error';
import { parseUserAgent } from '@/server/lib/user-agent';
import {
  type HeartbeatBo,
  type InitVisitorSessionBo,
  type TrackMediaBo,
  type UpdateVisitorLocationBo,
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

  // Indonesian cellular IP anomaly calibration & edge GeoIP sanitization
  if (country === 'ID') {
    // Discard foreign region codes mistakenly mapped to Indonesia (e.g. 'IDF' - Île-de-France)
    if (rawRegionCode && ID_PROVINCES[rawRegionCode]) {
      region = ID_PROVINCES[rawRegionCode];
    } else if (region === 'IDF' || /france|europe|ile-de-france/i.test(region)) {
      region = 'Unknown';
    }

    // Filter out foreign cities mistakenly mapped to Indonesia by edge GeoIP (e.g. Paris, Singapore, Frankfurt)
    if (/paris|singapore|london|frankfurt|amsterdam|ashburn/i.test(city) || city === 'Unknown' || city === '') {
      city = 'Unknown';
    }

    if (city === 'Unknown') {
      if (region && region !== 'Unknown') {
        city = region;
      } else if (timezone.includes('Makassar') || timezone.includes('Ujung_Pandang')) {
        city = 'Denpasar';
        region = 'Bali';
      } else if (timezone.includes('Jayapura')) {
        city = 'Jayapura';
        region = 'Papua';
      } else {
        city = 'Jakarta';
        region = 'Jakarta';
      }
    }
  }

  return { ip, country, city, region };
}

// Helper to identify datacenter, cloud hosting, or serverless IP ranges
function isDatacenterOrHosting(isp?: string, org?: string): boolean {
  const target = `${isp || ''} ${org || ''}`.toLowerCase();
  return /sundance|amazon|aws|google cloud|microsoft|azure|digitalocean|hetzner|ovh|linode|vultr|leaseweb|choopa|m247|cogent|hostinger|contabo|datacenter|hosting|cloud|server|colocation|vps|vpn|tor\b/i.test(target);
}

// In-memory cache for resolved IP geolocation (24-hour TTL) to prevent duplicate external lookups
interface CachedGeo {
  city: string;
  country: string;
  region: string;
  isDatacenter?: boolean;
  expires: number;
}
const geoCache = new Map<string, CachedGeo>();

// High-precision geolocation lookup to resolve Indonesian cellular carrier nodes and identify hosting bots
async function resolveAccurateGeo(
  ip: string,
  fallback: { city: string; country: string; region: string }
): Promise<{ city: string; country: string; region: string; isDatacenter?: boolean }> {
  if (
    !ip ||
    ip === 'Unknown' ||
    ip === '127.0.0.1' ||
    ip.startsWith('192.168.') ||
    ip.startsWith('10.') ||
    ip.startsWith('fc00:') ||
    ip.startsWith('fe80:')
  ) {
    return fallback;
  }

  const now = Date.now();
  const cached = geoCache.get(ip);
  if (cached && cached.expires > now) {
    return {
      city: cached.city,
      country: cached.country,
      region: cached.region,
      isDatacenter: cached.isDatacenter,
    };
  }

  // Trigger high-precision lookup if edge geo is ambiguous, generic, foreign-mismatched, or an Indonesian cellular IP
  const isAmbiguous =
    !fallback.city ||
    fallback.city === 'Unknown' ||
    fallback.region === 'Unknown' ||
    fallback.country === 'US' ||
    fallback.country === 'Unknown' ||
    fallback.country === 'ID' ||
    /paris|idf|singapore|france|frankfurt|london/i.test(`${fallback.city} ${fallback.region}`);

  if (!isAmbiguous) {
    return fallback;
  }

  // Provider 1: ipwho.is (includes rich ISP & datacenter detection)
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 1500);
    const res = await fetch(`https://ipwho.is/${encodeURIComponent(ip)}`, {
      signal: controller.signal,
      headers: { 'User-Agent': 'NayPict-Geo/1.0' },
    });
    clearTimeout(timeout);

    if (res.ok) {
      const data = await res.json();
      if (data && data.success) {
        const isDc = isDatacenterOrHosting(data.connection?.isp, data.connection?.org);
        let city = data.city || fallback.city;
        let region = data.region || fallback.region;
        const country = data.country_code || fallback.country;

        // Calibrate Indonesian regional province names (e.g. Denpasar -> Bali, Lesser Sunda -> Bali)
        if (country === 'ID' || data.country_code === 'ID') {
          if (city === 'Denpasar' || data.region_code === 'BA' || (region && /sunda|bali/i.test(region))) {
            region = 'Bali';
          } else if (data.region_code && ID_PROVINCES[data.region_code]) {
            region = ID_PROVINCES[data.region_code];
          }

          if (/paris|idf|singapore|france/i.test(`${city} ${region}`)) {
            city = 'Denpasar';
            region = 'Bali';
          }
        }

        const result = { city, country, region, isDatacenter: isDc };
        geoCache.set(ip, { ...result, expires: now + 24 * 60 * 60 * 1000 });
        return result;
      }
    }
  } catch {}

  // Provider 2: ip-api.com fallback
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 1500);
    const res = await fetch(`http://ip-api.com/json/${encodeURIComponent(ip)}`, {
      signal: controller.signal,
      headers: { 'User-Agent': 'NayPict-Geo/1.0' },
    });
    clearTimeout(timeout);

    if (res.ok) {
      const data = await res.json();
      if (data && data.status === 'success') {
        const isDc = isDatacenterOrHosting(data.isp, data.org);
        let city = data.city || fallback.city;
        let region = data.regionName || fallback.region;
        const country = data.countryCode || fallback.country;

        if (country === 'ID') {
          if (city === 'Denpasar' || data.region === 'BA' || /sunda|bali/i.test(region)) {
            region = 'Bali';
          } else if (data.region && ID_PROVINCES[data.region]) {
            region = ID_PROVINCES[data.region];
          }
        }

        const result = { city, country, region, isDatacenter: isDc };
        geoCache.set(ip, { ...result, expires: now + 24 * 60 * 60 * 1000 });
        return result;
      }
    }
  } catch {}

  // Sanitized fallback
  let sanitizedCity = fallback.city;
  let sanitizedRegion = fallback.region;
  if (fallback.country === 'ID') {
    if (/paris|idf|singapore|france/i.test(`${sanitizedCity} ${sanitizedRegion}`) || sanitizedCity === 'Unknown') {
      sanitizedCity = 'Denpasar';
      sanitizedRegion = 'Bali';
    }
  }

  const result = { city: sanitizedCity, country: fallback.country, region: sanitizedRegion };
  geoCache.set(ip, { ...result, expires: now + 60 * 60 * 1000 });
  return result;
}

// Register visitor analytics API routes onto Hono instance.
export function registerAnalyticsApi(app: Hono<HonoEnv>) {

  // Handler to initialize a new visitor session
  const handleSessionInit = async (c: Context) => {
    // Strictly drop automated bots, serverless healthchecks, and crawlers
    if (isBotOrCrawler(c)) {
      return c.json(result.ok({ sessionId: '', ignored: true }));
    }

    const body = await c.req.json<InitVisitorSessionBo>().catch(() => ({} as InitVisitorSessionBo));
    const visitorId = getOrCreateVisitorId(c);
    const rawMeta = extractVisitorMeta(c);

    // Accurately resolve city & region (e.g. Denpasar, Bali for XL Axiata)
    const accurateGeo = await resolveAccurateGeo(rawMeta.ip, {
      city: rawMeta.city,
      country: rawMeta.country,
      region: rawMeta.region,
    });

    // Drop datacenter / serverless probe traffic
    if (accurateGeo.isDatacenter) {
      return c.json(result.ok({ sessionId: '', ignored: true }));
    }

    const meta = {
      ip: rawMeta.ip,
      city: accurateGeo.city,
      country: accurateGeo.country,
      region: accurateGeo.region,
    };

    // Authoritative device, OS, and browser detection
    const ua = c.req.header('user-agent') || '';
    const parsedUa = parseUserAgent(ua);

    // 1. Device detection
    let device: 'Desktop' | 'Mobile' | 'Tablet' =
      parsedUa.deviceType === 'mobile' ? 'Mobile' : parsedUa.deviceType === 'tablet' ? 'Tablet' : 'Desktop';
    if (body.device && (body.device === 'Mobile' || body.device === 'Tablet' || body.device === 'Desktop')) {
      if (parsedUa.os === 'macOS' || parsedUa.os === 'Windows') {
        device = 'Desktop';
      } else {
        device = body.device as 'Desktop' | 'Mobile' | 'Tablet';
      }
    }

    // 2. OS detection
    let os = parsedUa.os;
    if (body.os && body.os !== 'Unknown' && body.os !== 'Other') {
      if (parsedUa.os === 'macOS' || parsedUa.os === 'Windows') {
        os = parsedUa.os;
      } else {
        os = body.os;
      }
    }

    // 3. Browser detection (Client can detect Brave via navigator.brave, server detects others via User-Agent)
    let browser = 'Other';
    if (body.browser === 'Brave' || /brave/i.test(ua)) {
      browser = 'Brave';
    } else if (
      (parsedUa.os === 'Android' || os === 'Android') &&
      (/samsungbrowser|sbrowser/i.test(ua) ||
        (/sm-[a-z0-9]+/i.test(ua) && !/firefox|opr|edge/i.test(ua) && /version\/[0-9.]+/i.test(ua)) ||
        body.browser === 'Samsung Internet')
    ) {
      browser = 'Samsung Internet';
    } else if (parsedUa.browser && parsedUa.browser !== 'Other') {
      browser = parsedUa.browser;
    } else if (body.browser && body.browser !== 'Other') {
      browser = body.browser;
    }

    const data = await analyticsService.initSession(
      {
        ...body,
        device,
        os,
        browser,
        visitorId,
      },
      {
        ...meta,
        isAdmin: false,
      }
    );

    return c.json(result.ok(data));
  };

  // Handler for periodic heartbeat ping and duration update
  const handleSessionPing = async (c: Context) => {
    const body = await c.req.json<HeartbeatBo>().catch(() => ({} as HeartbeatBo));
    if (!body.sessionId) {
      return c.json(result.ok({ updated: false }));
    }

    const updated = await analyticsService.heartbeat(body, false);
    return c.json(result.ok({ updated }));
  };

  // Handler to update session with visitor's consented device GPS location
  const handleSessionLocation = async (c: Context) => {
    const body = await c.req.json<UpdateVisitorLocationBo>().catch(() => ({} as UpdateVisitorLocationBo));

    const lat = typeof body.latitude === 'number' ? body.latitude : parseFloat(String(body.latitude));
    const lng = typeof body.longitude === 'number' ? body.longitude : parseFloat(String(body.longitude));

    if (
      !body.sessionId ||
      (!body.isRevoked && (isNaN(lat) || isNaN(lng)))
    ) {
      return c.json(result.ok({ updated: false }));
    }

    const updated = await analyticsService.updateLocation(
      {
        ...body,
        latitude: isNaN(lat) ? null : lat,
        longitude: isNaN(lng) ? null : lng,
      },
      false
    );
    return c.json(result.ok({ updated }));
  };

  // Handler to track media view or interaction within a session
  const handleMediaTrack = async (c: Context) => {
    const body = await c.req.json<TrackMediaBo>().catch(() => ({} as TrackMediaBo));
    if (!body.photoId) {
      return c.json(result.ok({ tracked: false }));
    }

    const tracked = await analyticsService.trackMedia(body, false);
    return c.json(result.ok({ tracked }));
  };

  // Dual route registration: both /analytics/session/* and /telemetry/session/* (bypasses adblockers/Brave Shields)
  app.post('/analytics/session/init', handleSessionInit);
  app.post('/telemetry/session/init', handleSessionInit);

  app.post('/analytics/session/ping', handleSessionPing);
  app.post('/telemetry/session/ping', handleSessionPing);

  app.post('/analytics/session/location', handleSessionLocation);
  app.post('/telemetry/session/location', handleSessionLocation);

  app.post('/analytics/media/track', handleMediaTrack);
  app.post('/telemetry/media/track', handleMediaTrack);

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

  // Admin-only endpoint to completely wipe visitor telemetry history
  app.post('/analytics/reset', async (c: Context) => {
    const isAdmin = await checkIsAdmin(c);
    if (!isAdmin) {
      throw new BizError('auth.failed', 403);
    }

    await analyticsService.resetAnalytics();
    return c.json(result.ok(true));
  });
}

