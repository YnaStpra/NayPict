"use client"

import React, { useEffect, useState, useMemo } from "react"
import { motion } from "framer-motion"

export interface HeroTransitionOrigin {
  rect: {
    top: number
    left: number
    width: number
    height: number
  }
  src: string
  aspectRatio: number
}

interface HeroPhotoTransitionProps {
  origin: HeroTransitionOrigin | null
  onExpanded: () => void
}

/**
 * Shared Element / Hero Expansion Transition:
 * Animates a tapped photo card thumbnail from its exact gallery bounds
 * directly into the viewport center with iOS-grade deceleration physics.
 */
export function HeroPhotoTransition({
  origin,
  onExpanded,
}: HeroPhotoTransitionProps) {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  // Calculate destination bounds fitted into current viewport
  const targetBounds = useMemo(() => {
    if (typeof window === "undefined" || !origin) {
      return { top: 0, left: 0, width: 0, height: 0 }
    }

    const vw = window.innerWidth
    const vh = window.innerHeight
    const isMobile = vw < 768

    // Padding mimicking PhotoViewer's padding
    const padX = isMobile ? 16 : 48
    const padY = isMobile ? 32 : 64

    const maxW = Math.max(100, vw - padX)
    const maxH = Math.max(100, vh - padY)

    const ar = origin.aspectRatio > 0 ? origin.aspectRatio : 1

    let width = maxW
    let height = width / ar

    if (height > maxH) {
      height = maxH
      width = height * ar
    }

    const left = (vw - width) / 2
    const top = (vh - height) / 2

    return {
      top: Math.round(top),
      left: Math.round(left),
      width: Math.round(width),
      height: Math.round(height),
    }
  }, [origin])

  if (!mounted || !origin) return null

  return (
    <div
      className="fixed inset-0 z-[80] pointer-events-none overflow-hidden select-none"
      aria-hidden="true"
    >
      {/* Cinematic Darkening Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.22, ease: "easeOut" }}
        className="absolute inset-0 bg-black/95 backdrop-blur-md"
      />

      {/* Hero Expanding Image */}
      <motion.div
        initial={{
          top: origin.rect.top,
          left: origin.rect.left,
          width: origin.rect.width,
          height: origin.rect.height,
          borderRadius: 16,
          boxShadow: "0 10px 30px rgba(0,0,0,0.3)",
        }}
        animate={{
          top: targetBounds.top,
          left: targetBounds.left,
          width: targetBounds.width,
          height: targetBounds.height,
          borderRadius: 2,
          boxShadow: "0 25px 50px rgba(0,0,0,0.7)",
        }}
        transition={{
          duration: 0.26,
          ease: [0.16, 1, 0.3, 1], // Fast responsive spring-like curve
        }}
        onAnimationComplete={() => {
          onExpanded()
        }}
        className="absolute overflow-hidden bg-neutral-900"
        style={{ willChange: "top, left, width, height, border-radius" }}
      >
        <img
          src={origin.src}
          alt=""
          className="w-full h-full object-cover select-none pointer-events-none"
          decoding="async"
        />
      </motion.div>
    </div>
  )
}
