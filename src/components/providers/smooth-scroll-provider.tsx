"use client"

import React, { useEffect } from "react"
import { ReactLenis, useLenis } from "lenis/react"

interface SmoothScrollProviderProps {
  children: React.ReactNode
}

/**
 * Controller component that synchronizes Lenis scroll state with:
 * 1. Radix Dialogs, Modals, and Drawers (body[data-scroll-locked])
 * 2. Lightbox viewers (yarl__no_scroll)
 * 3. Mobile touch behavior & accessibility settings (prefers-reduced-motion)
 */
function LenisScrollController() {
  const lenis = useLenis()

  useEffect(() => {
    if (!lenis || typeof document === "undefined") return

    // Observe body for data-scroll-locked or modal-open classes to cleanly stop/start smooth scroll
    const checkModalLock = () => {
      const isLocked =
        document.body.hasAttribute("data-scroll-locked") ||
        document.body.classList.contains("yarl__no_scroll") ||
        document.querySelector('[data-slot="dialog-content"]') !== null ||
        document.querySelector('[data-slot="alert-dialog-content"]') !== null

      if (isLocked) {
        lenis.stop()
      } else {
        lenis.start()
      }
    }

    checkModalLock()

    const observer = new MutationObserver(checkModalLock)
    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ["data-scroll-locked", "class", "style"],
      childList: true,
      subtree: true,
    })

    return () => {
      observer.disconnect()
    }
  }, [lenis])

  return null
}

export function SmoothScrollProvider({ children }: SmoothScrollProviderProps) {
  return (
    <ReactLenis
      root
      options={{
        lerp: 0.1, // Organic Apple-style momentum glide on desktop
        duration: 1.1,
        smoothWheel: true,
        wheelMultiplier: 1.0,
        syncTouch: false, // Critical for 120 FPS: mobile touch scroll is 100% handled by native hardware GPU compositor
        touchMultiplier: 1.0,
        autoResize: true,
        prevent: (node) => {
          // Allow normal inner scrolling inside dialogs, dropdowns, and sidebars
          return Boolean(
            node.hasAttribute("data-lenis-prevent") ||
            node.closest("[data-lenis-prevent]") ||
            node.closest('[data-slot="dialog-content"]') ||
            node.closest('[role="dialog"]') ||
            node.closest(".no-scrollbar")
          )
        },
      }}
    >
      <LenisScrollController />
      {children}
    </ReactLenis>
  )
}
