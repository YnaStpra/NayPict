"use client"

import { useEffect, useRef } from "react"
import { notifyConnectionLost, notifyConnectionRestored } from "@/lib/network-status"

/**
 * Global background listener that monitors browser online/offline events
 * and triggers smooth, non-intrusive connection state toasts.
 */
export function NetworkStatusNotifier() {
  const wasOfflineRef = useRef(false)

  useEffect(() => {
    if (typeof window === "undefined") return

    // Check initial online status
    if (!navigator.onLine) {
      wasOfflineRef.current = true
      notifyConnectionLost()
    }

    const handleOnline = () => {
      if (wasOfflineRef.current) {
        wasOfflineRef.current = false
        notifyConnectionRestored()
      }
    }

    const handleOffline = () => {
      wasOfflineRef.current = true
      notifyConnectionLost()
    }

    window.addEventListener("online", handleOnline)
    window.addEventListener("offline", handleOffline)

    return () => {
      window.removeEventListener("online", handleOnline)
      window.removeEventListener("offline", handleOffline)
    }
  }, [])

  return null
}
