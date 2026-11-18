"use client"

import React, { useEffect, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Download, Smartphone, X, Sparkles } from "lucide-react"
import { usePwaInstall } from "@/hooks/use-pwa-install"
import { PwaIosDialog } from "@/components/pwa/pwa-ios-dialog"
import { useSidebarOptional } from "@/components/ui/sidebar"
import { NaypictLogo } from "@/components/icons/naypict-logo"
import { Button } from "@/components/ui/button"

const DISMISS_KEY = "naypict_pwa_banner_dismissed_until"
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000

/**
 * Smart Non-Intrusive Mobile PWA Install Banner & iOS Safari A2HS Guide
 * - Appears on mobile viewports (<768px / md:hidden) after 2.5s page settling delay
 * - Floats gracefully above the Mobile Bottom Navigation Dock with safe-area bottom insets
 * - Android / Chromium: triggers native beforeinstallprompt dialog
 * - iOS Safari: opens native-like 2-step Add-to-Home-Screen guide dialog
 * - Auto-hides when photo viewer lightbox or mobile sidebar menu is active
 * - Remembers user dismissals for 7 days in localStorage
 */
export function MobilePwaBanner() {
  const { canInstall, isInstalled, isIos, isIosGuideOpen, setIsIosGuideOpen, promptInstall } = usePwaInstall()
  const sidebar = useSidebarOptional()

  const [isDismissed, setIsDismissed] = useState(true)
  const [isDelayedReady, setIsDelayedReady] = useState(false)
  const [isViewerOpen, setIsViewerOpen] = useState(false)

  // Check dismissal cooldown in localStorage
  useEffect(() => {
    if (typeof window === "undefined") return

    try {
      const dismissedUntil = localStorage.getItem(DISMISS_KEY)
      if (dismissedUntil && Date.now() < parseInt(dismissedUntil, 10)) {
        setIsDismissed(true)
      } else {
        setIsDismissed(false)
      }
    } catch {
      setIsDismissed(false)
    }

    // Delay banner display by 2.5s for seamless page landing
    const timer = setTimeout(() => {
      setIsDelayedReady(true)
    }, 2500)

    return () => clearTimeout(timer)
  }, [])

  // Auto-hide when lightbox photo viewer is open
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

  const handleDismiss = (e: React.MouseEvent) => {
    e.stopPropagation()
    setIsDismissed(true)
    try {
      localStorage.setItem(DISMISS_KEY, (Date.now() + SEVEN_DAYS_MS).toString())
    } catch {}
  }

  const handleInstallClick = () => {
    void promptInstall()
  }

  const shouldShow =
    canInstall &&
    !isInstalled &&
    !isDismissed &&
    isDelayedReady &&
    !isViewerOpen &&
    !Boolean(sidebar?.openMobile)

  return (
    <>
      <AnimatePresence>
        {shouldShow && (
          <motion.aside
            role="region"
            aria-label="Install NayPict Web Application"
            initial={{ opacity: 0, y: 30, scale: 0.94 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 25, scale: 0.94 }}
            transition={{ type: "spring", stiffness: 420, damping: 28 }}
            className="fixed left-3 right-3 sm:left-auto sm:right-4 z-40 md:hidden max-w-sm sm:max-w-md mx-auto pointer-events-auto"
            style={{
              bottom: "max(4.5rem, calc(env(safe-area-inset-bottom, 12px) + 3.75rem))",
            }}
          >
            <div className="flex items-center justify-between gap-3 p-3 rounded-2xl bg-neutral-900/95 dark:bg-neutral-900/95 border border-white/15 dark:border-white/15 backdrop-blur-2xl shadow-2xl shadow-black/40 text-white">
              {/* NayPict App Icon */}
              <div className="relative flex size-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary/25 to-primary/10 border border-primary/30 shadow-xs">
                <NaypictLogo className="size-5 text-primary" />
                <span className="absolute -top-1 -right-1 flex size-3 items-center justify-center rounded-full bg-primary text-[8px] text-primary-foreground font-bold shadow-xs">
                  <Sparkles className="size-2 text-white" />
                </span>
              </div>

              {/* Title & Subtitle */}
              <div className="flex flex-col min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-bold tracking-tight text-white truncate">
                    NayPict
                  </span>
                  <span className="text-[10px] font-semibold px-1.5 py-0.2 rounded-full bg-primary/20 text-primary border border-primary/30 uppercase tracking-wider">
                    PWA
                  </span>
                </div>
                <p className="text-[11px] text-neutral-300 leading-tight truncate">
                  {isIos ? "Add to Home Screen for fullscreen" : "Fast, offline & fullscreen gallery"}
                </p>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-1.5 shrink-0">
                <Button
                  type="button"
                  size="sm"
                  onClick={handleInstallClick}
                  className="h-8 px-3 text-xs font-semibold rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 active:scale-95 transition-all cursor-pointer shadow-xs flex items-center gap-1.5"
                >
                  {isIos ? (
                    <Smartphone className="size-3.5" />
                  ) : (
                    <Download className="size-3.5" />
                  )}
                  <span>{isIos ? "Install" : "Install"}</span>
                </Button>

                <button
                  type="button"
                  onClick={handleDismiss}
                  aria-label="Dismiss install banner"
                  className="flex size-7 items-center justify-center rounded-lg text-neutral-400 hover:text-white hover:bg-white/10 active:scale-90 transition-all cursor-pointer"
                >
                  <X className="size-4" />
                </button>
              </div>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      {/* Render iOS Guide Dialog when triggered on iOS */}
      <PwaIosDialog open={isIosGuideOpen} onOpenChange={setIsIosGuideOpen} />
    </>
  )
}
