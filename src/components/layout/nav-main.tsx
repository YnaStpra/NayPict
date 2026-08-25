"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import {
  SidebarGroup,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"

// Cache map of prefetched URLs to avoid redundant router prefetch triggers
const prefetchedRoutes = new Set<string>();

export function NavMain({
  items,
}: {
  items: {
    title: string
    url: string
    icon?: React.ReactNode
    isActive?: boolean
  }[]
}) {
  const pathname = usePathname()
  const router = useRouter()

  // Determine whether the current browser path hits the menu URL.
  function isUrlMatched(url: string) {
    return pathname === url || pathname.startsWith(`${url}/`)
  }

  // Adaptive intent-based route prefetching on hover or touchstart (respects Save-Data & 2G connections)
  function handleIntentPrefetch(url: string) {
    if (url === pathname || prefetchedRoutes.has(url)) return;

    // Respect user's Save-Data mode or slow mobile connections
    if (typeof navigator !== "undefined") {
      const conn = (navigator as unknown as { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
      if (conn?.saveData || conn?.effectiveType === "slow-2g" || conn?.effectiveType === "2g") {
        return;
      }
    }

    prefetchedRoutes.add(url);
    try {
      router.prefetch(url);

      // Speculative Dynamic Chunk Prefetching for heavy modules
      if (url === "/map") {
        import("@/components/map/photo-map-view").catch(() => {});
      } else if (url === "/photos") {
        import("@/components/photo/photo-viewer").catch(() => {});
      }
    } catch {
      // Gracefully ignore prefetch error
    }
  }

  return (
    <SidebarGroup>
      <SidebarMenu>
        {items.map((item) => (
          <SidebarMenuItem key={item.title} className="mb-1 magnetic-nav-item">
            <SidebarMenuButton
              asChild
              isActive={isUrlMatched(item.url)}
              tooltip={item.title}
              onMouseEnter={() => handleIntentPrefetch(item.url)}
              onTouchStart={() => handleIntentPrefetch(item.url)}
            >
              <Link
                href={item.url}
                prefetch={true}
                onMouseEnter={() => handleIntentPrefetch(item.url)}
                onTouchStart={() => handleIntentPrefetch(item.url)}
              >
                {item.icon}
                <span>{item.title}</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        ))}
      </SidebarMenu>
    </SidebarGroup>
  )
}
