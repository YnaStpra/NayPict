"use client"

import { useCallback, useEffect, useState } from "react"

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[]
  readonly userChoice: Promise<{
    outcome: "accepted" | "dismissed"
    platform: string
  }>
  prompt(): Promise<void>
}

// Module-level cache for beforeinstallprompt event across component mounts
let deferredPrompt: BeforeInstallPromptEvent | null = null
const promptListeners = new Set<() => void>()

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault()
    deferredPrompt = e as BeforeInstallPromptEvent
    promptListeners.forEach((fn) => fn())
  })

  window.addEventListener("appinstalled", () => {
    deferredPrompt = null
    promptListeners.forEach((fn) => fn())
  })
}

/**
 * Universal cross-platform PWA installation hook.
 * Seamlessly manages native install prompt on Chromium (Android, Windows, macOS, Linux)
 * and guides iOS/iPadOS Safari users through the "Add to Home Screen" workflow.
 */
export function usePwaInstall() {
  const [promptReady, setPromptReady] = useState(Boolean(deferredPrompt))
  const [isIosGuideOpen, setIsIosGuideOpen] = useState(false)
  const [isInstalled, setIsInstalled] = useState(false)
  const [isIos, setIsIos] = useState(false)

  useEffect(() => {
    if (typeof window === "undefined") return

    const checkStandalone = () => {
      const isStandaloneMedia = window.matchMedia("(display-mode: standalone)").matches
      const isIosStandalone = "standalone" in navigator && Boolean((navigator as any).standalone)
      return isStandaloneMedia || isIosStandalone
    }

    const checkIos = () => {
      const ua = window.navigator.userAgent || ""
      return /iPad|iPhone|iPod/.test(ua) && !(window as any).MSStream
    }

    setIsInstalled(checkStandalone())
    setIsIos(checkIos())

    const handlePromptChange = () => {
      setPromptReady(Boolean(deferredPrompt))
      setIsInstalled(checkStandalone())
    }

    promptListeners.add(handlePromptChange)
    return () => {
      promptListeners.delete(handlePromptChange)
    }
  }, [])

  const promptInstall = useCallback(async () => {
    if (isIos) {
      setIsIosGuideOpen(true)
      return
    }

    if (!deferredPrompt) return

    try {
      await deferredPrompt.prompt()
      const choice = await deferredPrompt.userChoice
      if (choice.outcome === "accepted") {
        deferredPrompt = null
        setPromptReady(false)
      }
    } catch {
      // Prompt error or dismissed safely
    }
  }, [isIos])

  // Can install if not already in standalone mode and either native prompt is ready or running on iOS browser
  const canInstall = !isInstalled && (promptReady || isIos)

  return {
    canInstall,
    isInstalled,
    isIos,
    isIosGuideOpen,
    setIsIosGuideOpen,
    promptInstall,
  }
}

