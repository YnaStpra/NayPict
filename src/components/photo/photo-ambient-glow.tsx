"use client"

import React, { useMemo } from "react"
import { getThumbHashUrl } from "@/lib/thumb-hash"
import { cn } from "@/lib/utils"

interface PhotoViewerAmbientGlowProps {
  thumbHash?: string | null
  visible?: boolean
  dragOpacity?: number
  className?: string
}

/**
 * Dynamic Cinema Ambient Glow (Apple TV / Spotify Canvas / YouTube Ambient Mode)
 * Multi-layer atmospheric diffusion backdrop driven by thumbHash dominant color.
 */
export function PhotoViewerAmbientGlow({
  thumbHash,
  visible = true,
  dragOpacity = 1,
  className,
}: PhotoViewerAmbientGlowProps) {
  const thumbHashUrl = useMemo(() => getThumbHashUrl(thumbHash), [thumbHash])

  if (!thumbHashUrl || !visible) return null

  return (
    <div
      className={cn(
        "fixed inset-0 z-[-5] pointer-events-none select-none flex items-center justify-center overflow-hidden transition-opacity duration-500",
        className
      )}
      style={{
        opacity: dragOpacity,
        willChange: "opacity, transform",
        transform: "translateZ(0)",
      }}
      aria-hidden
    >
      {/* Outer Ambient Atmosphere: Ultra-wide color wash with enhanced saturation */}
      <img
        src={thumbHashUrl}
        alt=""
        decoding="async"
        className="absolute w-[95vw] h-[95vh] max-w-[1600px] max-h-[1200px] rounded-full blur-[100px] md:blur-[180px] opacity-70 dark:opacity-80 scale-150 saturate-[2.2] contrast-[1.25] object-cover pointer-events-none transition-all duration-700 ease-out animate-ambient-breathe"
      />

      {/* Inner Core Bloom: Tighter, radiant halo around photo frame */}
      <img
        src={thumbHashUrl}
        alt=""
        decoding="async"
        className="absolute w-[75vw] h-[75vh] max-w-[1100px] max-h-[850px] rounded-full blur-[45px] md:blur-[85px] opacity-60 dark:opacity-75 scale-110 saturate-[1.8] contrast-[1.15] object-cover pointer-events-none transition-all duration-700 ease-out"
      />

      {/* Cinema Contrast Vignette: Preserves deep black viewport edges and contrast */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse at 50% 50%, transparent 20%, rgba(0,0,0,0.55) 65%, rgba(0,0,0,0.88) 95%)",
        }}
      />
    </div>
  )
}
