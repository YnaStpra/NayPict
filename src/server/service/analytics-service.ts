import { and, avg, count, countDistinct, desc, eq, gte, ilike, inArray, or, sql } from 'drizzle-orm';
import { neon } from '@neondatabase/serverless';
import { createId } from '@/server/lib/id';
import { orm, readOrm } from '@/server/infra/db';
import { visitorActivityTab, visitorSessionTab } from '@/server/entity/analytics';
import { photoTab } from '@/server/entity/photo';
import { fileTab } from '@/server/entity/file';
import { storageTab } from '@/server/entity/storage';
import { buildThumbnailKey } from '@/server/lib/photo-path';
import { toMediaUrl } from '@/lib/url';
import { insightsService } from '@/server/service/insights-service';
import {
  type HeartbeatBo,
  type InitVisitorSessionBo,
  type TrackMediaBo,
  type VisitorSessionsQueryBo,
} from '@/server/entity/bo/analytics';
import {
  type AnalyticsDistributionVo,
  type AnalyticsOverviewVo,
  type VisitorActivityItemVo,
  type VisitorSessionDetailVo,
  type VisitorSessionsListVo,
  type VisitorSessionVo,
} from '@/server/entity/vo/analytics';

// This module manages visitor sessions, real-time duration tracking, geo-ip telemetry, and media access histories.

// Live activity threshold in minutes for considering a visitor currently online.
const LIVE_THRESHOLD_MINUTES = 5;

let tablesEnsured = false;

// Ensure visitor_session and visitor_activity tables exist before any analytics operations.
async function ensureAnalyticsTables(): Promise<void> {
  if (tablesEnsured || !process.env.DATABASE_URL) return;
  try {
    const rawSql = neon(process.env.DATABASE_URL);
    await rawSql`
      CREATE TABLE IF NOT EXISTS "visitor_session" (
        "id" text PRIMARY KEY NOT NULL,
        "visitor_id" text NOT NULL,
        "ip" text DEFAULT '' NOT NULL,
        "country" text DEFAULT '' NOT NULL,
        "city" text DEFAULT '' NOT NULL,
        "region" text DEFAULT '' NOT NULL,
        "browser" text DEFAULT '' NOT NULL,
        "browser_version" text DEFAULT '' NOT NULL,
        "os" text DEFAULT '' NOT NULL,
        "device" text DEFAULT 'Desktop' NOT NULL,
        "referrer" text DEFAULT 'Direct' NOT NULL,
        "landing_path" text DEFAULT '/' NOT NULL,
        "started_at" timestamptz DEFAULT now() NOT NULL,
        "last_active_at" timestamptz DEFAULT now() NOT NULL,
        "duration_seconds" integer DEFAULT 0 NOT NULL,
        "media_count" integer DEFAULT 0 NOT NULL,
        "is_admin" integer DEFAULT 0 NOT NULL
      );
    `;
    await rawSql`CREATE INDEX IF NOT EXISTS "visitor_session_started_at_idx" ON "visitor_session" ("started_at");`;
    await rawSql`CREATE INDEX IF NOT EXISTS "visitor_session_last_active_idx" ON "visitor_session" ("last_active_at");`;
    await rawSql`CREATE INDEX IF NOT EXISTS "visitor_session_visitor_id_idx" ON "visitor_session" ("visitor_id");`;
    await rawSql`CREATE INDEX IF NOT EXISTS "visitor_session_ip_idx" ON "visitor_session" ("ip");`;

    await rawSql`
      CREATE TABLE IF NOT EXISTS "visitor_activity" (
        "id" text PRIMARY KEY NOT NULL,
        "session_id" text NOT NULL REFERENCES "visitor_session"("id") ON DELETE CASCADE,
        "photo_id" text NOT NULL REFERENCES "photo"("photo_id") ON DELETE CASCADE,
        "action" text DEFAULT 'view' NOT NULL,
        "created_at" timestamptz DEFAULT now() NOT NULL
      );
    `;
    await rawSql`CREATE INDEX IF NOT EXISTS "visitor_activity_session_id_idx" ON "visitor_activity" ("session_id");`;
    await rawSql`CREATE INDEX IF NOT EXISTS "visitor_activity_photo_id_idx" ON "visitor_activity" ("photo_id");`;
    tablesEnsured = true;
  } catch (err) {
    console.warn('[ANALYTICS] Failed to ensure analytics tables:', err);
  }
}

const analyticsService = {

  // Initialize a new visitor session with geolocation headers and client telemetry.
  async initSession(
    params: InitVisitorSessionBo,
    meta: { ip: string; country: string; city: string; region: string; isAdmin: boolean }
  ): Promise<{ sessionId: string }> {
    // Strictly exclude administrators from visitor tracking entirely
    if (meta.isAdmin) {
      return { sessionId: '' };
    }

    await ensureAnalyticsTables();
    const sessionId = createId();

    const cleanIp = (meta.ip || 'Unknown').split(',')[0].trim();
    const cleanCountry = (meta.country || '').trim().toUpperCase() || 'Unknown';
    const cleanCity = (meta.city || '').trim() || 'Unknown';
    const cleanRegion = (meta.region || '').trim() || 'Unknown';

    // Normalize referrer domain or source
    let cleanReferrer = (params.referrer || '').trim();
    if (!cleanReferrer || cleanReferrer === 'null' || cleanReferrer === 'undefined') {
      cleanReferrer = 'Direct';
    } else {
      try {
        const parsedUrl = new URL(cleanReferrer);
        cleanReferrer = parsedUrl.hostname.replace(/^www\./, '');
      } catch {
        // Keep as-is if not a valid full URL
      }
    }

    await orm.insert(visitorSessionTab).values({
      id: sessionId,
      visitorId: params.visitorId || createId(),
      ip: cleanIp,
      country: cleanCountry,
      city: cleanCity,
      region: cleanRegion,
      browser: params.browser || 'Unknown',
      browserVersion: params.browserVersion || '',
      os: params.os || 'Unknown',
      device: params.device || 'Desktop',
      referrer: cleanReferrer,
      landingPath: params.landingPath || '/',
      durationSeconds: 0,
      mediaCount: 0,
      isAdmin: 0,
    });


    return { sessionId };
  },

  // Update session duration and last active timestamp via lightweight heartbeat ping.
  async heartbeat(params: HeartbeatBo, isAdmin: boolean): Promise<boolean> {
    if (!params.sessionId || isAdmin) {
      return false;
    }

    const safeDuration = Math.max(0, Math.min(params.durationSeconds || 0, 86400));

    await orm
      .update(visitorSessionTab)
      .set({
        lastActiveAt: sql`now()`,
        durationSeconds: safeDuration,
      })
      .where(eq(visitorSessionTab.id, params.sessionId));

    return true;
  },

  // Track media viewed or interacted with by visitor during session.
  async trackMedia(params: TrackMediaBo, isAdmin: boolean): Promise<boolean> {
    if (!params.photoId || isAdmin) {
      return false;
    }

    const action = params.action || 'view';

    if (params.sessionId) {
      await orm.insert(visitorActivityTab).values({
        id: createId(),
        sessionId: params.sessionId,
        photoId: params.photoId,
        action,
        createdAt: sql`now()`,
      });

      await orm
        .update(visitorSessionTab)
        .set({
          mediaCount: sql`${visitorSessionTab.mediaCount} + 1`,
          lastActiveAt: sql`now()`,
        })
        .where(eq(visitorSessionTab.id, params.sessionId));
    }


    // Synchronize event with insights service (excluding reactions which have dedicated counter)
    if (action === 'view' || action === 'download' || action === 'share') {
      try {
        await insightsService.recordEvent(
          { photoId: params.photoId, type: action },
          params.sessionId || 'guest',
          false
        );
      } catch (err) {
        console.warn('[ANALYTICS] insights sync error:', err);
      }
    }


    return true;
  },

  // Compute aggregate overview metrics, top devices, browsers, and country distributions.
  async getOverview(): Promise<AnalyticsOverviewVo> {
    await ensureAnalyticsTables();
    const liveThresholdIso = new Date(Date.now() - LIVE_THRESHOLD_MINUTES * 60 * 1000).toISOString();


    // 1. Total sessions and unique visitors
    const [counts] = await readOrm
      .select({
        totalSessions: count(),
        totalVisitors: countDistinct(visitorSessionTab.visitorId),
        avgDuration: avg(visitorSessionTab.durationSeconds),
      })
      .from(visitorSessionTab)
      .where(eq(visitorSessionTab.isAdmin, 0));

    // 2. Active now visitors
    const [live] = await readOrm
      .select({ liveCount: countDistinct(visitorSessionTab.visitorId) })
      .from(visitorSessionTab)
      .where(
        and(
          eq(visitorSessionTab.isAdmin, 0),
          gte(visitorSessionTab.lastActiveAt, liveThresholdIso)
        )
      );

    // 3. Total media interactions
    const [mediaInteractions] = await readOrm
      .select({ total: count() })
      .from(visitorActivityTab);

    const totalSessionsNum = counts?.totalSessions || 0;

    // Helper for computing distribution percentage
    const calcDist = (rows: Array<{ name: string; cnt: number }>): AnalyticsDistributionVo[] => {
      return rows.map((r) => ({
        name: r.name || 'Unknown',
        count: Number(r.cnt) || 0,
        percentage: totalSessionsNum > 0 ? Math.round((Number(r.cnt) / totalSessionsNum) * 100) : 0,
      }));
    };

    // 4. Top Browsers
    const browserRows = await readOrm
      .select({ name: visitorSessionTab.browser, cnt: count() })
      .from(visitorSessionTab)
      .where(eq(visitorSessionTab.isAdmin, 0))
      .groupBy(visitorSessionTab.browser)
      .orderBy(desc(count()))
      .limit(5);

    // 5. Top Devices
    const deviceRows = await readOrm
      .select({ name: visitorSessionTab.device, cnt: count() })
      .from(visitorSessionTab)
      .where(eq(visitorSessionTab.isAdmin, 0))
      .groupBy(visitorSessionTab.device)
      .orderBy(desc(count()))
      .limit(5);

    // 6. Top Countries
    const countryRows = await readOrm
      .select({ name: visitorSessionTab.country, cnt: count() })
      .from(visitorSessionTab)
      .where(eq(visitorSessionTab.isAdmin, 0))
      .groupBy(visitorSessionTab.country)
      .orderBy(desc(count()))
      .limit(5);

    // 7. Top Referrers
    const referrerRows = await readOrm
      .select({ name: visitorSessionTab.referrer, cnt: count() })
      .from(visitorSessionTab)
      .where(eq(visitorSessionTab.isAdmin, 0))
      .groupBy(visitorSessionTab.referrer)
      .orderBy(desc(count()))
      .limit(5);

    return {
      totalVisitors: counts?.totalVisitors || 0,
      totalSessions: totalSessionsNum,
      liveVisitors: live?.liveCount || 0,
      avgDurationSeconds: Math.round(Number(counts?.avgDuration) || 0),
      totalMediaInteractions: mediaInteractions?.total || 0,
      topBrowsers: calcDist(browserRows),
      topDevices: calcDist(deviceRows),
      topCountries: calcDist(countryRows).map((c) => ({ ...c, code: c.name })),
      topReferrers: calcDist(referrerRows),
    };
  },

  // Query paginated list of visitor sessions with optional filtering.
  async getSessions(params: VisitorSessionsQueryBo): Promise<VisitorSessionsListVo> {
    await ensureAnalyticsTables();
    const page = Math.max(1, params.page || 1);

    const pageSize = Math.max(1, Math.min(params.pageSize || 20, 100));
    const offset = (page - 1) * pageSize;

    const conditions = [eq(visitorSessionTab.isAdmin, 0)];

    if (params.device) {
      conditions.push(eq(visitorSessionTab.device, params.device));
    }
    if (params.browser) {
      conditions.push(eq(visitorSessionTab.browser, params.browser));
    }
    if (params.country) {
      conditions.push(eq(visitorSessionTab.country, params.country.toUpperCase()));
    }
    if (params.search?.trim()) {
      const q = `%${params.search.trim()}%`;
      conditions.push(
        or(
          ilike(visitorSessionTab.ip, q),
          ilike(visitorSessionTab.city, q),
          ilike(visitorSessionTab.country, q),
          ilike(visitorSessionTab.referrer, q)
        )!
      );
    }

    const whereClause = and(...conditions);

    const [totalRow] = await readOrm
      .select({ total: count() })
      .from(visitorSessionTab)
      .where(whereClause);

    const total = totalRow?.total || 0;

    const rows = await readOrm
      .select()
      .from(visitorSessionTab)
      .where(whereClause)
      .orderBy(desc(visitorSessionTab.startedAt))
      .limit(pageSize)
      .offset(offset);

    const items: VisitorSessionVo[] = rows.map((r) => ({
      id: r.id,
      visitorId: r.visitorId,
      ip: r.ip,
      country: r.country,
      city: r.city,
      region: r.region,
      browser: r.browser,
      browserVersion: r.browserVersion,
      os: r.os,
      device: r.device,
      referrer: r.referrer,
      landingPath: r.landingPath,
      startedAt: r.startedAt,
      lastActiveAt: r.lastActiveAt,
      durationSeconds: r.durationSeconds,
      mediaCount: r.mediaCount,
    }));

    return {
      items,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  },

  // Inspect specific visitor session and retrieve chronological media view activity.
  async getSessionDetail(sessionId: string): Promise<VisitorSessionDetailVo | null> {
    await ensureAnalyticsTables();
    const [session] = await readOrm
      .select()
      .from(visitorSessionTab)
      .where(eq(visitorSessionTab.id, sessionId))
      .limit(1);


    if (!session) {
      return null;
    }

    // Fetch activities for this session
    const activityRows = await readOrm
      .select({
        id: visitorActivityTab.id,
        photoId: visitorActivityTab.photoId,
        action: visitorActivityTab.action,
        createdAt: visitorActivityTab.createdAt,
        photoTitle: photoTab.name,
        storageId: photoTab.storageId,
        checksum: photoTab.checksum,
      })
      .from(visitorActivityTab)
      .innerJoin(photoTab, eq(visitorActivityTab.photoId, photoTab.photoId))
      .where(eq(visitorActivityTab.sessionId, sessionId))
      .orderBy(desc(visitorActivityTab.createdAt));

    // Resolve storage domains and file keys
    const storageIds = Array.from(
      new Set(activityRows.map((a) => a.storageId).filter(Boolean) as string[])
    );
    const storageMap = new Map<string, string | null>();

    if (storageIds.length > 0) {
      const sRows = await readOrm
        .select({ storageId: storageTab.storageId, domain: storageTab.domain })
        .from(storageTab)
        .where(inArray(storageTab.storageId, storageIds));
      for (const s of sRows) {
        storageMap.set(s.storageId, s.domain);
      }
    }

    const photoIds = Array.from(new Set(activityRows.map((a) => a.photoId)));
    const fileThumbnailMap = new Map<string, string>();

    if (photoIds.length > 0) {
      const fileRows = await readOrm
        .select({ photoId: fileTab.photoId, key: fileTab.key, type: fileTab.type })
        .from(fileTab)
        .where(inArray(fileTab.photoId, photoIds));

      for (const f of fileRows) {
        if (f.type === 2) {
          fileThumbnailMap.set(f.photoId, f.key);
        }
      }
    }

    const activities: VisitorActivityItemVo[] = activityRows.map((a) => {
      const storageDomain = a.storageId ? storageMap.get(a.storageId) ?? null : null;
      let thumbnail = '';

      const thumbKey = fileThumbnailMap.get(a.photoId);
      if (thumbKey) {
        thumbnail = toMediaUrl(thumbKey, storageDomain);
      } else if (a.checksum) {
        const generatedKey = buildThumbnailKey(a.checksum, a.photoId);
        thumbnail = toMediaUrl(generatedKey, storageDomain);
      }


      return {
        id: a.id,
        photoId: a.photoId,
        photoTitle: a.photoTitle || 'Untitled Media',
        thumbnail,
        action: a.action,
        createdAt: a.createdAt,
      };
    });

    const sessionVo: VisitorSessionVo = {
      id: session.id,
      visitorId: session.visitorId,
      ip: session.ip,
      country: session.country,
      city: session.city,
      region: session.region,
      browser: session.browser,
      browserVersion: session.browserVersion,
      os: session.os,
      device: session.device,
      referrer: session.referrer,
      landingPath: session.landingPath,
      startedAt: session.startedAt,
      lastActiveAt: session.lastActiveAt,
      durationSeconds: session.durationSeconds,
      mediaCount: session.mediaCount,
    };

    return {
      session: sessionVo,
      activities,
    };
  },
};

export { analyticsService };
