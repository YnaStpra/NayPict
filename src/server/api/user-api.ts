import { Hono, Context } from 'hono';
import result from '@/server/model/result';
import { type UserAddBo, type UserDeleteBo, type UserSetAvatarBo, type UserSetBo, type UserPasswordBo, type UserToggleStatusBo } from '@/server/entity/bo/user';
import { getUserId } from '@/server/security/context';
import { getClientIp } from '@/server/lib/ip';
import { logSecurityAudit } from '@/server/lib/audit';
import { avatarUploadRateLimiter, passwordChangeRateLimiter, sudoRateLimiter } from '@/server/lib/rate-limiter';
import { userService } from '@/server/service/user-service';
import { sudoService } from '@/server/service/sudo-service';
import BizError from '@/server/error/biz-error';
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
    const currentUserId = getUserId();
    const params = await c.req.json<UserAddBo>();
    await userService.add(params);
    logSecurityAudit({
      action: 'USER_ADD',
      userId: currentUserId,
      clientIp: getClientIp(c),
      details: { username: params.username, type: params.type },
    });
    return c.json(result.ok());
  });

  // Modify user information.
  app.post('/user/set', async (c: Context) => {
    const currentUserId = getUserId();
    const params = await c.req.json<UserSetBo>();
    await userService.set(params, currentUserId);
    logSecurityAudit({
      action: 'USER_SET',
      userId: currentUserId,
      clientIp: getClientIp(c),
      targetId: params.userId,
      details: { username: params.username, type: params.type },
    });
    return c.json(result.ok());
  });

  // Modify the current login user password.
  app.post('/user/setUserPassword', async (c: Context) => {
    const currentUserId = getUserId();
    const clientIp = getClientIp(c);
    const rateLimit = await passwordChangeRateLimiter.consume(`${currentUserId}:${clientIp}`);
    if (!rateLimit.allowed) {
      c.header('Retry-After', String(Math.ceil(rateLimit.resetMs / 1000)));
      return c.json(result.fail('Password change rate limit exceeded. Please try again later.', 429), 429);
    }

    const params = await c.req.json<UserPasswordBo>();
    await userService.setUserPassword(params, currentUserId);
    logSecurityAudit({
      action: 'USER_CHANGE_PASSWORD',
      userId: currentUserId,
      clientIp,
    });
    return c.json(result.ok());
  });

  // Set current user avatar.
  app.post('/user/setAvatar', async (c: Context) => {
    const currentUserId = getUserId();
    const clientIp = getClientIp(c);
    const rateLimit = await avatarUploadRateLimiter.consume(`${currentUserId}:${clientIp}`);
    if (!rateLimit.allowed) {
      c.header('Retry-After', String(Math.ceil(rateLimit.resetMs / 1000)));
      return c.json(result.fail('Avatar upload rate limit exceeded. Please try again later.', 429), 429);
    }

    const params = await c.req.json<UserSetAvatarBo>();
    const user = await userService.setAvatar(params, currentUserId);
    logSecurityAudit({
      action: 'USER_SET_AVATAR',
      userId: currentUserId,
      clientIp,
    });
    return c.json(result.ok(user.avatar));
  });

  // According to avatar key Read avatar image from storage, Browser img Tags are loaded directly.
  app.get('/user/avatar/:key', async (c: Context) => {
    const rawKey = c.req.param('key')?.trim() || '';

    // Security: Validate avatar key strictly to prevent path traversal and arbitrary bucket reads
    if (!rawKey || rawKey.includes('..') || rawKey.includes('/') || rawKey.includes('\\') || !/^[a-zA-Z0-9_\-.]+\.(webp|jpg|jpeg|png)$/i.test(rawKey)) {
      return c.body(null, 400);
    }

    const file = await userService.getAvatar(rawKey);

    if (!file) {
      return c.body(null, 404);
    }

    const ext = rawKey.toLowerCase().split('.').pop();
    const contentTypeMap: Record<string, string> = {
      webp: 'image/webp',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      png: 'image/png',
    };
    const contentType = (ext && contentTypeMap[ext]) || 'image/webp';

    return c.body(file.body as unknown as ReadableStream, 200, {
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=31536000, immutable',
      'Content-Length': String(file.size),
      'X-Content-Type-Options': 'nosniff',
    });
  });

  // Switch the specified user's enabled status (Guarded by Sudo Mode).
  app.post('/user/toggleStatus', async (c: Context) => {
    const currentUserId = getUserId();
    await sudoService.requireSudo(currentUserId);
    const params = await c.req.json<UserToggleStatusBo>();
    await userService.toggleStatus(params, currentUserId);
    logSecurityAudit({
      action: 'USER_TOGGLE_STATUS',
      userId: currentUserId,
      clientIp: getClientIp(c),
      targetId: params.userId,
    });
    return c.json(result.ok());
  });

  // Delete the specified user and its associated data (Guarded by Sudo Mode).
  app.post('/user/delete', async (c: Context) => {
    const currentUserId = getUserId();
    await sudoService.requireSudo(currentUserId);
    const params = await c.req.json<UserDeleteBo>();
    await userService.delete(params.userId, currentUserId);
    logSecurityAudit({
      action: 'USER_DELETE',
      userId: currentUserId,
      clientIp: getClientIp(c),
      targetId: params.userId,
    });
    return c.json(result.ok());
  });

  // Verify administrative credentials and elevate session to Sudo Mode (15-minute window).
  app.post('/user/sudo', async (c: Context) => {
    const currentUserId = getUserId();
    if (!currentUserId) {
      throw new BizError('auth.failed', 401);
    }

    const clientIp = getClientIp(c);
    const rateLimit = await sudoRateLimiter.consume(`${currentUserId}:${clientIp}`);
    if (!rateLimit.allowed) {
      c.header('Retry-After', String(Math.ceil(rateLimit.resetMs / 1000)));
      return c.json(result.fail('Sudo elevation rate limit exceeded. Please wait a moment.', 429), 429);
    }

    const body = await c.req.json<{ password?: string; code?: string }>().catch(() => ({ password: '', code: '' }));
    if (!body.password?.trim()) {
      throw new BizError('totp.invalidPassword', 400);
    }

    try {
      const verified = await sudoService.verifySudo(currentUserId, body.password, body.code);
      if (!verified) {
        logSecurityAudit({
          action: 'USER_SUDO_FAILED',
          userId: currentUserId,
          clientIp,
          details: { reason: 'invalid_password' },
        });
        throw new BizError('totp.invalidPassword', 400);
      }
    } catch (err) {
      if (err instanceof BizError) {
        logSecurityAudit({
          action: 'USER_SUDO_FAILED',
          userId: currentUserId,
          clientIp,
          details: { error: err.message },
        });
        throw err;
      }
      throw err;
    }

    logSecurityAudit({
      action: 'USER_SUDO_ELEVATE',
      userId: currentUserId,
      clientIp,
    });

    const status = await sudoService.isSudoActive(currentUserId);
    return c.json(result.ok(status));
  });

  // Check current Sudo Mode elevation status and remaining validity window.
  app.get('/user/sudo/status', async (c: Context) => {
    const currentUserId = getUserId();
    if (!currentUserId) {
      throw new BizError('auth.failed', 401);
    }

    const status = await sudoService.isSudoActive(currentUserId);
    return c.json(result.ok(status));
  });

  // Revoke administrative Sudo Mode elevation early upon user request.
  app.post('/user/sudo/drop', async (c: Context) => {
    const currentUserId = getUserId();
    if (!currentUserId) {
      throw new BizError('auth.failed', 401);
    }

    await sudoService.clearSudo(currentUserId);
    logSecurityAudit({
      action: 'USER_SUDO_DROP',
      userId: currentUserId,
      clientIp: getClientIp(c),
    });

    return c.json(result.ok({ active: false, remainingSeconds: 0 }));
  });
}
