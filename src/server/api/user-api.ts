import { Hono, Context } from 'hono';
import result from '@/server/model/result';
import { type UserAddBo, type UserDeleteBo, type UserSetAvatarBo, type UserSetBo, type UserPasswordBo, type UserToggleStatusBo } from '@/server/entity/bo/user';
import { getUserId } from '@/server/security/context';
import { userService } from '@/server/service/user-service';
import type { HonoEnv } from '../hono/type';

// This module registers user-related interfaces.

export function registerUserApi(app: Hono<HonoEnv>) {
  // Query the currently logged in user information.
  app.post('/user/info', async (c: Context) => {
    const data = await userService.getById(getUserId());
    return c.json(result.ok(data));
  });

  // Query all user list.
  app.post('/user/list', async (c: Context) => {
    const data = await userService.list();
    return c.json(result.ok(data));
  });

  // Add user.
  app.post('/user/add', async (c: Context) => {
    const params = await c.req.json<UserAddBo>();
    await userService.add(params);
    return c.json(result.ok());
  });

  // Modify user information.
  app.post('/user/set', async (c: Context) => {
    const params = await c.req.json<UserSetBo>();
    await userService.set(params);
    return c.json(result.ok());
  });

  // Modify the current login user password.
  app.post('/user/setUserPassword', async (c: Context) => {
    const params = await c.req.json<UserPasswordBo>();
    await userService.setUserPassword(params, getUserId());
    return c.json(result.ok());
  });

  // Set current user avatar.
  app.post('/user/setAvatar', async (c: Context) => {
    const params = await c.req.json<UserSetAvatarBo>();
    const user = await userService.setAvatar(params, getUserId());
    return c.json(result.ok(user.avatar));
  });

  // According to avatar key Read avatar image from storage, Browser img Tags are loaded directly.
  app.get('/user/avatar/:key', async (c: Context) => {

    const key = c.req.param('key');
    const file = await userService.getAvatar(key);

    if (!file) {
      return c.body(null, 404);
    }

    return c.body(file.body as unknown as ReadableStream, 200, {
      'Content-Type': 'image/webp',
      'Cache-Control': 'public, max-age=31536000, immutable',
      'Content-Length': String(file.size),
    });
  });

  // Switch the specified user's enabled status.
  app.post('/user/toggleStatus', async (c: Context) => {
    const params = await c.req.json<UserToggleStatusBo>();
    await userService.toggleStatus(params);
    return c.json(result.ok());
  });

  // Delete the specified user and its associated data.
  app.post('/user/delete', async (c: Context) => {
    const params = await c.req.json<UserDeleteBo>();
    await userService.delete(params.userId);
    return c.json(result.ok());
  });
}
