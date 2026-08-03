import { NextResponse, type NextRequest } from 'next/server';
import { TOKEN_COOKIE_NAME } from '@/server/const/global';
import { AUTH_CACHE_KEY } from '@/server/const/cache';
import { getLoginInfo } from '@/lib/cookie';
import { UserTypeEnum } from '@/server/enums/user-enum';
import { type AuthInfo } from '@/server/entity/vo/auth';
import { cache } from '@/server/infra/cache';

// This module proxy page routing，Jump to login page when not logged in。

const SYSTEM_PATHS = ['/users', '/settings', '/storage'];
const PUBLIC_FILE_REG = /\.(?:png|jpg|jpeg|gif|webp|svg|ico)$/i;

// Determine whether the current path allows unlogged access。
function isPublicPath(pathname: string) {
  return pathname.startsWith('/login')
    || pathname.startsWith('/api')
    || pathname.startsWith('/media')
    || pathname.startsWith('/_next')
    || pathname === '/favicon.ico'
    || pathname === '/robots.txt'
    || PUBLIC_FILE_REG.test(pathname);
}

// Determine whether the current path hits the specified page or its subpages。
function isPathMatched(pathname: string, path: string) {
  return pathname === path || pathname.startsWith(`${path}/`);
}

// Determine whether the current path belongs to the system settings page。
function isSystemPath(pathname: string) {
  return SYSTEM_PATHS.some((path) => isPathMatched(pathname, path));
}

// Clear login related Cookie，and return the incoming response。
function clearLoginCookies(response: NextResponse) {
  response.cookies.set(TOKEN_COOKIE_NAME, '', {
    path: '/',
    maxAge: 0,
  });

  return response;
}

// Agent is not logged in to access the page，API and media resources are handed over to their respective backends for processing.。
export async function proxy(req: NextRequest) {

  const { pathname } = req.nextUrl;
  const cookie = req.headers.get('cookie');
  const { userId, uuid } = await getLoginInfo(cookie);

  if (!userId || !uuid) {
    if (isPublicPath(pathname)) {
      return clearLoginCookies(NextResponse.next());
    }

    const loginUrl = req.nextUrl.clone();
    loginUrl.pathname = '/login';
    return clearLoginCookies(NextResponse.redirect(loginUrl));
  }

  // Confirm current session from cache uuid still valid。
  const authInfo = await cache.get<AuthInfo>(AUTH_CACHE_KEY + userId);

  if (!authInfo || !authInfo.uuidList.includes(uuid)) {
    if (isPublicPath(pathname)) {
      return clearLoginCookies(NextResponse.next());
    }

    const loginUrl = req.nextUrl.clone();
    loginUrl.pathname = '/login';
    return clearLoginCookies(NextResponse.redirect(loginUrl));
  }

  if (pathname === '/') {
    const url = req.nextUrl.clone();
    url.pathname = '/photos';
    return NextResponse.redirect(url);
  }

  if (pathname.startsWith('/login')) {
    const photoUrl = req.nextUrl.clone();
    photoUrl.pathname = '/photos';
    return NextResponse.redirect(photoUrl);
  }

  if (isSystemPath(pathname) && authInfo.type !== UserTypeEnum.ADMIN) {
    const notFoundUrl = req.nextUrl.clone();
    notFoundUrl.pathname = '/_not-found';

    return NextResponse.rewrite(notFoundUrl, { status: 404 });
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!api|media|_next/static|_next/image|favicon.ico|robots.txt|.*\\.(?:png|jpg|jpeg|gif|webp|svg|ico)$).*)'],
};
