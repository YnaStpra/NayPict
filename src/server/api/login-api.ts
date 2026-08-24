import { Hono, Context } from "hono";
import { deleteCookie, setCookie } from 'hono/cookie';
import { TOKEN_COOKIE_MAX_AGE, TOKEN_COOKIE_NAME } from "@/server/const/global";
import result from "@/server/model/result";
import { type LoginBo } from "@/server/entity/bo/login";
import { getLoginInfo } from "@/lib/cookie";
import { loginService } from "@/server/service/login-service";
import type { HonoEnv } from '../hono/type';

// This module registers login and logout interfaces.

export function registerLoginApi(app: Hono<HonoEnv>) {
  // User login, Return after success JWT and user info or 2FA prompt.
  app.post('/login', async (c: Context) => {
    const params = await c.req.json<LoginBo>();

    // Resolve real client IP and device metadata for rate limiting and anomaly detection (HIGH-02, ANOMALY-01)
    const clientIp =
      c.req.header('x-forwarded-for')?.split(',')[0].trim() ||
      c.req.header('x-real-ip') ||
      'unknown';
    const userAgent = c.req.header('user-agent') || 'unknown';
    const acceptLanguage = c.req.header('accept-language') || '';

    const data = await loginService.login(params, clientIp, { userAgent, acceptLanguage });

    if (data.token) {
      setCookie(c, TOKEN_COOKIE_NAME, data.token, {
        path: '/',
        maxAge: TOKEN_COOKIE_MAX_AGE,
        sameSite: 'Lax',
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true,
      });

      // If in production with __Host- prefix, clear any legacy un-prefixed token
      if (TOKEN_COOKIE_NAME !== 'token') {
        deleteCookie(c, 'token', { path: '/' });
      }
    }

    return c.json(result.ok(data));
  });

  // User logs out, Clear current session and delete Cookie.
  app.post('/logout', async (c: Context) => {
    const { userId, uuid } = await getLoginInfo(c.req.header('cookie'));
    await loginService.logout(userId, uuid);

    deleteCookie(c, TOKEN_COOKIE_NAME, {
      path: '/',
      secure: process.env.NODE_ENV === 'production',
    });

    if (TOKEN_COOKIE_NAME !== 'token') {
      deleteCookie(c, 'token', { path: '/' });
    }

    return c.json(result.ok());
  });
}
