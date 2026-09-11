"use client"

import { useEffect, useRef } from "react"
import { getSyncVersion } from "@/request/sync"
import { emitCatalogSync } from "@/lib/catalog-sync"
import { type CatalogSyncVersionVo } from "@/server/entity/vo/sync"

// Polling interval in milliseconds when tab is active (5 seconds).
// Due to Cloudflare Edge CDN 3s caching, 10,000 visitors produce only ~20 req/min to Vercel.
const SYNC_POLL_INTERVAL = 5000

/**
 * Global background catalog synchronization hook.
 * Monitors edge-cached version vector and triggers silent component revalidation when mutations occur.
 * Automatically pauses when browser tab is inactive to preserve battery, bandwidth, and Vercel quota.
 */
export function useLiveCatalogSync() {
  const lastVersionRef = useRef<CatalogSyncVersionVo | null>(null)
  const isCheckingRef = useRef(false)

  useEffect(() => {
    let timer: NodeJS.Timeout | null = null

    // Check edge-cached version and emit local/cross-tab events if revision bumped.
    const checkSync = async () => {
      if (isCheckingRef.current) return
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return

      isCheckingRef.current = true
      try {
        const latest = await getSyncVersion()
        if (!latest || typeof latest.v !== "number") return

        // First initial check: calibrate baseline version without firing mutation events
        if (!lastVersionRef.current) {
          lastVersionRef.current = latest
          return
        }

        const prev = lastVersionRef.current
        if (latest.v !== prev.v) {
          const albumChanged = latest.albumV !== prev.albumV
          const photoChanged = latest.photoV !== prev.photoV || latest.photoCount !== prev.photoCount

          lastVersionRef.current = latest

          if (albumChanged && photoChanged) {
            emitCatalogSync("all", { count: latest.photoCount, photoCount: latest.photoCount })
          } else if (albumChanged) {
            emitCatalogSync("album", { count: latest.photoCount, photoCount: latest.photoCount })
          } else if (photoChanged) {
            emitCatalogSync("photo", { count: latest.photoCount, photoCount: latest.photoCount })
          }
        }
      } catch {
        // Silently tolerate transient offline/network anomalies
      } finally {
        isCheckingRef.current = false
      }
    }

    // Schedule regular heartbeat check while tab is visible
    const startHeartbeat = () => {
      if (timer) clearInterval(timer)
      timer = setInterval(checkSync, SYNC_POLL_INTERVAL)
    }

    const stopHeartbeat = () => {
      if (timer) {
        clearInterval(timer)
        timer = null
      }
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void checkSync()
        startHeartbeat()
      } else {
        stopHeartbeat()
      }
    }

    // Initial check and heartbeat start
    void checkSync()
    startHeartbeat()

    document.addEventListener("visibilitychange", handleVisibilityChange)
    window.addEventListener("focus", handleVisibilityChange)

    return () => {
      stopHeartbeat()
      document.removeEventListener("visibilitychange", handleVisibilityChange)
      window.removeEventListener("focus", handleVisibilityChange)
    }
  }, [])
}
