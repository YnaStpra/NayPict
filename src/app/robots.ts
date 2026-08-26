import type { MetadataRoute } from "next"

// Only prohibit crawlers from crawling the login page.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/login"],
    },
  }
}
