import enMessages from "../../../locales/server/en.json"
import zhMessages from "../../../locales/server/zh.json"
import { getContext } from "hono/context-storage"
import type { Context, Next } from "hono"
import type { HonoEnv } from "@/server/hono/type"
import { resolveLocale } from "@/lib/locale"

// This module returns the backend internationalized copy based on the message key and request language..

type MessageKey = keyof typeof zhMessages

// Parse the language according to the request header and write the current Hono request context.
async function i18nMiddleware(c: Context<HonoEnv>, next: Next): Promise<void> {
  c.set("locale", resolveLocale(c.req.header("accept-language")))
  await next()
}

// Translate message based on current request language, Unconfigured messages remain original.
function t(message: string): string {
  const locale = getContext<HonoEnv>().get("locale") ?? "en"
  const messages: Record<MessageKey, string> = locale === "zh" ? zhMessages : enMessages
  return messages[message as MessageKey] ?? message
}

export { i18nMiddleware, t }
