import { Hono, Context } from "hono";
import result from '@/server/model/result';
import { getUserId } from "@/server/security/context";
import { totpService } from "@/server/service/totp-service";
import { userService } from "@/server/service/user-service";
import { type TotpSetupBo } from "@/server/entity/bo/totp";
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

    const body = await c.req.json<TotpSetupBo>();
    await totpService.verifyAndEnableTotp(body.code, body.secret, userId);
    return c.json(result.ok());
  });

  // Disable 2FA Google Authenticator
  app.post('/totp/disable', async (c: Context) => {
    const userId = getUserId();
    if (!userId) {
      return c.json(result.fail('login.unauthorized'), 401);
    }

    await totpService.disableTotp(userId);
    return c.json(result.ok());
  });
}
