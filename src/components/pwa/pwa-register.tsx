"use client"

import { useEffect } from "react"

// Automatically registers the NayPict PWA service worker and handles offline capability.
export function PwaRegister() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
      return
    }

    // Register service worker
    const registerSw = async () => {
      try {
        const registration = await navigator.serviceWorker.register("/sw.js", {
          scope: "/",
        })

        // Check for service worker updates periodically
        registration.addEventListener("updatefound", () => {
          const newWorker = registration.installing
          if (newWorker) {
            newWorker.addEventListener("statechange", () => {
              if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
                console.log("[PWA] New version of NayPict is available.")
              }
            })
          }
        })
      } catch (err) {
        console.warn("[PWA] Service worker registration failed:", err)
      }
    }

    // Register after page is fully loaded to not block first contentful paint
    if (document.readyState === "complete") {
      registerSw()
    } else {
      window.addEventListener("load", registerSw)
      return () => window.removeEventListener("load", registerSw)
    }
  }, [])

  return null
}

/**
 * Speculatively prefetch media derivative URLs into Service Worker CacheStorage.
 * Runs in background off the main thread with low priority.
 */
export function prefetchMediaInSw(urls: string[]) {
  if (typeof window === "undefined" || !("serviceWorker" in navigator) || !navigator.serviceWorker.controller) return
  if (!urls || urls.length === 0) return

  try {
    navigator.serviceWorker.controller.postMessage({
      type: "PREFETCH_MEDIA",
      urls,
    })
  } catch {}
}

/**
 * Invalidate cached catalog and album list responses in Service Worker after mutations.
 */
export function invalidateSwApiCache() {
  if (typeof window === "undefined" || !("serviceWorker" in navigator) || !navigator.serviceWorker.controller) return

  try {
    navigator.serviceWorker.controller.postMessage({
      type: "INVALIDATE_API_CACHE",
    })
  } catch {}
}

