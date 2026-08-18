/* eslint-disable @next/next/no-img-element */
"use client"

import { useEffect, useRef, useState } from "react"
import { useLocale, useTranslations } from "next-intl"
import { Calendar, ChevronDown, ChevronUp, History, MapPin } from "lucide-react"
import { photoOnThisDay } from "@/request/photo"
import { type PhotoOnThisDayItemVo } from "@/server/entity/vo/photo"
import { formatPhotoTakenDate, formatYearsAgo, getLocalTzOffsetMin } from "@/lib/date"
import { getThumbHashUrl } from "@/lib/thumb-hash"
import { Button } from "@/components/ui/button"

interface OnThisDayBannerProps {
  onPhotoClick: (photo: PhotoOnThisDayItemVo, index: number, list: PhotoOnThisDayItemVo[]) => void
}

const COLLAPSED_STORAGE_KEY = "naypict_on_this_day_collapsed"

// Render "On This Day" nostalgic memory showcase above the gallery.
export function OnThisDayBanner({ onPhotoClick }: OnThisDayBannerProps) {
  const t = useTranslations("photos.onThisDay")
  const locale = useLocale()
  const scrollContainerRef = useRef<HTMLDivElement | null>(null)

  const [photos, setPhotos] = useState<PhotoOnThisDayItemVo[]>([])
  const [loaded, setLoaded] = useState(false)
  const [isCollapsed, setIsCollapsed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false
    try {
      return localStorage.getItem(COLLAPSED_STORAGE_KEY) === "true"
    } catch {
      return false
    }
  })

  // Fetch photos captured on this month/day in previous years
  useEffect(() => {
    let isMounted = true

    photoOnThisDay({ tzOffset: getLocalTzOffsetMin() })
      .then((res) => {
        if (!isMounted) return
        if (res && res.list && res.list.length > 0) {
          setPhotos(res.list)
        } else {
          setPhotos([])
        }
        setLoaded(true)
      })
      .catch((err) => {
        console.error("Failed to load On This Day photos:", err)
        if (isMounted) {
          setPhotos([])
          setLoaded(true)
        }
      })

    return () => {
      isMounted = false
    }
  }, [])

  // Toggle minimize/expand state and persist choice to localStorage
  const toggleCollapse = () => {
    setIsCollapsed((prev) => {
      const next = !prev
      try {
        localStorage.setItem(COLLAPSED_STORAGE_KEY, String(next))
      } catch {
        // Ignore local storage write errors
      }
      return next
    })
  }

  // If loading or no photos found, hide the entire section (zero layout shift, no empty state)
  if (!loaded || photos.length === 0) {
    return null
  }

  // Format today's month and day for section header
  const todayLabel = new Intl.DateTimeFormat(locale, {
    month: "long",
    day: "numeric",
  }).format(new Date())

  return (
    <section
      aria-label="On This Day in Previous Years"
      className={`relative mb-6 mx-1 md:mx-0 rounded-2xl border border-amber-500/20 bg-gradient-to-r from-amber-500/[0.07] via-primary/[0.04] to-background shadow-xs transition-all duration-300 backdrop-blur-xs ${
        isCollapsed ? "p-3 sm:px-4 sm:py-3 cursor-pointer hover:border-amber-500/40 hover:bg-amber-500/[0.09]" : "p-4 sm:p-5"
      }`}
      onClick={isCollapsed ? toggleCollapse : undefined}
    >
      {/* Header with Title, Date Badge & Minimize/Expand Button */}
      <div className={`flex items-center justify-between gap-3 ${isCollapsed ? "" : "mb-3.5"}`}>
        <div className="flex items-center gap-2 min-w-0">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-base sm:text-lg font-bold tracking-tight text-foreground flex items-center gap-1.5 truncate">
                <span>{t("title")}</span>
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                  {todayLabel}
                </span>
                {isCollapsed && (
                  <span className="text-xs text-muted-foreground font-normal ml-1">
                    ({photos.length})
                  </span>
                )}
              </h2>
            </div>
            {!isCollapsed && (
              <p className="text-xs text-muted-foreground truncate">
                {t("subtitle")}
              </p>
            )}
          </div>
        </div>

        {/* Minimize / Expand Toggle Button */}
        <div className="flex items-center gap-1 shrink-0">
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="size-7 rounded-full bg-background/60 hover:bg-amber-500/15 text-muted-foreground hover:text-foreground cursor-pointer transition-colors"
            onClick={(e) => {
              e.stopPropagation()
              toggleCollapse()
            }}
            aria-label={isCollapsed ? "Expand On This Day" : "Minimize On This Day"}
            title={isCollapsed ? "Expand" : "Minimize"}
          >
            {isCollapsed ? <ChevronDown className="size-4" /> : <ChevronUp className="size-4" />}
          </Button>
        </div>
      </div>

      {/* Horizontal Scrollable Carousel Container (rendered only when expanded) */}
      {!isCollapsed && (
        <div
          ref={scrollContainerRef}
          className="flex gap-3 overflow-x-auto pb-1 pt-0.5 scrollbar-none snap-x snap-mandatory overscroll-x-contain"
          style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
        >
          {photos.map((photo, index) => {
            const src = photo.thumbnail || photo.preview || photo.key
            const thumbHash = getThumbHashUrl(photo.thumbHash)
            const yearsAgoText = formatYearsAgo(photo.yearsAgo, locale)
            const formattedDate = formatPhotoTakenDate(photo.takenTime, locale)
            const albumName = photo.albums && photo.albums.length > 0 ? photo.albums[0].name : null

            return (
              <div
                key={photo.photoId}
                onClick={() => onPhotoClick(photo, index, photos)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault()
                    onPhotoClick(photo, index, photos)
                  }
                }}
                role="button"
                tabIndex={0}
                aria-label={`View photo ${photo.name} from ${yearsAgoText}`}
                className="group relative flex-none w-[200px] sm:w-[240px] md:w-[260px] aspect-[4/3] rounded-xl overflow-hidden bg-muted cursor-pointer border border-border/50 hover:border-amber-500/50 shadow-xs hover:shadow-md transition-all duration-300 snap-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary select-none"
              >
                {/* ThumbHash Blur Placeholder */}
                {thumbHash && (
                  <img
                    src={thumbHash}
                    alt=""
                    aria-hidden
                    className="absolute inset-0 h-full w-full object-cover scale-110 blur-sm"
                  />
                )}

                {/* Main Photo Image */}
                <img
                  src={src ?? undefined}
                  alt={photo.name}
                  loading="lazy"
                  decoding="async"
                  crossOrigin="anonymous"
                  className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-105"
                />

                {/* Dark Gradient Overlay for Readability */}
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/80 via-black/25 to-black/40 group-hover:from-black/85 transition-colors duration-300" />

                {/* Top-Left Floating Badge: Years Ago */}
                <div className="absolute top-2.5 left-2.5 z-10 flex items-center gap-1.5 rounded-full bg-amber-500/90 text-black dark:text-neutral-950 px-2.5 py-0.5 text-[11px] font-bold shadow-md backdrop-blur-md border border-amber-300/40">
                  <History className="size-3 stroke-[2.5]" />
                  <span>{yearsAgoText}</span>
                </div>

                {/* Top-Right Year Pill */}
                <div className="absolute top-2.5 right-2.5 z-10 flex items-center gap-1 rounded-full bg-black/60 text-white/90 px-2 py-0.5 text-[10px] font-semibold backdrop-blur-md border border-white/20">
                  <Calendar className="size-2.5" />
                  <span>{photo.year}</span>
                </div>

                {/* Bottom Caption Overlay */}
                <div className="absolute inset-x-0 bottom-0 p-3 text-white flex flex-col justify-end">
                  <h3 className="text-xs sm:text-sm font-semibold truncate drop-shadow-sm text-white">
                    {photo.name.replace(/\.[^/.]+$/, "")}
                  </h3>
                  <div className="flex items-center gap-1.5 text-[11px] text-white/80 mt-0.5 truncate">
                    <span>{formattedDate || `${photo.year}`}</span>
                    {albumName && (
                      <>
                        <span>•</span>
                        <span className="inline-flex items-center gap-0.5 truncate max-w-[100px]" title={albumName}>
                          <MapPin className="size-2.5 shrink-0" />
                          <span className="truncate">{albumName}</span>
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
