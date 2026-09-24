"use client"

import { useEffect, useRef } from "react"
import { ArrowUp } from "lucide-react"

/**
 * Floating Explorer & Back-to-Top Capsule with Spring Pop & Realtime 120 FPS Scroll Percentage
 */
export function BackToTopButton() {
  const buttonRef = useRef<HTMLButtonElement | null>(null)
  const progressTextRef = useRef<HTMLSpanElement | null>(null)
  const isVisibleRef = useRef(false)

  useEffect(() => {
    const updateProgress = () => {
      const scrollY = window.scrollY || window.pageYOffset || document.documentElement.scrollTop || 0
      const totalHeight = (document.documentElement.scrollHeight || document.body.scrollHeight) - window.innerHeight
      const progress = totalHeight > 0 ? Math.min(100, Math.max(0, Math.round((scrollY / totalHeight) * 100))) : 0

      // Instant 120 FPS direct text update (no React re-render queueing)
      if (progressTextRef.current) {
        progressTextRef.current.textContent = `${progress}%`
      }

      // Smooth visibility transitions
      const shouldBeVisible = scrollY > 300
      if (shouldBeVisible !== isVisibleRef.current) {
        isVisibleRef.current = shouldBeVisible
        if (buttonRef.current) {
          if (shouldBeVisible) {
            buttonRef.current.style.opacity = "1"
            buttonRef.current.style.pointerEvents = "auto"
            buttonRef.current.style.transform = "scale(1)"
          } else {
            buttonRef.current.style.opacity = "0"
            buttonRef.current.style.pointerEvents = "none"
            buttonRef.current.style.transform = "scale(0.85)"
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
        transform: "scale(0.85)",
        transition: "opacity 0.25s cubic-bezier(0.16, 1, 0.3, 1), transform 0.25s cubic-bezier(0.16, 1, 0.3, 1)",
      }}
      className="fixed bottom-6 right-6 z-40 flex items-center gap-2 pl-3 pr-2 py-1.5 rounded-full bg-background/85 dark:bg-neutral-900/85 backdrop-blur-xl border border-white/25 dark:border-white/15 shadow-2xl text-foreground elastic-pop-badge hover:scale-105 active:scale-95 cursor-pointer select-none group will-change-transform"
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
