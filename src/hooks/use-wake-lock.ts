"use client"

import { useEffect, useRef } from "react"

interface WakeLockSentinelLike extends EventTarget {
  readonly released: boolean
  readonly type: "screen"
  release(): Promise<void>
  onrelease: ((this: WakeLockSentinelLike, ev: Event) => void) | null
}

/**
 * Screen Wake Lock API hook: prevents the device display from dimming or locking
 * during long-duration activities like video playback and photo slideshows.
 *
 * Fully supports Android Chrome, Samsung Internet, iPadOS/iOS 16.4+ Safari, and Desktop Chrome/Edge.
 * Gracefully no-ops on unsupported browsers or battery saver restrictions.
 */
export function useWakeLock(enabled: boolean): void {
  const sentinelRef = useRef<WakeLockSentinelLike | null>(null)

  useEffect(() => {
    if (!enabled || typeof window === "undefined" || !("wakeLock" in navigator)) {
      return
    }

    let isMounted = true

    async function requestLock() {
      try {
        if (!isMounted || document.visibilityState !== "visible") return
        if (sentinelRef.current && !sentinelRef.current.released) {
          await sentinelRef.current.release().catch(() => {})
        }
        const nav = navigator as unknown as {
          wakeLock?: { request: (type: "screen") => Promise<WakeLockSentinelLike> }
        }
        if (!nav.wakeLock) return

        const sentinel = await nav.wakeLock.request("screen")
        sentinelRef.current = sentinel
        sentinel.addEventListener("release", () => {
          if (sentinelRef.current === sentinel) {
            sentinelRef.current = null
          }
        })
      } catch {
        sentinelRef.current = null
      }
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible" && enabled) {
        void requestLock()
      }
    }

    void requestLock()
    document.addEventListener("visibilitychange", handleVisibilityChange)

    return () => {
      isMounted = false
      document.removeEventListener("visibilitychange", handleVisibilityChange)
      if (sentinelRef.current && !sentinelRef.current.released) {
        sentinelRef.current.release().catch(() => {})
        sentinelRef.current = null
      }
    }
  }, [enabled])
}

