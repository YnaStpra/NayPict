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

// This module registers login and logout interfaces.

export function registerLoginApi(app: Hono<HonoEnv>) {
  // User login, Return after success JWT and user info or 2FA prompt.
  app.post('/login', async (c: Context) => {
    const params = await c.req.json<LoginBo>();
    const data = await loginService.login(params);

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
    await loginService.logout(userId, uuid);

    deleteCookie(c, TOKEN_COOKIE_NAME, {
      path: '/',
    });

    return c.json(result.ok());
  });
}
