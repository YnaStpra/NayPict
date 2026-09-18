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
import {
  isCityCountryMismatch,
  normalizeRegionName,
  sanitizeGeoRecord,
} from '@/server/lib/geo-normalizer';
import { getClientIp, isPublicIp } from '@/server/lib/ip';
import {
  telemetryInitRateLimiter,
  telemetryLocationRateLimiter,
  telemetryPingRateLimiter,
  telemetryTrackRateLimiter,
} from '@/server/lib/rate-limiter';

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

// Extract visitor IP and geographical metadata from Cloudflare and Vercel edge headers.
function extractVisitorMeta(c: Context) {
  const ip = getClientIp(c);

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

  // Normalize region name using province / state code dictionaries
  region = normalizeRegionName(country, region, rawRegionCode);

  // Eliminate obvious edge GeoIP mismatches (e.g. Amsterdam in China, Paris in Indonesia)
  if (isCityCountryMismatch(country, city)) {
    city = 'Unknown';
  }

  // Edge GeoIP sanitization for Indonesia
  if (country === 'ID') {
    if (city === 'Unknown' || /paris|singapore|london|frankfurt|amsterdam|ashburn/i.test(city)) {
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

  const sanitized = sanitizeGeoRecord({ country, city, region });
  return { ip, ...sanitized };
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

// High-precision geolocation lookup to resolve authoritative city, region, country, and identify hosting bots
async function resolveAccurateGeo(
  ip: string,
  fallback: { city: string; country: string; region: string }
): Promise<{ city: string; country: string; region: string; isDatacenter?: boolean }> {
  // Strictly prevent SSRF, private network probing, and cloud metadata queries
  if (!isPublicIp(ip)) {
    return sanitizeGeoRecord(fallback);
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

  // Provider 1: ipwho.is (authoritative GeoIP database with ASN & ISP detection)
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);
    const res = await fetch(`https://ipwho.is/${encodeURIComponent(ip)}`, {
      signal: controller.signal,
      headers: { 'User-Agent': 'NayPict-Geo/1.0' },
    });
    clearTimeout(timeout);

    if (res.ok) {
      const data = await res.json();
      if (data && data.success) {
        const isDc = isDatacenterOrHosting(data.connection?.isp, data.connection?.org);
        const rawCountry = (data.country_code || fallback.country || 'Unknown').trim().toUpperCase();
        const rawCity = (data.city || fallback.city || 'Unknown').trim();
        const rawRegion = normalizeRegionName(rawCountry, data.region || fallback.region, data.region_code);

        const sanitized = sanitizeGeoRecord({
          city: rawCity,
          country: rawCountry,
          region: rawRegion,
        });

        // Specific Indonesian carrier calibration (Denpasar -> Bali)
        if (sanitized.country === 'ID') {
          if (sanitized.city === 'Denpasar' || data.region_code === 'BA') {
            sanitized.region = 'Bali';
          }
        }

        const result = { ...sanitized, isDatacenter: isDc };
        geoCache.set(ip, { ...result, expires: now + 24 * 60 * 60 * 1000 });
        return result;
      }
    }
  } catch {}

  // Provider 2: ip-api.com fallback
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);
    const res = await fetch(`http://ip-api.com/json/${encodeURIComponent(ip)}`, {
      signal: controller.signal,
      headers: { 'User-Agent': 'NayPict-Geo/1.0' },
    });
    clearTimeout(timeout);

    if (res.ok) {
      const data = await res.json();
      if (data && data.status === 'success') {
        const isDc = isDatacenterOrHosting(data.isp, data.org);
        const rawCountry = (data.countryCode || fallback.country || 'Unknown').trim().toUpperCase();
        const rawCity = (data.city || fallback.city || 'Unknown').trim();
        const rawRegion = normalizeRegionName(rawCountry, data.regionName || fallback.region, data.region);

        const sanitized = sanitizeGeoRecord({
          city: rawCity,
          country: rawCountry,
          region: rawRegion,
        });

        if (sanitized.country === 'ID') {
          if (sanitized.city === 'Denpasar' || data.region === 'BA') {
            sanitized.region = 'Bali';
          }
        }

        const result = { ...sanitized, isDatacenter: isDc };
        geoCache.set(ip, { ...result, expires: now + 24 * 60 * 60 * 1000 });
        return result;
      }
    }
  } catch {}

  // Fully sanitized fallback
  const sanitized = sanitizeGeoRecord(fallback);
  if (sanitized.country === 'ID' && (sanitized.city === 'Unknown' || /paris|idf/i.test(sanitized.city))) {
    sanitized.city = 'Denpasar';
    sanitized.region = 'Bali';
  }

  const result = { ...sanitized };
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

    const clientIp = getClientIp(c);
    const rateLimit = await telemetryInitRateLimiter.consume(clientIp);
    if (!rateLimit.allowed) {
      return c.json(result.fail('Too many requests.', 429), 429);
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
        os = String(body.os).slice(0, 64);
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
      browser = String(body.browser).slice(0, 64);
    }

    // Sanitize and validate GPS coordinates if supplied
    let userLat = '';
    let userLng = '';
    if (body.userLat && body.userLng) {
      const nLat = Number(body.userLat);
      const nLng = Number(body.userLng);
      if (
        !isNaN(nLat) &&
        !isNaN(nLng) &&
        isFinite(nLat) &&
        isFinite(nLng) &&
        nLat >= -90 &&
        nLat <= 90 &&
        nLng >= -180 &&
        nLng <= 180
      ) {
        userLat = String(nLat);
        userLng = String(nLng);
      }
    }

    const isAdmin = await checkIsAdmin(c);

    const data = await analyticsService.initSession(
      {
        ...body,
        referrer: typeof body.referrer === 'string' ? body.referrer.slice(0, 255) : '',
        landingPath: typeof body.landingPath === 'string' ? body.landingPath.slice(0, 255) : '/',
        browserVersion: typeof body.browserVersion === 'string' ? body.browserVersion.slice(0, 32) : '',
        userLocationName: typeof body.userLocationName === 'string' ? body.userLocationName.slice(0, 255) : '',
        userLat,
        userLng,
        device,
        os,
        browser,
        visitorId,
      },
      {
        ...meta,
        isAdmin,
      }
    );

    return c.json(result.ok(data));
  };

  // Handler for periodic heartbeat ping and duration update
  const handleSessionPing = async (c: Context) => {
    const clientIp = getClientIp(c);
    const rateLimit = await telemetryPingRateLimiter.consume(clientIp);
    if (!rateLimit.allowed) {
      return c.json(result.ok({ updated: false }));
    }

    const body = await c.req.json<HeartbeatBo>().catch(() => ({} as HeartbeatBo));
    if (!body.sessionId || typeof body.sessionId !== 'string' || body.sessionId.length > 64) {
      return c.json(result.ok({ updated: false }));
    }

    const updated = await analyticsService.heartbeat(
      {
        ...body,
        sessionId: body.sessionId.slice(0, 64),
        durationSeconds: Math.max(0, Math.min(Number(body.durationSeconds) || 0, 86400)),
      },
      false
    );
    return c.json(result.ok({ updated }));
  };

  // Handler to update session with visitor's consented device GPS location
  const handleSessionLocation = async (c: Context) => {
    const clientIp = getClientIp(c);
    const rateLimit = await telemetryLocationRateLimiter.consume(clientIp);
    if (!rateLimit.allowed) {
      return c.json(result.ok({ updated: false }));
    }

    const body = await c.req.json<UpdateVisitorLocationBo>().catch(() => ({} as UpdateVisitorLocationBo));

    if (!body.sessionId || typeof body.sessionId !== 'string' || body.sessionId.length > 64) {
      return c.json(result.ok({ updated: false }));
    }

    const lat = typeof body.latitude === 'number' ? body.latitude : parseFloat(String(body.latitude));
    const lng = typeof body.longitude === 'number' ? body.longitude : parseFloat(String(body.longitude));

    if (
      !body.isRevoked &&
      (isNaN(lat) ||
        isNaN(lng) ||
        !isFinite(lat) ||
        !isFinite(lng) ||
        lat < -90 ||
        lat > 90 ||
        lng < -180 ||
        lng > 180)
    ) {
      return c.json(result.ok({ updated: false }));
    }

    const updated = await analyticsService.updateLocation(
      {
        ...body,
        sessionId: body.sessionId.slice(0, 64),
        locationName: typeof body.locationName === 'string' ? body.locationName.slice(0, 255) : '',
        latitude: isNaN(lat) || !isFinite(lat) ? null : lat,
        longitude: isNaN(lng) || !isFinite(lng) ? null : lng,
      },
      false
    );
    return c.json(result.ok({ updated }));
  };

  // Handler to track media view or interaction within a session
  const handleMediaTrack = async (c: Context) => {
    const clientIp = getClientIp(c);
    const rateLimit = await telemetryTrackRateLimiter.consume(clientIp);
    if (!rateLimit.allowed) {
      return c.json(result.ok({ tracked: false }));
    }

    const body = await c.req.json<TrackMediaBo>().catch(() => ({} as TrackMediaBo));
    if (!body.photoId || typeof body.photoId !== 'string' || body.photoId.length > 64) {
      return c.json(result.ok({ tracked: false }));
    }

    const validActions = ['view', 'download', 'share', 'reaction'];
    const safeAction = body.action && validActions.includes(body.action) ? body.action : 'view';
    const isAdmin = await checkIsAdmin(c);

    const tracked = await analyticsService.trackMedia(
      {
        ...body,
        photoId: body.photoId.slice(0, 64),
        sessionId: typeof body.sessionId === 'string' ? body.sessionId.slice(0, 64) : undefined,
        action: safeAction as 'view' | 'download' | 'share' | 'reaction',
      },
      isAdmin
    );
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
      role: query.role,
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

