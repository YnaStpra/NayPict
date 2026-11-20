"use client"

import { useEffect, useRef } from "react"
import { ArrowUp } from "lucide-react"

/**
 * Floating Explorer & Back-to-Top Capsule with Apple-style Fluid Spring Motion
 * - Realtime 120 FPS Scroll Percentage
 * - Direction-aware on mobile (<768px): automatically glides down & fades out when scrolling down,
 *   smoothly reappears when scrolling up (synchronized with Mobile Navigation Dock)
 * - Cinema-grade smooth transitions (360ms cubic-bezier easing) to prevent abrupt visual flick
 * - Auto-conceals when fullscreen photo viewer is open
 */
export function BackToTopButton() {
  const buttonRef = useRef<HTMLButtonElement | null>(null)
  const progressTextRef = useRef<HTMLSpanElement | null>(null)
  const isVisibleRef = useRef(false)
  const lastScrollYRef = useRef(0)
  const isScrollingUpRef = useRef(true)
  const isViewerOpenRef = useRef(false)

  useEffect(() => {
    // 1. Monitor photo viewer / lightbox state to hide button when viewer is active
    const checkViewer = () => {
      const open = Boolean(document.querySelector("[data-yarl-viewer-open='true']"))
      isViewerOpenRef.current = open
      if (open && isVisibleRef.current) {
        isVisibleRef.current = false
        if (buttonRef.current) {
          buttonRef.current.style.opacity = "0"
          buttonRef.current.style.pointerEvents = "none"
          buttonRef.current.style.transform = "translate3d(0, 1.25rem, 0) scale(0.92)"
        }
      }
    }

    checkViewer()
    const observer = new MutationObserver(checkViewer)
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["data-yarl-viewer-open"],
    })

    // 2. High-frequency 120 FPS scroll handler with direction awareness
    const updateProgress = () => {
      const scrollY = window.scrollY || window.pageYOffset || document.documentElement.scrollTop || 0
      const totalHeight = (document.documentElement.scrollHeight || document.body.scrollHeight) - window.innerHeight
      const progress = totalHeight > 0 ? Math.min(100, Math.max(0, Math.round((scrollY / totalHeight) * 100))) : 0

      // Instant 120 FPS direct text update (no React re-render queueing)
      if (progressTextRef.current) {
        progressTextRef.current.textContent = `${progress}%`
      }

      const isMobile = window.innerWidth < 768
      const delta = scrollY - lastScrollYRef.current

      // Direction detection on mobile (threshold of 6px to avoid micro-jitter)
      if (isMobile) {
        if (delta > 6) {
          isScrollingUpRef.current = false // scrolling down -> hide
        } else if (delta < -6) {
          isScrollingUpRef.current = true // scrolling up -> reveal
        }
      } else {
        isScrollingUpRef.current = true
      }

      lastScrollYRef.current = scrollY

      // Determine visibility
      const pastThreshold = scrollY > 300
      const shouldBeVisible =
        pastThreshold &&
        !isViewerOpenRef.current &&
        (!isMobile || isScrollingUpRef.current)

      if (shouldBeVisible !== isVisibleRef.current) {
        isVisibleRef.current = shouldBeVisible
        if (buttonRef.current) {
          if (shouldBeVisible) {
            buttonRef.current.style.opacity = "1"
            buttonRef.current.style.pointerEvents = "auto"
            buttonRef.current.style.transform = "translate3d(0, 0, 0) scale(1)"
          } else {
            buttonRef.current.style.opacity = "0"
            buttonRef.current.style.pointerEvents = "none"
            buttonRef.current.style.transform = isMobile
              ? "translate3d(0, 1.25rem, 0) scale(0.92)"
              : "translate3d(0, 0.5rem, 0) scale(0.92)"
          }
        }
      }
    }

    // High-frequency event listeners for desktop and mobile touch
    window.addEventListener("scroll", updateProgress, { passive: true })
    window.addEventListener("touchmove", updateProgress, { passive: true })
    window.addEventListener("resize", updateProgress, { passive: true })
    updateProgress()

    return () => {
      observer.disconnect()
      window.removeEventListener("scroll", updateProgress)
      window.removeEventListener("touchmove", updateProgress)
      window.removeEventListener("resize", updateProgress)
    }
  }, [])

  const scrollToTop = () => {
    window.scrollTo({
      top: 0,
      behavior: "smooth",
    })
  }

  return (
    <button
      ref={buttonRef}
      type="button"
      onClick={scrollToTop}
      style={{
        opacity: 0,
        pointerEvents: "none",
        transform: "translate3d(0, 1.25rem, 0) scale(0.92)",
        transition:
          "opacity 0.36s cubic-bezier(0.22, 1, 0.36, 1), transform 0.36s cubic-bezier(0.22, 1, 0.36, 1)",
      }}
      className="fixed max-md:bottom-[max(4.75rem,calc(env(safe-area-inset-bottom,0px)+4rem))] md:bottom-[max(1.5rem,calc(env(safe-area-inset-bottom,0px)+0.75rem))] right-[max(1.5rem,calc(env(safe-area-inset-right,0px)+0.75rem))] z-40 flex items-center gap-2 pl-3 pr-2 py-1.5 rounded-full bg-background/85 dark:bg-neutral-900/85 backdrop-blur-xl border border-white/25 dark:border-white/15 shadow-2xl text-foreground elastic-pop-badge hover:scale-105 active:scale-95 cursor-pointer select-none group will-change-transform"
      aria-label="Back to top"
      title="Scroll back to top"
    >
      <span
        ref={progressTextRef}
        className="text-[11px] font-bold text-muted-foreground group-hover:text-primary transition-colors tabular-nums min-w-[28px] text-right"
      >
        0%
      </span>
      <div className="flex size-7 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-xs group-hover:bg-primary/90 transition-all">
        <ArrowUp className="size-4 transition-transform group-hover:-translate-y-0.5" />
      </div>
    </button>
  )
}
