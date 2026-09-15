"use client"

import { useEffect, useRef } from "react"
import { useApp } from "@/app/provider"
import { UserTypeEnum } from "@/server/enums/user-enum"

// This module provides client-side visitor telemetry, session lifecycle heartbeats, and media interaction tracking.

const SESSION_STORAGE_KEY = "naypict_session_id"
const SESSION_START_KEY = "naypict_session_start"

// Helper function to track media interactions from anywhere in the client UI
export function trackVisitorMedia(photoId: string, action: "view" | "download" | "share" | "reaction" = "view") {
  if (typeof window === "undefined" || !photoId) return

  const sessionId = sessionStorage.getItem(SESSION_STORAGE_KEY)
  const payload = JSON.stringify({ sessionId, photoId, action })

  // Send asynchronous track request without blocking UI
  if (typeof navigator.sendBeacon === "function") {
    const blob = new Blob([payload], { type: "application/json" })
    navigator.sendBeacon("/api/analytics/media/track", blob)
  } else {
    fetch("/api/analytics/media/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: payload,
      keepalive: true,
    }).catch(() => {})
  }
}

// Detect client device, operating system, and browser vendor
async function detectClientTelemetry() {
  const ua = navigator.userAgent
  let browser = "Other"
  let device = "Desktop"
  let os = "Other"

  // Device detection
  const isMobile = /Android|webOS|iPhone|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua)
  const isTablet = /iPad|Tablet|PlayBook|Silk/i.test(ua) || (navigator.maxTouchPoints > 1 && /Macintosh/.test(ua))
  if (isTablet) {
    device = "Tablet"
  } else if (isMobile) {
    device = "Mobile"
  }

  // OS detection
  if (/iPhone|iPad|iPod/i.test(ua)) os = "iOS"
  else if (/Macintosh|Mac OS X/i.test(ua)) os = "macOS"
  else if (/Android/i.test(ua)) os = "Android"
  else if (/Windows NT/i.test(ua)) os = "Windows"
  else if (/Linux/i.test(ua)) os = "Linux"

  // Browser detection
  let isBrave = false
  try {
    const navAny = navigator as unknown as { brave?: { isBrave?: () => Promise<boolean> } }
    if (navAny.brave && typeof navAny.brave.isBrave === "function") {
      isBrave = await navAny.brave.isBrave()
    }
  } catch {
    isBrave = false
  }

  // Enhanced Samsung Internet detection (covers SamsungBrowser, SBrowser, Samsung model identifiers, and UserAgentData)
  const isSamsung =
    /SamsungBrowser|SBrowser|SAMSUNG/i.test(ua) ||
    Boolean(
      (navigator as unknown as { userAgentData?: { brands?: Array<{ brand: string }> } })
        .userAgentData?.brands?.some((b) => /Samsung/i.test(b.brand))
    ) ||
    (/SM-[A-Z0-9]+/i.test(ua) && !/Firefox|OPR|Edge/i.test(ua) && /Version\/[0-9.]+/i.test(ua))

  if (isBrave) {
    browser = "Brave"
  } else if (isSamsung) {
    browser = "Samsung Internet"
  } else if (/Edg\//i.test(ua)) {
    browser = "Edge"
  } else if (/OPR\/|Opera/i.test(ua)) {
    browser = "Opera"
  } else if (/Firefox\//i.test(ua)) {
    browser = "Firefox"
  } else if (/Chrome\//i.test(ua)) {
    browser = "Chrome"
  } else if (/Safari\//i.test(ua)) {
    browser = "Safari"
  }

  return { browser, device, os }
}

// Hook that manages session lifetime, periodic heartbeats, and page visibility duration sync
export function useVisitorTracker() {
  const { userInfo } = useApp()
  const isAdmin = userInfo?.type === UserTypeEnum.ADMIN
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (typeof window === "undefined") return

    // 1. Strictly exclude automated bots, headless browsers, or crawler engines
    if (
      navigator.webdriver ||
      /bot|crawler|spider|headless|lighthouse|preview|vercel/i.test(navigator.userAgent)
    ) {
      return
    }

    // 2. Strictly exclude authenticated administrators immediately (no waiting for userInfo fetch)
    const hasAdminCookie =
      document.cookie.includes("token=") ||
      document.cookie.includes("__Host-token=") ||
      document.cookie.includes("naypict_token=")
    const isSystemRoute =
      window.location.pathname.startsWith("/admin") ||
      window.location.pathname.startsWith("/settings") ||
      window.location.pathname.startsWith("/storage") ||
      window.location.pathname.startsWith("/duplicates")

    if (isAdmin || hasAdminCookie || isSystemRoute) {
      return
    }

    let activeSessionId = sessionStorage.getItem(SESSION_STORAGE_KEY)
    let startTime = Number(sessionStorage.getItem(SESSION_START_KEY)) || Date.now()

    if (!sessionStorage.getItem(SESSION_START_KEY)) {
      sessionStorage.setItem(SESSION_START_KEY, String(startTime))
    }

    const sendPing = (duration: number) => {
      const currentSid = sessionStorage.getItem(SESSION_STORAGE_KEY)
      if (!currentSid) return

      const payload = JSON.stringify({ sessionId: currentSid, durationSeconds: duration })
      if (typeof navigator.sendBeacon === "function") {
        const blob = new Blob([payload], { type: "application/json" })
        navigator.sendBeacon("/api/analytics/session/ping", blob)
      } else {
        fetch("/api/analytics/session/ping", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: payload,
          keepalive: true,
        }).catch(() => {})
      }
    }

    // Sync visitor's consented GPS location to active session
    const syncLocation = async (latitude: number, longitude: number) => {
      const sid = sessionStorage.getItem(SESSION_STORAGE_KEY) || activeSessionId
      if (!sid) return
      try {
        await fetch("/api/analytics/session/location", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId: sid,
            latitude,
            longitude,
          }),
        })
      } catch {}
    }

    // Initialize session if not yet initialized
    const initSession = async () => {
      if (!activeSessionId) {
        const { browser, device, os } = await detectClientTelemetry()

        let userLat = ""
        let userLng = ""
        try {
          const cached = sessionStorage.getItem("naypict_user_coords")
          if (cached) {
            const parsed = JSON.parse(cached)
            if (parsed.latitude && parsed.longitude) {
              userLat = String(parsed.latitude)
              userLng = String(parsed.longitude)
            }
          }
        } catch {}

        try {
          const res = await fetch("/api/analytics/session/init", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              referrer: document.referrer || "Direct",
              landingPath: window.location.pathname + window.location.search,
              browser,
              device,
              os,
              userLat,
              userLng,
            }),
          })
          const json = await res.json()
          const sid = json?.data?.sessionId
          if (typeof sid === "string" && sid) {
            activeSessionId = sid
            sessionStorage.setItem(SESSION_STORAGE_KEY, sid)
          }
        } catch (err) {
          console.warn("[ANALYTICS] Init session error:", err)
        }
      }

      // Check if browser already granted geolocation permission without prompting
      if (typeof navigator !== "undefined" && "permissions" in navigator && navigator.permissions?.query) {
        try {
          const perm = await navigator.permissions.query({ name: "geolocation" as PermissionName })
          if (perm.state === "granted" && "geolocation" in navigator) {
            navigator.geolocation.getCurrentPosition(
              (pos) => {
                const lat = Number(pos.coords.latitude.toFixed(6))
                const lng = Number(pos.coords.longitude.toFixed(6))
                sessionStorage.setItem("naypict_user_coords", JSON.stringify({ latitude: lat, longitude: lng, timestamp: Date.now() }))
                syncLocation(lat, lng)
              },
              () => {},
              { timeout: 8000 }
            )
          }
        } catch {}
      }
    }

    initSession()

    // Listen for real-time location updates when visitor grants permission on gallery or map
    const handleLocationUpdated = (e: Event) => {
      const customEvent = e as CustomEvent<{ latitude: number; longitude: number }>
      if (customEvent?.detail?.latitude && customEvent?.detail?.longitude) {
        syncLocation(customEvent.detail.latitude, customEvent.detail.longitude)
      }
    }
    window.addEventListener("naypict:user-location-updated", handleLocationUpdated)

    // Lightweight heartbeat every 45 seconds while tab is active
    intervalRef.current = setInterval(() => {
      if (document.visibilityState === "visible") {
        const elapsed = Math.floor((Date.now() - startTime) / 1000)
        sendPing(elapsed)
      }
    }, 45000)

    // Flush final duration when tab is hidden or unloaded
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        const elapsed = Math.floor((Date.now() - startTime) / 1000)
        sendPing(elapsed)
      }
    }

    const handleBeforeUnload = () => {
      const elapsed = Math.floor((Date.now() - startTime) / 1000)
      sendPing(elapsed)
    }

    document.addEventListener("visibilitychange", handleVisibilityChange)
    window.addEventListener("pagehide", handleBeforeUnload)
    window.addEventListener("beforeunload", handleBeforeUnload)

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
      window.removeEventListener("naypict:user-location-updated", handleLocationUpdated)
      document.removeEventListener("visibilitychange", handleVisibilityChange)
      window.removeEventListener("pagehide", handleBeforeUnload)
      window.removeEventListener("beforeunload", handleBeforeUnload)
    }
  }, [isAdmin])
}
