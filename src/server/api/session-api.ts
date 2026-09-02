import { Hono, type Context } from 'hono';
import result from '@/server/model/result';
import { sessionService } from '@/server/service/session-service';
import { getLoginInfo } from '@/lib/cookie';
import { getUserId } from '@/server/security/context';
import BizError from '@/server/error/biz-error';
import type { HonoEnv } from '../hono/type';

// This module registers active session management and multi-device revocation endpoints.

export function registerSessionApi(app: Hono<HonoEnv>) {
  // Query all active device sessions for current authenticated user.
  app.get('/session/list', async (c: Context) => {
    const userId = getUserId();
    if (!userId) {
      throw new BizError('auth.failed', 401);
    }

    const { uuid } = await getLoginInfo(c.req.header('cookie') ?? null);
    const sessions = await sessionService.listActiveSessions(userId, uuid ?? undefined);

    return c.json(result.ok(sessions));
  });

  // Revoke a specific active device session by UUID.
  app.post('/session/revoke', async (c: Context) => {
    const userId = getUserId();
    if (!userId) {
      throw new BizError('auth.failed', 401);
    }

    const body = await c.req.json<{ uuid: string }>().catch(() => ({ uuid: '' }));
    if (!body.uuid?.trim()) {
      throw new BizError('system.internalError');
    }

    const success = await sessionService.revokeSession(userId, body.uuid.trim());
    return c.json(result.ok(success));
  });

  // Revoke all other device sessions, keeping only caller's current session.
  app.post('/session/revoke-others', async (c: Context) => {
    const userId = getUserId();
    if (!userId) {
      throw new BizError('auth.failed', 401);
    }

    const { uuid } = await getLoginInfo(c.req.header('cookie') ?? null);
    if (!uuid) {
      throw new BizError('auth.failed', 401);
    }

    const success = await sessionService.revokeOtherSessions(userId, uuid);
    return c.json(result.ok(success));
  });
}
