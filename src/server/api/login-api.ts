import { Hono, Context } from "hono";
import { deleteCookie, setCookie } from 'hono/cookie';
import { TOKEN_COOKIE_MAX_AGE, TOKEN_COOKIE_NAME } from "@/server/const/global";
import result from "@/server/model/result";
import { type LoginBo } from "@/server/entity/bo/login";
import { type LoginVo } from "@/server/entity/vo/login";
import { getLoginInfo } from "@/lib/cookie";
import { loginService } from "@/server/service/login-service";
import { userService } from '@/server/service/user-service';
import type { HonoEnv } from '../hono/type';

import { getClientInfo } from "@/server/lib/device";
import { loginLogService } from "@/server/service/login-log-service";

// This module registers login, active sessions, and audit log interfaces.

export function registerLoginApi(app: Hono<HonoEnv>) {
  // User login, Return after success JWT and user info or 2FA prompt.
  app.post('/login', async (c: Context) => {
    const params = await c.req.json<LoginBo>();
    const headersObj: Record<string, string | undefined> = {};
    c.req.raw.headers.forEach((val, key) => {
      headersObj[key.toLowerCase()] = val;
    });

    const clientInfo = await getClientInfo(headersObj);
    const data = await loginService.login(params, clientInfo);

    if (data.token) {
      setCookie(c, TOKEN_COOKIE_NAME, data.token, {
        path: '/',
        maxAge: TOKEN_COOKIE_MAX_AGE,
        sameSite: process.env.NODE_ENV === 'production' ? 'None' : 'Lax',
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true,
      });
    }

    return c.json(result.ok(data));
  });

  // User logs out, Clear current session and delete Cookie.
  app.post('/logout', async (c: Context) => {
    const { userId, uuid } = await getLoginInfo(c.req.header('cookie'));
    if (uuid && userId) {
      await loginLogService.revokeSession(uuid, userId);
    }
    await loginService.logout(userId, uuid);

    deleteCookie(c, TOKEN_COOKIE_NAME, {
      path: '/',
    });

    return c.json(result.ok());
  });

  // Get all active login sessions for current user.
  app.get('/login/sessions', async (c: Context) => {
    const { userId, uuid } = await getLoginInfo(c.req.header('cookie'));
    if (!userId) {
      return c.json(result.fail('login.unauthorized'), 401);
    }

    const sessions = await loginLogService.getActiveSessions(uuid, userId);
    return c.json(result.ok(sessions));
  });

  // Revoke/force log out a specific active session.
  app.post('/login/revoke-session', async (c: Context) => {
    const { userId } = await getLoginInfo(c.req.header('cookie'));
    if (!userId) {
      return c.json(result.fail('login.unauthorized'), 401);
    }

    const body = await c.req.json<{ uuid: string }>();
    if (!body?.uuid) {
      return c.json(result.fail('Invalid session UUID'), 400);
    }

    await loginLogService.revokeSession(body.uuid, userId);
    return c.json(result.ok());
  });

  // Get login history audit logs for current user.
  app.get('/login/logs', async (c: Context) => {
    const { userId } = await getLoginInfo(c.req.header('cookie'));
    if (!userId) {
      return c.json(result.fail('login.unauthorized'), 401);
    }

    const logs = await loginLogService.listLogs(userId, 50);
    return c.json(result.ok(logs));
  });
}
