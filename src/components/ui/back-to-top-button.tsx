"use client"

import { useEffect, useState } from "react"
import { ArrowUp } from "lucide-react"

/**
 * Floating Explorer & Back-to-Top Capsule with Spring Pop & Scroll Percentage
 */
export function BackToTopButton() {
  const [visible, setVisible] = useState(false)
  const [scrollProgress, setScrollProgress] = useState(0)

  useEffect(() => {
    let ticking = false

    const handleScroll = () => {
      if (!ticking) {
        window.requestAnimationFrame(() => {
          const scrollY = window.scrollY
          const totalHeight = document.documentElement.scrollHeight - window.innerHeight
          const progress = totalHeight > 0 ? Math.min(100, Math.round((scrollY / totalHeight) * 100)) : 0

          setScrollProgress(progress)
          setVisible(scrollY > 400)
          ticking = false
        })
        ticking = true
      }
    }

    window.addEventListener("scroll", handleScroll, { passive: true })
    handleScroll()

    return () => window.removeEventListener("scroll", handleScroll)
  }, [])

  const scrollToTop = () => {
    window.scrollTo({
      top: 0,
      behavior: "smooth",
    })
  }

  if (!visible) return null

  return (
    <button
      type="button"
      onClick={scrollToTop}
      className="fixed bottom-6 right-6 z-40 flex items-center gap-2 pl-3 pr-2 py-1.5 rounded-full bg-background/85 dark:bg-neutral-900/85 backdrop-blur-xl border border-white/25 dark:border-white/15 shadow-2xl text-foreground elastic-pop-badge hover:scale-105 active:scale-95 transition-all duration-200 cursor-pointer select-none group"
      aria-label="Back to top"
      title="Scroll back to top"
    >
      <span className="text-[11px] font-bold text-muted-foreground group-hover:text-primary transition-colors tabular-nums">
        {scrollProgress}%
      </span>
      <div className="flex size-7 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-xs group-hover:bg-primary/90 transition-all">
        <ArrowUp className="size-4 transition-transform group-hover:-translate-y-0.5" />
      </div>
    </button>
  )
}
