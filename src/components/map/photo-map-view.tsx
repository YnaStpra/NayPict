"use client"

import { useEffect, useRef, useState, useCallback } from "react"
import { useTheme } from "next-themes"
import Image from "next/image"
import Link from "next/link"
import {
  Calendar,
  Compass,
  Expand,
  Eye,
  Filter,
  Image as ImageIcon,
  Loader2,
  LocateFixed,
  MapPin,
  Sparkles,
  X,
} from "lucide-react"
import type * as LType from "leaflet"
import "leaflet/dist/leaflet.css"

import { photoMapList } from "@/request/photo"
import { type PhotoVo } from "@/server/entity/vo/photo"
import { Button } from "@/components/ui/button"
import { formatRelativeTime } from "@/lib/date"
import { useLocale } from "next-intl"

export default function PhotoMapView() {
  const locale = useLocale()
  const { resolvedTheme } = useTheme()
  const mapContainerRef = useRef<HTMLDivElement>(null)
  const mapInstanceRef = useRef<LType.Map | null>(null)
  const markersLayerRef = useRef<LType.LayerGroup | null>(null)
  const markerMapRef = useRef<Map<string, LType.Marker>>(new Map())

  const [photos, setPhotos] = useState<PhotoVo[]>([])
  const [loading, setLoading] = useState<boolean>(true)
  const [selectedPhoto, setSelectedPhoto] = useState<PhotoVo | null>(null)
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(true)

  // Fetch all geotagged photos on mount
  useEffect(() => {
    let isMounted = true
    photoMapList()
      .then((data) => {
        if (isMounted) {
          const validCoords = (data ?? []).filter(
            (p) => typeof p.latitude === "number" && typeof p.longitude === "number" && !isNaN(p.latitude) && !isNaN(p.longitude)
          )
          setPhotos(validCoords)
        }
      })
      .catch((err) => {
        console.error("Failed to load map photos:", err)
      })
      .finally(() => {
        if (isMounted) setLoading(false)
      })

    return () => {
      isMounted = false
    }
  }, [])

  // Initialize Leaflet map
  useEffect(() => {
    if (typeof window === "undefined" || !mapContainerRef.current) return

    let isDisposed = false

    async function initMap() {
      const L = (await import("leaflet")).default

      if (isDisposed || !mapContainerRef.current) return

      // Clean up previous instance if any
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove()
        mapInstanceRef.current = null
      }

      // Default world view or center on first photo
      const defaultCenter: [number, number] = photos.length > 0 && photos[0].latitude && photos[0].longitude
        ? [photos[0].latitude, photos[0].longitude]
        : [20, 0]
      const defaultZoom = photos.length > 0 ? 5 : 2

      const map = L.map(mapContainerRef.current, {
        center: defaultCenter,
        zoom: defaultZoom,
        zoomControl: false,
        attributionControl: false,
      })

      // Add custom zoom control in bottom right
      L.control.zoom({ position: "bottomright" }).addTo(map)

      // Choose tile layer based on current theme
      const isDark = resolvedTheme === "dark"
      const tileUrl = isDark
        ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        : "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"

      L.tileLayer(tileUrl, {
        maxZoom: 19,
        subdomains: "abcd",
      }).addTo(map)

      const markersLayer = L.layerGroup().addTo(map)
      markersLayerRef.current = markersLayer
      mapInstanceRef.current = map

      // If photos exist, fit bounds to show all markers
      if (photos.length > 0) {
        const bounds = L.latLngBounds(
          photos.map((p) => [p.latitude!, p.longitude!])
        )
        map.fitBounds(bounds, { padding: [50, 50], maxZoom: 14 })
      }
    }

    initMap()

    return () => {
      isDisposed = true
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove()
        mapInstanceRef.current = null
      }
    }
  }, [resolvedTheme, photos])

  // Update map markers when photos change
  useEffect(() => {
    if (!mapInstanceRef.current || !markersLayerRef.current) return

    let isDisposed = false

    async function renderMarkers() {
      const L = (await import("leaflet")).default
      if (isDisposed || !mapInstanceRef.current || !markersLayerRef.current) return

      markersLayerRef.current.clearLayers()
      markerMapRef.current.clear()

      photos.forEach((photo) => {
        if (typeof photo.latitude !== "number" || typeof photo.longitude !== "number") return

        const imgUrl = photo.thumbnail || photo.preview || ""
        const isSelected = selectedPhoto?.photoId === photo.photoId

        // Custom HTML pin with clean image thumbnail and pointer
        const customIcon = L.divIcon({
          className: "photo-marker-icon",
          html: `
            <div class="relative group cursor-pointer transition-transform duration-300 transform hover:scale-125 ${
              isSelected ? "scale-125 z-50 ring-4 ring-emerald-400" : ""
            }">
              <div class="relative w-11 h-11 rounded-2xl overflow-hidden shadow-2xl border-2 border-white/90 dark:border-black/90 bg-neutral-900 flex items-center justify-center">
                ${
                  imgUrl
                    ? `<img src="${imgUrl}" alt="${photo.name}" class="w-full h-full object-cover" />`
                    : `<div class="w-full h-full bg-emerald-600 flex items-center justify-center text-white text-xs">📷</div>`
                }
              </div>
              <div class="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-3 h-3 rotate-45 bg-white/90 dark:bg-black/90 border-r border-b border-white/50 dark:border-black/50"></div>
            </div>
          `,
          iconSize: [44, 52],
          iconAnchor: [22, 50],
          popupAnchor: [0, -48],
        })

        const marker = L.marker([photo.latitude, photo.longitude], { icon: customIcon })

        // Bind click popup
        marker.on("click", () => {
          setSelectedPhoto(photo)
          mapInstanceRef.current?.flyTo([photo.latitude!, photo.longitude!], 14, {
            duration: 0.8,
          })
        })

        markersLayerRef.current?.addLayer(marker)
        markerMapRef.current.set(photo.photoId, marker)
      })
    }

    renderMarkers()

    return () => {
      isDisposed = true
    }
  }, [photos, selectedPhoto?.photoId])

  // Center map on a specific photo
  const handleFlyToPhoto = useCallback((photo: PhotoVo) => {
    if (typeof photo.latitude !== "number" || typeof photo.longitude !== "number") return
    setSelectedPhoto(photo)
    mapInstanceRef.current?.flyTo([photo.latitude, photo.longitude], 15, {
      duration: 1.2,
    })
  }, [])

  // Fit bounds to all photos
  const handleFitAll = useCallback(async () => {
    if (!mapInstanceRef.current || photos.length === 0) return
    const L = (await import("leaflet")).default
    const bounds = L.latLngBounds(
      photos.map((p) => [p.latitude!, p.longitude!])
    )
    mapInstanceRef.current.fitBounds(bounds, { padding: [60, 60], maxZoom: 15 })
  }, [photos])

  return (
    <div className="relative w-full h-[calc(100vh-4rem)] overflow-hidden bg-background">
      {/* Fullscreen Map Canvas */}
      <div ref={mapContainerRef} className="w-full h-full z-0" />

      {/* Top Floating Glass Header Control Bar */}
      <div className="absolute top-4 left-4 right-4 sm:right-auto z-10 flex flex-wrap items-center gap-2 pointer-events-auto">
        <div className="flex items-center gap-2 px-3.5 py-2 rounded-2xl backdrop-blur-xl bg-background/80 dark:bg-neutral-900/80 border border-border/70 shadow-xl">
          <MapPin className="size-4 text-emerald-500 animate-pulse" />
          <span className="font-bold text-xs sm:text-sm">Photo Map Explorer</span>
          <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-500 border border-emerald-500/30 ml-1">
            {photos.length} foto
          </span>
        </div>

        {/* Fit All Photos Button */}
        {photos.length > 0 && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleFitAll}
            className="h-9 px-3 text-xs rounded-2xl backdrop-blur-xl bg-background/80 dark:bg-neutral-900/80 border-border/70 shadow-xl gap-1.5 cursor-pointer hover:scale-105 transition-all"
            title="Tampilkan seluruh foto"
          >
            <LocateFixed className="size-3.5 text-primary" />
            <span className="hidden sm:inline">Lihat Semua</span>
          </Button>
        )}

        {/* Toggle Photos Drawer Button */}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setIsSidebarOpen((prev) => !prev)}
          className="h-9 px-3 text-xs rounded-2xl backdrop-blur-xl bg-background/80 dark:bg-neutral-900/80 border-border/70 shadow-xl gap-1.5 cursor-pointer"
        >
          <Filter className="size-3.5" />
          <span className="hidden sm:inline">{isSidebarOpen ? "Tutup Panel" : "Buka Panel"}</span>
        </Button>
      </div>

      {/* Floating Photo Preview Card (When a marker is clicked) */}
      {selectedPhoto && (
        <div className="absolute top-20 right-4 z-20 w-80 max-w-[calc(100vw-2rem)] rounded-3xl overflow-hidden backdrop-blur-2xl bg-background/90 dark:bg-neutral-900/90 border border-border/80 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
          <div className="relative aspect-4/3 w-full bg-neutral-950 overflow-hidden">
            {selectedPhoto.thumbnail || selectedPhoto.preview ? (
              <Image
                src={selectedPhoto.preview || selectedPhoto.thumbnail || ""}
                alt={selectedPhoto.name}
                fill
                unoptimized
                className="object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                <ImageIcon className="size-10 opacity-40" />
              </div>
            )}
            <button
              onClick={() => setSelectedPhoto(null)}
              className="absolute top-3 right-3 p-1.5 rounded-full bg-black/60 text-white hover:bg-black/80 backdrop-blur-md transition-colors cursor-pointer"
            >
              <X className="size-4" />
            </button>
          </div>

          <div className="p-4 space-y-2.5">
            <div>
              <h3 className="font-bold text-sm text-foreground truncate" title={selectedPhoto.name}>
                {selectedPhoto.name}
              </h3>
              {selectedPhoto.takenTime && (
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-0.5">
                  <Calendar className="size-3 text-primary" />
                  <span>{formatRelativeTime(selectedPhoto.takenTime, locale)}</span>
                </div>
              )}
            </div>

            {/* Coordinates & Location Badge */}
            <div className="flex items-center justify-between p-2 rounded-xl bg-muted/40 border border-border/50 text-[11px]">
              <div className="flex items-center gap-1.5 text-muted-foreground font-mono truncate">
                <Compass className="size-3.5 text-emerald-500 shrink-0" />
                <span>
                  {selectedPhoto.latitude?.toFixed(4)}°, {selectedPhoto.longitude?.toFixed(4)}°
                </span>
              </div>
              <span className="text-[10px] font-semibold text-emerald-500 uppercase tracking-wider">
                GPS EXIF
              </span>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-2 pt-1">
              <Button asChild size="sm" className="flex-1 h-8.5 text-xs rounded-xl gap-1.5 font-semibold">
                <Link href={`/photo/${selectedPhoto.photoId}`}>
                  <Eye className="size-3.5" />
                  <span>Buka Foto</span>
                </Link>
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => handleFlyToPhoto(selectedPhoto)}
                className="h-8.5 text-xs rounded-xl gap-1.5"
                title="Fokuskan Kamera"
              >
                <Expand className="size-3.5" />
                <span>Fokus</span>
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Bottom Floating Horizontal Carousel Drawer */}
      {isSidebarOpen && (
        <div className="absolute bottom-4 left-4 right-4 z-10 max-h-44 rounded-3xl backdrop-blur-2xl bg-background/80 dark:bg-neutral-900/80 border border-border/70 p-3 shadow-2xl animate-in slide-in-from-bottom duration-300">
          <div className="flex items-center justify-between pb-2 px-1">
            <div className="flex items-center gap-1.5 text-xs font-bold text-foreground">
              <Sparkles className="size-3.5 text-emerald-500" />
              <span>Foto Berlokasi ({photos.length})</span>
            </div>
            <button
              onClick={() => setIsSidebarOpen(false)}
              className="text-muted-foreground hover:text-foreground text-xs cursor-pointer p-1"
            >
              <X className="size-3.5" />
            </button>
          </div>

          {photos.length === 0 ? (
            <div className="py-6 text-center text-xs text-muted-foreground">
              Belum ada foto yang memiliki koordinat GPS.
            </div>
          ) : (
            <div className="flex items-center gap-2.5 overflow-x-auto pb-1 scrollbar-thin scrollbar-thumb-muted scrollbar-track-transparent">
              {photos.map((photo) => {
                const isSelected = selectedPhoto?.photoId === photo.photoId
                return (
                  <div
                    key={photo.photoId}
                    onClick={() => handleFlyToPhoto(photo)}
                    className={`group relative shrink-0 w-24 h-24 sm:w-28 sm:h-28 rounded-2xl overflow-hidden cursor-pointer border-2 transition-all duration-200 hover:scale-105 active:scale-95 ${
                      isSelected
                        ? "border-emerald-500 ring-2 ring-emerald-500/50 shadow-lg"
                        : "border-border/60 hover:border-foreground/50"
                    }`}
                  >
                    <Image
                      src={photo.thumbnail || photo.preview || ""}
                      alt={photo.name}
                      fill
                      unoptimized
                      className="object-cover transition-transform duration-300 group-hover:scale-110"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-80 group-hover:opacity-100 transition-opacity" />
                    <div className="absolute bottom-1.5 left-1.5 right-1.5">
                      <p className="text-[10px] font-semibold text-white truncate leading-tight">
                        {photo.name}
                      </p>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Loading Overlay */}
      {loading && (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-background/80 backdrop-blur-md gap-3">
          <Loader2 className="size-8 animate-spin text-emerald-500" />
          <p className="text-sm font-semibold text-foreground">Memuat Peta & Lokasi Foto...</p>
        </div>
      )}

      {/* Empty State when no photos have GPS coordinates */}
      {!loading && photos.length === 0 && (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-20 w-96 max-w-[calc(100vw-2rem)] p-6 rounded-3xl backdrop-blur-2xl bg-background/95 dark:bg-neutral-900/95 border border-border/80 shadow-2xl text-center space-y-3">
          <div className="size-12 rounded-2xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center mx-auto">
            <MapPin className="size-6" />
          </div>
          <h3 className="font-bold text-base text-foreground">Belum Ada Foto Berkoordinat GPS</h3>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Foto yang Anda unggah belum memiliki data metadata lokasi GPS EXIF. Anda dapat menambahkan koordinat lokasi melalui menu Edit Meta di informasi foto.
          </p>
          <Button asChild size="sm" className="rounded-xl mt-2 text-xs">
            <Link href="/photos">Kembali ke Galeri</Link>
          </Button>
        </div>
      )}
    </div>
  )
}
