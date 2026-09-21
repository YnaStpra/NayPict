"use client"

import React from "react"
import { toast } from "sonner"
import { WifiOff, Wifi } from "lucide-react"

// Dedicated toast identifier to prevent stacking or notification spam
const NETWORK_TOAST_ID = "app-network-status"
const SLOW_CONNECTION_TOAST_ID = "app-slow-connection"

let lastSlowWarningTime = 0

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

  toast.error("Connection Lost", {
    id: NETWORK_TOAST_ID,
    description: description || "You are currently offline. Please check your internet connection.",
    duration: Infinity, // Persists until connection is restored
    icon: React.createElement(WifiOff, { className: "size-4 text-rose-500" }),
  })
}

/**
 * Displays a clean "Connection Restored" notification when back online.
 */
export function notifyConnectionRestored(): void {
  if (typeof window === "undefined") return

  toast.success("Connection Restored", {
    id: NETWORK_TOAST_ID,
    description: "Back online. Reconnected successfully.",
    duration: 3000,
    icon: React.createElement(Wifi, { className: "size-4 text-emerald-400" }),
  })
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
