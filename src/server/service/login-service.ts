import { orm } from '@/server/infra/db'
import { userTab } from "@/server/entity/user";
import { eq } from "drizzle-orm";
import BizError from "@/server/error/biz-error";
import { verifyPassword } from '@/server/lib/crypto';
import { createId } from '@/server/lib/id';
import { createLoginToken } from '@/server/lib/jwt';
import { type LoginBo } from '@/server/entity/bo/login';
import { type AuthInfo } from '@/server/entity/vo/auth';
import { UserStatusEnum } from '@/server/enums/user-enum';
import { cache } from '@/server/infra/cache';
import { AUTH_CACHE_TTL } from '@/server/const/global';
import { AUTH_CACHE_KEY } from '@/server/const/cache';

import { type LoginVo } from '@/server/entity/vo/login';
import { totpService } from '@/server/service/totp-service';
import { userService } from '@/server/service/user-service';

// This module handles login authentication related services.

const loginService = {

  // Write user information to login cache, and return to this session uuid.
  async saveAuthInfo(user: { userId: string, username: string, avatar: string, type: number }): Promise<string> {
    const uuid = createId()
    const oldAuthInfo = await cache.get<AuthInfo>(AUTH_CACHE_KEY + user.userId)

    const oldUuids = oldAuthInfo?.uuidList || []
    const updatedUuids = [...oldUuids.filter((id) => id !== uuid), uuid].slice(-10)

    const authInfo: AuthInfo = {
      userId: user.userId,
      username: user.username,
      avatar: user.avatar,
      type: user.type,
      uuidList: updatedUuids,
    }

    await cache.set(AUTH_CACHE_KEY + user.userId, authInfo, { ttl: AUTH_CACHE_TTL })
    return uuid
  },

  // Verify username and password, with optional 2FA code verification.
  async login(params: LoginBo, clientIp: string): Promise<LoginVo> {
    // Rate limiting: max 10 login attempts per minute per IP (HIGH-02)
    const rateLimitKey = `login_ratelimit_${clientIp}`;
    const attempts = (await cache.get<number>(rateLimitKey)) ?? 0;
    if (attempts >= 10) {
      throw new BizError('login.tooManyAttempts');
    }
    // Increment attempt counter (TTL=60s window; only increment on non-2FA paths)
    if (!params.tempToken) {
      await cache.set(rateLimitKey, attempts + 1, { ttl: 60 });
    }

    if (params.tempToken) {
      const cachedUserId = await cache.get<string>(`temp_2fa_${params.tempToken}`);
      if (!cachedUserId) {
        throw new BizError('totp.sessionExpired');
      }

      if (!params.code) {
        throw new BizError('totp.codeRequired');
      }

      // Check 2FA attempt counter for this tempToken (HIGH-06)
      const attemptKey = `temp_2fa_attempts_${params.tempToken}`;
      const totpAttempts = (await cache.get<number>(attemptKey)) ?? 0;
      if (totpAttempts >= 3) {
        // Lockout: invalidate tempToken after 3 failed guesses
        await cache.delete(`temp_2fa_${params.tempToken}`);
        await cache.delete(attemptKey);
        throw new BizError('totp.sessionExpired');
      }

      try {
        await totpService.verifyLoginTotp(cachedUserId, params.code);
      } catch {
        // Increment failure counter, delete tempToken to prevent further attempts on success-then-replay
        await cache.set(attemptKey, totpAttempts + 1, { ttl: 300 });
        throw new BizError('totp.invalidCode');
      }

      // Success: clean up both tempToken and attempt counter
      await cache.delete(`temp_2fa_${params.tempToken}`);
      await cache.delete(attemptKey);

      const [user] = await orm.select().from(userTab).where(eq(userTab.userId, cachedUserId)).limit(1);
      if (!user) throw new BizError('login.invalidCredentials');

      const uuid = await this.saveAuthInfo(user);
      const token = await createLoginToken(user.userId, uuid);
      const userVo = await userService.getById(user.userId);
      return { token, user: userVo };
    }

    if (!params.username?.trim() || !params.password?.trim()) {
      throw new BizError("login.credentialsRequired");
    }

    const [user] = await orm.select().from(userTab).where(eq(userTab.username, params.username)).limit(1);

    if (!user) {
      throw new BizError("login.invalidCredentials");
    }

    if (user.status === UserStatusEnum.DISABLE) {
      throw new BizError("user.disabled");
    }

    const isValidPassword = await verifyPassword(params.password, user.salt, user.password);

    if (!isValidPassword) {
      throw new BizError('login.invalidCredentials');
    }

    // Check if Google Authenticator 2FA is enabled for this Admin/User
    const totpStatus = await totpService.getTotpStatus(user.userId);
    if (totpStatus.enabled) {
      if (params.code) {
        await totpService.verifyLoginTotp(user.userId, params.code);
      } else {
        const tempToken = createId();
        await cache.set(`temp_2fa_${tempToken}`, user.userId, { ttl: 300 }); // 5 mins TTL
        return {
          token: null,
          require2Fa: true,
          tempToken,
        };
      }
    }

    if (user.username === process.env.NEXT_PUBLIC_DEMO_USERNAME) {
      const token = await createLoginToken(user.userId, 'demo');
      const userVo = await userService.getById(user.userId);
      return { token, user: userVo };
    }

    const uuid = await this.saveAuthInfo(user);
    const token = await createLoginToken(user.userId, uuid);
    const userVo = await userService.getById(user.userId);
    return { token, user: userVo };
  },

  // Remove current session from cache when logging out uuid。
  async logout(userId: string | null, uuid: string | null): Promise<void> {

    if (!userId || !uuid) {
      return
    }

    const authInfo = await cache.get<AuthInfo>(AUTH_CACHE_KEY + userId)

    if (!authInfo) {
      return
    }

    const uuidList = authInfo.uuidList.filter((item) => item !== uuid)

    if (!uuidList.length) {
      await cache.delete(AUTH_CACHE_KEY + userId)
      return
    }

    await cache.set(AUTH_CACHE_KEY + userId, {
      ...authInfo,
      uuidList,
    }, { ttl: AUTH_CACHE_TTL })
  },

}

export { loginService }
