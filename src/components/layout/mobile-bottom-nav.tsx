"use client"

import React, { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { Images, FolderOpen, MapPin, Menu } from "lucide-react"
import { cn } from "@/lib/utils"
import { useSidebarOptional } from "@/components/ui/sidebar"

/**
 * Ergonomic Mobile Bottom Navigation Dock (One-Handed Thumb Zone)
 * - Fixed floating capsule at the bottom on mobile viewports (<768px / md:hidden)
 * - Safe area aware (env(safe-area-inset-bottom))
 * - Smart scroll auto-hide: hides when scrolling down to maximize photo viewing canvas,
 *   reappears immediately on scroll up or at page top
 * - Automatically conceals when fullscreen photo viewer or mobile sidebar sheet is open
 */
export function MobileBottomNav() {
  const pathname = usePathname()
  const sidebar = useSidebarOptional()

  const [isVisible, setIsVisible] = useState(true)
  const [isViewerOpen, setIsViewerOpen] = useState(false)
  const lastScrollYRef = useRef(0)

  // Track scroll direction: auto-hide on scroll down to maximize mobile screen real-estate
  useEffect(() => {
    if (typeof window === "undefined") return

    const handleScroll = () => {
      const currentScrollY = window.scrollY
      const delta = currentScrollY - lastScrollYRef.current

      // Always show when close to top
      if (currentScrollY < 32) {
        setIsVisible(true)
      } else if (delta > 8) {
        // Scrolling down -> hide bottom dock
        setIsVisible(false)
      } else if (delta < -8) {
        // Scrolling up -> reveal dock
        setIsVisible(true)
      }

      lastScrollYRef.current = currentScrollY
    }

    window.addEventListener("scroll", handleScroll, { passive: true })
    return () => window.removeEventListener("scroll", handleScroll)
  }, [])

  // Automatically hide when fullscreen photo viewer is open
  useEffect(() => {
    if (typeof document === "undefined") return

    const checkViewer = () => {
      const open = Boolean(document.querySelector("[data-yarl-viewer-open='true']"))
      setIsViewerOpen(open)
    }

    checkViewer()

    const observer = new MutationObserver(checkViewer)
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["data-yarl-viewer-open"],
    })

    return () => observer.disconnect()
  }, [])

  // Conceal on login page
  if (pathname === "/login") return null

  const isPhotosActive = pathname === "/photos" || pathname === "/"
  const isAlbumsActive = pathname.startsWith("/albums")
  const isMapActive = pathname.startsWith("/map")

  const handleToggleMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    if (sidebar) {
      sidebar.toggleSidebar()
    }
  }

  const isHidden = !isVisible || isViewerOpen || Boolean(sidebar?.openMobile)

  return (
    <nav
      aria-label="Mobile Navigation Dock"
      data-mobile-dock="true"
      className={cn(
        "fixed left-1/2 -translate-x-1/2 z-40 md:hidden",
        "transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] will-change-transform",
        isHidden
          ? "translate-y-24 opacity-0 pointer-events-none"
          : "translate-y-0 opacity-100 pointer-events-auto"
      )}
      style={{
        bottom: "max(0.75rem, env(safe-area-inset-bottom, 12px))",
      }}
    >
      <div className="flex items-center gap-1 px-2.5 py-1.5 rounded-full bg-background/85 dark:bg-neutral-900/85 backdrop-blur-xl border border-border/60 dark:border-white/10 shadow-2xl shadow-black/25 ring-1 ring-black/5 dark:ring-white/5">
        {/* Photos Tab */}
        <Link
          href="/photos"
          aria-label="Photos"
          className={cn(
            "flex flex-col items-center justify-center min-w-[62px] py-1 px-2 rounded-full text-[10px] font-medium transition-all duration-200 select-none active:scale-90",
            isPhotosActive
              ? "bg-sky-500/15 text-sky-600 dark:text-sky-400 font-semibold shadow-2xs"
              : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
          )}
        >
          <Images className="size-5 mb-0.5" />
          <span>Photos</span>
        </Link>

        {/* Albums Tab */}
        <Link
          href="/albums"
          aria-label="Albums"
          className={cn(
            "flex flex-col items-center justify-center min-w-[62px] py-1 px-2 rounded-full text-[10px] font-medium transition-all duration-200 select-none active:scale-90",
            isAlbumsActive
              ? "bg-amber-500/15 text-amber-600 dark:text-amber-400 font-semibold shadow-2xs"
              : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
          )}
        >
          <FolderOpen className="size-5 mb-0.5" />
          <span>Albums</span>
        </Link>

        {/* Map Tab */}
        <Link
          href="/map"
          aria-label="Map"
          className={cn(
            "flex flex-col items-center justify-center min-w-[62px] py-1 px-2 rounded-full text-[10px] font-medium transition-all duration-200 select-none active:scale-90",
            isMapActive
              ? "bg-rose-500/15 text-rose-600 dark:text-rose-400 font-semibold shadow-2xs"
              : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
          )}
        >
          <MapPin className="size-5 mb-0.5" />
          <span>Map</span>
        </Link>

        {/* Menu Drawer Toggle */}
        <button
          type="button"
          onClick={handleToggleMenu}
          aria-label="Open Navigation Menu"
          className={cn(
            "flex flex-col items-center justify-center min-w-[62px] py-1 px-2 rounded-full text-[10px] font-medium transition-all duration-200 select-none cursor-pointer active:scale-90",
            sidebar?.openMobile
              ? "bg-purple-500/15 text-purple-600 dark:text-purple-400 font-semibold shadow-2xs"
              : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
          )}
        >
          <Menu className="size-5 mb-0.5" />
          <span>Menu</span>
        </button>
      </div>
    </nav>
  )
}
