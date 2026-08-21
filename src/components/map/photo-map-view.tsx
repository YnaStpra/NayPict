"use client"

import { useEffect, useRef, useState, useCallback, useMemo } from "react"
import { useTheme } from "next-themes"
import Image from "next/image"
import Link from "next/link"
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  Compass,
  Expand,
  Eye,
  Filter,
  Image as ImageIcon,
  Images,
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

export interface PhotoCluster {
  id: string
  latitude: number
  longitude: number
  photos: PhotoVo[]
}

// Calculate geographical distance in kilometers using Haversine formula
function getDistanceInKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371 // Radius of earth in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLon = ((lon2 - lon1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

// Cluster photos that share the same or very close coordinates (< 150m) into a single grouped marker
function clusterNearbyPhotos(photos: PhotoVo[], thresholdKm = 0.15): PhotoCluster[] {
  const clusters: PhotoCluster[] = []

  for (const photo of photos) {
    if (
      typeof photo.latitude !== "number" ||
      typeof photo.longitude !== "number" ||
      isNaN(photo.latitude) ||
      isNaN(photo.longitude)
    ) {
      continue
    }

    const matchedCluster = clusters.find((c) => {
      return getDistanceInKm(photo.latitude!, photo.longitude!, c.latitude, c.longitude) <= thresholdKm
    })

    if (matchedCluster) {
      matchedCluster.photos.push(photo)
    } else {
      clusters.push({
        id: photo.photoId,
        latitude: photo.latitude,
        longitude: photo.longitude,
        photos: [photo],
      })
    }
  }

  return clusters
}

export default function PhotoMapView() {
  const locale = useLocale()
  const { resolvedTheme } = useTheme()
  const mapContainerRef = useRef<HTMLDivElement>(null)
  const mapInstanceRef = useRef<LType.Map | null>(null)
  const tileLayerRef = useRef<LType.TileLayer | null>(null)
  const markersLayerRef = useRef<LType.LayerGroup | null>(null)
  const markerMapRef = useRef<Map<string, LType.Marker>>(new Map())
  const hasFitBoundsInitialRef = useRef<boolean>(false)

  const [photos, setPhotos] = useState<PhotoVo[]>([])
  const [loading, setLoading] = useState<boolean>(true)
  const [mapReady, setMapReady] = useState<boolean>(false)
  const [selectedCluster, setSelectedCluster] = useState<PhotoCluster | null>(null)
  const [activePhotoIndex, setActivePhotoIndex] = useState<number>(0)
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(true)

  // Cluster photos into groups so identical/nearby coordinates don't overlap
  const clusters = useMemo(() => {
    return clusterNearbyPhotos(photos, 0.15)
  }, [photos])

  // Fetch all geotagged photos on mount
  useEffect(() => {
    let isMounted = true
    photoMapList()
      .then((data) => {
        if (isMounted) {
          const validCoords = (data ?? []).filter(
            (p) =>
              typeof p.latitude === "number" &&
              typeof p.longitude === "number" &&
              !isNaN(p.latitude) &&
              !isNaN(p.longitude)
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

  const themeRef = useRef(resolvedTheme)
  useEffect(() => {
    themeRef.current = resolvedTheme
  }, [resolvedTheme])

  // Initialize Leaflet map once on container mount
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

      const defaultCenter: [number, number] = [-2.5, 118.0] // Center of Indonesia / World view
      const defaultZoom = 5

      const map = L.map(mapContainerRef.current, {
        center: defaultCenter,
        zoom: defaultZoom,
        zoomControl: false,
        attributionControl: false,
      })

      // Add custom zoom control in bottom right
      L.control.zoom({ position: "bottomright" }).addTo(map)

      // Choose tile layer based on current theme
      const isDark = themeRef.current === "dark"
      const tileUrl = isDark
        ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        : "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"

      const tileLayer = L.tileLayer(tileUrl, {
        maxZoom: 19,
        subdomains: "abcd",
      }).addTo(map)
      tileLayerRef.current = tileLayer

      const markersLayer = L.layerGroup().addTo(map)
      markersLayerRef.current = markersLayer
      mapInstanceRef.current = map

      if (!isDisposed) {
        setMapReady(true)
      }
    }

    initMap()

    return () => {
      isDisposed = true
      setMapReady(false)
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove()
        mapInstanceRef.current = null
      }
    }
  }, [])

  // Update tile layer smoothly when resolvedTheme changes without recreating map
  useEffect(() => {
    if (!tileLayerRef.current) return
    const isDark = resolvedTheme === "dark"
    const tileUrl = isDark
      ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
      : "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
    tileLayerRef.current.setUrl(tileUrl)
  }, [resolvedTheme])

  // Handle container resize when sidebar toggles or viewport changes
  useEffect(() => {
    if (!mapReady || !mapContainerRef.current) return
    const ro = new ResizeObserver(() => {
      mapInstanceRef.current?.invalidateSize()
    })
    ro.observe(mapContainerRef.current)
    return () => {
      ro.disconnect()
    }
  }, [mapReady])

  // Automatically render grouped cluster markers whenever map is ready or clusters update
  useEffect(() => {
    if (!mapReady || !mapInstanceRef.current || !markersLayerRef.current) return

    let isDisposed = false

    async function renderMarkers() {
      const L = (await import("leaflet")).default
      if (isDisposed || !mapInstanceRef.current || !markersLayerRef.current) return

      markersLayerRef.current.clearLayers()
      markerMapRef.current.clear()

      clusters.forEach((cluster) => {
        const topPhoto = cluster.photos[0]
        if (!topPhoto) return

        const imgUrl = topPhoto.thumbnail || topPhoto.preview || ""
        const isSelected = selectedCluster?.id === cluster.id
        const count = cluster.photos.length

        // Custom HTML pin marker with grouped stack styling if multiple photos exist
        const customIcon = L.divIcon({
          className: "photo-marker-icon",
          html: `
            <div class="relative group cursor-pointer transition-transform duration-300 transform hover:scale-125 ${
              isSelected ? "scale-125 z-50 ring-4 ring-emerald-400" : ""
            }">
              ${
                count > 1
                  ? `
                <!-- Stacked background cards for group depth -->
                <div class="absolute -inset-0.5 rounded-2xl bg-neutral-800 border-2 border-white/60 dark:border-black/60 rotate-6 shadow-md pointer-events-none"></div>
                <div class="absolute -inset-0.5 rounded-2xl bg-neutral-700 border-2 border-white/60 dark:border-black/60 -rotate-3 shadow-md pointer-events-none"></div>
              `
                  : ""
              }
              <div class="relative w-11 h-11 rounded-2xl overflow-hidden shadow-2xl border-2 border-white/90 dark:border-black/90 bg-neutral-900 flex items-center justify-center">
                ${
                  imgUrl
                    ? `<img src="${imgUrl}" alt="${topPhoto.name}" class="w-full h-full object-cover" />`
                    : `<div class="w-full h-full bg-emerald-600 flex items-center justify-center text-white text-xs">📷</div>`
                }
              </div>
              <div class="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-3 h-3 rotate-45 bg-white/90 dark:bg-black/90 border-r border-b border-white/50 dark:border-black/50"></div>
              ${
                count > 1
                  ? `
                <!-- Count badge pill on top right -->
                <div class="absolute -top-2 -right-2 px-1.5 py-0.5 min-w-5 h-5 rounded-full bg-emerald-500 text-white font-black text-[10px] leading-none flex items-center justify-center shadow-lg ring-2 ring-white dark:ring-neutral-900 pointer-events-none">
                  ${count}
                </div>
              `
                  : ""
              }
            </div>
          `,
          iconSize: [44, 52],
          iconAnchor: [22, 50],
          popupAnchor: [0, -48],
        })

        const marker = L.marker([cluster.latitude, cluster.longitude], { icon: customIcon })

        // Click marker -> select cluster and open preview card
        marker.on("click", () => {
          setSelectedCluster(cluster)
          setActivePhotoIndex(0)
          mapInstanceRef.current?.flyTo([cluster.latitude, cluster.longitude], 14, {
            duration: 0.8,
          })
        })

        markersLayerRef.current?.addLayer(marker)
        markerMapRef.current.set(cluster.id, marker)
      })

      // Automatically fit map bounds to show all markers on initial load
      if (!hasFitBoundsInitialRef.current && clusters.length > 0 && mapInstanceRef.current) {
        const bounds = L.latLngBounds(clusters.map((c) => [c.latitude, c.longitude]))
        mapInstanceRef.current.fitBounds(bounds, { padding: [60, 60], maxZoom: 14 })
        hasFitBoundsInitialRef.current = true
      }
    }

    renderMarkers()

    return () => {
      isDisposed = true
    }
  }, [mapReady, clusters, selectedCluster?.id])

  // Center map on a specific photo from bottom carousel
  const handleFlyToPhoto = useCallback(
    (photo: PhotoVo) => {
      if (typeof photo.latitude !== "number" || typeof photo.longitude !== "number") return

      // Find the cluster this photo belongs to
      const matchedCluster = clusters.find((c) =>
        c.photos.some((p) => p.photoId === photo.photoId)
      )

      if (matchedCluster) {
        setSelectedCluster(matchedCluster)
        const photoIdx = matchedCluster.photos.findIndex((p) => p.photoId === photo.photoId)
        setActivePhotoIndex(photoIdx >= 0 ? photoIdx : 0)
        mapInstanceRef.current?.flyTo([matchedCluster.latitude, matchedCluster.longitude], 15, {
          duration: 1.2,
        })
      }
    },
    [clusters]
  )

  // Fit bounds to all photos
  const handleFitAll = useCallback(async () => {
    if (!mapInstanceRef.current || clusters.length === 0) return
    const L = (await import("leaflet")).default
    const bounds = L.latLngBounds(clusters.map((c) => [c.latitude, c.longitude]))
    mapInstanceRef.current.fitBounds(bounds, { padding: [60, 60], maxZoom: 15 })
  }, [clusters])

  // Get active photo from selected cluster
  const currentPhoto = selectedCluster
    ? selectedCluster.photos[activePhotoIndex] || selectedCluster.photos[0]
    : null

  // Next / Prev handlers for clustered photo browsing
  const handleNextPhoto = () => {
    if (!selectedCluster || selectedCluster.photos.length <= 1) return
    setActivePhotoIndex((prev) => (prev + 1) % selectedCluster.photos.length)
  }

  const handlePrevPhoto = () => {
    if (!selectedCluster || selectedCluster.photos.length <= 1) return
    setActivePhotoIndex((prev) =>
      prev === 0 ? selectedCluster.photos.length - 1 : prev - 1
    )
  }

  return (
    <div className="relative w-full h-full overflow-hidden bg-background">
      {/* Fullscreen Map Canvas */}
      <div ref={mapContainerRef} className="w-full h-full z-0" />

      {/* Top Floating Glass Header Control Bar */}
      <div className="absolute top-4 left-4 right-4 sm:right-auto z-10 flex flex-wrap items-center gap-2 pointer-events-auto">
        <div className="flex items-center gap-2 px-3.5 py-2 rounded-2xl backdrop-blur-xl bg-background/80 dark:bg-neutral-900/80 border border-border/70 shadow-xl">
          <MapPin className="size-4 text-emerald-500 animate-pulse" />
          <span className="font-bold text-xs sm:text-sm">Photo Map Explorer</span>
          <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-500 border border-emerald-500/30 ml-1">
            {photos.length} foto • {clusters.length} titik lokasi
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

      {/* Floating Photo Preview Card (When a marker/cluster is clicked) */}
      {selectedCluster && currentPhoto && (
        <div className="absolute top-20 right-4 z-20 w-80 max-w-[calc(100vw-2rem)] rounded-3xl overflow-hidden backdrop-blur-2xl bg-background/90 dark:bg-neutral-900/90 border border-border/80 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
          {/* Main Photo Image with Cluster Carousel Controls */}
          <div className="relative aspect-4/3 w-full bg-neutral-950 overflow-hidden group">
            {currentPhoto.thumbnail || currentPhoto.preview ? (
              <Image
                src={currentPhoto.preview || currentPhoto.thumbnail || ""}
                alt={currentPhoto.name}
                fill
                unoptimized
                className="object-cover transition-all duration-300"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                <ImageIcon className="size-10 opacity-40" />
              </div>
            )}

            {/* Close Button */}
            <button
              onClick={() => setSelectedCluster(null)}
              className="absolute top-3 right-3 p-1.5 rounded-full bg-black/60 text-white hover:bg-black/80 backdrop-blur-md transition-colors cursor-pointer z-10"
            >
              <X className="size-4" />
            </button>

            {/* Cluster Multi-Photo Badge */}
            {selectedCluster.photos.length > 1 && (
              <div className="absolute top-3 left-3 px-2.5 py-1 rounded-full bg-emerald-500/90 text-white text-[11px] font-bold shadow-lg backdrop-blur-md flex items-center gap-1.5">
                <Images className="size-3" />
                <span>
                  {activePhotoIndex + 1} / {selectedCluster.photos.length} Foto di Titik Ini
                </span>
              </div>
            )}

            {/* Left/Right Arrows if multiple photos in cluster */}
            {selectedCluster.photos.length > 1 && (
              <div className="absolute inset-y-0 inset-x-2 flex items-center justify-between pointer-events-none">
                <button
                  type="button"
                  onClick={handlePrevPhoto}
                  className="pointer-events-auto p-1.5 rounded-full bg-black/50 text-white hover:bg-black/80 backdrop-blur-md transition-all cursor-pointer hover:scale-110"
                  title="Foto Sebelumnya"
                >
                  <ChevronLeft className="size-4" />
                </button>
                <button
                  type="button"
                  onClick={handleNextPhoto}
                  className="pointer-events-auto p-1.5 rounded-full bg-black/50 text-white hover:bg-black/80 backdrop-blur-md transition-all cursor-pointer hover:scale-110"
                  title="Foto Berikutnya"
                >
                  <ChevronRight className="size-4" />
                </button>
              </div>
            )}
          </div>

          {/* Group Photo Strip (Horizontal miniature selector) */}
          {selectedCluster.photos.length > 1 && (
            <div className="flex items-center gap-1.5 px-3 py-2 bg-muted/40 border-b border-border/50 overflow-x-auto scrollbar-none">
              {selectedCluster.photos.map((p, idx) => (
                <button
                  key={p.photoId}
                  onClick={() => setActivePhotoIndex(idx)}
                  className={`relative shrink-0 w-9 h-9 rounded-lg overflow-hidden border-2 transition-all cursor-pointer ${
                    activePhotoIndex === idx
                      ? "border-emerald-500 scale-105 ring-1 ring-emerald-400"
                      : "border-transparent opacity-60 hover:opacity-100"
                  }`}
                >
                  <Image
                    src={p.thumbnail || p.preview || ""}
                    alt={p.name}
                    fill
                    unoptimized
                    className="object-cover"
                  />
                </button>
              ))}
            </div>
          )}

          <div className="p-4 space-y-2.5">
            <div>
              <h3 className="font-bold text-sm text-foreground truncate" title={currentPhoto.name}>
                {currentPhoto.name}
              </h3>
              {currentPhoto.takenTime && (
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-0.5">
                  <Calendar className="size-3 text-primary" />
                  <span>{formatRelativeTime(currentPhoto.takenTime, locale)}</span>
                </div>
              )}
            </div>

            {/* Coordinates & Location Badge */}
            <div className="flex items-center justify-between p-2 rounded-xl bg-muted/40 border border-border/50 text-[11px]">
              <div className="flex items-center gap-1.5 text-muted-foreground font-mono truncate">
                <Compass className="size-3.5 text-emerald-500 shrink-0" />
                <span>
                  {selectedCluster.latitude?.toFixed(4)}°, {selectedCluster.longitude?.toFixed(4)}°
                </span>
              </div>
              <span className="text-[10px] font-semibold text-emerald-500 uppercase tracking-wider">
                GPS EXIF
              </span>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-2 pt-1">
              <Button asChild size="sm" className="flex-1 h-8.5 text-xs rounded-xl gap-1.5 font-semibold">
                <Link href={`/photo/${currentPhoto.photoId}`}>
                  <Eye className="size-3.5" />
                  <span>Buka Foto</span>
                </Link>
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  mapInstanceRef.current?.flyTo(
                    [selectedCluster.latitude, selectedCluster.longitude],
                    16,
                    { duration: 1 }
                  )
                }
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
                const isSelected = currentPhoto?.photoId === photo.photoId
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
