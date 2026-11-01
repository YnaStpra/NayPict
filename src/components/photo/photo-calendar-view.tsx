"use client"

import React, { useState, useMemo, useCallback, useRef, useEffect } from "react"
import {
  CalendarDays,
  Calendar as CalendarIcon,
  Play,
  X,
  Layers,
  ArrowRight,
  RotateCcw,
  Sparkles,
  Image as ImageIcon,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
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
  onPhotoClick?: (photo: PhotoVo) => void
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
  const currentMonth = today.getMonth() // 0-indexed
  const currentDay = today.getDate()

  // Target Jump-to-Date inputs (Year, Month, Day)
  const [selectedYear, setSelectedYear] = useState<number>(currentYear)
  const [selectedMonth, setSelectedMonth] = useState<number>(currentMonth)
  const [dayInput, setDayInput] = useState<string>(String(currentDay))

  // Actively expanded date for the photo shelf preview
  const [activeDateKey, setActiveDateKey] = useState<string | null>(null)
  const [highlightedDateKey, setHighlightedDateKey] = useState<string | null>(null)

  // 1. Group all photos by "YYYY-MM-DD"
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

  // Count photos per month for quick headers: "YYYY-MM" -> count
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

  // Generate list of all months from today down to minYear-01 in reverse chronological order
  const allMonthsList = useMemo(() => {
    const list: Array<{ year: number; month: number; monthKey: string }> = []
    for (let y = currentYear; y >= minYear; y--) {
      const maxM = y === currentYear ? currentMonth : 11
      for (let m = maxM; m >= 0; m--) {
        const monthKey = `${y}-${String(m + 1).padStart(2, "0")}`
        list.push({ year: y, month: m, monthKey })
      }
    }
    return list
  }, [currentYear, currentMonth, minYear])

  // Max days in the currently selected Jump Month
  const maxDaysInSelectedMonth = useMemo(() => {
    return new Date(selectedYear, selectedMonth + 1, 0).getDate()
  }, [selectedYear, selectedMonth])

  // Jump to specific Date / Month
  const handleJumpToDate = useCallback(() => {
    const parsedDay = parseInt(dayInput, 10)
    const validDay = isNaN(parsedDay)
      ? 1
      : Math.max(1, Math.min(parsedDay, maxDaysInSelectedMonth))

    const targetDateKey = `${selectedYear}-${String(selectedMonth + 1).padStart(2, "0")}-${String(validDay).padStart(2, "0")}`
    const targetMonthId = `calendar-month-${selectedYear}-${selectedMonth}`
    const targetCellId = `calendar-cell-${targetDateKey}`

    // 1. Scroll month into view smoothly
    const monthEl = document.getElementById(targetMonthId)
    if (monthEl) {
      monthEl.scrollIntoView({ behavior: "smooth", block: "start" })
    }

    // 2. Set active date to open shelf if it has photos
    if (photosByDate.has(targetDateKey)) {
      setActiveDateKey(targetDateKey)
    }

    // 3. Highlight date cell with glowing pulse
    setHighlightedDateKey(targetDateKey)
    setTimeout(() => {
      const cellEl = document.getElementById(targetCellId)
      if (cellEl) {
        cellEl.scrollIntoView({ behavior: "smooth", block: "center" })
      }
    }, 250)

    // Clear highlight after 2.8s
    setTimeout(() => {
      setHighlightedDateKey(null)
    }, 2800)
  }, [dayInput, selectedYear, selectedMonth, maxDaysInSelectedMonth, photosByDate])

  // Jump to Today
  const handleJumpToday = useCallback(() => {
    setSelectedYear(currentYear)
    setSelectedMonth(currentMonth)
    setDayInput(String(currentDay))

    const todayMonthId = `calendar-month-${currentYear}-${currentMonth}`
    const todayCellId = `calendar-cell-${currentYear}-${String(currentMonth + 1).padStart(2, "0")}-${String(currentDay).padStart(2, "0")}`

    const monthEl = document.getElementById(todayMonthId)
    if (monthEl) {
      monthEl.scrollIntoView({ behavior: "smooth", block: "start" })
    }

    const todayDateKey = `${currentYear}-${String(currentMonth + 1).padStart(2, "0")}-${String(currentDay).padStart(2, "0")}`
    if (photosByDate.has(todayDateKey)) {
      setActiveDateKey(todayDateKey)
    }

    setHighlightedDateKey(todayDateKey)
    setTimeout(() => {
      const cellEl = document.getElementById(todayCellId)
      if (cellEl) {
        cellEl.scrollIntoView({ behavior: "smooth", block: "center" })
      }
    }, 250)

    setTimeout(() => {
      setHighlightedDateKey(null)
    }, 2800)
  }, [currentYear, currentMonth, currentDay, photosByDate])

  // Photos of the actively clicked date
  const activePhotos = useMemo(() => {
    if (!activeDateKey) return []
    return photosByDate.get(activeDateKey) || []
  }, [activeDateKey, photosByDate])

  const formattedActiveDate = useMemo(() => {
    if (!activeDateKey) return ""
    const [y, m, d] = activeDateKey.split("-").map(Number)
    return new Date(y, m - 1, d).toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    })
  }, [activeDateKey])

  return (
    <div className={cn("w-full max-w-5xl mx-auto px-3 sm:px-6 py-4 space-y-6 select-none", className)}>
      {/* =========================================================================
          Sticky Jump-to-Date Toolbar (Year 2018-Today, Month, Typable Day Input)
          ========================================================================= */}
      <div className="sticky top-12 z-20 -mx-3 sm:-mx-6 px-3 sm:px-6 py-2.5 bg-background/90 backdrop-blur-xl border-b border-border/60 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Title & Date Range Indicator */}
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
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
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
              <SelectTrigger className="h-8 w-[88px] text-xs font-medium rounded-lg border-border/70 bg-muted/40">
                <SelectValue placeholder="Year" />
              </SelectTrigger>
              <SelectContent className="max-h-56">
                {availableYears.map((y) => (
                  <SelectItem key={y} value={String(y)} className="text-xs">
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
              <SelectTrigger className="h-8 w-[112px] text-xs font-medium rounded-lg border-border/70 bg-muted/40">
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
                      className="text-xs"
                    >
                      {m}
                    </SelectItem>
                  )
                })}
              </SelectContent>
            </Select>

            {/* Day Input (Typable Number) */}
            <div className="flex items-center gap-1">
              <Input
                type="number"
                min={1}
                max={maxDaysInSelectedMonth}
                value={dayInput}
                onChange={(e) => setDayInput(e.target.value)}
                placeholder="Day"
                className="h-8 w-[58px] text-xs font-medium rounded-lg text-center border-border/70 bg-muted/40 px-1 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                aria-label="Day of month"
              />
            </div>

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
          Selected Date Preview Shelf (Instagram Photo Drawer)
          ========================================================================= */}
      {activeDateKey && activePhotos.length > 0 && (
        <div className="sticky top-26 z-15 rounded-2xl border border-primary/30 bg-background/95 backdrop-blur-2xl p-3.5 shadow-xl animate-in fade-in slide-in-from-top-2 duration-300">
          <div className="flex items-center justify-between pb-2 mb-2 border-b border-border/50">
            <div className="flex items-center gap-2">
              <div className="flex size-6 items-center justify-center rounded-md bg-primary/10 text-primary">
                <CalendarIcon className="size-3.5" />
              </div>
              <span className="text-xs sm:text-sm font-semibold text-foreground">
                {formattedActiveDate}
              </span>
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-muted font-medium text-muted-foreground">
                {activePhotos.length} {activePhotos.length === 1 ? "moment" : "moments"}
              </span>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setActiveDateKey(null)}
              className="size-7 p-0 rounded-lg text-muted-foreground hover:text-foreground"
              aria-label="Close date preview"
            >
              <X className="size-4" />
            </Button>
          </div>

          {/* Horizontal Scrollable Thumbnails Strip */}
          <div className="flex gap-2.5 overflow-x-auto pb-1 no-scrollbar scroll-smooth">
            {activePhotos.map((photo) => {
              const isVid = Boolean(photo.type?.startsWith("video/"))
              const thumb = photo.thumbnail || photo.preview || photo.key

              return (
                <div
                  key={photo.photoId}
                  onClick={() => onPhotoClick?.(photo)}
                  className="relative shrink-0 size-22 sm:size-26 rounded-xl overflow-hidden cursor-pointer group border border-border/80 hover:border-primary transition-all duration-200 active:scale-95 shadow-sm"
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
                    <div className="absolute inset-0 flex items-center justify-center bg-black/35 group-hover:bg-black/20 transition-colors">
                      <div className="flex size-7 items-center justify-center rounded-full bg-black/70 text-white">
                        <Play className="size-3.5 fill-white ml-0.5" />
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* =========================================================================
          Continuous Vertical Monthly Calendar Stream (From Today down to 2018)
          ========================================================================= */}
      <div className="space-y-10">
        {allMonthsList.map(({ year, month, monthKey }) => {
          const monthPhotoCount = photosCountByMonth.get(monthKey) || 0
          const firstDayIndex = new Date(year, month, 1).getDay()
          const daysInMonth = new Date(year, month + 1, 0).getDate()

          // Precompute cells for this month
          const cells: Array<{
            day: number
            dateKey: string
            photos: PhotoVo[]
          }> = []

          for (let d = 1; d <= daysInMonth; d++) {
            const dateKey = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`
            cells.push({
              day: d,
              dateKey,
              photos: photosByDate.get(dateKey) || [],
            })
          }

          return (
            <section
              key={monthKey}
              id={`calendar-month-${year}-${month}`}
              style={{
                contentVisibility: "auto",
                containIntrinsicSize: "360px",
              }}
              className="rounded-2xl border border-border/60 bg-card/60 p-3 sm:p-5 shadow-xs scroll-mt-28"
            >
              {/* Sticky Month Header */}
              <div className="sticky top-24 z-10 -mx-3 sm:-mx-5 px-3 sm:px-5 py-2 mb-3 bg-card/95 backdrop-blur-md border-b border-border/40 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <h3 className="text-base sm:text-lg font-bold tracking-tight text-foreground">
                    {MONTH_NAMES[month]} {year}
                  </h3>
                </div>
                {monthPhotoCount > 0 ? (
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-sky-500/10 text-sky-500 border border-sky-500/20 tabular-nums">
                    {monthPhotoCount} {monthPhotoCount === 1 ? "media" : "medias"}
                  </span>
                ) : (
                  <span className="text-xs text-muted-foreground/60">No media</span>
                )}
              </div>

              {/* Day of Week Labels */}
              <div className="grid grid-cols-7 gap-1 sm:gap-2 text-center font-medium text-[11px] sm:text-xs text-muted-foreground uppercase tracking-wider mb-2">
                {DAYS_OF_WEEK.map((dw) => (
                  <div key={dw} className="py-1">
                    {dw}
                  </div>
                ))}
              </div>

              {/* 7-Column Day Grid */}
              <div className="grid grid-cols-7 gap-1.5 sm:gap-2.5">
                {/* Blank Leading Days */}
                {Array.from({ length: firstDayIndex }).map((_, idx) => (
                  <div key={`blank-${idx}`} className="aspect-square rounded-xl bg-muted/5 opacity-25" />
                ))}

                {/* Actual Days */}
                {cells.map((cell) => {
                  const hasPhotos = cell.photos.length > 0
                  const isSelected = activeDateKey === cell.dateKey
                  const isHighlighted = highlightedDateKey === cell.dateKey
                  const coverPhoto = cell.photos[0]
                  const isVideo = Boolean(coverPhoto?.type?.startsWith("video/"))
                  const coverSrc = coverPhoto?.thumbnail || coverPhoto?.preview || coverPhoto?.key

                  return (
                    <div
                      key={cell.dateKey}
                      id={`calendar-cell-${cell.dateKey}`}
                      onClick={() => {
                        if (hasPhotos) {
                          setActiveDateKey((prev) => (prev === cell.dateKey ? null : cell.dateKey))
                        }
                      }}
                      className={cn(
                        "relative aspect-square rounded-xl overflow-hidden transition-all duration-200 select-none flex flex-col justify-between p-1 sm:p-1.5",
                        hasPhotos
                          ? "cursor-pointer group hover:scale-[1.04] active:scale-95 border border-white/20 shadow-xs"
                          : "bg-muted/15 border border-transparent cursor-default",
                        isSelected && "ring-2 ring-primary ring-offset-2 ring-offset-background scale-[1.03] shadow-md z-10",
                        isHighlighted && "ring-4 ring-sky-400 ring-offset-2 ring-offset-background scale-[1.05] shadow-lg animate-pulse z-10"
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
                          {/* Contrast gradient overlay */}
                          <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/20 to-black/40" />
                        </>
                      )}

                      {/* Day Number */}
                      <span
                        className={cn(
                          "relative z-10 text-[11px] sm:text-xs font-semibold leading-none",
                          hasPhotos
                            ? "text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]"
                            : "text-muted-foreground/60"
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
            </section>
          )
        })}
      </div>
    </div>
  )
}

