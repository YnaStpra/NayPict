import { TOKEN_COOKIE_NAME } from "@/server/const/global"
import { sessionService } from "@/server/service/session-service"

// This module encapsulates the browser Cookie Read and business Cookie parse.

type LoginCookie = {
  userId: string | null
  uuid: string | null
  tokenVersion: number
}

// from browser Cookie Read the value of the specified name in.
function getCookieValue(name: string) {
  const item = document.cookie
    .split("; ")
    .find((cookie) => cookie.startsWith(`${name}=`))

  return item?.slice(name.length + 1)
}

// from incoming Cookie Read the value of the specified name from the string.
function getCookieValueFromString(cookie: string | null | undefined, name: string) {
  if (!cookie) {
    return undefined
  }

  const item = cookie
    .split("; ")
    .find((cookieItem) => cookieItem.startsWith(`${name}=`))

  return item?.slice(name.length + 1)
}

// from incoming Cookie Verify login in string token, and returns the user id with session uuid.
async function getLoginInfo(cookie: string | null = null): Promise<LoginCookie> {
  const token =
    getCookieValueFromString(cookie, TOKEN_COOKIE_NAME) ||
    getCookieValueFromString(cookie, '__Host-token') ||
    getCookieValueFromString(cookie, 'token') ||
    getCookieValueFromString(cookie, '__Host-naypict_token') ||
    getCookieValueFromString(cookie, 'naypict_token');

  const { verifyLoginToken } = await import("@/server/lib/jwt");
  const payload = await verifyLoginToken(token);

  if (!payload) {
    return {
      userId: null,
      uuid: null,
      tokenVersion: 1,
    };
  }

  // Legacy tokens without the claim remain valid only while the persisted version is still one.
  const tokenVersion = payload.tokenVersion ?? 1;
  const persistedVersion = await sessionService.getTokenVersion(payload.userId);

  if (persistedVersion !== tokenVersion) {
    return {
      userId: null,
      uuid: null,
      tokenVersion,
    };
  }

  return {
    userId: payload.userId,
    uuid: payload.uuid,
    tokenVersion,
  };
}

export { getCookieValue, getCookieValueFromString, getLoginInfo }
export type { LoginCookie }
