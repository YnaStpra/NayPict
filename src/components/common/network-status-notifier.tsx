"use client"

import { useEffect } from "react"
import { notifyConnectionLost, notifyConnectionRestored, getIsOffline } from "@/lib/network-status"

/**
 * Global background listener that monitors browser online/offline transitions,
 * window focus, and active network health probes to ensure connection lost
 * notifications are automatically and reliably dismissed as soon as internet returns.
 */
export function NetworkStatusNotifier() {
  useEffect(() => {
    if (typeof window === "undefined") return

    // Check initial online status
    if (!navigator.onLine) {
      notifyConnectionLost()
    }

    const handleOnline = () => {
      notifyConnectionRestored()
    }

    const handleOffline = () => {
      notifyConnectionLost()
    }

    const checkConnectivity = () => {
      if (navigator.onLine && getIsOffline()) {
        notifyConnectionRestored()
      }
    }

    window.addEventListener("online", handleOnline)
    window.addEventListener("offline", handleOffline)
    window.addEventListener("focus", checkConnectivity)
    document.addEventListener("visibilitychange", checkConnectivity)

    // Active heartbeat check: when flagged as offline, poll every 2.5s to auto-recover if browser missed event
    const interval = setInterval(() => {
      if (getIsOffline()) {
        if (navigator.onLine) {
          // Verify with a lightweight zero-byte probe
          fetch(`/favicon.ico?_ping=${Date.now()}`, { method: "HEAD", cache: "no-store" })
            .then(() => {
              notifyConnectionRestored()
            })
            .catch(() => {})
        }
      }
    }, 2500)

    return () => {
      window.removeEventListener("online", handleOnline)
      window.removeEventListener("offline", handleOffline)
      window.removeEventListener("focus", checkConnectivity)
      document.removeEventListener("visibilitychange", checkConnectivity)
      clearInterval(interval)
    }
  }, [])

  return null
}
