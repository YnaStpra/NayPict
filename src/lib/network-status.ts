"use client"

import React from "react"
import { toast } from "sonner"
import { WifiOff, Wifi } from "lucide-react"

// Dedicated toast identifier to prevent stacking or notification spam
export const NETWORK_TOAST_ID = "app-network-status"
const SLOW_CONNECTION_TOAST_ID = "app-slow-connection"

let isCurrentlyOfflineState = false
let lastSlowWarningTime = 0
let lastRestoreNotificationTime = 0

/**
 * Returns whether the application is currently flagged in an offline or connection lost state.
 */
export function getIsOffline(): boolean {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return true
  }
  return isCurrentlyOfflineState
}

/**
 * Manually dismiss any active network connection toast.
 */
export function dismissNetworkToast(): void {
  if (typeof window === "undefined") return
  isCurrentlyOfflineState = false
  toast.dismiss(NETWORK_TOAST_ID)
}

/**
 * Checks whether an error or failure was caused by network interruption or being offline.
 */
export function isNetworkError(error: unknown): boolean {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return true
  }

  const msg = (error instanceof Error ? error.message : String(error || "")).toLowerCase()
  return (
    msg.includes("fetch") ||
    msg.includes("network") ||
    msg.includes("offline") ||
    msg.includes("load failed") ||
    msg.includes("aborted") ||
    msg.includes("timeout") ||
    msg.includes("err_internet_disconnected") ||
    msg.includes("err_name_not_resolved") ||
    msg.includes("failed to fetch")
  )
}

/**
 * Displays a clean, modern "Connection Lost" notification.
 * Never shows raw technical errors like "fetch error" or "Failed to fetch".
 */
export function notifyConnectionLost(description?: string): void {
  if (typeof window === "undefined") return

  isCurrentlyOfflineState = true

  // Dismiss any existing toast first to guarantee clean transition
  toast.dismiss(NETWORK_TOAST_ID)

  toast.error("Connection Lost", {
    id: NETWORK_TOAST_ID,
    description: description || "You are currently offline. Please check your internet connection.",
    duration: 5000, // Safe 5s auto-dismiss so it never gets permanently stuck on screen
    icon: React.createElement(WifiOff, { className: "size-4 text-rose-500" }),
    onDismiss: () => {
      isCurrentlyOfflineState = false
    },
    onAutoClose: () => {
      // If browser is actually online when timer expires, clear the offline flag
      if (typeof navigator !== "undefined" && navigator.onLine) {
        isCurrentlyOfflineState = false
      }
    },
  })
}

/**
 * Displays a clean "Connection Restored" notification when back online
 * and guarantees the previous Connection Lost toast is dismissed immediately.
 */
export function notifyConnectionRestored(): void {
  if (typeof window === "undefined") return

  const wasOffline = isCurrentlyOfflineState || (typeof navigator !== "undefined" && !navigator.onLine)
  isCurrentlyOfflineState = false

  // Always dismiss the connection lost toast immediately
  toast.dismiss(NETWORK_TOAST_ID)

  // Only show the restored celebration toast if we were actually offline
  const now = Date.now()
  if (wasOffline && now - lastRestoreNotificationTime > 4000) {
    lastRestoreNotificationTime = now
    toast.success("Connection Restored", {
      id: NETWORK_TOAST_ID,
      description: "Back online. Reconnected successfully.",
      duration: 3000,
      icon: React.createElement(Wifi, { className: "size-4 text-emerald-400" }),
    })
  }
}

/**
 * Displays a subtle notification if the user's connection is experiencing slow speeds during media loading.
 * Throttled to display at most once every 30 seconds.
 */
export function notifySlowConnection(): void {
  if (typeof window === "undefined") return

  const now = Date.now()
  if (now - lastSlowWarningTime < 30_000) return
  lastSlowWarningTime = now

  toast.warning("Slow Connection", {
    id: SLOW_CONNECTION_TOAST_ID,
    description: "Media buffering may take longer due to slow network conditions.",
    duration: 4000,
    icon: React.createElement(Wifi, { className: "size-4 text-amber-400 animate-pulse" }),
  })
}
