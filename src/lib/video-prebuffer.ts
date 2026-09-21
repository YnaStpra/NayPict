"use client"

import { toProxyMediaUrl } from "@/lib/url"

// Set to track pre-buffered video URLs to prevent redundant network requests
const prebufferedVideoUrls = new Set<string>()

// Pool of hidden HTML5 video elements for background byte-range pre-buffering
const MAX_PREBUFFER_ELEMENTS = 4
const prebufferElements: HTMLVideoElement[] = []

function getPrebufferElement(): HTMLVideoElement | null {
  if (typeof document === "undefined") return null

  if (prebufferElements.length < MAX_PREBUFFER_ELEMENTS) {
    const video = document.createElement("video")
    video.preload = "auto"
    video.muted = true
    video.defaultMuted = true
    video.playsInline = true
    video.crossOrigin = "anonymous"
    video.setAttribute("webkit-playsinline", "true")
    video.style.position = "fixed"
    video.style.width = "1px"
    video.style.height = "1px"
    video.style.opacity = "0"
    video.style.pointerEvents = "none"
    video.style.top = "-9999px"
    video.style.left = "-9999px"
    document.body.appendChild(video)
    prebufferElements.push(video)
    return video
  }

  // Round-robin reuse oldest prebuffer element
  const recycled = prebufferElements.shift()!
  prebufferElements.push(recycled)
  return recycled
}

/**
 * Proactively pre-buffers a video stream into the browser media/disk cache.
 * Uses native HTML5 byte-range requests with preload="auto" to fetch initial
 * video containers, moov atoms, and media segments before the user navigates to it.
 */
export function prebufferVideo(rawUrl?: string | null): void {
  if (!rawUrl || typeof window === "undefined") return

  const url = rawUrl.startsWith("http") ? rawUrl : toProxyMediaUrl(rawUrl)
  if (!url || prebufferedVideoUrls.has(url)) return

  prebufferedVideoUrls.add(url)
  // Keep memory bounded during extensive gallery browsing
  if (prebufferedVideoUrls.size > 200) {
    const oldest = prebufferedVideoUrls.values().next().value
    if (oldest) prebufferedVideoUrls.delete(oldest)
  }

  const run = () => {
    try {
      const el = getPrebufferElement()
      if (!el) return

      // Reset and load the video with preload="auto"
      el.src = url
      el.load()
    } catch {
      // Gracefully ignore any DOM or media decoding exceptions
    }
  }

  // Dispatch aggressively via requestIdleCallback with low timeout or immediate microtask
  if ("requestIdleCallback" in window) {
    window.requestIdleCallback(run, { timeout: 150 })
  } else {
    setTimeout(run, 0)
  }
}
