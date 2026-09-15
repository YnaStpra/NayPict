"use client"

import { useState, useEffect, useCallback } from "react"

export interface UserCoordinates {
  latitude: number
  longitude: number
  accuracy?: number
  timestamp?: number
}

const STORAGE_KEY = "naypict_user_coords"
const LOCATION_EVENT_KEY = "naypict:user-location-updated"

/**
 * Retrieve cached user coordinates from sessionStorage if available and valid (< 30 minutes old).
 */
function getCachedCoordinates(): UserCoordinates | null {
  if (typeof window === "undefined") return null
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed: UserCoordinates = JSON.parse(raw)
    if (
      typeof parsed.latitude === "number" &&
      typeof parsed.longitude === "number" &&
      !isNaN(parsed.latitude) &&
      !isNaN(parsed.longitude)
    ) {
      // Validate freshness: 30 minutes
      const ageMs = Date.now() - (parsed.timestamp || 0)
      if (ageMs < 30 * 60 * 1000) {
        return parsed
      }
    }
  } catch {
    // Ignore JSON parse errors
  }
  return null
}

/**
 * Save valid user coordinates to sessionStorage and broadcast change across components.
 */
function persistCoordinates(coords: UserCoordinates | null) {
  if (typeof window === "undefined") return
  try {
    if (coords) {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(coords))
      window.dispatchEvent(new CustomEvent(LOCATION_EVENT_KEY, { detail: coords }))
    } else {
      sessionStorage.removeItem(STORAGE_KEY)
      window.dispatchEvent(new CustomEvent(LOCATION_EVENT_KEY, { detail: null }))
    }
  } catch {
    // Ignore storage quota / access errors
  }
}

export type PermissionState = "granted" | "prompt" | "denied" | "unknown"

export interface UnblockGuide {
  browser: string
  title: string
  steps: string[]
}

/**
 * Detect client platform and provide actionable step-by-step instructions to unblock location.
 */
export function getDeviceUnblockInstructions(): UnblockGuide {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return {
      browser: "Browser",
      title: "Allow Location Access",
      steps: ["Allow location access in your browser settings, then reload the page."],
    }
  }

  const ua = navigator.userAgent || ""
  const isIOS = /iPhone|iPad|iPod/i.test(ua)
  const isSamsung = /SamsungBrowser|SBrowser|SAMSUNG/i.test(ua)
  const isBrave = Boolean(
    (navigator as unknown as { brave?: { isBrave?: () => unknown } }).brave?.isBrave
  )
  const isChrome = /Chrome\//i.test(ua) && !isSamsung && !/Edg/i.test(ua)

  if (isIOS) {
    return {
      browser: "Safari / iOS",
      title: "Unblock Location on iPhone / iPad",
      steps: [
        "Tap the 'AA' or Page Settings icon in the Safari address bar.",
        "Tap 'Website Settings'.",
        "Set 'Location' to 'Allow', then reload this page.",
        "(If still blocked, check iOS Settings > Privacy & Security > Location Services > Safari Websites).",
      ],
    }
  }

  if (isSamsung) {
    return {
      browser: "Samsung Internet",
      title: "Unblock Location on Samsung Internet",
      steps: [
        "Tap the Lock icon next to the URL in the address bar.",
        "Tap 'Website permissions' or 'Permissions'.",
        "Toggle 'Location' to ON / Allow.",
        "Refresh this page to pinpoint your position.",
      ],
    }
  }

  if (isBrave) {
    return {
      browser: "Brave",
      title: "Unblock Location on Brave",
      steps: [
        "Tap the Brave Shields or Lock icon in the address bar.",
        "Change Location permission to 'Allow'.",
        "Reload this page.",
      ],
    }
  }

  if (isChrome) {
    return {
      browser: "Chrome",
      title: "Unblock Location on Google Chrome",
      steps: [
        "Tap the Lock or Tune / Settings icon to the left of the address bar.",
        "Tap 'Permissions' > 'Location'.",
        "Select 'Allow', then refresh this page.",
      ],
    }
  }

  return {
    browser: "Browser",
    title: "Unblock Location Permission",
    steps: [
      "Click or tap the Lock / Site Settings icon in the browser address bar.",
      "Set Location permission to 'Allow'.",
      "Refresh this page to enable location.",
    ],
  }
}

/**
 * Custom hook to manage user browser geolocation state, caching, requests, and unblock guidance.
 */
export function useUserLocation() {
  const [coords, setCoords] = useState<UserCoordinates | null>(() => getCachedCoordinates())
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [permissionDenied, setPermissionDenied] = useState(false)
  const [permissionState, setPermissionState] = useState<PermissionState>("unknown")

  // Check native browser permission status safely (iOS Safari throws or lacks query for geolocation)
  const refreshPermissionState = useCallback(async (): Promise<PermissionState> => {
    if (typeof window === "undefined" || !("navigator" in window) || !navigator.permissions?.query) {
      return "unknown"
    }
    try {
      const status = await navigator.permissions.query({ name: "geolocation" as PermissionName })
      const state = (status.state as PermissionState) || "unknown"
      setPermissionState(state)
      if (state === "denied") {
        setPermissionDenied(true)
      } else if (state === "granted") {
        setPermissionDenied(false)
      }
      status.onchange = () => {
        const nextState = (status.state as PermissionState) || "unknown"
        setPermissionState(nextState)
        if (nextState === "denied") {
          setPermissionDenied(true)
          setCoords(null)
          persistCoordinates(null)
        } else if (nextState === "granted") {
          setPermissionDenied(false)
          setError(null)
        }
      }
      return state
    } catch {
      return "unknown"
    }
  }, [])

  // Check initial permission status on mount
  useEffect(() => {
    refreshPermissionState()
  }, [refreshPermissionState])

  // Re-verify permission state on visibility change and window focus (e.g. returning from device/browser settings)
  useEffect(() => {
    const handleRecheck = () => {
      if (typeof document !== "undefined" && document.visibilityState === "visible") {
        refreshPermissionState()
      }
    }
    document.addEventListener("visibilitychange", handleRecheck)
    window.addEventListener("focus", handleRecheck)
    return () => {
      document.removeEventListener("visibilitychange", handleRecheck)
      window.removeEventListener("focus", handleRecheck)
    }
  }, [refreshPermissionState])

  // Listen to cross-component coordinate updates
  useEffect(() => {
    const handleUpdate = (e: Event) => {
      const customEvent = e as CustomEvent<UserCoordinates | null>
      setCoords(customEvent.detail ?? null)
    }

    window.addEventListener(LOCATION_EVENT_KEY, handleUpdate)
    return () => window.removeEventListener(LOCATION_EVENT_KEY, handleUpdate)
  }, [])


  /**
   * Request user coordinates from browser Geolocation API with mobile-friendly dual fallback.
   * If forceRefresh is false and valid coordinates already exist, returns cached coordinates.
   */
  const requestLocation = useCallback(
    async (forceRefresh = false): Promise<UserCoordinates | null> => {
      if (typeof window === "undefined" || !("geolocation" in navigator)) {
        setError("Geolocation is not supported by your browser.")
        return null
      }

      // If cached coordinates exist and fresh (< 10 mins), return immediately unless forced
      if (!forceRefresh) {
        const cached = getCachedCoordinates()
        if (cached && Date.now() - (cached.timestamp || 0) < 10 * 60 * 1000) {
          setCoords(cached)
          return cached
        }
      }

      setLoading(true)
      setError(null)
      setPermissionDenied(false)

      // Dual-strategy position resolver:
      // Phase 1: High Accuracy GPS (ideal for outdoors and high precision, 8s timeout)
      // Phase 2: If Phase 1 times out or is unavailable (common on mobile indoors), fallback to cellular/Wi-Fi triangulation
      const fetchPosition = async (): Promise<GeolocationPosition> => {
        return new Promise((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(
            resolve,
            (err) => {
              // If user explicitly denied permission, do not retry
              if (err.code === err.PERMISSION_DENIED) {
                return reject(err)
              }
              // Phase 2 Fallback: standard network/cell triangulation (fast & reliable indoors)
              navigator.geolocation.getCurrentPosition(
                resolve,
                reject,
                {
                  enableHighAccuracy: false,
                  timeout: 10000,
                  maximumAge: 300000,
                }
              )
            },
            {
              enableHighAccuracy: true,
              timeout: 8000,
              maximumAge: 60000,
            }
          )
        })
      }

      try {
        const position = await fetchPosition()
        const newCoords: UserCoordinates = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
          timestamp: Date.now(),
        }
        setCoords(newCoords)
        persistCoordinates(newCoords)
        setPermissionDenied(false)
        setPermissionState("granted")
        setLoading(false)
        return newCoords
      } catch (err: unknown) {
        setLoading(false)
        const geoErr = err as GeolocationPositionError
        let errorMsg = "Unable to retrieve your location."

        if (geoErr && geoErr.code === geoErr.PERMISSION_DENIED) {
          errorMsg = "Location access was denied. Please allow location permissions in your browser."
          setPermissionDenied(true)
          setPermissionState("denied")
        } else if (geoErr && geoErr.code === geoErr.POSITION_UNAVAILABLE) {
          errorMsg = "Location signal is currently unavailable. Please check your device GPS."
        } else if (geoErr && geoErr.code === geoErr.TIMEOUT) {
          errorMsg = "Request to get location timed out. Please try again."
        }

        setError(errorMsg)
        return null
      }
    },
    []
  )

  // When location permission is already granted by user/device, automatically obtain coordinates if not yet present
  useEffect(() => {
    if (permissionState === "granted" && !coords && !loading) {
      void requestLocation(false)
    }
  }, [permissionState, coords, loading, requestLocation])

  // Clear cached location
  const clearLocation = useCallback(() => {
    setCoords(null)
    persistCoordinates(null)
  }, [])

  return {
    coords,
    loading,
    error,
    permissionDenied,
    permissionState,
    unblockGuide: getDeviceUnblockInstructions(),
    hasLocation: Boolean(coords && typeof coords.latitude === "number" && typeof coords.longitude === "number"),
    requestLocation,
    clearLocation,
    refreshPermissionState,
  }
}

