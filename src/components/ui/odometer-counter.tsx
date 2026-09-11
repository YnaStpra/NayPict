"use client"

import { useEffect, useRef, useState } from "react"

interface OdometerCounterProps {
  target: number
  duration?: number
  className?: string
  formatter?: (n: number) => string
}

// Ease-out cubic curve
function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3)
}

/**
 * High-performance animated number counter with smooth easing.
 * Starts from 0 on initial mount, and transitions from previous value on subsequent updates.
 */
export function OdometerCounter({
  target,
  duration = 900,
  className = "",
  formatter = (n) => Math.round(n).toLocaleString(),
}: OdometerCounterProps) {
  const [current, setCurrent] = useState(0)
  const currentRef = useRef(0)

  useEffect(() => {
    let startTimestamp: number | null = null
    let rafId: number
    const startVal = currentRef.current

    if (startVal === target) {
      return
    }

    const step = (timestamp: number) => {
      if (!startTimestamp) startTimestamp = timestamp
      const progress = Math.min((timestamp - startTimestamp) / duration, 1)
      const easedProgress = easeOutCubic(progress)
      const nextVal = startVal + (target - startVal) * easedProgress

      setCurrent(nextVal)
      currentRef.current = nextVal

      if (progress < 1) {
        rafId = requestAnimationFrame(step)
      } else {
        setCurrent(target)
        currentRef.current = target
      }
    }

    rafId = requestAnimationFrame(step)
    return () => cancelAnimationFrame(rafId)
  }, [target, duration])

  return <span className={className}>{formatter(current)}</span>
}

