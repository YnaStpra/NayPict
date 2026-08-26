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
import { userService } from '@/server/service/user-service';

// This module provides global interface authentication middleware.

const SYSTEM_PATHS = [
  '/setting',
  '/user/list',
  '/user/add',
  '/user/set',
  '/user/toggleStatus',
  '/user/delete',
  '/storage',
  '/photo/setVisibility',
  '/photo/setAllowDownload',
  '/photo/batchEdit',
  '/photo/recycle',
  '/photo/restore',
  '/photo/delete',
  '/photo/clear',
  '/photo/duplicates',
  '/photo/add',
  '/photo/exists',
  '/photo/presignedUploadUrl',
  '/album/add',
  '/album/setCover',
  '/album/coverCandidates',
  '/album/addPhoto',
  '/album/removePhoto',
  '/album/togglePinPhoto',
  '/album/setName',
  '/album/setTop',
  '/album/delete',
  '/album/trash',
  '/photo/comment/admin',
  '/photo/comment/reply',
  '/photo/comment/delete',
  '/photo/untagged',
  '/admin/insights',
  '/insights',
  '/totp'
];

const PUBLIC_API_PATHS = [
  '/login',
  '/logout',
  '/photo/list',
  '/photo/randomIdList',
  '/photo/takenDateList',
  '/photo/onThisDay',
  '/photo/download',
  '/album/list',
  '/storage/select',
  '/media',
  '/photos',
  '/photo/comment/list',
  '/photo/comment/add',
  '/photo/view',
  '/photo/share',
  '/location',
  '/csp-report'
];

// Determine whether the current path hits the specified interface or its subpath.
function isPathMatched(path: string, target: string) {
  return path === target || path.startsWith(`${target}/`);
}

// Determine whether the current interface belongs to the public browsing interface.
function isPublicApiPath(path: string) {
  return PUBLIC_API_PATHS.some((target) => isPathMatched(path, target));
}

// Determine whether the current interface belongs to the system management interface.
function isSystemPath(path: string) {
  return SYSTEM_PATHS.some((target) => isPathMatched(path, target));
}

// Clear login related Cookie.
function clearLoginCookies(c: Context) {
  deleteCookie(c, TOKEN_COOKIE_NAME, {
    path: '/',
    secure: process.env.NODE_ENV === 'production',
  });
  if (TOKEN_COOKIE_NAME !== 'token') {
    deleteCookie(c, 'token', { path: '/' });
  }
}

// Verify login information and session uuid, Write context after passing; Direct release via public path.
async function security(c: Context, next: Next) {

  const path = c.req.path.replace(/^\/api/, '');

  const { userId, uuid } = await getLoginInfo(c.req.header('cookie') ?? null);

  if (!userId || !uuid) {
    if (isPublicApiPath(path)) {
      return next();
    }
    clearLoginCookies(c);
    throw new BizError('auth.failed', 401);
  }

  // Read login information from cache, and fallback to DB for serverless lambda instances.
  let authInfo = await cache.get<AuthInfo>(AUTH_CACHE_KEY + userId);

  if (!authInfo) {
    const user = await userService.getById(userId);
    if (user) {
      authInfo = {
        userId: user.userId,
        username: user.username,
        avatar: user.avatar,
        type: user.type,
        uuidList: [uuid],
      };
      await cache.set(AUTH_CACHE_KEY + userId, authInfo);
    }
  }

  if (!authInfo || (!authInfo.uuidList.includes(uuid) && uuid !== 'demo')) {
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
