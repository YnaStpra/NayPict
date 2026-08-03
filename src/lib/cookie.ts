import { TOKEN_COOKIE_NAME } from "@/server/const/global"

// This module encapsulates the browser Cookie Read and business Cookie parse。

type LoginCookie = {
  userId: string | null
  uuid: string | null
}

// from browser Cookie Read the value of the specified name in。
function getCookieValue(name: string) {
  const item = document.cookie
    .split("; ")
    .find((cookie) => cookie.startsWith(`${name}=`))

  return item?.slice(name.length + 1)
}

// from incoming Cookie Read the value of the specified name from the string。
function getCookieValueFromString(cookie: string | null | undefined, name: string) {
  if (!cookie) {
    return undefined
  }

  const item = cookie
    .split("; ")
    .find((cookieItem) => cookieItem.startsWith(`${name}=`))

  return item?.slice(name.length + 1)
}

// from incoming Cookie Verify login in string token，and returns the user id with session uuid。
async function getLoginInfo(cookie: string | null = null): Promise<LoginCookie> {
  const token = getCookieValueFromString(cookie, TOKEN_COOKIE_NAME)
  const { verifyLoginToken } = await import("@/server/lib/jwt")
  const payload = await verifyLoginToken(token)

  return {
    userId: payload?.userId ?? null,
    uuid: payload?.uuid ?? null,
  }
}

export { getCookieValue, getCookieValueFromString, getLoginInfo }
export type { LoginCookie }
