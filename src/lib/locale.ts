// This module parses the browser language。

// according to Accept-Language Select Chinese or English as the browser language with the highest priority。
function resolveLocale(acceptLanguage: string | null | undefined) {
  const languages = (acceptLanguage ?? "")
    .split(",")
    .map((item) => {
      const [language, ...params] = item.trim().split(";")
      const qualityParam = params.find((param) => param.trim().startsWith("q="))

      return {
        language: language.toLowerCase(),
        quality: qualityParam ? Number(qualityParam.trim().slice(2)) : 1,
      }
    })
    .filter((item) => item.language && item.quality > 0)
    .sort((left, right) => right.quality - left.quality)

  const preferredLanguage = languages[0]?.language

  if (preferredLanguage === "zh" || preferredLanguage?.startsWith("zh-")) {
    return "zh"
  }

  return "en"
}

export { resolveLocale }
