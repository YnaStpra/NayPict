import type { MetadataRoute } from "next"

/**
 * Authoritative Application Sitemap (Anti-SEO Hijacking & Canonical Discovery)
 * Strictly enumerates legitimate public routes to search engines (Google, Bing, etc.)
 * Prevents malicious SEO poisoning, fake cloaked URL indexing, and search engine spoofing.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const appUrl = (
    process.env.APP_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    "https://naypict.my.id"
  ).replace(/\/+$/, "")

  const now = new Date()

  // Base authorized public pages
  const staticRoutes: MetadataRoute.Sitemap = [
    {
      url: `${appUrl}/`,
      lastModified: now,
      changeFrequency: "daily",
      priority: 1.0,
    },
    {
      url: `${appUrl}/photos`,
      lastModified: now,
      changeFrequency: "daily",
      priority: 0.9,
    },
    {
      url: `${appUrl}/albums`,
      lastModified: now,
      changeFrequency: "daily",
      priority: 0.8,
    },
    {
      url: `${appUrl}/map`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.7,
    },
  ]

  // Dynamically attach authorized public albums (ignoring DB errors safely during static build evaluation)
  try {
    const { albumService } = await import("@/server/service/album-service")
    const publicAlbums = await albumService.list(undefined, 0)
    const albumRoutes: MetadataRoute.Sitemap = (publicAlbums || []).map((album) => ({
      url: `${appUrl}/albums/${album.albumId}`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.6,
    }))
    return [...staticRoutes, ...albumRoutes]
  } catch {
    return staticRoutes
  }
}
