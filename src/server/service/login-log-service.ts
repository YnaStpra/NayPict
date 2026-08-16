import { and, desc, eq, inArray } from 'drizzle-orm';
import { AUTH_CACHE_KEY } from '@/server/const/cache';
import { AUTH_CACHE_TTL } from '@/server/const/global';
import { loginLogTab } from '@/server/entity/login-log';
import { type RecordLoginLogBo } from '@/server/entity/bo/login-log';
import { type AuthInfo } from '@/server/entity/vo/auth';
import { type ActiveSessionVo, type LoginLogItemVo } from '@/server/entity/vo/login-log';
import BizError from '@/server/error/biz-error';
import { cache } from '@/server/infra/cache';
import { orm } from '@/server/infra/db';
import { createId } from '@/server/lib/id';

// This module handles logging of login history and active session management operations.

const loginLogService = {

  // Record a new login event into database audit log.
  async recordLog(params: RecordLoginLogBo): Promise<void> {
    try {
      const logId = createId();
      await orm.insert(loginLogTab).values({
        logId,
        userId: params.userId,
        username: params.username,
        uuid: params.uuid,
        ip: params.ip,
        location: params.location,
        device: params.device,
        browser: params.browser,
        os: params.os,
        userAgent: params.userAgent,
        status: params.status,
        isRevoked: 0,
        loginTime: new Date().toISOString(),
      });
    } catch (err) {
      console.warn("[loginLogService] Failed to record login log:", err);
    }
  },

  // List all currently active login sessions for user.
  async getActiveSessions(currentUuid: string | null, userId: string): Promise<ActiveSessionVo[]> {
    try {
      const authInfo = await cache.get<AuthInfo>(AUTH_CACHE_KEY + userId);
      if (!authInfo || !authInfo.uuidList || !authInfo.uuidList.length) {
        return [];
      }

      // Limit active UUIDs to maximum 10 most recent to keep SQL query fast and prevent parameter overflow
      const activeUuids = authInfo.uuidList.slice(-10);
      if (!activeUuids.length) return [];

      const rows = await orm
        .select()
        .from(loginLogTab)
        .where(and(
          eq(loginLogTab.userId, userId),
          eq(loginLogTab.isRevoked, 0),
          inArray(loginLogTab.uuid, activeUuids)
        ))
        .orderBy(desc(loginLogTab.loginTime));

      return rows.map((row) => ({
        logId: row.logId,
        uuid: row.uuid,
        ip: row.ip,
        location: row.location,
        device: row.device,
        browser: row.browser,
        os: row.os,
        loginTime: row.loginTime,
        isCurrent: currentUuid ? row.uuid === currentUuid : false,
      }));
    } catch (err) {
      console.warn("[loginLogService] Failed to get active sessions:", err);
      return [];
    }
  },

  // Revoke/logout a specific active login session by UUID.
  async revokeSession(uuid: string, userId: string): Promise<void> {
    if (!uuid || !userId) {
      throw new BizError('login.sessionInvalid');
    }

    try {
      // 1. Remove UUID from cache
      const authInfo = await cache.get<AuthInfo>(AUTH_CACHE_KEY + userId);
      if (authInfo) {
        const updatedUuids = authInfo.uuidList.filter((item) => item !== uuid);
        if (updatedUuids.length > 0) {
          await cache.set(AUTH_CACHE_KEY + userId, {
            ...authInfo,
            uuidList: updatedUuids,
          }, { ttl: AUTH_CACHE_TTL });
        } else {
          await cache.delete(AUTH_CACHE_KEY + userId);
        }
      }

      // 2. Mark session as revoked in loginLogTab
      await orm
        .update(loginLogTab)
        .set({ isRevoked: 1 })
        .where(and(
          eq(loginLogTab.userId, userId),
          eq(loginLogTab.uuid, uuid)
        ));
    } catch (err) {
      console.warn("[loginLogService] Failed to revoke session:", err);
    }
  },

  // List recent login history audit logs for user.
  async listLogs(userId: string, limit: number = 30): Promise<LoginLogItemVo[]> {
    try {
      const rows = await orm
        .select()
        .from(loginLogTab)
        .where(eq(loginLogTab.userId, userId))
        .orderBy(desc(loginLogTab.loginTime))
        .limit(limit);

      return rows.map((row) => ({
        logId: row.logId,
        userId: row.userId,
        username: row.username,
        ip: row.ip,
        location: row.location,
        device: row.device,
        browser: row.browser,
        os: row.os,
        status: row.status,
        isRevoked: row.isRevoked,
        loginTime: row.loginTime,
      }));
    } catch (err) {
      console.warn("[loginLogService] Failed to list login logs:", err);
      return [];
    }
  }
};

export { loginLogService };
