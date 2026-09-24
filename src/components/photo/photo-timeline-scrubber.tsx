"use client"

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { CalendarDays } from "lucide-react"
import { type PhotoVo } from "@/server/entity/vo/photo"
import { parseTime } from "@/lib/date"

interface PhotoTimelineScrubberProps {
  photos: PhotoVo[]
  enabled?: boolean
}

function parsePhotoDate(photo: PhotoVo): { key: string; label: string; shortLabel: string; timestamp: number } {
  const timeStr = photo.takenTime || photo.createTime
  if (!timeStr) {
    return { key: "undated", label: "Undated Photos", shortLabel: "Undated", timestamp: 0 }
  }
  const d = parseTime(timeStr)
  if (!d || isNaN(d.getTime())) {
    return { key: "undated", label: "Undated Photos", shortLabel: "Undated", timestamp: 0 }
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

  return { key, label, shortLabel, timestamp: d.getTime() }
}

/**
 * Validates that photos are sorted chronologically (ascending or descending)
 * so that timeline dates do not jump around randomly.
 */
function isChronologicalList(photos: PhotoVo[]): boolean {
  if (photos.length < 4) return false

  let descCount = 0
  let ascCount = 0
  const sampleStep = Math.max(1, Math.floor(photos.length / 15))
  let prevTime: number | null = null

  for (let i = 0; i < photos.length; i += sampleStep) {
    const timeStr = photos[i]?.takenTime || photos[i]?.createTime
    if (!timeStr) continue
    const t = new Date(timeStr).getTime()
    if (isNaN(t) || t === 0) continue

    if (prevTime !== null) {
      if (t <= prevTime) descCount++
      if (t >= prevTime) ascCount++
    }
    prevTime = t
  }

  const totalPairs = descCount + ascCount
  if (totalPairs < 2) return false
  return descCount / totalPairs >= 0.75 || ascCount / totalPairs >= 0.75
}

/**
 * Fast Date Timeline Scrubber (Google Photos & Apple Photos style)
 *
 * 1. Synchronous zero-delay tracking: rides directly beside native browser scrollbar at 120 FPS.
 * 2. Only visible when media is sorted chronologically by date.
 * 3. Drag handle to fast-forward / rewind through photo archive with tactile haptic ticks.
 * 4. Automatic fade-out on scroll idle.
 */
export const PhotoTimelineScrubber = memo(function PhotoTimelineScrubber({
  photos,
  enabled = true,
}: PhotoTimelineScrubberProps) {
  const [isVisible, setIsVisible] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const [currentDateLabel, setCurrentDateLabel] = useState<string>("")

  const hideTimerRef = useRef<NodeJS.Timeout | null>(null)
  const trackRef = useRef<HTMLDivElement | null>(null)
  const thumbRef = useRef<HTMLDivElement | null>(null)
  const labelTextRef = useRef<HTMLSpanElement | null>(null)
  const lastHapticKeyRef = useRef<string>("")
  const isDraggingRef = useRef(false)

  // Verify chronology so scrubber never appears in random/unordered view
  const isChronological = useMemo(() => {
    if (!enabled || photos.length < 8) return false
    return isChronologicalList(photos)
  }, [enabled, photos])

  const showScrubber = useCallback(() => {
    setIsVisible(true)
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
    if (!isDraggingRef.current) {
      hideTimerRef.current = setTimeout(() => {
        setIsVisible(false)
      }, 1400)
    }
  }, [])

  // Direct 1:1 hardware scroll tracking: updates DOM transform synchronously without React render latency
  useEffect(() => {
    if (typeof window === "undefined" || !isChronological || !photos.length) return

    const updateThumbPosition = () => {
      if (isDraggingRef.current) return

      const scrollY = window.scrollY || window.pageYOffset
      const scrollHeight = document.documentElement.scrollHeight || document.body.scrollHeight
      const innerHeight = window.innerHeight
      const maxScroll = Math.max(1, scrollHeight - innerHeight)

      const progress = Math.min(1, Math.max(0, scrollY / maxScroll))

      // Update thumb DOM directly for 0ms lag lockstep with native scrollbar
      if (trackRef.current && thumbRef.current) {
        const trackHeight = trackRef.current.offsetHeight
        const maxThumbTravel = Math.max(0, trackHeight - 40) // 40px thumb height
        const thumbY = progress * maxThumbTravel

        thumbRef.current.style.transform = `translate3d(0, ${thumbY}px, 0)`
      }

      // Sample photo at current scroll percentage
      const targetPhotoIdx = Math.min(
        photos.length - 1,
        Math.max(0, Math.floor(progress * photos.length))
      )
      const photo = photos[targetPhotoIdx]
      if (photo) {
        const { shortLabel } = parsePhotoDate(photo)
        if (labelTextRef.current) {
          labelTextRef.current.textContent = shortLabel
        }
        setCurrentDateLabel(shortLabel)
      }
    }

    const handleScroll = () => {
      showScrubber()
      updateThumbPosition()
    }

    // Initial position sync
    updateThumbPosition()

    window.addEventListener("scroll", handleScroll, { passive: true })
    window.addEventListener("resize", updateThumbPosition, { passive: true })

    return () => {
      window.removeEventListener("scroll", handleScroll)
      window.removeEventListener("resize", updateThumbPosition)
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
    }
  }, [isChronological, photos, showScrubber])

  // Drag scrubber interaction handler
  const handleScrubMove = useCallback(
    (clientY: number) => {
      if (!trackRef.current || !photos.length) return

      const rect = trackRef.current.getBoundingClientRect()
      const clampedY = Math.min(Math.max(0, clientY - rect.top), rect.height)
      const maxThumbTravel = Math.max(1, rect.height - 40)
      const progress = Math.min(1, Math.max(0, (clampedY - 20) / maxThumbTravel))

      // Direct synchronous update of thumb during drag
      if (thumbRef.current) {
        thumbRef.current.style.transform = `translate3d(0, ${progress * maxThumbTravel}px, 0)`
      }

      // Calculate corresponding photo index and date
      const targetPhotoIdx = Math.min(
        photos.length - 1,
        Math.max(0, Math.floor(progress * (photos.length - 1)))
      )
      const targetPhoto = photos[targetPhotoIdx]

      if (targetPhoto) {
        const { label, key } = parsePhotoDate(targetPhoto)
        if (labelTextRef.current) {
          labelTextRef.current.textContent = label
        }
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

      // Jump scroll position synchronously
      const scrollHeight = document.documentElement.scrollHeight || document.body.scrollHeight
      const innerHeight = window.innerHeight
      const maxScroll = Math.max(1, scrollHeight - innerHeight)
      const targetScrollY = progress * maxScroll

      window.scrollTo({
        top: targetScrollY,
        behavior: "instant" as ScrollBehavior,
      })
    },
    [photos]
  )

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()

    isDraggingRef.current = true
    setIsDragging(true)
    setIsVisible(true)
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current)

    try {
      ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
    } catch {}

    handleScrubMove(e.clientY)
  }

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

    if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
    hideTimerRef.current = setTimeout(() => {
      setIsVisible(false)
    }, 1200)
  }

  if (!isChronological) {
    return null
  }

  return (
    <aside
      aria-label="Timeline Scrubber"
      className={`fixed right-1 sm:right-2 top-14 bottom-14 z-40 flex items-center select-none transition-opacity duration-250 pointer-events-none ${
        isVisible ? "opacity-100" : "opacity-0"
      }`}
    >
      {/* Hitbox track aligned side-by-side with native scrollbar */}
      <div
        ref={trackRef}
        className="relative h-full w-8 sm:w-10 flex justify-end items-stretch pointer-events-auto touch-none cursor-pointer"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        {/* Subtle timeline track guide line */}
        <div className="absolute right-2 top-0 bottom-0 w-[2px] rounded-full bg-border/30 transition-colors group-hover:bg-primary/40" />

        {/* Floating Date Capsule Scrubber Thumb (Zero CSS transition delay for 1:1 hardware scroll lock) */}
        <div
          ref={thumbRef}
          className="absolute right-0 top-0 flex items-center will-change-transform"
          style={{
            transform: "translate3d(0, 0, 0)",
          }}
        >
          {/* Expanded Date Bubble Tooltip (shows on drag or active scroll) */}
          <div
            className={`mr-2.5 flex items-center gap-1.5 px-3 py-1.5 rounded-full border shadow-xl backdrop-blur-md transition-all duration-150 ${
              isDragging
                ? "scale-105 bg-background/95 dark:bg-zinc-900/95 border-primary/50 text-foreground text-xs font-semibold shadow-2xl ring-2 ring-primary/20"
                : "bg-background/90 dark:bg-zinc-900/90 border-border/60 text-foreground text-[11px] font-medium"
            }`}
          >
            <CalendarDays className="w-3.5 h-3.5 text-primary shrink-0" />
            <span ref={labelTextRef} className="whitespace-nowrap tracking-tight font-semibold">
              {currentDateLabel}
            </span>
          </div>

          {/* Physical Touch Pill Handle */}
          <div
            className={`w-3.5 h-9 sm:w-4 sm:h-10 rounded-full border shadow-lg flex items-center justify-center transition-colors ${
              isDragging
                ? "bg-primary border-primary text-primary-foreground shadow-primary/30"
                : "bg-background/95 dark:bg-zinc-800/95 border-border text-muted-foreground hover:border-primary/50"
            }`}
          >
            {/* Tactile Grip Lines */}
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
