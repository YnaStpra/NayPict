import crypto from 'node:crypto';
import { orm } from '@/server/infra/db'
import { userTab, type User } from "@/server/entity/user";
import { eq } from "drizzle-orm";
import BizError from "@/server/error/biz-error";
import { hashPassword, verifyPasswordDetailed } from '@/server/lib/crypto';
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
import { loginRateLimiter } from '@/server/lib/rate-limiter';

// This module handles login authentication related services.

interface Temp2FaSession {
  userId: string;
  tokenVersion: number;
}

const loginService = {

  // Write user information to login cache, and return to this session uuid.
  async saveAuthInfo(user: Pick<User, 'userId' | 'username' | 'avatar' | 'type' | 'tokenVersion'>): Promise<string> {
    const uuid = createId()
    const oldAuthInfo = await cache.get<AuthInfo>(AUTH_CACHE_KEY + user.userId)

    // Never carry session UUIDs across different credential versions; legacy cache entries imply version one.
    const oldTokenVersion = oldAuthInfo?.tokenVersion ?? 1
    const oldUuids = oldAuthInfo && oldTokenVersion === user.tokenVersion ? oldAuthInfo.uuidList : []
    const updatedUuids = [...oldUuids.filter((id) => id !== uuid), uuid].slice(-10)

    const authInfo: AuthInfo = {
      userId: user.userId,
      username: user.username,
      avatar: user.avatar,
      type: user.type,
      tokenVersion: user.tokenVersion,
      uuidList: updatedUuids,
    }

    await cache.set(AUTH_CACHE_KEY + user.userId, authInfo, { ttl: AUTH_CACHE_TTL })
    return uuid
  },

  // Verify username and password, with optional 2FA code verification and device anomaly detection.
  async login(
    params: LoginBo,
    clientIp: string,
    clientMeta?: { userAgent?: string; acceptLanguage?: string }
  ): Promise<LoginVo> {
    // Distributed rate limiting: max 5 failed attempts per 15 minutes per IP
    const rateLimit = await loginRateLimiter.check(clientIp);
    if (!rateLimit.allowed) {
      throw new BizError('login.tooManyAttempts');
    }

    // IP & Device Fingerprint Anomaly Detection (ANOMALY-01)
    const userAgent = clientMeta?.userAgent || 'unknown';
    const acceptLanguage = clientMeta?.acceptLanguage || '';
    const ipSubnet = clientIp.includes('.')
      ? clientIp.split('.').slice(0, 3).join('.')
      : clientIp.includes(':')
      ? clientIp.split(':').slice(0, 4).join(':')
      : clientIp;

    const deviceFingerprint = crypto
      .createHash('sha256')
      .update(`${userAgent}|${acceptLanguage}|${ipSubnet}`)
      .digest('hex')
      .slice(0, 32);

    if (params.tempToken) {
      const tempSession = await cache.get<Temp2FaSession>(`temp_2fa_${params.tempToken}`);
      if (
        !tempSession
        || typeof tempSession.userId !== 'string'
        || !Number.isInteger(tempSession.tokenVersion)
      ) {
        throw new BizError('totp.sessionExpired');
      }

      if (!params.code) {
        throw new BizError('totp.codeRequired');
      }

      const [user] = await orm.select().from(userTab).where(eq(userTab.userId, tempSession.userId)).limit(1);
      if (
        !user
        || user.status === UserStatusEnum.DISABLE
        || user.tokenVersion !== tempSession.tokenVersion
      ) {
        await cache.delete(`temp_2fa_${params.tempToken}`);
        await cache.delete(`temp_2fa_attempts_${params.tempToken}`);
        throw new BizError('totp.sessionExpired');
      }

      // Check 2FA attempt counter for this tempToken (HIGH-06)
      const attemptKey = `temp_2fa_attempts_${params.tempToken}`;
      const totpAttempts = (await cache.get<number>(attemptKey)) ?? 0;
      if (totpAttempts >= 3) {
        // Lockout: invalidate tempToken after 3 failed guesses
        await cache.delete(`temp_2fa_${params.tempToken}`);
        await cache.delete(attemptKey);
        await loginRateLimiter.consume(clientIp);
        throw new BizError('totp.sessionExpired');
      }

      try {
        await totpService.verifyLoginTotp(tempSession.userId, params.code);
      } catch {
        // Increment failure counter
        await cache.set(attemptKey, totpAttempts + 1, { ttl: 300 });
        await loginRateLimiter.consume(clientIp);
        throw new BizError('totp.invalidCode');
      }

      // Success: clean up both tempToken and attempt counter
      await cache.delete(`temp_2fa_${params.tempToken}`);
      await cache.delete(attemptKey);
      await loginRateLimiter.reset(clientIp);

      // Record verified device fingerprint upon successful 2FA
      const fingerprintKey = `known_devices_${user.userId}`;
      const knownDevices = (await cache.get<string[]>(fingerprintKey)) || [];
      const isNewDevice = knownDevices.length > 0 && !knownDevices.includes(deviceFingerprint);

      const updatedDevices = [...knownDevices.filter((d) => d !== deviceFingerprint), deviceFingerprint].slice(-10);
      await cache.set(fingerprintKey, updatedDevices, { ttl: 60 * 60 * 24 * 90 }); // 90 days TTL

      const uuid = await this.saveAuthInfo(user);
      const token = await createLoginToken(user.userId, uuid, user.tokenVersion);
      const userVo = await userService.getById(user.userId);
      return { token, user: userVo, isNewDevice };
    }

    if (!params.username?.trim() || !params.password?.trim()) {
      throw new BizError("login.credentialsRequired");
    }

    const [user] = await orm.select().from(userTab).where(eq(userTab.username, params.username)).limit(1);

    if (!user) {
      await loginRateLimiter.consume(clientIp);
      throw new BizError("login.invalidCredentials");
    }

    if (user.status === UserStatusEnum.DISABLE) {
      throw new BizError("user.disabled");
    }

    const { valid: isValidPassword, needsRehash } = await verifyPasswordDetailed(params.password, user.salt, user.password);

    if (!isValidPassword) {
      await loginRateLimiter.consume(clientIp);
      throw new BizError('login.invalidCredentials');
    }

    // Transparent gradual migration: upgrade legacy SHA-256 to Argon2id upon successful authentication
    if (needsRehash) {
      try {
        const newHash = await hashPassword(params.password);
        await orm
          .update(userTab)
          .set({
            password: newHash.hash,
            salt: newHash.salt,
          })
          .where(eq(userTab.userId, user.userId));
        console.log(`[SECURITY] Transparently upgraded password hash to Argon2id for user: ${user.username}`);
      } catch (err) {
        console.warn('[SECURITY] Failed to auto-upgrade password to Argon2id:', err);
      }
    }

    // Check device fingerprint anomaly
    const fingerprintKey = `known_devices_${user.userId}`;
    const knownDevices = (await cache.get<string[]>(fingerprintKey)) || [];
    const isNewDevice = knownDevices.length > 0 && !knownDevices.includes(deviceFingerprint);

    if (isNewDevice) {
      console.warn(
        `[SECURITY ANOMALY DETECTED] Login from unrecognized device/network for user "${user.username}" (IP: ${clientIp}, Subnet: ${ipSubnet}, UA: ${userAgent.slice(0, 100)})`
      );
    }

    // Check if Google Authenticator 2FA is enabled for this Admin/User
    const totpStatus = await totpService.getTotpStatus(user.userId);
    if (totpStatus.enabled) {
      if (params.code) {
        try {
          await totpService.verifyLoginTotp(user.userId, params.code);
        } catch {
          await loginRateLimiter.consume(clientIp);
          throw new BizError('totp.invalidCode');
        }
      } else {
        const tempToken = createId();
        const tempSession: Temp2FaSession = {
          userId: user.userId,
          tokenVersion: user.tokenVersion,
        };
        await cache.set(`temp_2fa_${tempToken}`, tempSession, { ttl: 300 }); // 5 mins TTL
        return {
          token: null,
          require2Fa: true,
          tempToken,
          isNewDevice,
        };
      }
    }

    // Reset rate limiter on successful authentication
    await loginRateLimiter.reset(clientIp);

    // Save trusted device fingerprint
    const updatedDevices = [...knownDevices.filter((d) => d !== deviceFingerprint), deviceFingerprint].slice(-10);
    await cache.set(fingerprintKey, updatedDevices, { ttl: 60 * 60 * 24 * 90 });

    if (user.username === process.env.NEXT_PUBLIC_DEMO_USERNAME) {
      const token = await createLoginToken(user.userId, 'demo', user.tokenVersion);
      const userVo = await userService.getById(user.userId);
      return { token, user: userVo, isNewDevice };
    }

    const uuid = await this.saveAuthInfo(user);
    const token = await createLoginToken(user.userId, uuid, user.tokenVersion);
    const userVo = await userService.getById(user.userId);
    return { token, user: userVo, isNewDevice };
  },

  // Remove current session from cache when logging out uuid.
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
