"use client"

import React, { useEffect, useRef } from "react"
import { cn } from "@/lib/utils"

export interface VideoAmbientGlowProps {
  videoRef: React.RefObject<HTMLVideoElement | null>
  isPlaying?: boolean
  poster?: string
  enabled?: boolean
  isActive?: boolean
  dragOpacity?: number
  className?: string
}

type VideoElementWithRVFC = HTMLVideoElement & {
  requestVideoFrameCallback?: (
    callback: (now: number, metadata: unknown) => void
  ) => number
  cancelVideoFrameCallback?: (handle: number) => void
}

/**
 * Dynamic Real-Time Video Ambient Glow (Ambilight / YouTube Ambient Mode)
 * Multi-layer atmospheric diffusion backdrop driven by the video frames in real-time.
 * 
 * 100% Client-Side GPU Canvas execution:
 * - 0 Vercel Serverless Function invocations
 * - 0 Vercel Fast Data Transfer / bandwidth usage
 * - 0 API requests
 * - Native GPU downsampling via HTML5 Canvas (32x18 pixels) + CSS filters
 */
export function VideoAmbientGlow({
  videoRef,
  isPlaying = false,
  poster,
  enabled = true,
  isActive = true,
  dragOpacity = 1,
  className,
}: VideoAmbientGlowProps) {
  const outerCanvasRef = useRef<HTMLCanvasElement>(null)
  const innerCanvasRef = useRef<HTMLCanvasElement>(null)
  const isRunningRef = useRef(false)
  const rvfcHandleRef = useRef<number | null>(null)
  const rafHandleRef = useRef<number | null>(null)
  const lastDrawTimeRef = useRef<number>(0)
  const hasDrawnVideoFrameRef = useRef(false)

  // Draw current frame or image source to both canvases
  const drawSource = (source: CanvasImageSource) => {
    const cOuter = outerCanvasRef.current
    const cInner = innerCanvasRef.current
    if (!cOuter && !cInner) return

    try {
      if (cOuter) {
        const ctx = cOuter.getContext("2d", { alpha: false, desynchronized: true })
        if (ctx) {
          ctx.drawImage(source, 0, 0, cOuter.width, cOuter.height)
        }
      }
      if (cInner) {
        const ctx = cInner.getContext("2d", { alpha: false, desynchronized: true })
        if (ctx) {
          ctx.drawImage(source, 0, 0, cInner.width, cInner.height)
        }
      }
    } catch {
      // Gracefully catch any cross-origin or canvas decode errors
    }
  }

  // Update canvas internal pixel resolution to match video aspect ratio
  const syncDimensions = (width?: number, height?: number) => {
    const video = videoRef.current
    const vw = width || video?.videoWidth || 16
    const vh = height || video?.videoHeight || 9
    const aspect = vw / vh

    const base = 32
    const w = aspect >= 1 ? base : Math.max(16, Math.round(base * aspect))
    const h = aspect >= 1 ? Math.max(16, Math.round(base / aspect)) : base

    const cOuter = outerCanvasRef.current
    const cInner = innerCanvasRef.current

    if (cOuter && (cOuter.width !== w || cOuter.height !== h)) {
      cOuter.width = w
      cOuter.height = h
    }
    if (cInner && (cInner.width !== w || cInner.height !== h)) {
      cInner.width = w
      cInner.height = h
    }
  }

  // Draw single video frame immediately
  const drawVideoFrame = () => {
    const video = videoRef.current
    if (!video || video.readyState < 2) return
    syncDimensions()
    drawSource(video)
    hasDrawnVideoFrameRef.current = true
  }

  // Draw initial poster image if available and video has not decoded yet
  useEffect(() => {
    if (!poster || hasDrawnVideoFrameRef.current) return
    const img = new Image()
    img.crossOrigin = "anonymous"
    img.onload = () => {
      if (!hasDrawnVideoFrameRef.current) {
        syncDimensions(img.naturalWidth, img.naturalHeight)
        drawSource(img)
      }
    }
    img.src = poster
  }, [poster])

  // Listen to video state changes (seek, metadata loaded, first frame) to update glow immediately
  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    const handleImmediateUpdate = () => {
      drawVideoFrame()
    }

    video.addEventListener("loadedmetadata", handleImmediateUpdate)
    video.addEventListener("loadeddata", handleImmediateUpdate)
    video.addEventListener("canplay", handleImmediateUpdate)
    video.addEventListener("seeked", handleImmediateUpdate)
    video.addEventListener("timeupdate", handleImmediateUpdate)

    // Attempt drawing once if video is already ready
    if (video.readyState >= 2) {
      drawVideoFrame()
    }

    return () => {
      video.removeEventListener("loadedmetadata", handleImmediateUpdate)
      video.removeEventListener("loadeddata", handleImmediateUpdate)
      video.removeEventListener("canplay", handleImmediateUpdate)
      video.removeEventListener("seeked", handleImmediateUpdate)
      video.removeEventListener("timeupdate", handleImmediateUpdate)
    }
  }, [videoRef])

  // Continuous animation loop during video playback
  useEffect(() => {
    const video = videoRef.current as VideoElementWithRVFC | null
    if (!video || !isPlaying || !enabled || !isActive) {
      if (rvfcHandleRef.current !== null && video?.cancelVideoFrameCallback) {
        video.cancelVideoFrameCallback(rvfcHandleRef.current)
        rvfcHandleRef.current = null
      }
      if (rafHandleRef.current !== null) {
        cancelAnimationFrame(rafHandleRef.current)
        rafHandleRef.current = null
      }
      isRunningRef.current = false
      return
    }

    isRunningRef.current = true

    const supportsRVFC = typeof video.requestVideoFrameCallback === "function"

    if (supportsRVFC && video.requestVideoFrameCallback) {
      const onFrame = () => {
        if (!isRunningRef.current) return
        drawVideoFrame()
        if (video && video.requestVideoFrameCallback) {
          rvfcHandleRef.current = video.requestVideoFrameCallback(onFrame)
        }
      }
      rvfcHandleRef.current = video.requestVideoFrameCallback(onFrame)
    } else {
      // Fallback: throttled requestAnimationFrame (~30fps)
      const onRaf = (timestamp: number) => {
        if (!isRunningRef.current) return
        if (timestamp - lastDrawTimeRef.current >= 33) {
          lastDrawTimeRef.current = timestamp
          drawVideoFrame()
        }
        rafHandleRef.current = requestAnimationFrame(onRaf)
      }
      rafHandleRef.current = requestAnimationFrame(onRaf)
    }

    return () => {
      isRunningRef.current = false
      if (rvfcHandleRef.current !== null && video?.cancelVideoFrameCallback) {
        video.cancelVideoFrameCallback(rvfcHandleRef.current)
        rvfcHandleRef.current = null
      }
      if (rafHandleRef.current !== null) {
        cancelAnimationFrame(rafHandleRef.current)
        rafHandleRef.current = null
      }
    }
  }, [videoRef, isPlaying, enabled, isActive])

  // Pause rendering when browser tab is inactive to save battery
  useEffect(() => {
    const handleVisibility = () => {
      if (document.hidden) {
        isRunningRef.current = false
        const video = videoRef.current as VideoElementWithRVFC | null
        if (rvfcHandleRef.current !== null && video?.cancelVideoFrameCallback) {
          video.cancelVideoFrameCallback(rvfcHandleRef.current)
          rvfcHandleRef.current = null
        }
        if (rafHandleRef.current !== null) {
          cancelAnimationFrame(rafHandleRef.current)
          rafHandleRef.current = null
        }
      } else if (isPlaying && enabled && isActive) {
        drawVideoFrame()
      }
    }

    document.addEventListener("visibilitychange", handleVisibility)
    return () => {
      document.removeEventListener("visibilitychange", handleVisibility)
    }
  }, [isPlaying, enabled, isActive])

  if (!isActive) return null

  return (
    <div
      className={cn(
        "absolute inset-0 z-0 pointer-events-none select-none flex items-center justify-center overflow-hidden transition-opacity duration-500",
        enabled ? "opacity-100" : "opacity-0 pointer-events-none",
        className
      )}
      style={{
        opacity: enabled ? dragOpacity : 0,
        transform: "translateZ(0)",
        contain: "paint",
      }}
      aria-hidden="true"
    >
      {/* Outer Atmosphere Canvas: Ultra-wide color wash with enhanced saturation (Desktop only to conserve mobile GPU fill-rate) */}
      <canvas
        ref={outerCanvasRef}
        width={32}
        height={18}
        className="absolute w-[110%] h-[110%] md:w-[135%] md:h-[135%] max-w-none rounded-full blur-[100px] md:blur-[140px] opacity-75 dark:opacity-85 scale-125 md:scale-140 saturate-[2.2] contrast-[1.25] pointer-events-none transition-all duration-300 ease-out hidden md:block"
      />

      {/* Inner Core Bloom Canvas: Radiant atmospheric halo hugging the video edges */}
      <canvas
        ref={innerCanvasRef}
        width={32}
        height={18}
        className="absolute w-[95%] h-[95%] md:w-[105%] md:h-[105%] max-w-none rounded-2xl md:rounded-3xl blur-[28px] md:blur-[60px] opacity-70 dark:opacity-85 scale-105 md:scale-115 saturate-[1.8] contrast-[1.2] pointer-events-none transition-all duration-300 ease-out"
      />

      {/* Cinema Contrast Vignette: Preserves deep black viewport edges and contrast */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse at 50% 50%, transparent 25%, rgba(0,0,0,0.50) 70%, rgba(0,0,0,0.90) 98%)",
        }}
      />
    </div>
  )
}
