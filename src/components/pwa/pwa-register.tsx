"use client"

import { useEffect } from "react"

// Automatically registers the NayPict PWA service worker and handles offline capability.
export function PwaRegister() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
      return
    }

    // Register service worker
    const registerSw = async () => {
      try {
        const registration = await navigator.serviceWorker.register("/sw.js", {
          scope: "/",
        })

        // Check for service worker updates periodically
        registration.addEventListener("updatefound", () => {
          const newWorker = registration.installing
          if (newWorker) {
            newWorker.addEventListener("statechange", () => {
              if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
                console.log("[PWA] New version of NayPict is available.")
              }
            })
          }
        })
      } catch (err) {
        console.warn("[PWA] Service worker registration failed:", err)
      }
    }

    // Register after page is fully loaded to not block first contentful paint
    if (document.readyState === "complete") {
      registerSw()
    } else {
      window.addEventListener("load", registerSw)
      return () => window.removeEventListener("load", registerSw)
    }
  }, [])

  return null
}
