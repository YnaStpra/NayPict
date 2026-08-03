import { headers } from "next/headers"
import { getRequestConfig } from "next-intl/server"
import { resolveLocale } from "@/lib/locale"

// This module loads translation messages for the current request based on the browser language。

// Convert dot-separated flat keys in a language file to next-intl Nested messages used。
function nestMessages(messages: Record<string, string>): Record<string, unknown> {
  const result: Record<string, unknown> = {}

  for (const [key, message] of Object.entries(messages)) {
    const parts = key.split(".")
    let target = result

    for (const part of parts.slice(0, -1)) {
      target[part] ??= {}
      target = target[part] as Record<string, unknown>
    }

    target[parts[parts.length - 1]] = message
  }

  return result
}

// Read the browser language and return the corresponding translation message。
export default getRequestConfig(async () => {
  const requestHeaders = await headers()
  const locale = resolveLocale(requestHeaders.get("accept-language"))
  const flatMessages = locale === "en"
    ? (await import("../../locales/web/en.json")).default
    : (await import("../../locales/web/zh.json")).default

  return {
    locale,
    messages: nestMessages(flatMessages),
  }
})
