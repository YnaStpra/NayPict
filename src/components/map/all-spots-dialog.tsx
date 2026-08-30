"use client"

import { useState, useMemo } from "react"
import {
  Calendar,
  Compass,
  Eye,
  Images,
  LocateFixed,
  MapPin,
  Search,
  SlidersHorizontal,
  Sparkles,
  X,
} from "lucide-react"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { type GeoSpot } from "@/components/map/photo-map-view"
import { type PhotoVo } from "@/server/entity/vo/photo"
import { formatRelativeTime } from "@/lib/date"
import { getThumbHashUrl } from "@/lib/thumb-hash"
import { toProxyMediaUrl } from "@/lib/url"
import { useLocale } from "next-intl"
import { useModalBackHandler } from "@/hooks/use-modal-back-handler"

interface AllSpotsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  spots: GeoSpot[]
  spotCovers?: Record<string, string>
  onSelectSpot: (spot: GeoSpot) => void
  onEditSpot: (spot: GeoSpot) => void
  onSetSpotCover?: (spot: GeoSpot, photo: PhotoVo) => void
  onOpenViewer: (photos: PhotoVo[], startIdx: number) => void
}

type SortOption = "most-photos" | "newest" | "oldest"

// Helper to convert decimal degrees to DMS string
function decimalToDmsText(lat: number, lng: number): string {
  const toDms = (deg: number, isLat: boolean) => {
    const absolute = Math.abs(deg)
    const d = Math.floor(absolute)
    const minutesNotTruncated = (absolute - d) * 60
    const m = Math.floor(minutesNotTruncated)
    const seconds = ((minutesNotTruncated - m) * 60).toFixed(1)
    const direction = isLat ? (deg >= 0 ? "N" : "S") : deg >= 0 ? "E" : "W"
    return `${d}°${m}'${seconds}"${direction}`
  }
  return `${toDms(lat, true)} ${toDms(lng, false)}`
}

export function AllSpotsDialog({
  open,
  onOpenChange,
  spots,
  spotCovers = {},
  onSelectSpot,
  onEditSpot,
  onSetSpotCover,
  onOpenViewer,
}: AllSpotsDialogProps) {
  // Intercept Android / mobile back gesture to close modal cleanly
  useModalBackHandler(open, onOpenChange)

  const locale = useLocale()
  const [searchQuery, setSearchQuery] = useState("")
  const [sortBy, setSortBy] = useState<SortOption>("most-photos")

  // Filter and sort spots
  const filteredAndSortedSpots = useMemo(() => {
    const q = searchQuery.toLowerCase().trim()

    const result = spots.filter((spot) => {
      if (!q) return true

      // Search in coordinates
      const latStr = spot.latitude.toString()
      const lngStr = spot.longitude.toString()
      const dmsStr = decimalToDmsText(spot.latitude, spot.longitude).toLowerCase()
      if (latStr.includes(q) || lngStr.includes(q) || dmsStr.includes(q)) return true

      // Search in photo names or dates
      return spot.photos.some((p) => {
        const nameMatch = p.name.toLowerCase().includes(q)
        const dateMatch = p.takenTime?.toLowerCase().includes(q)
        return nameMatch || dateMatch
      })
    })

    // Sorting
    result.sort((a, b) => {
      if (sortBy === "most-photos") {
        return b.photos.length - a.photos.length
      }
      if (sortBy === "newest") {
        const dateA = a.photos[0]?.takenTime || a.photos[0]?.createTime || ""
        const dateB = b.photos[0]?.takenTime || b.photos[0]?.createTime || ""
        return dateB.localeCompare(dateA)
      }
      if (sortBy === "oldest") {
        const dateA = a.photos[0]?.takenTime || a.photos[0]?.createTime || ""
        const dateB = b.photos[0]?.takenTime || b.photos[0]?.createTime || ""
        return dateA.localeCompare(dateB)
      }
      return 0
    })

    return result
  }, [spots, searchQuery, sortBy])

  const totalPhotosCount = useMemo(() => {
    return spots.reduce((sum, s) => sum + s.photos.length, 0)
  }, [spots])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col p-6 rounded-3xl backdrop-blur-2xl bg-background/95 dark:bg-neutral-900/95 border-border/80 shadow-2xl">
        <DialogHeader className="space-y-1.5 shrink-0 border-b border-border/50 pb-4">
          <div className="flex items-center justify-between">
            <DialogTitle className="text-lg font-bold flex items-center gap-2 text-foreground">
              <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-500">
                <MapPin className="size-5" />
              </div>
              <span>Manage All Photo Map Spots</span>
            </DialogTitle>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
                {spots.length} Spots • {totalPhotosCount} Photos
              </span>
            </div>
          </div>
          <DialogDescription className="text-xs text-muted-foreground">
            Directory of all mapped geographic coordinates. Admin can choose pin cover photos, move all photos in a spot simultaneously, or fly camera to the spot.
          </DialogDescription>
        </DialogHeader>

        {/* Search & Sort Filter Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-3 pb-2 shrink-0">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by photo name, coordinates (DMS/decimal)..."
              className="pl-9 h-9 text-xs rounded-xl bg-muted/40 border-border/70"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="size-3.5" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <SlidersHorizontal className="size-3.5 text-muted-foreground" />
            <span className="text-xs text-muted-foreground font-medium mr-1">Sort:</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortOption)}
              className="h-9 px-2.5 text-xs rounded-xl bg-muted/40 border border-border/70 text-foreground cursor-pointer outline-hidden"
            >
              <option value="most-photos">Most Photos</option>
              <option value="newest">Newest Photos</option>
              <option value="oldest">Oldest Photos</option>
            </select>
          </div>
        </div>

        {/* Spots List Scroll Area */}
        <div className="flex-1 min-h-0 overflow-y-auto pr-1 space-y-3 pt-1 scrollbar-thin scrollbar-thumb-muted">
          {spots.length === 0 ? (
            <div className="py-14 text-center space-y-2">
              <MapPin className="size-8 text-muted-foreground/50 mx-auto" />
              <p className="text-sm font-semibold text-foreground">No location spots yet</p>
              <p className="text-xs text-muted-foreground">
                No uploaded photos have GPS coordinates yet.
              </p>
            </div>
          ) : filteredAndSortedSpots.length === 0 ? (
            <div className="py-12 text-center text-xs text-muted-foreground">
              No location spots match your search &quot;{searchQuery}&quot;.
            </div>
          ) : (
            filteredAndSortedSpots.map((spot, spotIndex) => {
              const spotKey = `${spot.latitude.toFixed(5)}_${spot.longitude.toFixed(5)}`
              const currentCoverPhotoId = spotCovers[spotKey] || spotCovers[spot.id] || spot.photos[0]?.photoId
              const topPhoto = spot.photos.find((p) => p.photoId === currentCoverPhotoId) || spot.photos[0]
              const dms = decimalToDmsText(spot.latitude, spot.longitude)

              return (
                <div
                  key={spot.id || spotIndex}
                  className="p-3.5 rounded-2xl border border-border/70 bg-card/60 hover:bg-card/90 hover:border-border transition-all duration-200 shadow-xs space-y-3"
                >
                  {/* Top Row: Details & Actions */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3.5">
                    {/* Left Side: Main Cover Photo Preview & Location Details */}
                    <div className="flex items-start sm:items-center gap-3.5 min-w-0 flex-1">
                      {/* Cover Photo Thumbnail */}
                      <div
                        className="relative shrink-0 w-16 h-16 rounded-2xl overflow-hidden bg-neutral-900 border border-white/40 shadow-md cursor-pointer group"
                        onClick={() => onOpenViewer(spot.photos, 0)}
                        title="Open photos at this spot"
                      >
                        {topPhoto && (
                          <>
                            {(() => {
                              const ph = getThumbHashUrl(topPhoto.thumbHash)
                              const thumb = topPhoto.thumbnail || topPhoto.preview || ""
                              return (
                                <>
                                  {ph && (
                                    <img
                                      src={ph}
                                      alt=""
                                      className="absolute inset-0 h-full w-full object-cover blur-xs scale-110"
                                      aria-hidden
                                    />
                                  )}
                                  {thumb && (
                                    <img
                                      src={thumb}
                                      alt={topPhoto.name}
                                      loading="lazy"
                                      decoding="async"
                                      onError={(e) => {
                                        const el = e.currentTarget
                                        if (el.src && !el.src.includes('/media/')) {
                                          el.src = toProxyMediaUrl(el.src)
                                        }
                                      }}
                                      className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover:scale-110"
                                    />
                                  )}
                                </>
                              )
                            })()}
                          </>
                        )}
                        <div className="absolute top-1 left-1 px-1 rounded-md bg-amber-500 text-black text-[9px] font-black leading-tight flex items-center gap-0.5 shadow-sm" title="Pin Cover Photo">
                          ★
                        </div>
                        {spot.photos.length > 1 && (
                          <div className="absolute bottom-1 right-1 px-1.5 py-0.5 rounded-md bg-black/75 text-white text-[10px] font-black leading-none backdrop-blur-xs flex items-center gap-0.5">
                            <Images className="size-2.5" />
                            <span>{spot.photos.length}</span>
                          </div>
                        )}
                      </div>

                      {/* Spot Info */}
                      <div className="min-w-0 space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-bold text-foreground truncate max-w-[240px]">
                            {topPhoto?.name}
                          </span>
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
                            {spot.photos.length} Photos
                          </span>
                        </div>

                        {/* Coordinates */}
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-mono truncate">
                          <Compass className="size-3.5 text-emerald-500 shrink-0" />
                          <span title={dms}>
                            {spot.latitude.toFixed(5)}°, {spot.longitude.toFixed(5)}°
                          </span>
                        </div>

                        {/* Date & Subtitle */}
                        {topPhoto?.takenTime && (
                          <div className="flex items-center gap-1 text-[11px] text-muted-foreground/80">
                            <Calendar className="size-3 text-primary/70 shrink-0" />
                            <span>{formatRelativeTime(topPhoto.takenTime, locale)}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Right Side: Action Buttons */}
                    <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                      {/* View in Lightbox */}
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => onOpenViewer(spot.photos, 0)}
                        className="h-8.5 px-2.5 text-xs rounded-xl gap-1 text-muted-foreground hover:text-foreground cursor-pointer"
                        title="Open photo fullscreen"
                      >
                        <Eye className="size-3.5" />
                        <span className="hidden md:inline">Open</span>
                      </Button>

                      {/* Fly / Focus in Map */}
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          onSelectSpot(spot)
                          onOpenChange(false)
                        }}
                        className="h-8.5 px-2.5 text-xs rounded-xl gap-1.5 border-border/80 hover:bg-muted cursor-pointer"
                        title="Fly camera to this spot"
                      >
                        <LocateFixed className="size-3.5 text-primary" />
                        <span>View on Map</span>
                      </Button>

                      {/* Edit Coordinates for all photos in this spot */}
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => {
                          onEditSpot(spot)
                        }}
                        className="h-8.5 px-3 text-xs rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold gap-1.5 shadow-xs cursor-pointer"
                        title="Edit location coordinates for all photos at this spot"
                      >
                        <MapPin className="size-3.5" />
                        <span>Edit Spot</span>
                      </Button>
                    </div>
                  </div>

                  {/* Multi-Photo Cover Selector Strip (When spot has > 1 photo) */}
                  {spot.photos.length > 1 && (
                    <div className="pt-2 border-t border-border/40">
                      <div className="flex items-center justify-between pb-1.5">
                        <span className="text-[11px] font-semibold text-muted-foreground flex items-center gap-1">
                          <Sparkles className="size-3 text-amber-500" />
                          <span>Select Pin Cover Photo:</span>
                        </span>
                        <span className="text-[10px] text-muted-foreground">
                          Click a photo to set as cover
                        </span>
                      </div>

                      <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-thin scrollbar-thumb-muted">
                        {spot.photos.map((photo, pIdx) => {
                          const isCover = photo.photoId === currentCoverPhotoId
                          const thumb = photo.thumbnail || photo.preview || ""
                          const ph = getThumbHashUrl(photo.thumbHash)

                          return (
                            <button
                              key={photo.photoId}
                              type="button"
                              onClick={() => onSetSpotCover?.(spot, photo)}
                              className={`group relative shrink-0 w-12 h-12 rounded-xl overflow-hidden border-2 transition-all cursor-pointer bg-neutral-900 ${
                                isCover
                                  ? "border-amber-400 ring-2 ring-amber-400/50 scale-105 shadow-md"
                                  : "border-border/60 hover:border-amber-400/60 opacity-70 hover:opacity-100"
                              }`}
                              title={
                                isCover
                                  ? `Photo "${photo.name}" is active cover`
                                  : `Set "${photo.name}" as pin cover`
                              }
                            >
                              {ph && (
                                <img
                                  src={ph}
                                  alt=""
                                  className="absolute inset-0 h-full w-full object-cover blur-xs scale-110"
                                  aria-hidden
                                />
                              )}
                              {thumb && (
                                <img
                                  src={thumb}
                                  alt={photo.name}
                                  loading="lazy"
                                  decoding="async"
                                  onError={(e) => {
                                    const el = e.currentTarget
                                    if (el.src && !el.src.includes('/media/')) {
                                      el.src = toProxyMediaUrl(el.src)
                                    }
                                  }}
                                  className="absolute inset-0 h-full w-full object-cover"
                                />
                              )}
                              {isCover && (
                                <div className="absolute top-0.5 right-0.5 size-3.5 rounded-full bg-amber-500 text-black flex items-center justify-center text-[8px] font-black shadow-xs">
                                  ★
                                </div>
                              )}
                              <div className="absolute bottom-0 inset-x-0 bg-black/75 text-[8px] font-bold text-white py-0.2 text-center truncate px-0.5">
                                #{pIdx + 1}
                              </div>
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )
            })
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
