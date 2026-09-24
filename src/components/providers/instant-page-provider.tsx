"use client"

import { useEffect, useRef } from "react"
import { useRouter } from "next/navigation"

/**
 * InstantPageProvider implements high-precision speculative route preloading inspired by instant.page.
 *
 * 1. Mobile touchstart: Fires ~100-300ms before tap release/click. Prefetches route instantly.
 * 2. Desktop mouseover: 65ms hover intent threshold filter avoids prefetching inadvertent mouse passes.
 * 3. Automatically ignores external links, file downloads, API routes, data-no-instant links, and respects Data Saver.
 */
export function InstantPageProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const prefetchedUrls = useRef<Set<string>>(new Set())
  const hoverTimer = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    if (typeof window === "undefined") return

    // Honor user Data Saver preference and slow 2G connections
    const nav = navigator as unknown as { connection?: { saveData?: boolean; effectiveType?: string } }
    if (nav?.connection?.saveData || nav?.connection?.effectiveType === "2g") {
      return
    }

    const isEligibleAnchor = (anchor: HTMLAnchorElement | null): string | null => {
      if (!anchor) return null

      // Ignore links with target="_blank" or download attribute
      if (anchor.target && anchor.target !== "_self") return null
      if (anchor.hasAttribute("download")) return null

      // Check opt-out attribute
      if (anchor.hasAttribute("data-no-instant") || anchor.hasAttribute("data-no-prefetch")) {
        return null
      }

      const href = anchor.getAttribute("href")
      if (!href) return null

      // Must be internal path or same-origin
      if (
        href.startsWith("#") ||
        href.startsWith("mailto:") ||
        href.startsWith("tel:") ||
        href.startsWith("javascript:")
      ) {
        return null
      }

      try {
        const url = new URL(href, window.location.origin)
        if (url.origin !== window.location.origin) return null

        const pathname = url.pathname

        // Skip API routes, auth endpoints, or direct media files
        if (
          pathname.startsWith("/api/") ||
          pathname.includes("/logout") ||
          /\.(jpg|jpeg|png|webp|gif|svg|avif|mp4|webm|zip|tar|gz|pdf)$/i.test(pathname)
        ) {
          return null
        }

        // Return path + search
        return url.pathname + url.search
      } catch {
        return null
      }
    }

    const prefetchUrl = (url: string) => {
      if (!url || prefetchedUrls.current.has(url)) return
      prefetchedUrls.current.add(url)
      try {
        router.prefetch(url)
      } catch {}
    }

    const handleMouseOver = (e: MouseEvent) => {
      const target = (e.target as HTMLElement)?.closest<HTMLAnchorElement>("a")
      const url = isEligibleAnchor(target)
      if (!url || prefetchedUrls.current.has(url)) return

      if (hoverTimer.current) clearTimeout(hoverTimer.current)
      hoverTimer.current = setTimeout(() => {
        prefetchUrl(url)
      }, 65) // 65ms intent threshold (instant.page proven optimal)
    }

    const handleMouseOut = (e: MouseEvent) => {
      const target = (e.target as HTMLElement)?.closest<HTMLAnchorElement>("a")
      if (target && hoverTimer.current) {
        clearTimeout(hoverTimer.current)
        hoverTimer.current = null
      }
    }

    const handleTouchStart = (e: TouchEvent) => {
      const target = (e.target as HTMLElement)?.closest<HTMLAnchorElement>("a")
      const url = isEligibleAnchor(target)
      if (!url) return
      // Touchstart triggers immediately to beat the 100-300ms click delay on touch screens
      prefetchUrl(url)
    }

    document.addEventListener("mouseover", handleMouseOver, { passive: true })
    document.addEventListener("mouseout", handleMouseOut, { passive: true })
    document.addEventListener("touchstart", handleTouchStart, { passive: true })

    return () => {
      if (hoverTimer.current) clearTimeout(hoverTimer.current)
      document.removeEventListener("mouseover", handleMouseOver)
      document.removeEventListener("mouseout", handleMouseOut)
      document.removeEventListener("touchstart", handleTouchStart)
    }
  }, [router])

  return <>{children}</>
}
