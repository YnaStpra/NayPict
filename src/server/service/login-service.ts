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

import { type ClientInfo } from '@/server/lib/device';
import { loginLogService } from '@/server/service/login-log-service';

// This module handles login authentication related services.

const loginService = {

  // Write user information to login cache, and return to this session uuid.
  async saveAuthInfo(user: { userId: string, username: string, avatar: string, type: number }): Promise<string> {
    const uuid = createId()
    const oldAuthInfo = await cache.get<AuthInfo>(AUTH_CACHE_KEY + user.userId)

    const authInfo: AuthInfo = {
      userId: user.userId,
      username: user.username,
      avatar: user.avatar,
      type: user.type,
      uuidList: oldAuthInfo ? [...oldAuthInfo.uuidList, uuid] : [uuid],
    }

    await cache.set(AUTH_CACHE_KEY + user.userId, authInfo, { ttl: AUTH_CACHE_TTL })
    return uuid
  },

  // Verify username and password, with optional 2FA code verification and audit logging.
  async login(params: LoginBo, clientInfo?: ClientInfo): Promise<LoginVo> {
    if (params.tempToken) {
      const cachedUserId = await cache.get<string>(`temp_2fa_${params.tempToken}`);
      if (!cachedUserId) {
        throw new BizError('totp.sessionExpired');
      }

      if (!params.code) {
        throw new BizError('totp.codeRequired');
      }

      await totpService.verifyLoginTotp(cachedUserId, params.code);
      await cache.delete(`temp_2fa_${params.tempToken}`);

      const [user] = await orm.select().from(userTab).where(eq(userTab.userId, cachedUserId)).limit(1);
      if (!user) throw new BizError('login.invalidCredentials');

      const uuid = await this.saveAuthInfo(user);
      const token = await createLoginToken(user.userId, uuid);
      const userVo = await userService.getById(user.userId);

      if (clientInfo) {
        await loginLogService.recordLog({
          userId: user.userId,
          username: user.username,
          uuid,
          ip: clientInfo.ip,
          location: clientInfo.location,
          device: clientInfo.device,
          browser: clientInfo.browser,
          os: clientInfo.os,
          userAgent: clientInfo.userAgent,
          status: 1,
        });
      }

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

    if (clientInfo) {
      await loginLogService.recordLog({
        userId: user.userId,
        username: user.username,
        uuid,
        ip: clientInfo.ip,
        location: clientInfo.location,
        device: clientInfo.device,
        browser: clientInfo.browser,
        os: clientInfo.os,
        userAgent: clientInfo.userAgent,
        status: 1,
      });
    }

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
