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

    // Revoke visitor's GPS location when permission is blocked or withdrawn
    const revokeLocation = async () => {
      const sid = sessionStorage.getItem(SESSION_STORAGE_KEY) || activeSessionId
      if (!sid) return
      try {
        await fetch("/api/analytics/session/location", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId: sid,
            isRevoked: true,
          }),
        })
      } catch {}
    }

    let isCheckingGeo = false
    // Detect and synchronize browser location permission status with backend analytics
    const checkAndSyncPermission = async () => {
      if (isCheckingGeo || typeof window === "undefined" || typeof navigator === "undefined") return
      const sid = sessionStorage.getItem(SESSION_STORAGE_KEY) || activeSessionId
      if (!sid) return

      // Sync existing cached coordinates if not yet recorded for this session
      const cachedCoords = sessionStorage.getItem("naypict_user_coords")
      if (cachedCoords) {
        try {
          const parsed = JSON.parse(cachedCoords)
          if (
            typeof parsed.latitude === "number" &&
            typeof parsed.longitude === "number" &&
            sessionStorage.getItem("naypict_loc_synced_sid") !== sid
          ) {
            sessionStorage.setItem("naypict_loc_synced_sid", sid)
            syncLocation(parsed.latitude, parsed.longitude)
          }
        } catch {}
      }

      // Query browser Permissions API if supported (Chrome, Samsung Internet, Edge, Brave)
      if ("permissions" in navigator && typeof navigator.permissions?.query === "function") {
        try {
          isCheckingGeo = true
          const perm = await navigator.permissions.query({ name: "geolocation" as PermissionName })

          // Keep active listener for permission state changes (e.g. toggled in site settings)
          perm.onchange = () => {
            checkAndSyncPermission()
          }

          if (perm.state === "granted" && "geolocation" in navigator) {
            navigator.geolocation.getCurrentPosition(
              (pos) => {
                isCheckingGeo = false
                const lat = Number(pos.coords.latitude.toFixed(6))
                const lng = Number(pos.coords.longitude.toFixed(6))
                const lastSyncedSid = sessionStorage.getItem("naypict_loc_synced_sid")

                let shouldSync = lastSyncedSid !== sid
                if (!shouldSync && cachedCoords) {
                  try {
                    const parsed = JSON.parse(cachedCoords)
                    if (
                      Math.abs(parsed.latitude - lat) > 0.0001 ||
                      Math.abs(parsed.longitude - lng) > 0.0001 ||
                      Date.now() - (parsed.timestamp || 0) > 5 * 60 * 1000
                    ) {
                      shouldSync = true
                    }
                  } catch {
                    shouldSync = true
                  }
                } else if (!cachedCoords) {
                  shouldSync = true
                }

                if (shouldSync) {
                  const coordData = { latitude: lat, longitude: lng, timestamp: Date.now() }
                  sessionStorage.setItem("naypict_user_coords", JSON.stringify(coordData))
                  sessionStorage.setItem("naypict_loc_synced_sid", sid)
                  window.dispatchEvent(new CustomEvent("naypict:user-location-updated", { detail: coordData }))
                  syncLocation(lat, lng)
                }
              },
              () => {
                isCheckingGeo = false
              },
              { enableHighAccuracy: false, timeout: 8000, maximumAge: 60000 }
            )
          } else if (perm.state === "denied") {
            isCheckingGeo = false
            // If location was previously shared during this session, notify backend of revocation
            const hadSynced =
              sessionStorage.getItem("naypict_loc_synced_sid") === sid ||
              sessionStorage.getItem("naypict_user_coords")
            if (hadSynced) {
              sessionStorage.removeItem("naypict_user_coords")
              sessionStorage.removeItem("naypict_loc_synced_sid")
              window.dispatchEvent(new CustomEvent("naypict:user-location-updated", { detail: null }))
              revokeLocation()
            }
          } else {
            isCheckingGeo = false
          }
        } catch {
          isCheckingGeo = false
        }
      }
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
            if (userLat && userLng) {
              sessionStorage.setItem("naypict_loc_synced_sid", sid)
            }
          }
        } catch (err) {
          console.warn("[ANALYTICS] Init session error:", err)
        }
      }

      // Check permission state immediately after session init
      checkAndSyncPermission()
    }

    initSession()

    // Listen for real-time location updates when visitor grants or revokes permission
    const handleLocationUpdated = (e: Event) => {
      const customEvent = e as CustomEvent<{ latitude: number; longitude: number } | null>
      if (customEvent?.detail?.latitude && customEvent?.detail?.longitude) {
        const sid = sessionStorage.getItem(SESSION_STORAGE_KEY) || activeSessionId
        if (sid) {
          sessionStorage.setItem("naypict_loc_synced_sid", sid)
        }
        syncLocation(customEvent.detail.latitude, customEvent.detail.longitude)
      } else if (customEvent?.detail === null) {
        sessionStorage.removeItem("naypict_loc_synced_sid")
        revokeLocation()
      }
    }
    window.addEventListener("naypict:user-location-updated", handleLocationUpdated)

    // Periodic heartbeat and permission verification every 30 seconds while tab is active
    intervalRef.current = setInterval(() => {
      if (document.visibilityState === "visible") {
        const elapsed = Math.floor((Date.now() - startTime) / 1000)
        sendPing(elapsed)
        checkAndSyncPermission()
      }
    }, 30000)

    // Detect when visitor switches back from browser settings / notifications
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        const elapsed = Math.floor((Date.now() - startTime) / 1000)
        sendPing(elapsed)
      } else if (document.visibilityState === "visible") {
        checkAndSyncPermission()
      }
    }

    const handleWindowFocus = () => {
      checkAndSyncPermission()
    }

    const handleBeforeUnload = () => {
      const elapsed = Math.floor((Date.now() - startTime) / 1000)
      sendPing(elapsed)
    }

    document.addEventListener("visibilitychange", handleVisibilityChange)
    window.addEventListener("focus", handleWindowFocus)
    window.addEventListener("pagehide", handleBeforeUnload)
    window.addEventListener("beforeunload", handleBeforeUnload)

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
      window.removeEventListener("naypict:user-location-updated", handleLocationUpdated)
      document.removeEventListener("visibilitychange", handleVisibilityChange)
      window.removeEventListener("focus", handleWindowFocus)
      window.removeEventListener("pagehide", handleBeforeUnload)
      window.removeEventListener("beforeunload", handleBeforeUnload)
    }
  }, [isAdmin])
}
