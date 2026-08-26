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
    <div className="w-full px-3 sm:px-4 md:px-5 pb-4 box-border min-w-0">
      <section
        aria-label="On This Day in Previous Years"
        className={`relative mx-auto w-full rounded-2xl border border-amber-500/20 bg-gradient-to-r from-amber-500/[0.07] via-primary/[0.04] to-background shadow-xs transition-all duration-300 backdrop-blur-xs min-w-0 overflow-hidden box-border ${
          isCollapsed ? "p-3 sm:px-4 sm:py-3 cursor-pointer hover:border-amber-500/40 hover:bg-amber-500/[0.09]" : "p-4 sm:p-5"
        }`}
        onClick={isCollapsed ? toggleCollapse : undefined}
      >
      {/* Header with Title, Date Badge & Visible Minimize/Expand Button */}
      <div className={`flex items-center justify-between gap-3 min-w-0 w-full ${isCollapsed ? "" : "mb-3.5"}`}>
        <div className="flex items-center gap-2 min-w-0">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap min-w-0">
              <h2 className="text-base sm:text-lg font-bold tracking-tight text-foreground flex items-center gap-1.5 truncate">
                <span>{t("title")}</span>
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                  {todayLabel}
                </span>
                {isCollapsed && (
                  <span className="text-xs text-muted-foreground font-normal ml-0.5">
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

        {/* Clearly Visible Minimize / Expand Toggle Button */}
        <div className="flex items-center gap-1 shrink-0">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7.5 px-3 rounded-full text-xs font-semibold gap-1.5 bg-amber-500/10 border-amber-500/30 text-amber-600 dark:text-amber-400 hover:bg-amber-500/20 hover:text-amber-500 shadow-2xs cursor-pointer transition-all active:scale-95 shrink-0"
            onClick={(e) => {
              e.stopPropagation()
              toggleCollapse()
            }}
            aria-label={isCollapsed ? "Expand On This Day" : "Minimize On This Day"}
          >
            {isCollapsed ? <ChevronDown className="size-3.5 stroke-[2.5]" /> : <ChevronUp className="size-3.5 stroke-[2.5]" />}
            <span>{isCollapsed ? t("show") : t("hide")}</span>
          </Button>
        </div>
      </div>

      {/* Horizontal Scrollable Carousel Container (rendered only when expanded) */}
      {!isCollapsed && (
        <div
          ref={scrollContainerRef}
          className="flex gap-3 overflow-x-auto pb-1 pt-0.5 pr-4 scrollbar-none snap-x snap-mandatory overscroll-x-contain w-full max-w-full min-w-0"
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
                className="group relative flex-none w-[240px] sm:w-[260px] md:w-[280px] aspect-[4/3] rounded-xl overflow-hidden bg-muted cursor-pointer border border-border/50 hover:border-amber-500/50 shadow-xs hover:shadow-md transition-all duration-300 snap-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary select-none"
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
                  className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-105"
                />

                {/* Dark Gradient Overlay for Readability */}
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/80 via-black/25 to-black/40 group-hover:from-black/85 transition-colors duration-300" />

                {/* Top Badges Row: Years Ago on Left, Year on Right without clipping */}
                <div className="absolute top-2.5 inset-x-2.5 z-10 flex items-center justify-between gap-1.5 pointer-events-none">
                  <div className="flex items-center gap-1.5 rounded-full bg-amber-500 text-black dark:text-neutral-950 px-2.5 py-0.5 text-[11px] font-bold shadow-md backdrop-blur-md border border-amber-300/40 shrink-0">
                    <History className="size-3 stroke-[2.5]" />
                    <span>{yearsAgoText}</span>
                  </div>

                  <div className="flex items-center gap-1 rounded-full bg-black/60 text-white/90 px-2 py-0.5 text-[10px] font-semibold backdrop-blur-md border border-white/20 shrink-0">
                    <Calendar className="size-2.5" />
                    <span>{photo.year}</span>
                  </div>
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
    </div>
  )
}
