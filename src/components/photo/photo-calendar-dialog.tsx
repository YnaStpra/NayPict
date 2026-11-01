"use client"

import React, { useState, useMemo, useCallback, useRef } from "react"
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Play,
  X,
  Sparkles,
  Layers,
  Image as ImageIcon,
} from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { type PhotoVo } from "@/server/entity/vo/photo"
import { cn } from "@/lib/utils"

interface PhotoCalendarDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  photos: PhotoVo[]
  onPhotoClick?: (photo: PhotoVo) => void
}

const DAYS_OF_WEEK = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

export function PhotoCalendarDialog({
  open,
  onOpenChange,
  photos,
  onPhotoClick,
}: PhotoCalendarDialogProps) {
  // Current viewed month and year
  const [currentDate, setCurrentDate] = useState(() => new Date())
  const [selectedDateKey, setSelectedDateKey] = useState<string | null>(null)

  // Touch gesture tracking for horizontal swipe between months
  const touchStartRef = useRef<{ x: number; y: number } | null>(null)

  // 1. Group photos by "YYYY-MM-DD"
  const photosByDate = useMemo(() => {
    const map = new Map<string, PhotoVo[]>()
    for (const photo of photos) {
      const raw = photo.takenTime || photo.createTime
      if (!raw) continue
      const dateKey = raw.slice(0, 10) // "YYYY-MM-DD"
      const existing = map.get(dateKey)
      if (existing) {
        existing.push(photo)
      } else {
        map.set(dateKey, [photo])
      }
    }
    return map
  }, [photos])

  const year = currentDate.getFullYear()
  const month = currentDate.getMonth()

  const monthName = useMemo(() => {
    return currentDate.toLocaleString("en-US", { month: "long", year: "numeric" })
  }, [currentDate])

  const handlePrevMonth = useCallback(() => {
    setCurrentDate((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))
    setSelectedDateKey(null)
  }, [])

  const handleNextMonth = useCallback(() => {
    setCurrentDate((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))
    setSelectedDateKey(null)
  }, [])

  const handleToday = useCallback(() => {
    setCurrentDate(new Date())
    setSelectedDateKey(null)
  }, [])

  // Touch swipe handlers
  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      touchStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
    }
  }

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (!touchStartRef.current || e.changedTouches.length !== 1) return
    const dx = e.changedTouches[0].clientX - touchStartRef.current.x
    const dy = e.changedTouches[0].clientY - touchStartRef.current.y
    touchStartRef.current = null

    // Horizontal swipe threshold: > 50px dx and < 40px dy
    if (Math.abs(dx) > 50 && Math.abs(dy) < 40) {
      if (dx > 0) {
        handlePrevMonth()
      } else {
        handleNextMonth()
      }
    }
  }

  // Calculate calendar grid days
  const calendarCells = useMemo(() => {
    const firstDayIndex = new Date(year, month, 1).getDay()
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    const daysInPrevMonth = new Date(year, month, 0).getDate()

    const cells: Array<{
      day: number
      isCurrentMonth: boolean
      dateKey: string
      photos: PhotoVo[]
    }> = []

    // 1. Previous month trailing days
    for (let i = firstDayIndex - 1; i >= 0; i--) {
      const day = daysInPrevMonth - i
      const prevMonth = month === 0 ? 11 : month - 1
      const prevYear = month === 0 ? year - 1 : year
      const dateKey = `${prevYear}-${String(prevMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`
      cells.push({
        day,
        isCurrentMonth: false,
        dateKey,
        photos: photosByDate.get(dateKey) || [],
      })
    }

    // 2. Current month days
    for (let day = 1; day <= daysInMonth; day++) {
      const dateKey = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`
      cells.push({
        day,
        isCurrentMonth: true,
        dateKey,
        photos: photosByDate.get(dateKey) || [],
      })
    }

    // 3. Next month leading days to complete full weeks
    const remainingCells = 7 - (cells.length % 7)
    if (remainingCells < 7) {
      for (let day = 1; day <= remainingCells; day++) {
        const nextMonth = month === 11 ? 0 : month + 1
        const nextYear = month === 11 ? year + 1 : year
        const dateKey = `${nextYear}-${String(nextMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`
        cells.push({
          day,
          isCurrentMonth: false,
          dateKey,
          photos: photosByDate.get(dateKey) || [],
        })
      }
    }

    return cells
  }, [year, month, photosByDate])

  // Photos of the actively selected date tile
  const selectedDatePhotos = useMemo(() => {
    if (!selectedDateKey) return []
    return photosByDate.get(selectedDateKey) || []
  }, [selectedDateKey, photosByDate])

  const formattedSelectedDate = useMemo(() => {
    if (!selectedDateKey) return ""
    const [y, m, d] = selectedDateKey.split("-").map(Number)
    return new Date(y, m - 1, d).toLocaleDateString("en-US", {
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
    })
  }, [selectedDateKey])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl w-[95vw] sm:w-[90vw] md:max-w-3xl border-border/70 bg-background/95 backdrop-blur-3xl shadow-2xl rounded-2xl p-4 sm:p-6 max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header: Title & Month Navigation */}
        <DialogHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3 border-b border-border/50">
          <div className="flex items-center gap-2.5">
            <div className="flex size-9 items-center justify-center rounded-xl bg-sky-500/15 text-sky-500 border border-sky-500/30">
              <CalendarDays className="size-5" />
            </div>
            <div>
              <DialogTitle className="text-base sm:text-lg font-semibold tracking-tight text-foreground flex items-center gap-2">
                <span>Photo Archive Calendar</span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-sky-500/10 text-sky-500 border border-sky-500/20 font-medium">
                  Instagram View
                </span>
              </DialogTitle>
              <p className="text-[11px] sm:text-xs text-muted-foreground">
                Browse moments visually by the day they were captured
              </p>
            </div>
          </div>

          {/* Month Switcher Controls */}
          <div className="flex items-center gap-1.5 self-center sm:self-auto">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleToday}
              className="text-xs h-8 px-2.5 rounded-lg border-border/60 hover:bg-muted"
            >
              Today
            </Button>
            <div className="flex items-center rounded-lg border border-border/60 bg-muted/30 p-0.5">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={handlePrevMonth}
                className="size-7 rounded-md hover:bg-muted"
                aria-label="Previous month"
              >
                <ChevronLeft className="size-4" />
              </Button>
              <span className="text-xs sm:text-sm font-semibold px-2 min-w-[125px] text-center select-none">
                {monthName}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={handleNextMonth}
                className="size-7 rounded-md hover:bg-muted"
                aria-label="Next month"
              >
                <ChevronRight className="size-4" />
              </Button>
            </div>
          </div>
        </DialogHeader>

        {/* Calendar Body: Swipeable Grid */}
        <div
          className="flex-1 min-h-0 overflow-y-auto pt-3 space-y-3 touch-pan-y"
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          {/* Days of Week Header */}
          <div className="grid grid-cols-7 gap-1 text-center font-medium text-[11px] sm:text-xs text-muted-foreground uppercase tracking-wider select-none">
            {DAYS_OF_WEEK.map((day) => (
              <div key={day} className="py-1">
                {day}
              </div>
            ))}
          </div>

          {/* 7-Column Day Grid */}
          <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
            {calendarCells.map((cell) => {
              const hasPhotos = cell.photos.length > 0
              const isSelected = selectedDateKey === cell.dateKey
              const coverPhoto = cell.photos[0]
              const isVideo = Boolean(coverPhoto?.type?.startsWith("video/"))
              const coverSrc = coverPhoto?.thumbnail || coverPhoto?.preview || coverPhoto?.key

              return (
                <div
                  key={cell.dateKey}
                  onClick={() => {
                    if (hasPhotos) {
                      setSelectedDateKey((prev) => (prev === cell.dateKey ? null : cell.dateKey))
                    }
                  }}
                  className={cn(
                    "relative aspect-square rounded-xl overflow-hidden transition-all duration-200 select-none flex flex-col justify-between p-1 sm:p-1.5",
                    cell.isCurrentMonth ? "bg-muted/30" : "bg-muted/10 opacity-40",
                    hasPhotos
                      ? "cursor-pointer group hover:scale-[1.03] active:scale-95 border border-white/20 shadow-xs"
                      : "cursor-default border border-transparent",
                    isSelected && "ring-2 ring-primary ring-offset-2 ring-offset-background scale-[1.02] shadow-md"
                  )}
                >
                  {/* Instagram-Style Photo Background Tile */}
                  {hasPhotos && coverSrc && (
                    <>
                      <img
                        src={coverSrc}
                        alt=""
                        loading="lazy"
                        draggable={false}
                        className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                      />
                      {/* Gradient contrast layer so day number is always legible */}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/20 to-black/40" />
                    </>
                  )}

                  {/* Day Number */}
                  <span
                    className={cn(
                      "relative z-10 text-[11px] sm:text-xs font-semibold leading-none",
                      hasPhotos
                        ? "text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]"
                        : cell.isCurrentMonth
                        ? "text-foreground/80"
                        : "text-muted-foreground/40"
                    )}
                  >
                    {cell.day}
                  </span>

                  {/* Media Indicators (Multi-photo count & video badge) */}
                  {hasPhotos && (
                    <div className="relative z-10 flex items-center justify-between w-full mt-auto">
                      {isVideo ? (
                        <span className="flex size-4 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-xs">
                          <Play className="size-2 fill-white ml-0.5" />
                        </span>
                      ) : (
                        <span />
                      )}

                      {cell.photos.length > 1 && (
                        <span className="flex items-center gap-0.5 px-1 py-0.5 rounded-md bg-black/65 backdrop-blur-md text-[10px] font-bold text-white border border-white/20 tabular-nums">
                          <Layers className="size-2.5" />
                          <span>{cell.photos.length}</span>
                        </span>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {/* Selected Date Photo Shelf (Instagram Drawer / Carousel strip) */}
          {selectedDateKey && selectedDatePhotos.length > 0 && (
            <div className="mt-4 pt-3 border-t border-border/50 animate-in fade-in slide-in-from-bottom-2 duration-300">
              <div className="flex items-center justify-between mb-2.5">
                <div className="flex items-center gap-2">
                  <span className="text-xs sm:text-sm font-semibold text-foreground">
                    {formattedSelectedDate}
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    ({selectedDatePhotos.length} {selectedDatePhotos.length === 1 ? "media" : "medias"})
                  </span>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedDateKey(null)}
                  className="size-7 p-0 rounded-lg text-muted-foreground hover:text-foreground"
                >
                  <X className="size-3.5" />
                </Button>
              </div>

              {/* Horizontal Scrollable Thumbnails Strip */}
              <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar scroll-smooth">
                {selectedDatePhotos.map((photo) => {
                  const isVid = Boolean(photo.type?.startsWith("video/"))
                  const thumb = photo.thumbnail || photo.preview || photo.key

                  return (
                    <div
                      key={photo.photoId}
                      onClick={() => {
                        onPhotoClick?.(photo)
                        onOpenChange(false)
                      }}
                      className="relative shrink-0 size-20 sm:size-24 rounded-xl overflow-hidden cursor-pointer group border border-border/70 hover:border-primary transition-all duration-200 active:scale-95 shadow-xs"
                      title={photo.name}
                    >
                      {thumb ? (
                        <img
                          src={thumb}
                          alt={photo.name}
                          loading="lazy"
                          draggable={false}
                          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center bg-muted">
                          <ImageIcon className="size-6 text-muted-foreground" />
                        </div>
                      )}
                      {isVid && (
                        <div className="absolute inset-0 flex items-center justify-center bg-black/30 group-hover:bg-black/20 transition-colors">
                          <div className="flex size-6 items-center justify-center rounded-full bg-black/60 text-white">
                            <Play className="size-3 fill-white ml-0.5" />
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

