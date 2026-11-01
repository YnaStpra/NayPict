"use client"

import React, { useState, useMemo, useCallback } from "react"
import {
  CalendarDays,
  Play,
  Layers,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Sparkles,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { type PhotoVo } from "@/server/entity/vo/photo"
import { cn } from "@/lib/utils"

interface PhotoCalendarViewProps {
  photos: PhotoVo[]
  minYear?: number
  onPhotoClick?: (photo: PhotoVo, dayPhotos: PhotoVo[]) => void
  className?: string
}

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
]

const DAYS_OF_WEEK = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

export function PhotoCalendarView({
  photos,
  minYear = 2018,
  onPhotoClick,
  className = "",
}: PhotoCalendarViewProps) {
  const today = useMemo(() => new Date(), [])
  const currentYear = today.getFullYear()
  const currentMonth = today.getMonth() // 0-indexed (0 = Jan)
  const currentDay = today.getDate()

  // Group all photos by "YYYY-MM-DD"
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

  // Count photos per month: "YYYY-MM" -> count
  const photosCountByMonth = useMemo(() => {
    const map = new Map<string, number>()
    for (const photo of photos) {
      const raw = photo.takenTime || photo.createTime
      if (!raw) continue
      const monthKey = raw.slice(0, 7) // "YYYY-MM"
      map.set(monthKey, (map.get(monthKey) || 0) + 1)
    }
    return map
  }, [photos])

  // Allowed Years Array: from currentYear down to minYear (e.g. 2026 down to 2018)
  const availableYears = useMemo(() => {
    const years: number[] = []
    for (let y = currentYear; y >= minYear; y--) {
      years.push(y)
    }
    return years
  }, [currentYear, minYear])

  // Active displayed Month & Year
  const [activeYear, setActiveYear] = useState<number>(currentYear)
  const [activeMonth, setActiveMonth] = useState<number>(currentMonth)

  // Jump toolbar dropdown selections
  const [selectedYear, setSelectedYear] = useState<number>(currentYear)
  const [selectedMonth, setSelectedMonth] = useState<number>(currentMonth)

  // Direct Jump Handler: instantly displays selected Year & Month
  const handleJumpToDate = useCallback(() => {
    setActiveYear(selectedYear)
    setActiveMonth(selectedMonth)
  }, [selectedYear, selectedMonth])

  // Direct Jump Today Handler
  const handleJumpToday = useCallback(() => {
    setActiveYear(currentYear)
    setActiveMonth(currentMonth)
    setSelectedYear(currentYear)
    setSelectedMonth(currentMonth)
  }, [currentYear, currentMonth])

  // Navigation boundary checks
  const canGoPrev = useMemo(() => {
    if (activeYear > minYear) return true
    return activeMonth > 0
  }, [activeYear, activeMonth, minYear])

  const canGoNext = useMemo(() => {
    if (activeYear < currentYear) return true
    return activeMonth < currentMonth
  }, [activeYear, activeMonth, currentYear, currentMonth])

  // Step to previous month
  const handlePrevMonth = useCallback(() => {
    if (!canGoPrev) return
    if (activeMonth === 0) {
      const newY = activeYear - 1
      const newM = 11
      setActiveYear(newY)
      setActiveMonth(newM)
      setSelectedYear(newY)
      setSelectedMonth(newM)
    } else {
      const newM = activeMonth - 1
      setActiveMonth(newM)
      setSelectedMonth(newM)
    }
  }, [canGoPrev, activeYear, activeMonth])

  // Step to next month
  const handleNextMonth = useCallback(() => {
    if (!canGoNext) return
    if (activeMonth === 11) {
      const newY = activeYear + 1
      const newM = 0
      setActiveYear(newY)
      setActiveMonth(newM)
      setSelectedYear(newY)
      setSelectedMonth(newM)
    } else {
      const newM = activeMonth + 1
      setActiveMonth(newM)
      setSelectedMonth(newM)
    }
  }, [canGoNext, activeYear, activeMonth])

  // Key and media count for the active month
  const activeMonthKey = useMemo(() => {
    return `${activeYear}-${String(activeMonth + 1).padStart(2, "0")}`
  }, [activeYear, activeMonth])

  const monthPhotoCount = useMemo(() => {
    return photosCountByMonth.get(activeMonthKey) || 0
  }, [photosCountByMonth, activeMonthKey])

  // Compute days for the active month
  const { cells, firstDayIndex } = useMemo(() => {
    const firstDay = new Date(activeYear, activeMonth, 1).getDay()
    const daysInMonth = new Date(activeYear, activeMonth + 1, 0).getDate()

    const monthCells: Array<{
      day: number
      dateKey: string
      photos: PhotoVo[]
    }> = []

    for (let d = 1; d <= daysInMonth; d++) {
      const dateKey = `${activeYear}-${String(activeMonth + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`
      monthCells.push({
        day: d,
        dateKey,
        photos: photosByDate.get(dateKey) || [],
      })
    }

    return { cells: monthCells, firstDayIndex: firstDay }
  }, [activeYear, activeMonth, photosByDate])

  // Trailing blanks to complete the 7-column grid
  const trailingBlanksCount = useMemo(() => {
    const totalSlots = firstDayIndex + cells.length
    return (7 - (totalSlots % 7)) % 7
  }, [firstDayIndex, cells.length])

  return (
    <div className={cn("w-full px-2 sm:px-4 md:px-6 py-4 space-y-4 select-none", className)}>
      {/* =========================================================================
          Sticky Jump-to-Date Toolbar (Year 2018-Today, Month, Direct Jump & Today)
          ========================================================================= */}
      <div className="sticky top-12 z-20 -mx-2 sm:-mx-4 md:-mx-6 px-2 sm:px-4 md:px-6 py-2.5 bg-background/90 backdrop-blur-xl border-b border-border/60 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Title & Range Indicator */}
          <div className="flex items-center gap-2">
            <div className="flex size-8 items-center justify-center rounded-lg bg-sky-500/15 text-sky-500 border border-sky-500/30">
              <CalendarDays className="size-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold tracking-tight text-foreground flex items-center gap-1.5">
                <span>Photo Archive Calendar</span>
                <span className="text-[10px] px-1.5 py-0.2 rounded-md bg-sky-500/10 text-sky-500 border border-sky-500/20 font-medium">
                  {minYear} – Present
                </span>
              </h2>
            </div>
          </div>

          {/* Jump Controls */}
          <div className="flex flex-wrap items-center gap-2 text-xs">
            {/* Year Select (2018 to Current Year) */}
            <Select
              value={String(selectedYear)}
              onValueChange={(val) => {
                const yr = Number(val)
                setSelectedYear(yr)
                if (yr === currentYear && selectedMonth > currentMonth) {
                  setSelectedMonth(currentMonth)
                }
              }}
            >
              <SelectTrigger
                aria-label="Select Year"
                className="h-8 w-[92px] text-xs font-medium rounded-lg border-border/70 bg-muted/40 cursor-pointer"
              >
                <SelectValue placeholder="Year" />
              </SelectTrigger>
              <SelectContent className="max-h-56">
                {availableYears.map((y) => (
                  <SelectItem key={y} value={String(y)} className="text-xs cursor-pointer">
                    {y}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Month Select */}
            <Select
              value={String(selectedMonth)}
              onValueChange={(val) => setSelectedMonth(Number(val))}
            >
              <SelectTrigger
                aria-label="Select Month"
                className="h-8 w-[118px] text-xs font-medium rounded-lg border-border/70 bg-muted/40 cursor-pointer"
              >
                <SelectValue placeholder="Month" />
              </SelectTrigger>
              <SelectContent className="max-h-56">
                {MONTH_NAMES.map((m, idx) => {
                  const isDisabled = selectedYear === currentYear && idx > currentMonth
                  return (
                    <SelectItem
                      key={idx}
                      value={String(idx)}
                      disabled={isDisabled}
                      className="text-xs cursor-pointer"
                    >
                      {m}
                    </SelectItem>
                  )
                })}
              </SelectContent>
            </Select>

            {/* Jump Button */}
            <Button
              type="button"
              variant="default"
              size="sm"
              onClick={handleJumpToDate}
              className="h-8 px-3 rounded-lg text-xs font-medium gap-1 cursor-pointer shadow-2xs"
            >
              <span>Jump</span>
              <ArrowRight className="size-3.5" />
            </Button>

            {/* Today Button */}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleJumpToday}
              className="h-8 px-2.5 rounded-lg text-xs border-border/70 hover:bg-muted cursor-pointer"
            >
              Today
            </Button>
          </div>
        </div>
      </div>

      {/* =========================================================================
          Direct Active Month View (Full Width, 7-Column Responsive Grid)
          ========================================================================= */}
      <section
        style={{
          contentVisibility: "auto",
        }}
        className="w-full rounded-2xl border border-border/60 bg-card/60 p-3 sm:p-5 md:p-6 shadow-xs space-y-4"
      >
        {/* Month Navigation & Header */}
        <div className="flex items-center justify-between px-1 py-2 border-b border-border/40">
          <div className="flex items-center gap-2 sm:gap-3">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              disabled={!canGoPrev}
              onClick={handlePrevMonth}
              className="size-8 sm:size-9 rounded-lg hover:bg-muted text-foreground/80 hover:text-foreground disabled:opacity-30 cursor-pointer"
              aria-label="Previous month"
            >
              <ChevronLeft className="size-4 sm:size-5" />
            </Button>

            <h3 className="text-base sm:text-xl md:text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
              <span>
                {MONTH_NAMES[activeMonth]} {activeYear}
              </span>
            </h3>

            <Button
              type="button"
              variant="ghost"
              size="icon"
              disabled={!canGoNext}
              onClick={handleNextMonth}
              className="size-8 sm:size-9 rounded-lg hover:bg-muted text-foreground/80 hover:text-foreground disabled:opacity-30 cursor-pointer"
              aria-label="Next month"
            >
              <ChevronRight className="size-4 sm:size-5" />
            </Button>
          </div>

          <div>
            {monthPhotoCount > 0 ? (
              <span className="text-xs sm:text-sm font-semibold px-2.5 sm:px-3 py-1 rounded-full bg-sky-500/15 text-sky-500 dark:text-sky-400 border border-sky-500/30 tabular-nums">
                {monthPhotoCount} {monthPhotoCount === 1 ? "media" : "media"}
              </span>
            ) : (
              <span className="text-xs sm:text-sm text-muted-foreground/60 font-medium px-2 py-0.5">
                No media
              </span>
            )}
          </div>
        </div>

        {/* Day of Week Headers */}
        <div className="grid grid-cols-7 gap-1 sm:gap-2 md:gap-3 text-center font-semibold text-[11px] sm:text-xs text-muted-foreground uppercase tracking-wider">
          {DAYS_OF_WEEK.map((dw) => (
            <div key={dw} className="py-1">
              {dw}
            </div>
          ))}
        </div>

        {/* 7-Column Date Grid */}
        <div className="grid grid-cols-7 gap-1.5 sm:gap-2.5 md:gap-3.5">
          {/* Blank Leading Days */}
          {Array.from({ length: firstDayIndex }).map((_, idx) => (
            <div
              key={`blank-lead-${idx}`}
              className="aspect-square rounded-xl sm:rounded-2xl bg-muted/5 border border-dashed border-border/20 opacity-25 pointer-events-none"
            />
          ))}

          {/* Actual Days in Active Month */}
          {cells.map((cell) => {
            const hasPhotos = cell.photos.length > 0
            const coverPhoto = cell.photos[0]
            const isVideo = Boolean(coverPhoto?.type?.startsWith("video/"))
            const coverSrc = coverPhoto?.thumbnail || coverPhoto?.preview || coverPhoto?.key
            const isTodayCell =
              cell.day === currentDay &&
              activeMonth === currentMonth &&
              activeYear === currentYear

            return (
              <div
                key={cell.dateKey}
                id={`calendar-cell-${cell.dateKey}`}
                role={hasPhotos ? "button" : undefined}
                tabIndex={hasPhotos ? 0 : -1}
                onClick={() => {
                  if (hasPhotos) {
                    onPhotoClick?.(cell.photos[0], cell.photos)
                  }
                }}
                onKeyDown={(e) => {
                  if (hasPhotos && (e.key === "Enter" || e.key === " ")) {
                    e.preventDefault()
                    onPhotoClick?.(cell.photos[0], cell.photos)
                  }
                }}
                aria-label={`${MONTH_NAMES[activeMonth]} ${cell.day}, ${activeYear}${
                  hasPhotos ? `: ${cell.photos.length} media` : ": No media"
                }`}
                className={cn(
                  "relative aspect-square rounded-xl sm:rounded-2xl overflow-hidden transition-all duration-200 select-none flex flex-col justify-between p-1.5 sm:p-2.5",
                  hasPhotos
                    ? "cursor-pointer group hover:scale-[1.03] active:scale-95 border border-white/20 hover:border-sky-400 hover:ring-2 hover:ring-sky-400/50 shadow-sm"
                    : "bg-muted/15 border border-border/30 cursor-default",
                  isTodayCell && "ring-2 ring-primary ring-offset-2 ring-offset-background"
                )}
              >
                {/* Photo Background Tile */}
                {hasPhotos && coverSrc && (
                  <>
                    <img
                      src={coverSrc}
                      alt=""
                      loading="lazy"
                      draggable={false}
                      className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                    />
                    {/* Contrast Gradient Overlay */}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-black/45 pointer-events-none" />
                  </>
                )}

                {/* Day Number Header */}
                <div className="relative z-10 flex items-center justify-between w-full">
                  <span
                    className={cn(
                      "text-xs sm:text-sm md:text-base font-bold leading-none",
                      hasPhotos
                        ? "text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)]"
                        : "text-muted-foreground/60"
                    )}
                  >
                    {cell.day}
                  </span>
                  {isTodayCell && (
                    <span className="text-[9px] sm:text-[10px] font-semibold px-1.5 py-0.2 rounded-full bg-primary text-primary-foreground shadow-xs">
                      Today
                    </span>
                  )}
                </div>

                {/* Media Indicators (Multi-photo count & video badge) */}
                {hasPhotos && (
                  <div className="relative z-10 flex items-center justify-between w-full mt-auto pt-1">
                    {isVideo ? (
                      <span
                        className="flex size-4 sm:size-5 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-xs shadow-xs"
                        title="Video"
                      >
                        <Play className="size-2 sm:size-2.5 fill-white ml-0.5" />
                      </span>
                    ) : (
                      <span />
                    )}

                    {cell.photos.length > 1 && (
                      <span
                        className="flex items-center gap-0.5 sm:gap-1 px-1.5 py-0.5 rounded-md bg-black/70 backdrop-blur-md text-[10px] sm:text-xs font-bold text-white border border-white/20 tabular-nums shadow-xs"
                        title={`${cell.photos.length} media`}
                      >
                        <Layers className="size-2.5 sm:size-3" />
                        <span>{cell.photos.length}</span>
                      </span>
                    )}
                  </div>
                )}
              </div>
            )
          })}

          {/* Blank Trailing Days */}
          {Array.from({ length: trailingBlanksCount }).map((_, idx) => (
            <div
              key={`blank-trail-${idx}`}
              className="aspect-square rounded-xl sm:rounded-2xl bg-muted/5 border border-dashed border-border/20 opacity-25 pointer-events-none"
            />
          ))}
        </div>
      </section>
    </div>
  )
}
