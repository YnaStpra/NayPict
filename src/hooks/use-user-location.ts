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

/**
 * Custom hook to manage user browser geolocation state, caching, and requests.
 */
export function useUserLocation() {
  const [coords, setCoords] = useState<UserCoordinates | null>(() => getCachedCoordinates())
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Listen to cross-component coordinate updates
  useEffect(() => {
    const handleUpdate = (e: Event) => {
      const customEvent = e as CustomEvent<UserCoordinates | null>
      setCoords(customEvent.detail ?? null)
    }

    window.addEventListener(LOCATION_EVENT_KEY, handleUpdate)
    return () => window.removeEventListener(LOCATION_EVENT_KEY, handleUpdate)
  }, [])

  // Explicitly request user coordinates from browser Geolocation API
  const requestLocation = useCallback(async (): Promise<UserCoordinates | null> => {
    if (typeof window === "undefined" || !("geolocation" in navigator)) {
      setError("Geolocation is not supported by your browser.")
      return null
    }

    setLoading(true)
    setError(null)

    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const newCoords: UserCoordinates = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy,
            timestamp: Date.now(),
          }
          setCoords(newCoords)
          persistCoordinates(newCoords)
          setLoading(false)
          resolve(newCoords)
        },
        (err) => {
          setLoading(false)
          let errorMsg = "Unable to retrieve your location."
          if (err.code === err.PERMISSION_DENIED) {
            errorMsg = "Location access was denied. Please allow location permissions in your browser."
          } else if (err.code === err.POSITION_UNAVAILABLE) {
            errorMsg = "Location information is currently unavailable."
          } else if (err.code === err.TIMEOUT) {
            errorMsg = "Request to get location timed out."
          }
          setError(errorMsg)
          resolve(null)
        },
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 300000, // 5 minutes cache
        }
      )
    })
  }, [])

  // Clear cached location
  const clearLocation = useCallback(() => {
    setCoords(null)
    persistCoordinates(null)
  }, [])

  return {
    coords,
    loading,
    error,
    hasLocation: Boolean(coords && typeof coords.latitude === "number" && typeof coords.longitude === "number"),
    requestLocation,
    clearLocation,
  }
}
