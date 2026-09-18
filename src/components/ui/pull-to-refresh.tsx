"use client"

import React, { useState, useRef, useEffect, useCallback } from "react"
import { motion, AnimatePresence } from "framer-motion"

interface PullToRefreshProps {
  // Asynchronous callback triggered on release to refresh content.
  onRefresh: () => Promise<unknown> | void
  // Children to render inside the pullable container.
  children: React.ReactNode
  // Disabled state (e.g. while modal, selection, or viewer is open).
  disabled?: boolean
}

const PULL_THRESHOLD = 68
const MAX_PULL = 110

// Interactive SVG Camera Aperture Shutter icon that opens/rotates with pull distance.
function CameraShutterIcon({
  progress,
  refreshing,
}: {
  progress: number
  refreshing: boolean
}) {
  const rotation = refreshing ? 0 : progress * 240

  return (
    <div className="relative size-8 flex items-center justify-center">
      {/* Aperture SVG with 6 rotating blades */}
      <svg
        viewBox="0 0 48 48"
        className={`size-7 transition-transform ${refreshing ? "animate-spin" : ""}`}
        style={{
          transform: `rotate(${rotation}deg)`,
          animationDuration: "800ms",
        }}
      >
        <circle
          cx="24"
          cy="24"
          r="21"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          className="text-white/20"
        />
        {/* Aperture blades */}
        <g stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" className="text-primary">
          <line x1="24" y1="5" x2="16" y2="19" />
          <line x1="16" y1="19" x2="20" y2="35" />
          <line x1="20" y1="35" x2="35" y2="35" />
          <line x1="35" y1="35" x2="41" y2="21" />
          <line x1="41" y1="21" x2="31" y2="9" />
          <line x1="31" y1="9" x2="24" y2="5" />
        </g>
        <circle
          cx="24"
          cy="24"
          r={Math.max(3, 8 - progress * 4)}
          fill="currentColor"
          className={progress >= 1 ? "text-primary animate-pulse" : "text-white/40"}
        />
      </svg>
    </div>
  )
}

// Fluid, iOS-style Pull-to-Refresh container with custom camera shutter physics and haptics.
export function PullToRefresh({
  onRefresh,
  children,
  disabled = false,
}: PullToRefreshProps) {
  const [pullY, setPullY] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const touchStartY = useRef<number | null>(null)
  const touchStartX = useRef<number | null>(null)
  const isDragging = useRef(false)
  const hasVibratedRef = useRef(false)
  const containerRef = useRef<HTMLDivElement | null>(null)

  // Progress ratio 0 -> 1 based on threshold
  const progress = Math.min(1, pullY / PULL_THRESHOLD)

  // Handle touch start at top of page
  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (disabled || refreshing) return
      // Only initiate pull when scroll position is at the very top
      if (window.scrollY <= 1) {
        const touch = e.touches[0]
        if (touch) {
          touchStartY.current = touch.clientY
          touchStartX.current = touch.clientX
          isDragging.current = true
          hasVibratedRef.current = false
        }
      }
    },
    [disabled, refreshing]
  )

  // Handle touch move with rubber-band damping
  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (!isDragging.current || touchStartY.current === null || disabled || refreshing) return

      const touch = e.touches[0]
      if (!touch) return

      const deltaY = touch.clientY - touchStartY.current
      const deltaX = touchStartX.current !== null ? Math.abs(touch.clientX - touchStartX.current) : 0

      // If user is clearly swiping horizontally, cancel pull-to-refresh immediately
      if (deltaX > 15 && deltaX > deltaY) {
        setPullY(0)
        isDragging.current = false
        return
      }

      // Only pull down when at top
      if (deltaY > 0 && window.scrollY <= 1) {
        // Damped rubber-band physics curve
        const dampedY = Math.min(MAX_PULL, Math.pow(deltaY, 0.85) * 1.8)
        setPullY(dampedY)

        // Haptic feedback once threshold is crossed
        if (dampedY >= PULL_THRESHOLD && !hasVibratedRef.current) {
          hasVibratedRef.current = true
          try {
            if (typeof navigator !== "undefined" && navigator.vibrate) {
              navigator.vibrate(15)
            }
          } catch {}
        } else if (dampedY < PULL_THRESHOLD) {
          hasVibratedRef.current = false
        }
      } else {
        setPullY(0)
        isDragging.current = false
      }
    },
    [disabled, refreshing]
  )

  // Handle touch release: Execute refresh or snap back
  const handleTouchEnd = useCallback(async () => {
    if (!isDragging.current || disabled) return
    isDragging.current = false
    touchStartY.current = null

    if (pullY >= PULL_THRESHOLD && !refreshing) {
      setRefreshing(true)
      setPullY(55) // Hold indicator at comfortable viewing height

      try {
        await Promise.all([
          onRefresh(),
          // Enforce minimum animation dwell time for satisfying visual feedback
          new Promise((resolve) => setTimeout(resolve, 650)),
        ])
      } catch (err) {
        console.warn("[PullToRefresh] Refresh failed:", err)
      } finally {
        setRefreshing(false)
        setPullY(0)
      }
    } else {
      setPullY(0)
    }
  }, [pullY, refreshing, disabled, onRefresh])

  return (
    <div
      ref={containerRef}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={() => {
        isDragging.current = false
        touchStartY.current = null
        if (!refreshing) setPullY(0)
      }}
      className="relative w-full"
    >
      {/* Elastic Indicator Pill */}
      <AnimatePresence>
        {(pullY > 0 || refreshing) && (
          <motion.div
            initial={{ opacity: 0, y: -20, scale: 0.85 }}
            animate={{
              opacity: Math.max(0.2, progress),
              y: Math.max(12, pullY * 0.75),
              scale: 0.85 + progress * 0.15,
            }}
            exit={{ opacity: 0, y: -20, scale: 0.85 }}
            transition={{ type: "spring", stiffness: 450, damping: 28 }}
            className="fixed top-2 inset-x-0 z-[60] flex justify-center pointer-events-none"
          >
            <div className="flex items-center gap-2.5 px-3.5 py-1.5 rounded-full bg-neutral-900/90 border border-white/15 backdrop-blur-xl shadow-xl text-white">
              <CameraShutterIcon progress={progress} refreshing={refreshing} />
              <span className="text-xs font-semibold tracking-tight text-white/90">
                {refreshing
                  ? "Refreshing..."
                  : pullY >= PULL_THRESHOLD
                  ? "Release to refresh"
                  : "Pull down"}
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Content wrapper with subtle spring translation */}
      <div
        style={{
          transform: pullY > 0 ? `translate3d(0, ${pullY * 0.35}px, 0)` : undefined,
          transition: isDragging.current ? "none" : "transform 260ms cubic-bezier(0.25, 1, 0.5, 1)",
          willChange: pullY > 0 ? "transform" : "auto",
        }}
      >
        {children}
      </div>
    </div>
  )
}
