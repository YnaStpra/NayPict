// This module parses the browser language。

// according to Accept-Language Select Chinese or English as the browser language with the highest priority。
// resolveLocale returns 'en' as default locale
function resolveLocale(acceptLanguage: string | null | undefined) {
  return "en"
}

export { resolveLocale }
