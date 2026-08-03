import type { Context, Next } from 'hono';
import { deleteCookie } from 'hono/cookie';
import { TOKEN_COOKIE_NAME } from '@/server/const/global';
import { AUTH_CACHE_KEY } from '@/server/const/cache';
import BizError from '@/server/error/biz-error';
import { getLoginInfo } from '@/lib/cookie';
import { setUserId } from '@/server/security/context';
import { cache } from '@/server/infra/cache';
import { type AuthInfo } from '@/server/entity/vo/auth';
import { UserTypeEnum } from '@/server/enums/user-enum';

// This module provides global interface authentication middleware。

const SYSTEM_PATHS = [
  '/setting',
  '/user/list',
  '/user/add',
  '/user/set',
  '/user/toggleStatus',
  '/user/delete',
  '/storage/list',
  '/storage/add',
  '/storage/set',
  '/storage/setTop',
  '/storage/toggleStatus',
  '/storage/delete'
];

// Determine whether the current path hits the specified interface or its subpath。
function isPathMatched(path: string, target: string) {
  return path === target || path.startsWith(`${target}/`);
}

// Determine whether the current interface belongs to the system management interface。
function isSystemPath(path: string) {
  return SYSTEM_PATHS.some((target) => isPathMatched(path, target));
}

// Clear login related Cookie。
function clearLoginCookies(c: Context) {
  deleteCookie(c, TOKEN_COOKIE_NAME, {
    path: '/',
  });
}

// Verify login information and session uuid，Write context after passing；Direct release via public path。
async function security(c: Context, next: Next) {

  const path = c.req.path.replace(/^\/api/, '');

  if (path.startsWith('/login') || path.startsWith('/logout')) {
    return next();
  }

  const { userId, uuid } = await getLoginInfo(c.req.header('cookie') ?? null);

  if (!userId || !uuid) {
    clearLoginCookies(c);
    throw new BizError('auth.failed', 401);
  }

  // Read login information from cache，and confirm the current uuid still valid。
  const authInfo = await cache.get<AuthInfo>(AUTH_CACHE_KEY + userId);

  if (!authInfo || !authInfo.uuidList.includes(uuid)) {
    clearLoginCookies(c);
    throw new BizError('auth.failed', 401);
  }

  if (isSystemPath(path) && authInfo.type === UserTypeEnum.NORMAL) {
    throw new BizError('auth.forbidden', 403);
  }

  setUserId(authInfo.userId);

  return next();
}

export { security };
