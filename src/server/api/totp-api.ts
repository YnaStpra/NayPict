import { Hono, Context } from "hono";
import result from '@/server/model/result';
import { getUserId } from "@/server/security/context";
import { getClientIp } from "@/server/lib/ip";
import { logSecurityAudit } from "@/server/lib/audit";
import { totpSetupRateLimiter, totpVerifyRateLimiter } from "@/server/lib/rate-limiter";
import { totpService } from "@/server/service/totp-service";
import { userService } from "@/server/service/user-service";
import { type TotpDisableBo, type TotpSetupBo } from "@/server/entity/bo/totp";
import type { HonoEnv } from '../hono/type';

// This module registers Google Authenticator (TOTP 2FA) interfaces.

export function registerTotpApi(app: Hono<HonoEnv>) {
  // Get current user's Google Authenticator 2FA status
  app.get('/totp/status', async (c: Context) => {
    const userId = getUserId();
    if (!userId) {
      return c.json(result.fail('login.unauthorized'), 401);
    }
    const data = await totpService.getTotpStatus(userId);
    return c.json(result.ok(data));
  });

  // Setup / Generate QR Code for Google Authenticator 2FA
  app.post('/totp/setup', async (c: Context) => {
    const userId = getUserId();
    if (!userId) {
      return c.json(result.fail('login.unauthorized'), 401);
    }

    const clientIp = getClientIp(c);
    const rateLimit = await totpSetupRateLimiter.consume(`${userId}:${clientIp}`);
    if (!rateLimit.allowed) {
      c.header('Retry-After', String(Math.ceil(rateLimit.resetMs / 1000)));
      return c.json(result.fail('totp.tooManyAttempts', 429), 429);
    }

    const user = await userService.getById(userId);
    const data = await totpService.setupTotp(user?.username || 'admin', userId);
    return c.json(result.ok(data));
  });

  // Verify initial OTP code and enable 2FA
  app.post('/totp/enable', async (c: Context) => {
    const userId = getUserId();
    if (!userId) {
      return c.json(result.fail('login.unauthorized'), 401);
    }

    const clientIp = getClientIp(c);
    const rateLimit = await totpVerifyRateLimiter.consume(`${userId}:${clientIp}`);
    if (!rateLimit.allowed) {
      return c.json(result.fail('totp.tooManyAttempts', 429), 429);
    }

    const body = await c.req.json<TotpSetupBo>();
    await totpService.verifyAndEnableTotp(body.code, body.secret, userId);

    logSecurityAudit({
      action: 'TOTP_ENABLE',
      userId,
      clientIp,
    });

    return c.json(result.ok());
  });

  // Disable 2FA Google Authenticator with re-authentication
  app.post('/totp/disable', async (c: Context) => {
    const userId = getUserId();
    if (!userId) {
      return c.json(result.fail('login.unauthorized'), 401);
    }

    const clientIp = getClientIp(c);
    const rateLimit = await totpVerifyRateLimiter.consume(`${userId}:${clientIp}`);
    if (!rateLimit.allowed) {
      return c.json(result.fail('totp.tooManyAttempts', 429), 429);
    }

    const body = await c.req.json<TotpDisableBo>().catch(() => ({} as TotpDisableBo));
    await totpService.disableTotp(userId, body);

    logSecurityAudit({
      action: 'TOTP_DISABLE',
      userId,
      clientIp,
    });

    return c.json(result.ok());
  });
}

