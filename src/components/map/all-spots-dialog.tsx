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
import { useLocale } from "next-intl"

interface AllSpotsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  spots: GeoSpot[]
  onSelectSpot: (spot: GeoSpot) => void
  onEditSpot: (spot: GeoSpot) => void
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
  onSelectSpot,
  onEditSpot,
  onOpenViewer,
}: AllSpotsDialogProps) {
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
              <span>Kelola Semua Titik Lokasi Peta</span>
            </DialogTitle>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
                {spots.length} Titik • {totalPhotosCount} Foto
              </span>
            </div>
          </div>
          <DialogDescription className="text-xs text-muted-foreground">
            Daftar seluruh titik koordinat fisik yang terpetakan. Admin dapat langsung memindahkan lokasi seluruh foto dalam satu titik sekaligus atau memfokuskan peta ke titik tersebut.
          </DialogDescription>
        </DialogHeader>

        {/* Search & Sort Filter Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-3 pb-2 shrink-0">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari berdasarkan nama foto, koordinat (DMS/desimal)..."
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
            <span className="text-xs text-muted-foreground font-medium mr-1">Urutan:</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortOption)}
              className="h-9 px-2.5 text-xs rounded-xl bg-muted/40 border border-border/70 text-foreground cursor-pointer outline-hidden"
            >
              <option value="most-photos">Foto Terbanyak</option>
              <option value="newest">Foto Terbaru</option>
              <option value="oldest">Foto Terlama</option>
            </select>
          </div>
        </div>

        {/* Spots List Scroll Area */}
        <div className="flex-1 min-h-0 overflow-y-auto pr-1 space-y-2.5 pt-1 scrollbar-thin scrollbar-thumb-muted">
          {spots.length === 0 ? (
            <div className="py-14 text-center space-y-2">
              <MapPin className="size-8 text-muted-foreground/50 mx-auto" />
              <p className="text-sm font-semibold text-foreground">Belum ada titik lokasi</p>
              <p className="text-xs text-muted-foreground">
                Belum ada foto yang memiliki titik koordinat GPS.
              </p>
            </div>
          ) : filteredAndSortedSpots.length === 0 ? (
            <div className="py-12 text-center text-xs text-muted-foreground">
              Tidak ada titik lokasi yang cocok dengan pencarian &quot;{searchQuery}&quot;.
            </div>
          ) : (
            filteredAndSortedSpots.map((spot, spotIndex) => {
              const topPhoto = spot.photos[0]
              const dms = decimalToDmsText(spot.latitude, spot.longitude)

              return (
                <div
                  key={spot.id || spotIndex}
                  className="p-3.5 rounded-2xl border border-border/70 bg-card/60 hover:bg-card/90 hover:border-border transition-all duration-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3.5"
                >
                  {/* Left Side: Photo Previews & Location Details */}
                  <div className="flex items-start sm:items-center gap-3.5 min-w-0 flex-1">
                    {/* Thumbnail Stack Preview */}
                    <div
                      className="relative shrink-0 w-16 h-16 rounded-2xl overflow-hidden bg-neutral-900 border border-white/40 shadow-md cursor-pointer group"
                      onClick={() => onOpenViewer(spot.photos, 0)}
                      title="Buka foto titik ini"
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
                                    className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover:scale-110"
                                  />
                                )}
                              </>
                            )
                          })()}
                        </>
                      )}
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
                          {spot.photos.length > 1 ? ` (+${spot.photos.length - 1} foto)` : ""}
                        </span>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
                          {spot.photos.length} Foto
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
                      title="Buka foto layar penuh"
                    >
                      <Eye className="size-3.5" />
                      <span className="hidden md:inline">Buka</span>
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
                      title="Arahkan kamera peta ke titik ini"
                    >
                      <LocateFixed className="size-3.5 text-primary" />
                      <span>Lihat di Peta</span>
                    </Button>

                    {/* Edit Coordinates for all photos in this spot */}
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => {
                        onEditSpot(spot)
                      }}
                      className="h-8.5 px-3 text-xs rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold gap-1.5 shadow-xs cursor-pointer"
                      title="Ubah titik koordinat semua foto di titik ini"
                    >
                      <MapPin className="size-3.5" />
                      <span>Ubah Titik</span>
                    </Button>
                  </div>
                </div>
              )
            })
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
