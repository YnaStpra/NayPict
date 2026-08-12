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

// This module registers and logs in related interfaces.

export function registerLoginApi(app: Hono<HonoEnv>) {
  // User login, Return after success JWT and user info.
  app.post('/login', async (c: Context) => {
    const params = await c.req.json<LoginBo>();
    const token = await loginService.login(params);
    const { userId } = await getLoginInfo(`token=${token}`);
    const user = userId ? await userService.getById(userId) : null;
    const data: LoginVo = { token, user };

    setCookie(c, TOKEN_COOKIE_NAME, token, {
      path: '/',
      maxAge: TOKEN_COOKIE_MAX_AGE,
      sameSite: 'Lax',
    });

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
