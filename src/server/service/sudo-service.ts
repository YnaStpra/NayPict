import { eq } from 'drizzle-orm';
import { userTab } from '@/server/entity/user';
import { orm } from '@/server/infra/db';
import { cache } from '@/server/infra/cache';
import { verifyPasswordDetailed } from '@/server/lib/crypto';
import BizError from '@/server/error/biz-error';

const SUDO_CACHE_PREFIX = 'sudo_session_';
export const SUDO_TTL_SECONDS = 900; // 15 minutes validity window

export interface SudoSessionData {
  elevated: boolean;
  elevatedAt: number;
  expiresAt: number;
}

export const sudoService = {
  /**
   * Verifies the administrator password and elevates the session to Sudo Mode for 15 minutes.
   */
  async verifySudo(userId: string, password: string): Promise<boolean> {
    if (!userId || !password) {
      return false;
    }

    const [user] = await orm
      .select({
        userId: userTab.userId,
        password: userTab.password,
        salt: userTab.salt,
        status: userTab.status,
      })
      .from(userTab)
      .where(eq(userTab.userId, userId))
      .limit(1);

    if (!user || user.status !== 1) {
      return false;
    }

    const { valid } = await verifyPasswordDetailed(password, user.salt, user.password);
    if (!valid) {
      return false;
    }

    const now = Date.now();
    const data: SudoSessionData = {
      elevated: true,
      elevatedAt: now,
      expiresAt: now + SUDO_TTL_SECONDS * 1000,
    };

    await cache.set(SUDO_CACHE_PREFIX + userId, data, { ttl: SUDO_TTL_SECONDS });
    return true;
  },

  /**
   * Checks whether Sudo Mode is currently active for the given user, returning remaining validity in seconds.
   */
  async isSudoActive(userId?: string): Promise<{ active: boolean; remainingSeconds: number }> {
    if (!userId) {
      return { active: false, remainingSeconds: 0 };
    }

    const data = await cache.get<SudoSessionData>(SUDO_CACHE_PREFIX + userId);
    if (!data || !data.elevated) {
      return { active: false, remainingSeconds: 0 };
    }

    const now = Date.now();
    const remainingMs = data.expiresAt - now;
    if (remainingMs <= 0) {
      await cache.delete(SUDO_CACHE_PREFIX + userId);
      return { active: false, remainingSeconds: 0 };
    }

    return {
      active: true,
      remainingSeconds: Math.ceil(remainingMs / 1000),
    };
  },

  /**
   * Guards high-risk administrative operations. Throws BizError('auth.sudoRequired', 403) if not in Sudo Mode.
   */
  async requireSudo(userId?: string): Promise<void> {
    if (!userId) {
      throw new BizError('auth.failed', 401);
    }

    const status = await this.isSudoActive(userId);
    if (!status.active) {
      throw new BizError('auth.sudoRequired', 403);
    }
  },

  /**
   * Clears Sudo Mode elevation for a user (e.g. on logout or manual revocation).
   */
  async clearSudo(userId: string): Promise<void> {
    if (userId) {
      await cache.delete(SUDO_CACHE_PREFIX + userId);
    }
  },
};
