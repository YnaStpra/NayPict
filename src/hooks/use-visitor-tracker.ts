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

  if (isBrave) {
    browser = "Brave"
  } else if (/Edg\//i.test(ua)) {
    browser = "Edge"
  } else if (/OPR\/|Opera/i.test(ua)) {
    browser = "Opera"
  } else if (/SamsungBrowser/i.test(ua)) {
    browser = "Samsung Internet"
  } else if (/Firefox\//i.test(ua)) {
    browser = "Firefox"
  } else if (/Chrome\//i.test(ua)) {
    browser = "Chrome"
  } else if (/Safari/i.test(ua)) {
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
    // Strictly exclude authenticated administrators from tracking
    if (isAdmin || typeof window === "undefined") return

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

    // Initialize session if not yet initialized
    const initSession = async () => {
      if (!activeSessionId) {
        const { browser, device, os } = await detectClientTelemetry()
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
    }

    initSession()

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
      document.removeEventListener("visibilitychange", handleVisibilityChange)
      window.removeEventListener("pagehide", handleBeforeUnload)
      window.removeEventListener("beforeunload", handleBeforeUnload)
    }
  }, [isAdmin])
}
