import { eq } from 'drizzle-orm';
import { userTab } from '@/server/entity/user';
import { orm } from '@/server/infra/db';
import { cache } from '@/server/infra/cache';
import { AUTH_CACHE_KEY } from '@/server/const/cache';
import { AUTH_CACHE_TTL } from '@/server/const/global';
import { type AuthInfo, type SessionMeta } from '@/server/entity/vo/auth';
import { type ActiveSessionVo } from '@/server/entity/vo/session';
import { parseUserAgent } from '@/server/lib/user-agent';

// This module manages user sessions, device activity tracking, and multi-device revocation.

const sessionService = {
  // Read the current persisted token version for a user.
  async getTokenVersion(userId: string): Promise<number | null> {
    const [user] = await orm
      .select({ tokenVersion: userTab.tokenVersion })
      .from(userTab)
      .where(eq(userTab.userId, userId))
      .limit(1);

    return user?.tokenVersion ?? null;
  },

  // Query all active device sessions for a user, highlighting the current caller session.
  async listActiveSessions(userId: string, currentUuid?: string): Promise<ActiveSessionVo[]> {
    const authInfo = await cache.get<AuthInfo>(AUTH_CACHE_KEY + userId);
    if (!authInfo || !authInfo.uuidList || authInfo.uuidList.length === 0) {
      return [];
    }

    const sessionsMap = new Map<string, SessionMeta>();
    if (authInfo.sessions) {
      for (const s of authInfo.sessions) {
        sessionsMap.set(s.uuid, s);
      }
    }

    // Map each valid UUID in uuidList to an ActiveSessionVo
    return authInfo.uuidList.map((uuid) => {
      const meta = sessionsMap.get(uuid);
      const isCurrent = uuid === currentUuid;

      if (meta) {
        return {
          uuid: meta.uuid,
          ip: meta.ip,
          userAgent: meta.userAgent,
          deviceLabel: meta.deviceLabel,
          deviceType: meta.deviceType,
          createdAt: meta.createdAt,
          lastActive: meta.lastActive,
          isCurrent,
        };
      }

      // Fallback for legacy UUIDs without full metadata
      const fallbackUa = parseUserAgent(null);
      return {
        uuid,
        ip: 'Unknown IP',
        userAgent: 'Web Browser',
        deviceLabel: isCurrent ? 'This Device (Active)' : fallbackUa.label,
        deviceType: fallbackUa.deviceType,
        createdAt: Date.now(),
        lastActive: Date.now(),
        isCurrent,
      };
    }).sort((a, b) => (b.isCurrent ? 1 : 0) - (a.isCurrent ? 1 : 0));
  },

  // Revoke a specific active device session by its UUID.
  async revokeSession(userId: string, targetUuid: string): Promise<boolean> {
    const authInfo = await cache.get<AuthInfo>(AUTH_CACHE_KEY + userId);
    if (!authInfo) {
      return false;
    }

    const updatedUuidList = authInfo.uuidList.filter((id) => id !== targetUuid);
    const updatedSessions = (authInfo.sessions || []).filter((s) => s.uuid !== targetUuid);

    const updatedAuthInfo: AuthInfo = {
      ...authInfo,
      uuidList: updatedUuidList,
      sessions: updatedSessions,
    };

    await cache.set(AUTH_CACHE_KEY + userId, updatedAuthInfo, { ttl: AUTH_CACHE_TTL });
    return true;
  },

  // Revoke all other device sessions except the caller's current session.
  async revokeOtherSessions(userId: string, currentUuid: string): Promise<boolean> {
    const authInfo = await cache.get<AuthInfo>(AUTH_CACHE_KEY + userId);
    if (!authInfo) {
      return false;
    }

    const updatedUuidList = authInfo.uuidList.filter((id) => id === currentUuid);
    const updatedSessions = (authInfo.sessions || []).filter((s) => s.uuid === currentUuid);

    const updatedAuthInfo: AuthInfo = {
      ...authInfo,
      uuidList: updatedUuidList,
      sessions: updatedSessions,
    };

    await cache.set(AUTH_CACHE_KEY + userId, updatedAuthInfo, { ttl: AUTH_CACHE_TTL });
    return true;
  },

  // Periodically update the last active timestamp of a session (throttled).
  async touchSession(userId: string, currentUuid: string, ip?: string): Promise<void> {
    const authInfo = await cache.get<AuthInfo>(AUTH_CACHE_KEY + userId);
    if (!authInfo || !authInfo.sessions) {
      return;
    }

    const session = authInfo.sessions.find((s) => s.uuid === currentUuid);
    const now = Date.now();

    // Only update if at least 60 seconds have passed since last touch
    if (session && now - session.lastActive > 60000) {
      session.lastActive = now;
      if (ip && ip !== 'unknown') {
        session.ip = ip;
      }
      await cache.set(AUTH_CACHE_KEY + userId, authInfo, { ttl: AUTH_CACHE_TTL });
    }
  },
};

export { sessionService };
