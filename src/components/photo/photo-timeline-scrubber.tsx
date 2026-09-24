"use client"

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { CalendarDays } from "lucide-react"
import { type PhotoVo } from "@/server/entity/vo/photo"
import { parseTime } from "@/lib/date"

interface PhotoTimelineScrubberProps {
  photos: PhotoVo[]
}

interface DateCheckpoint {
  index: number
  key: string
  label: string
  shortLabel: string
}

function parsePhotoDate(photo: PhotoVo): { key: string; label: string; shortLabel: string } {
  const timeStr = photo.takenTime || photo.createTime
  if (!timeStr) {
    return { key: "undated", label: "Undated Photos", shortLabel: "Undated" }
  }
  const d = parseTime(timeStr)
  if (!d || isNaN(d.getTime())) {
    return { key: "undated", label: "Undated Photos", shortLabel: "Undated" }
  }

  const monthNames = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ]
  const fullMonthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ]

  const year = d.getFullYear()
  const month = d.getMonth()
  const key = `${year}-${String(month + 1).padStart(2, "0")}`
  const shortLabel = `${monthNames[month]} ${year}`
  const label = `${fullMonthNames[month]} ${year}`

  return { key, label, shortLabel }
}

/**
 * Fast Date Timeline Scrubber (inspired by Google Photos & Apple Photos)
 *
 * 1. Appears smoothly on the right edge when scrolling.
 * 2. Displays current visible photo month/year in real-time.
 * 3. Draggable scrub handle: drag vertically to fast-forward / rewind through the entire photo archive.
 * 4. Micro-haptic feedback ticks on month/year boundary changes.
 * 5. Automatically fades out after 1.5s of inactivity for zero visual clutter.
 */
export const PhotoTimelineScrubber = memo(function PhotoTimelineScrubber({
  photos,
}: PhotoTimelineScrubberProps) {
  const [isVisible, setIsVisible] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const [currentDateLabel, setCurrentDateLabel] = useState<string>("")
  const [scrubberProgress, setScrubberProgress] = useState(0) // 0 (top) to 1 (bottom)

  const hideTimerRef = useRef<NodeJS.Timeout | null>(null)
  const trackRef = useRef<HTMLDivElement | null>(null)
  const lastHapticKeyRef = useRef<string>("")
  const isDraggingRef = useRef(false)

  // Compute distinct date checkpoints across the loaded photos
  const checkpoints = useMemo<DateCheckpoint[]>(() => {
    if (!photos.length) return []

    const list: DateCheckpoint[] = []
    const seenKeys = new Set<string>()

    photos.forEach((photo, index) => {
      const { key, label, shortLabel } = parsePhotoDate(photo)
      if (!seenKeys.has(key)) {
        seenKeys.add(key)
        list.push({ index, key, label, shortLabel })
      }
    })

    return list
  }, [photos])

  const showScrubber = useCallback(() => {
    setIsVisible(true)
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
    if (!isDraggingRef.current) {
      hideTimerRef.current = setTimeout(() => {
        setIsVisible(false)
      }, 1600)
    }
  }, [])

  // Sync scroll position with current visible photo date label
  useEffect(() => {
    if (typeof window === "undefined" || !photos.length) return

    let rAFId: number | null = null

    const handleScroll = () => {
      if (isDraggingRef.current) return

      showScrubber()

      if (rAFId !== null) cancelAnimationFrame(rAFId)
      rAFId = requestAnimationFrame(() => {
        const scrollY = window.scrollY || window.pageYOffset
        const scrollHeight = document.documentElement.scrollHeight || document.body.scrollHeight
        const innerHeight = window.innerHeight
        const maxScroll = Math.max(1, scrollHeight - innerHeight)

        const rawProgress = Math.min(1, Math.max(0, scrollY / maxScroll))
        setScrubberProgress(rawProgress)

        // Find photo closest to current viewport scroll
        const targetPhotoIdx = Math.min(
          photos.length - 1,
          Math.max(0, Math.floor(rawProgress * photos.length))
        )
        const photo = photos[targetPhotoIdx]
        if (photo) {
          const { shortLabel } = parsePhotoDate(photo)
          setCurrentDateLabel(shortLabel)
        }
      })
    }

    window.addEventListener("scroll", handleScroll, { passive: true })
    return () => {
      window.removeEventListener("scroll", handleScroll)
      if (rAFId !== null) cancelAnimationFrame(rAFId)
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
    }
  }, [photos, showScrubber])

  // Drag scrubber interaction handler
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()

    isDraggingRef.current = true
    setIsDragging(true)
    setIsVisible(true)
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current)

    // Capture pointer events for smooth dragging beyond track bounds
    ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)

    handleScrubMove(e.clientY)
  }

  const handleScrubMove = useCallback(
    (clientY: number) => {
      if (!trackRef.current || !photos.length) return

      const rect = trackRef.current.getBoundingClientRect()
      const clampedY = Math.min(Math.max(0, clientY - rect.top), rect.height)
      const progress = rect.height > 0 ? clampedY / rect.height : 0

      setScrubberProgress(progress)

      // Calculate corresponding photo index and date
      const targetPhotoIdx = Math.min(
        photos.length - 1,
        Math.max(0, Math.floor(progress * (photos.length - 1)))
      )
      const targetPhoto = photos[targetPhotoIdx]

      if (targetPhoto) {
        const { label, key } = parsePhotoDate(targetPhoto)
        setCurrentDateLabel(label)

        // Haptic feedback tick on month/year boundary change
        if (lastHapticKeyRef.current !== key) {
          lastHapticKeyRef.current = key
          try {
            if (typeof navigator !== "undefined" && navigator.vibrate) {
              navigator.vibrate(10)
            }
          } catch {}
        }
      }

      // Jump scroll position instantly
      const scrollHeight = document.documentElement.scrollHeight || document.body.scrollHeight
      const innerHeight = window.innerHeight
      const maxScroll = Math.max(0, scrollHeight - innerHeight)
      const targetScrollY = progress * maxScroll

      window.scrollTo({
        top: targetScrollY,
        behavior: "instant" as ScrollBehavior,
      })
    },
    [photos]
  )

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingRef.current) return
    e.preventDefault()
    handleScrubMove(e.clientY)
  }

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingRef.current) return
    isDraggingRef.current = false
    setIsDragging(false)

    try {
      ;(e.target as HTMLElement).releasePointerCapture?.(e.pointerId)
    } catch {}

    // Gracefully fade out after release
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
    hideTimerRef.current = setTimeout(() => {
      setIsVisible(false)
    }, 1200)
  }

  if (photos.length < 12) {
    return null
  }

  return (
    <aside
      aria-label="Timeline Scrubber"
      className={`fixed right-1 sm:right-2 top-28 bottom-24 z-40 flex items-center select-none transition-opacity duration-300 pointer-events-none ${
        isVisible ? "opacity-100" : "opacity-0"
      }`}
    >
      {/* Hitbox track for vertical scrubbing */}
      <div
        ref={trackRef}
        className="relative h-full w-8 sm:w-10 flex justify-end items-stretch pointer-events-auto touch-none cursor-pointer"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        {/* Subtle timeline track guide line */}
        <div className="absolute right-2 top-0 bottom-0 w-[2px] rounded-full bg-border/40 transition-colors group-hover:bg-primary/40" />

        {/* Floating Date Capsule Scrubber Thumb */}
        <div
          className="absolute right-0 flex items-center transition-transform will-change-transform"
          style={{
            top: `${scrubberProgress * 100}%`,
            transform: "translateY(-50%)",
          }}
        >
          {/* Expanded Date Bubble Tooltip (shows on drag or active scroll) */}
          {currentDateLabel && (
            <div
              className={`mr-3 flex items-center gap-1.5 px-3 py-1.5 rounded-full border shadow-xl backdrop-blur-md transition-all duration-200 ${
                isDragging
                  ? "scale-105 bg-background/95 dark:bg-zinc-900/95 border-primary/50 text-foreground text-xs font-semibold shadow-2xl ring-2 ring-primary/20"
                  : "bg-background/85 dark:bg-zinc-900/85 border-border/60 text-muted-foreground text-[11px] font-medium"
              }`}
            >
              <CalendarDays className="w-3.5 h-3.5 text-primary shrink-0" />
              <span className="whitespace-nowrap tracking-tight">{currentDateLabel}</span>
            </div>
          )}

          {/* Physical Touch Pill Handle */}
          <div
            className={`w-4 h-9 sm:w-4.5 sm:h-10 rounded-full border shadow-lg flex items-center justify-center transition-all ${
              isDragging
                ? "bg-primary border-primary text-primary-foreground scale-110 shadow-primary/30"
                : "bg-background/90 dark:bg-zinc-800/90 border-border/80 text-muted-foreground hover:scale-105"
            }`}
          >
            {/* Grip lines */}
            <div className="flex flex-col gap-0.5 items-center">
              <span className="w-1.5 h-[1.5px] rounded-full bg-current opacity-80" />
              <span className="w-1.5 h-[1.5px] rounded-full bg-current opacity-80" />
              <span className="w-1.5 h-[1.5px] rounded-full bg-current opacity-80" />
            </div>
          </div>
        </div>
      </div>
    </aside>
  )
})
