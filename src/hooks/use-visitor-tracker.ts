"use client"

import { useEffect, useRef } from "react"
import { usePathname } from "next/navigation"

// This module provides client-side visitor telemetry, session lifecycle heartbeats, and media interaction tracking.

const SESSION_STORAGE_KEY = "naypict_session_id"
const SESSION_START_KEY = "naypict_session_start"
const ENDPOINT_PREFIX = "/api/telemetry"
const FALLBACK_PREFIX = "/api/analytics"

// Robust POST request handler with automatic fallback to bypass Brave Shields and adblockers
async function postTelemetry(path: string, body: Record<string, unknown>): Promise<Response | null> {
  const payload = JSON.stringify(body)
  try {
    const res = await fetch(`${ENDPOINT_PREFIX}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: payload,
    })
    if (res.ok) return res
  } catch {}

  // Fallback to legacy path if telemetry path fails
  try {
    const res = await fetch(`${FALLBACK_PREFIX}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: payload,
    })
    return res
  } catch {}

  return null
}

// Helper function to track media interactions from anywhere in the client UI
export function trackVisitorMedia(photoId: string, action: "view" | "download" | "share" | "reaction" = "view") {
  if (typeof window === "undefined" || !photoId) return

  const sessionId = sessionStorage.getItem(SESSION_STORAGE_KEY)
  const payload = JSON.stringify({ sessionId, photoId, action })

  // Send asynchronous track request without blocking UI
  if (typeof navigator.sendBeacon === "function") {
    const blob = new Blob([payload], { type: "application/json" })
    if (!navigator.sendBeacon(`${ENDPOINT_PREFIX}/media/track`, blob)) {
      navigator.sendBeacon(`${FALLBACK_PREFIX}/media/track`, blob)
    }
  } else {
    fetch(`${ENDPOINT_PREFIX}/media/track`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: payload,
      keepalive: true,
    }).catch(() => {
      fetch(`${FALLBACK_PREFIX}/media/track`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: payload,
        keepalive: true,
      }).catch(() => {})
    })
  }
}

// Detect client device, operating system, and browser vendor
async function detectClientTelemetry() {
  const ua = navigator.userAgent
  let browser = "Other"
  let device = "Desktop"
  let os = "Other"

  // 1. Operating System detection
  if (/iPhone|iPad|iPod/i.test(ua)) os = "iOS"
  else if (/Macintosh|Mac OS X/i.test(ua)) os = "macOS"
  else if (/Android/i.test(ua)) os = "Android"
  else if (/Windows NT/i.test(ua)) os = "Windows"
  else if (/Linux/i.test(ua)) os = "Linux"

  // 2. Device type detection
  const isMobile = /Android|webOS|iPhone|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua)
  const isTablet = /iPad|Tablet|PlayBook|Silk/i.test(ua) || (navigator.maxTouchPoints > 1 && os === "macOS")
  if (isTablet) {
    device = "Tablet"
  } else if (isMobile && os !== "macOS" && os !== "Windows") {
    device = "Mobile"
  } else {
    device = "Desktop"
  }

  // 3. Browser detection
  let isBrave = false
  try {
    const navAny = navigator as unknown as { brave?: { isBrave?: () => Promise<boolean> } }
    if (navAny.brave && typeof navAny.brave.isBrave === "function") {
      isBrave = await navAny.brave.isBrave()
    }
  } catch {
    isBrave = false
  }

  // Enhanced Samsung Internet detection (only valid on Android devices)
  const isSamsung =
    os === "Android" &&
    (/SamsungBrowser|SBrowser|SAMSUNG/i.test(ua) ||
      Boolean(
        (navigator as unknown as { userAgentData?: { brands?: Array<{ brand: string }> } })
          .userAgentData?.brands?.some((b) => /Samsung/i.test(b.brand))
      ) ||
      (/SM-[A-Z0-9]+/i.test(ua) && !/Firefox|OPR|Edge/i.test(ua) && /Version\/[0-9.]+/i.test(ua)))

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
  const pathname = usePathname()
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const locationIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const checkPermissionRef = useRef<() => void>(() => {})

  useEffect(() => {
    if (typeof window === "undefined") return

    // 1. Strictly exclude automated bots, headless browsers, or crawler engines
    if (
      navigator.webdriver ||
      /bot|crawler|spider|headless|lighthouse|preview|vercel/i.test(navigator.userAgent)
    ) {
      return
    }

    // 2. Exclude analytics dashboard itself from tracking to prevent self-referential telemetry loops
    const isSystemRoute = window.location.pathname.startsWith("/admin/analytics")

    if (isSystemRoute) {
      return
    }

    let activeSessionId = sessionStorage.getItem(SESSION_STORAGE_KEY)
    const startTime = Number(sessionStorage.getItem(SESSION_START_KEY)) || Date.now()

    if (!sessionStorage.getItem(SESSION_START_KEY)) {
      sessionStorage.setItem(SESSION_START_KEY, String(startTime))
    }

    // Send heartbeat ping with session duration
    const sendPing = (duration: number) => {
      const currentSid = sessionStorage.getItem(SESSION_STORAGE_KEY)
      if (!currentSid) return

      const payload = JSON.stringify({ sessionId: currentSid, durationSeconds: duration })
      if (typeof navigator.sendBeacon === "function") {
        const blob = new Blob([payload], { type: "application/json" })
        if (!navigator.sendBeacon(`${ENDPOINT_PREFIX}/session/ping`, blob)) {
          navigator.sendBeacon(`${FALLBACK_PREFIX}/session/ping`, blob)
        }
      } else {
        void postTelemetry("/session/ping", { sessionId: currentSid, durationSeconds: duration })
      }
    }

    // Sync visitor's consented GPS location to active session
    const syncLocation = async (latitude: number, longitude: number) => {
      let sid = sessionStorage.getItem(SESSION_STORAGE_KEY) || activeSessionId
      if (!sid) {
        // Retry shortly in case session init is still in flight
        await new Promise((r) => setTimeout(r, 600))
        sid = sessionStorage.getItem(SESSION_STORAGE_KEY) || activeSessionId
      }
      if (!sid) return

      try {
        const res = await postTelemetry("/session/location", {
          sessionId: sid,
          latitude,
          longitude,
        })
        if (res && res.ok) {
          sessionStorage.setItem("naypict_loc_synced_sid", sid)
        }
      } catch {}
    }

    // Revoke visitor's GPS location when permission is blocked or withdrawn
    const revokeLocation = async () => {
      const sid = sessionStorage.getItem(SESSION_STORAGE_KEY) || activeSessionId
      if (!sid) return
      try {
        await postTelemetry("/session/location", {
          sessionId: sid,
          isRevoked: true,
        })
      } catch {}
    }

    let isCheckingGeo = false
    // Detect and synchronize browser location permission status with backend analytics
    const checkAndSyncPermission = async () => {
      if (isCheckingGeo || typeof window === "undefined" || typeof navigator === "undefined") return
      const sid = sessionStorage.getItem(SESSION_STORAGE_KEY) || activeSessionId
      if (!sid) return

      // Sync existing cached coordinates if available in sessionStorage or localStorage
      const cachedCoords = sessionStorage.getItem("naypict_user_coords") || localStorage.getItem("naypict_user_coords")
      if (cachedCoords) {
        try {
          const parsed = JSON.parse(cachedCoords)
          if (
            typeof parsed.latitude === "number" &&
            typeof parsed.longitude === "number" &&
            sessionStorage.getItem("naypict_loc_synced_sid") !== sid
          ) {
            void syncLocation(parsed.latitude, parsed.longitude)
          }
        } catch {}
      }

      if (!("geolocation" in navigator)) return

      const handlePositionSuccess = (pos: GeolocationPosition) => {
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
          localStorage.setItem("naypict_user_coords", JSON.stringify(coordData))
          localStorage.setItem("naypict_geo_consent", "1")
          window.dispatchEvent(new CustomEvent("naypict:user-location-updated", { detail: coordData }))
          void syncLocation(lat, lng)
        }
      }

      const hasPriorConsent = typeof window !== "undefined" && localStorage.getItem("naypict_geo_consent") === "1"

      const runPositionResolver = () => {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            handlePositionSuccess(pos)
          },
          () => {
            navigator.geolocation.getCurrentPosition(
              (pos) => {
                handlePositionSuccess(pos)
              },
              (err) => {
                isCheckingGeo = false
                if (err && err.code === err.PERMISSION_DENIED) {
                  localStorage.removeItem("naypict_geo_consent")
                }
              },
              { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 }
            )
          },
          { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 }
        )
      }

      // Query browser Permissions API if supported (Chrome, Samsung Internet, Edge, Brave)
      if ("permissions" in navigator && typeof navigator.permissions?.query === "function") {
        try {
          isCheckingGeo = true
          const perm = await navigator.permissions.query({ name: "geolocation" as PermissionName })

          // Keep active listener for permission state changes
          perm.onchange = () => {
            void checkAndSyncPermission()
          }

          if (perm.state === "granted" || (hasPriorConsent && perm.state !== "denied")) {
            runPositionResolver()
          } else if (perm.state === "denied") {
            isCheckingGeo = false
            localStorage.removeItem("naypict_geo_consent")
            const hadSynced =
              sessionStorage.getItem("naypict_loc_synced_sid") === sid ||
              sessionStorage.getItem("naypict_user_coords") ||
              localStorage.getItem("naypict_user_coords")
            if (hadSynced) {
              sessionStorage.removeItem("naypict_user_coords")
              localStorage.removeItem("naypict_user_coords")
              sessionStorage.removeItem("naypict_loc_synced_sid")
              window.dispatchEvent(new CustomEvent("naypict:user-location-updated", { detail: null }))
              void revokeLocation()
            }
          } else {
            isCheckingGeo = false
          }
        } catch {
          isCheckingGeo = false
          if (hasPriorConsent) {
            runPositionResolver()
          }
        }
      } else if (hasPriorConsent) {
        runPositionResolver()
      }
    }

    checkPermissionRef.current = checkAndSyncPermission

    // Initialize session if not yet initialized
    const initSession = async () => {
      if (!activeSessionId) {
        const { browser, device, os } = await detectClientTelemetry()

        let userLat = ""
        let userLng = ""
        try {
          const cached = sessionStorage.getItem("naypict_user_coords") || localStorage.getItem("naypict_user_coords")
          if (cached) {
            const parsed = JSON.parse(cached)
            if (parsed.latitude && parsed.longitude) {
              userLat = String(parsed.latitude)
              userLng = String(parsed.longitude)
            }
          }
        } catch {}

        try {
          const res = await postTelemetry("/session/init", {
            referrer: document.referrer || "Direct",
            landingPath: window.location.pathname + window.location.search,
            browser,
            device,
            os,
            userLat,
            userLng,
          })
          if (res) {
            const json = await res.json()
            const sid = json?.data?.sessionId
            if (typeof sid === "string" && sid) {
              activeSessionId = sid
              sessionStorage.setItem(SESSION_STORAGE_KEY, sid)
              if (userLat && userLng) {
                sessionStorage.setItem("naypict_loc_synced_sid", sid)
              }
            }
          }
        } catch (err) {
          console.warn("[TELEMETRY] Init session error:", err)
        }
      }

      // Check permission state immediately after session init
      void checkAndSyncPermission()
    }

    void initSession()

    // Listen for real-time location updates when visitor grants or revokes permission
    const handleLocationUpdated = (e: Event) => {
      const customEvent = e as CustomEvent<{ latitude: number; longitude: number } | null>
      if (customEvent?.detail?.latitude && customEvent?.detail?.longitude) {
        void syncLocation(customEvent.detail.latitude, customEvent.detail.longitude)
      } else if (customEvent?.detail === null) {
        sessionStorage.removeItem("naypict_loc_synced_sid")
        void revokeLocation()
      }
    }
    window.addEventListener("naypict:user-location-updated", handleLocationUpdated)

    // Cross-tab synchronization: when location is granted in another tab (e.g. /map), immediately sync active session
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === "naypict_user_coords" && e.newValue) {
        try {
          const parsed = JSON.parse(e.newValue)
          if (typeof parsed.latitude === "number" && typeof parsed.longitude === "number") {
            void syncLocation(parsed.latitude, parsed.longitude)
          }
        } catch {}
      }
    }
    window.addEventListener("storage", handleStorageChange)


    // Periodic heartbeat and permission verification every 2 minutes while tab is active
    // Visibilitychange and pagehide listeners already capture exact exit duration
    intervalRef.current = setInterval(() => {
      if (document.visibilityState === "visible") {
        const elapsed = Math.floor((Date.now() - startTime) / 1000)
        sendPing(elapsed)
        void checkAndSyncPermission()
      }
    }, 120000)

    // Detect when visitor switches back from browser settings / notifications
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        const elapsed = Math.floor((Date.now() - startTime) / 1000)
        sendPing(elapsed)
      } else if (document.visibilityState === "visible") {
        void checkAndSyncPermission()
      }
    }

    const handleWindowFocus = () => {
      void checkAndSyncPermission()
    }

    const handleBeforeUnload = () => {
      const elapsed = Math.floor((Date.now() - startTime) / 1000)
      sendPing(elapsed)
    }

    document.addEventListener("visibilitychange", handleVisibilityChange)
    window.addEventListener("focus", handleWindowFocus)
    window.addEventListener("pagehide", handleBeforeUnload)

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
      if (locationIntervalRef.current) clearInterval(locationIntervalRef.current)
      window.removeEventListener("naypict:user-location-updated", handleLocationUpdated)
      window.removeEventListener("storage", handleStorageChange)
      document.removeEventListener("visibilitychange", handleVisibilityChange)
      window.removeEventListener("focus", handleWindowFocus)
      window.removeEventListener("pagehide", handleBeforeUnload)
    }
  }, [])

  // Immediately re-check and synchronize location whenever user navigates between pages (e.g. from / to /map)
  useEffect(() => {
    if (typeof window === "undefined") return
    const isSystemRoute = pathname.startsWith("/admin/analytics")
    if (isSystemRoute) return

    checkPermissionRef.current()
  }, [pathname])
}
