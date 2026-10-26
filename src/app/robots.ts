import type { MetadataRoute } from "next"

// Known AI scraping bots and LLM training dataset harvesters
const AI_SCRAPER_BOTS = [
  "GPTBot",
  "ChatGPT-User",
  "ClaudeBot",
  "Claude-Web",
  "anthropic-ai",
  "CCBot",
  "Bytespider",
  "Google-Extended",
  "PerplexityBot",
  "Diffbot",
  "cohere-ai",
  "Omgilibot",
  "FacebookBot",
  "Meta-ExternalAgent",
  "Amazonbot",
]

// Sensitive internal system & administrative paths that should never be crawled or indexed
const DISALLOWED_SYSTEM_PATHS = [
  "/login",
  "/admin",
  "/admin/*",
  "/api",
  "/api/*",
  "/storage",
  "/storage/*",
  "/trash",
  "/trash/*",
  "/archive",
  "/archive/*",
  "/duplicates",
  "/duplicates/*",
  "/settings",
  "/settings/*",
]

/**
 * Robots.txt configuration:
 * 1. Strictly blocks AI scrapers and LLM harvesters from crawling user media and training models.
 * 2. Protects sensitive administrative and API endpoints from search engine indexing and probing.
 * 3. Allows legitimate public search engine crawlers (Google, Bing, etc.) for gallery discovery.
 */
export default function robots(): MetadataRoute.Robots {
  const appUrl = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || "https://naypict.my.id"

  return {
    rules: [
      // Block all automated AI dataset scrapers from the entire site
      {
        userAgent: AI_SCRAPER_BOTS,
        disallow: ["/"],
      },
      // Allow legitimate search engines to crawl public gallery while disallowing private admin/api routes
      {
        userAgent: "*",
        allow: ["/", "/photos", "/albums", "/map"],
        disallow: DISALLOWED_SYSTEM_PATHS,
      },
    ],
    sitemap: `${appUrl.replace(/\/+$/, "")}/sitemap.xml`,
  }
}
