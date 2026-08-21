"use client"

import { useEffect, useRef, useState, useCallback, useMemo } from "react"
import dynamic from "next/dynamic"
import Link from "next/link"

const PhotoViewer = dynamic(
  () => import("@/components/photo/photo-viewer").then((mod) => mod.PhotoViewer),
  { ssr: false }
)
import {
  AlertCircle,
  Calendar,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Compass,
  Expand,
  Eye,
  Filter,
  Globe,
  Image as ImageIcon,
  Images,
  Layers,
  Loader2,
  LocateFixed,
  MapPin,
  Sparkles,
  X,
} from "lucide-react"
import type * as LType from "leaflet"
import "leaflet/dist/leaflet.css"

import { photoMapList, photoUntaggedList } from "@/request/photo"
import { type PhotoVo } from "@/server/entity/vo/photo"
import { Button } from "@/components/ui/button"
import { formatRelativeTime } from "@/lib/date"
import { getThumbHashUrl } from "@/lib/thumb-hash"
import { useLocale } from "next-intl"
import { useApp } from "@/app/provider"
import { UserTypeEnum } from "@/server/enums/user-enum"
import { UntaggedPhotosDialog } from "@/components/map/untagged-photos-dialog"
import { PhotoBatchEditDialog } from "@/components/photo/photo-batch-edit-dialog"

export interface GeoSpot {
  id: string
  latitude: number
  longitude: number
  photos: PhotoVo[]
}

export interface MapClusterMarker {
  id: string
  latitude: number
  longitude: number
  spots: GeoSpot[]
  photos: PhotoVo[]
  isMultiLocation: boolean
}

export type MapStyleKey =
  | "google-streets"
  | "google-hybrid"
  | "google-terrain"
  | "carto-dark"
  | "carto-light"

export interface MapStyleOption {
  key: MapStyleKey
  label: string
  subtitle: string
  icon: string
  badge: string
  tileUrl: string
  subdomains: string | string[]
  maxZoom: number
}

export const MAP_STYLE_OPTIONS: MapStyleOption[] = [
  {
    key: "google-streets",
    label: "Google Standar",
    subtitle: "Peta jalan & bangunan resmi Google Maps",
    icon: "🗺️",
    badge: "Populer",
    tileUrl: "https://mt{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}",
    subdomains: ["0", "1", "2", "3"],
    maxZoom: 20,
  },
  {
    key: "google-hybrid",
    label: "Satelit Hibrid",
    subtitle: "Citra satelit bumi + label kota & jalan",
    icon: "🛰️",
    badge: "Satelit",
    tileUrl: "https://mt{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}",
    subdomains: ["0", "1", "2", "3"],
    maxZoom: 20,
  },
  {
    key: "google-terrain",
    label: "Medan & Relief",
    subtitle: "Topografi, kontur gunung & ketinggian alam",
    icon: "⛰️",
    badge: "Topografi",
    tileUrl: "https://mt{s}.google.com/vt/lyrs=p&x={x}&y={y}&z={z}",
    subdomains: ["0", "1", "2", "3"],
    maxZoom: 20,
  },
  {
    key: "carto-dark",
    label: "Mode Gelap",
    subtitle: "Nuansa malam gelap kontras tinggi (CartoDB)",
    icon: "🌙",
    badge: "Gelap",
    tileUrl: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
    subdomains: "abcd",
    maxZoom: 19,
  },
  {
    key: "carto-light",
    label: "Terang Minimalis",
    subtitle: "Tampilan monokrom bersih & halus (Voyager)",
    icon: "☀️",
    badge: "Terang",
    tileUrl: "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png",
    subdomains: "abcd",
    maxZoom: 19,
  },
]

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

// 1. Group photos that are physically co-located at the EXACT same spot (<= 8 meters, e.g. burst/batch geotag)
function groupExactGeoSpots(photos: PhotoVo[], maxDistanceKm = 0.008): GeoSpot[] {
  const spots: GeoSpot[] = []

  for (const photo of photos) {
    if (
      typeof photo.latitude !== "number" ||
      typeof photo.longitude !== "number" ||
      isNaN(photo.latitude) ||
      isNaN(photo.longitude)
    ) {
      continue
    }

    const matched = spots.find(
      (s) => getDistanceInKm(photo.latitude!, photo.longitude!, s.latitude, s.longitude) <= maxDistanceKm
    )

    if (matched) {
      matched.photos.push(photo)
    } else {
      spots.push({
        id: photo.photoId,
        latitude: photo.latitude,
        longitude: photo.longitude,
        photos: [photo],
      })
    }
  }

  return spots
}

// 2. Compute dynamic screen-level clusters based on current map zoom and pixel collision distance
function computeScreenClusters(
  spots: GeoSpot[],
  map: LType.Map,
  pixelRadius = 42
): MapClusterMarker[] {
  const clusters: MapClusterMarker[] = []
  const visited = new Set<string>()

  for (let i = 0; i < spots.length; i++) {
    const spot = spots[i]
    if (visited.has(spot.id)) continue

    const pA = map.latLngToLayerPoint([spot.latitude, spot.longitude])
    const clusterSpots: GeoSpot[] = [spot]
    visited.add(spot.id)

    for (let j = i + 1; j < spots.length; j++) {
      const other = spots[j]
      if (visited.has(other.id)) continue

      const pB = map.latLngToLayerPoint([other.latitude, other.longitude])
      const dist = Math.hypot(pA.x - pB.x, pA.y - pB.y)

      if (dist <= pixelRadius) {
        visited.add(other.id)
        clusterSpots.push(other)
      }
    }

    const allPhotos = clusterSpots.flatMap((s) => s.photos)
    const isMultiLocation = clusterSpots.length > 1

    // For single spots, preserve exact geographic coordinate.
    // For multi-spot clusters, center marker at geographical centroid.
    const avgLat = clusterSpots.reduce((sum, s) => sum + s.latitude, 0) / clusterSpots.length
    const avgLon = clusterSpots.reduce((sum, s) => sum + s.longitude, 0) / clusterSpots.length

    clusters.push({
      id: spot.id,
      latitude: isMultiLocation ? avgLat : spot.latitude,
      longitude: isMultiLocation ? avgLon : spot.longitude,
      spots: clusterSpots,
      photos: allPhotos,
      isMultiLocation,
    })
  }

  return clusters
}

export default function PhotoMapView() {
  const locale = useLocale()
  const { userInfo } = useApp()
  const isAdmin = userInfo?.type === UserTypeEnum.ADMIN

  const mapContainerRef = useRef<HTMLDivElement>(null)
  const mapInstanceRef = useRef<LType.Map | null>(null)
  const tileLayerRef = useRef<LType.TileLayer | null>(null)
  const markersLayerRef = useRef<LType.LayerGroup | null>(null)
  const markerMapRef = useRef<Map<string, LType.Marker>>(new Map())
  const hasFitBoundsInitialRef = useRef<boolean>(false)
  const layerMenuRef = useRef<HTMLDivElement>(null)

  const [photos, setPhotos] = useState<PhotoVo[]>([])
  const [untaggedPhotos, setUntaggedPhotos] = useState<PhotoVo[]>([])
  const [loading, setLoading] = useState<boolean>(true)
  const [mapReady, setMapReady] = useState<boolean>(false)
  const [selectedCluster, setSelectedCluster] = useState<GeoSpot | null>(null)
  const [activePhotoIndex, setActivePhotoIndex] = useState<number>(0)
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(true)
  const [drawerTab, setDrawerTab] = useState<"map" | "untagged">("map")

  // Map layer/style switcher state
  const [mapStyle, setMapStyle] = useState<MapStyleKey>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("naypict_map_style") as MapStyleKey
      if (saved && MAP_STYLE_OPTIONS.some((o) => o.key === saved)) return saved
    }
    return "google-streets"
  })
  const [isLayerMenuOpen, setIsLayerMenuOpen] = useState<boolean>(false)

  // Untagged photos dialog state
  const [untaggedDialogOpen, setUntaggedDialogOpen] = useState<boolean>(false)
  const [singleGeotagPhotoId, setSingleGeotagPhotoId] = useState<string | null>(null)

  // Fullscreen PhotoViewer state on map
  const [viewerOpen, setViewerOpen] = useState<boolean>(false)
  const [viewerIndex, setViewerIndex] = useState<number>(0)
  const [viewerPhotos, setViewerPhotos] = useState<PhotoVo[]>([])

  const handleOpenPhotoViewer = useCallback((photoList: PhotoVo[], startIdx: number) => {
    setViewerPhotos(photoList)
    setViewerIndex(startIdx)
    setViewerOpen(true)
  }, [])

  // Close layer menu on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (layerMenuRef.current && !layerMenuRef.current.contains(e.target as Node)) {
        setIsLayerMenuOpen(false)
      }
    }
    if (isLayerMenuOpen) {
      document.addEventListener("mousedown", handleClickOutside)
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside)
    }
  }, [isLayerMenuOpen])

  // Group photos that are at the exact same physical spot
  const geoSpots = useMemo(() => {
    return groupExactGeoSpots(photos, 0.008)
  }, [photos])

  // Preload thumbnails of all photos in the selected cluster into memory cache for 0ms transitions
  useEffect(() => {
    if (!selectedCluster || typeof window === "undefined") return
    selectedCluster.photos.forEach((p) => {
      const url = p.thumbnail || p.preview
      if (url) {
        const img = new window.Image()
        img.src = url
      }
    })
  }, [selectedCluster])

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

  // Fetch untagged photos for Admin to manage missing GPS coordinates
  useEffect(() => {
    if (!isAdmin) return
    let isMounted = true
    photoUntaggedList()
      .then((data) => {
        if (isMounted) {
          setUntaggedPhotos(data ?? [])
        }
      })
      .catch((err) => {
        console.error("Failed to load untagged photos:", err)
      })

    return () => {
      isMounted = false
    }
  }, [isAdmin])

  // Active map style definition
  const currentMapStyleOption = useMemo(() => {
    return MAP_STYLE_OPTIONS.find((s) => s.key === mapStyle) || MAP_STYLE_OPTIONS[0]
  }, [mapStyle])

  const styleRef = useRef(currentMapStyleOption)
  useEffect(() => {
    styleRef.current = currentMapStyleOption
  }, [currentMapStyleOption])

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

      const initialStyle = styleRef.current
      const tileLayer = L.tileLayer(initialStyle.tileUrl, {
        maxZoom: initialStyle.maxZoom,
        subdomains: initialStyle.subdomains,
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

  // Switch tile layer smoothly when mapStyle changes
  useEffect(() => {
    if (!mapInstanceRef.current || !mapReady) return

    let isDisposed = false

    async function switchTileLayer() {
      const L = (await import("leaflet")).default
      if (isDisposed || !mapInstanceRef.current) return

      if (tileLayerRef.current) {
        mapInstanceRef.current.removeLayer(tileLayerRef.current)
      }

      const newTileLayer = L.tileLayer(currentMapStyleOption.tileUrl, {
        maxZoom: currentMapStyleOption.maxZoom,
        subdomains: currentMapStyleOption.subdomains,
      }).addTo(mapInstanceRef.current)

      // Ensure tile layer stays beneath the markers
      newTileLayer.bringToBack()
      tileLayerRef.current = newTileLayer
    }

    switchTileLayer()

    return () => {
      isDisposed = true
    }
  }, [mapStyle, currentMapStyleOption.tileUrl, currentMapStyleOption.maxZoom, currentMapStyleOption.subdomains, mapReady])

  // Handle map style change & save to localStorage
  const handleSelectMapStyle = (key: MapStyleKey) => {
    setMapStyle(key)
    setIsLayerMenuOpen(false)
    if (typeof window !== "undefined") {
      localStorage.setItem("naypict_map_style", key)
    }
  }

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

  // Dynamically render screen-level clusters whenever map is panned, zoomed, or spots update
  const renderMarkers = useCallback(async () => {
    if (!mapReady || !mapInstanceRef.current || !markersLayerRef.current) return

    const L = (await import("leaflet")).default
    const map = mapInstanceRef.current
    if (!map || !markersLayerRef.current) return

    markersLayerRef.current.clearLayers()
    markerMapRef.current.clear()

    const screenClusters = computeScreenClusters(geoSpots, map, 44)

    screenClusters.forEach((cluster) => {
      const topPhoto = cluster.photos[0]
      if (!topPhoto) return

      const imgUrl = topPhoto.thumbnail || topPhoto.preview || ""
      const thumbHashUrl = getThumbHashUrl(topPhoto.thumbHash)
      const isSelected = selectedCluster?.id === cluster.id
      const count = cluster.photos.length
      const isMulti = count > 1

      // Custom HTML pin marker with sleek border, curved selection ring, and calibrated pointer
      const customIcon = L.divIcon({
        className: "photo-marker-icon",
        html: `
          <div class="relative cursor-pointer transition-all duration-200 transform hover:scale-110 ${
            isSelected ? "scale-110 z-50" : ""
          }">
            ${
              isMulti
                ? `
              <!-- Sleek stacked cards behind for multi-photo depth -->
              <div class="absolute inset-0 rounded-2xl bg-neutral-900/80 border border-white/40 rotate-6 scale-95 shadow-sm pointer-events-none"></div>
              <div class="absolute inset-0 rounded-2xl bg-neutral-800/80 border border-white/40 -rotate-3 scale-95 shadow-sm pointer-events-none"></div>
            `
                : ""
            }
            <!-- Main Photo Frame -->
            <div class="relative w-10 h-10 rounded-2xl overflow-hidden shadow-xl border ${
              isSelected
                ? "border-emerald-400 ring-2 ring-emerald-400 ring-offset-2 ring-offset-background/90 shadow-emerald-500/30"
                : "border-white/90 dark:border-white/40"
            } bg-neutral-900 flex items-center justify-center" ${
              thumbHashUrl ? `style="background-image: url('${thumbHashUrl}'); background-size: cover;"` : ""
            }>
              ${
                imgUrl
                  ? `<img src="${imgUrl}" alt="${topPhoto.name}" class="w-full h-full object-cover" loading="lazy" decoding="async" />`
                  : `<div class="w-full h-full bg-emerald-600 flex items-center justify-center text-white text-xs">📷</div>`
              }
            </div>

            <!-- Calibrated bottom anchor pointer tip -->
            <div class="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2.5 h-2.5 rotate-45 ${
              isSelected
                ? "bg-emerald-400 border-r border-b border-emerald-400"
                : "bg-white dark:bg-neutral-900 border-r border-b border-white/90 dark:border-white/40"
            } shadow-xs pointer-events-none"></div>

            ${
              isMulti
                ? `
              <!-- Count badge pill on top right -->
              <div class="absolute -top-1.5 -right-1.5 px-1.5 py-0.5 min-w-4.5 h-4.5 rounded-full ${
                cluster.isMultiLocation ? "bg-sky-500" : "bg-emerald-500"
              } text-white font-bold text-[10px] leading-none flex items-center justify-center shadow-md border border-white/90 pointer-events-none">
                ${count}
              </div>
            `
                : ""
            }
          </div>
        `,
        iconSize: [40, 48],
        iconAnchor: [20, 46],
        popupAnchor: [0, -44],
      })

      const marker = L.marker([cluster.latitude, cluster.longitude], { icon: customIcon })

      // Marker click:
      // If multi-location cluster at lower zoom -> zoom in and separate pins!
      // If single spot or max zoom -> select spot and open preview card!
      marker.on("click", () => {
        if (cluster.isMultiLocation && map.getZoom() < 18) {
          const bounds = L.latLngBounds(cluster.spots.map((s) => [s.latitude, s.longitude]))
          map.fitBounds(bounds, { padding: [80, 80], maxZoom: 18 })
        } else {
          const spotToSelect = cluster.spots[0]
          setSelectedCluster(spotToSelect)
          setActivePhotoIndex(0)
          map.flyTo([spotToSelect.latitude, spotToSelect.longitude], Math.max(map.getZoom(), 16), {
            duration: 0.8,
          })
        }
      })

      markersLayerRef.current?.addLayer(marker)
      markerMapRef.current.set(cluster.id, marker)
    })

    // Automatically fit map bounds to show all markers on initial load
    if (!hasFitBoundsInitialRef.current && geoSpots.length > 0 && mapInstanceRef.current) {
      const bounds = L.latLngBounds(geoSpots.map((c) => [c.latitude, c.longitude]))
      mapInstanceRef.current.fitBounds(bounds, { padding: [60, 60], maxZoom: 14 })
      hasFitBoundsInitialRef.current = true
    }
  }, [mapReady, geoSpots, selectedCluster?.id])

  // Re-calculate screen clusters on map zoom/pan/ready/spots change
  useEffect(() => {
    if (!mapReady || !mapInstanceRef.current) return
    const map = mapInstanceRef.current

    renderMarkers()

    map.on("zoomend", renderMarkers)
    map.on("moveend", renderMarkers)

    return () => {
      map.off("zoomend", renderMarkers)
      map.off("moveend", renderMarkers)
    }
  }, [mapReady, renderMarkers])

  // Center map on a specific photo from bottom carousel
  const handleFlyToPhoto = useCallback(
    (photo: PhotoVo) => {
      if (typeof photo.latitude !== "number" || typeof photo.longitude !== "number") return

      // Find the exact geo spot this photo belongs to
      const matchedSpot = geoSpots.find((s) =>
        s.photos.some((p) => p.photoId === photo.photoId)
      )

      if (matchedSpot) {
        setSelectedCluster(matchedSpot)
        const photoIdx = matchedSpot.photos.findIndex((p) => p.photoId === photo.photoId)
        setActivePhotoIndex(photoIdx >= 0 ? photoIdx : 0)
        mapInstanceRef.current?.flyTo([matchedSpot.latitude, matchedSpot.longitude], 17, {
          duration: 1.2,
        })
      }
    },
    [geoSpots]
  )

  // Fit bounds to all photos
  const handleFitAll = useCallback(async () => {
    if (!mapInstanceRef.current || geoSpots.length === 0) return
    const L = (await import("leaflet")).default
    const bounds = L.latLngBounds(geoSpots.map((c) => [c.latitude, c.longitude]))
    mapInstanceRef.current.fitBounds(bounds, { padding: [60, 60], maxZoom: 15 })
  }, [geoSpots])

  // Callback when untagged photos are successfully geotagged
  const handleGeotagSuccess = useCallback(
    (geotaggedIds: string[], changes: Partial<PhotoVo>) => {
      // 1. Find the geotagged photo objects from untagged state
      const newlyGeotagged = untaggedPhotos.filter((p) => geotaggedIds.includes(p.photoId))

      // 2. Remove them from untaggedPhotos
      setUntaggedPhotos((prev) => prev.filter((p) => !geotaggedIds.includes(p.photoId)))

      // 3. Add to mapped photos if valid coordinates
      if (
        typeof changes.latitude === "number" &&
        typeof changes.longitude === "number" &&
        !isNaN(changes.latitude) &&
        !isNaN(changes.longitude)
      ) {
        const updatedMapped: PhotoVo[] = newlyGeotagged.map((p) => ({
          ...p,
          ...changes,
        }))

        setPhotos((prev) => [...prev, ...updatedMapped])

        // Fly camera to the new coordinate
        mapInstanceRef.current?.flyTo([changes.latitude, changes.longitude], 16, {
          duration: 1.2,
        })
      }
    },
    [untaggedPhotos]
  )

  // Get active photo from selected spot
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
            {photos.length} foto • {geoSpots.length} titik lokasi
          </span>
        </div>

        {/* Google Maps Style / Layer Switcher Dropdown */}
        <div ref={layerMenuRef} className="relative">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setIsLayerMenuOpen((prev) => !prev)}
            className={`h-9 px-3 text-xs rounded-2xl backdrop-blur-xl border shadow-xl gap-1.5 cursor-pointer transition-all hover:scale-105 ${
              isLayerMenuOpen
                ? "bg-primary/20 border-primary text-primary"
                : "bg-background/80 dark:bg-neutral-900/80 border-border/70"
            }`}
            title="Ganti tampilan peta (Google Standar, Satelit Hibrid, Medan, Mode Gelap)"
          >
            <Layers className="size-3.5 text-emerald-500" />
            <span className="font-semibold">{currentMapStyleOption.label}</span>
          </Button>

          {/* Layer Selector Popover Card */}
          {isLayerMenuOpen && (
            <div className="absolute top-11 left-0 z-50 w-72 p-2.5 rounded-3xl backdrop-blur-2xl bg-background/95 dark:bg-neutral-900/95 border border-border/80 shadow-2xl animate-in fade-in zoom-in-95 duration-150 space-y-1.5">
              <div className="px-2 py-1 flex items-center justify-between border-b border-border/50 pb-2">
                <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
                  <Globe className="size-3.5 text-primary" />
                  <span>Gaya & Lapisan Peta</span>
                </span>
                <span className="text-[10px] text-muted-foreground font-medium">Google Maps</span>
              </div>

              <div className="space-y-1 pt-1">
                {MAP_STYLE_OPTIONS.map((opt) => {
                  const isActive = opt.key === mapStyle
                  return (
                    <button
                      key={opt.key}
                      type="button"
                      onClick={() => handleSelectMapStyle(opt.key)}
                      className={`w-full flex items-center justify-between p-2 rounded-2xl transition-all text-left cursor-pointer border ${
                        isActive
                          ? "bg-emerald-500/15 border-emerald-500/40 text-foreground ring-1 ring-emerald-500/30"
                          : "border-transparent hover:bg-muted/60 text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="text-base shrink-0">{opt.icon}</span>
                        <div className="min-w-0">
                          <p className="font-bold text-xs leading-tight truncate">{opt.label}</p>
                          <p className="text-[10px] text-muted-foreground truncate leading-tight mt-0.5">
                            {opt.subtitle}
                          </p>
                        </div>
                      </div>
                      {isActive && (
                        <div className="size-5 rounded-full bg-emerald-500 text-white flex items-center justify-center shrink-0 ml-1 shadow-xs">
                          <Check className="size-3 stroke-[3]" />
                        </div>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>
          )}
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

        {/* Admin Untagged Photos Notification Pill */}
        {isAdmin && (
          <>
            {untaggedPhotos.length > 0 ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setUntaggedDialogOpen(true)}
                className="h-9 px-3 text-xs rounded-2xl backdrop-blur-xl bg-amber-500/10 dark:bg-amber-500/20 border-amber-500/35 text-amber-700 dark:text-amber-300 shadow-xl gap-1.5 cursor-pointer hover:bg-amber-500/25 transition-all hover:scale-105"
                title="Kelola foto yang belum memiliki titik koordinat lokasi GPS"
              >
                <AlertCircle className="size-3.5 text-amber-500 animate-bounce" />
                <span className="font-bold">{untaggedPhotos.length} Foto Tanpa Koordinat</span>
              </Button>
            ) : (
              <div className="hidden lg:flex items-center gap-1.5 px-3 py-1.5 rounded-2xl backdrop-blur-xl bg-background/80 dark:bg-neutral-900/80 border border-emerald-500/30 text-emerald-500 text-xs font-semibold shadow-xl">
                <CheckCircle2 className="size-3.5" />
                <span>Semua Foto Berkoordinat</span>
              </div>
            )}
          </>
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

      {/* Floating Photo Preview Card (When a marker/spot is clicked) */}
      {selectedCluster && currentPhoto && (
        <div className="absolute top-20 right-4 z-20 w-80 max-w-[calc(100vw-2rem)] rounded-3xl overflow-hidden backdrop-blur-2xl bg-background/90 dark:bg-neutral-900/90 border border-border/80 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
          {/* Main Photo Image with Instant ThumbHash Blur and Eager Thumbnail Loading */}
          {(() => {
            const previewSrc = currentPhoto.thumbnail || currentPhoto.preview || ""
            const placeholder = getThumbHashUrl(currentPhoto.thumbHash)
            return (
              <div
                className="relative aspect-4/3 w-full bg-neutral-950 overflow-hidden group cursor-pointer"
                onClick={() => handleOpenPhotoViewer(selectedCluster.photos, activePhotoIndex)}
                title="Klik untuk membuka foto layar penuh"
              >
                {placeholder && (
                  <img
                    src={placeholder}
                    alt=""
                    className="absolute inset-0 h-full w-full object-cover blur-sm scale-110"
                    aria-hidden
                  />
                )}
                {previewSrc ? (
                  <img
                    src={previewSrc}
                    alt={currentPhoto.name}
                    loading="eager"
                    decoding="async"
                    className="absolute inset-0 h-full w-full object-cover transition-all duration-300 group-hover:scale-105"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                    <ImageIcon className="size-10 opacity-40" />
                  </div>
                )}

                {/* Close Button */}
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    setSelectedCluster(null)
                  }}
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
                      onClick={(e) => {
                        e.stopPropagation()
                        handlePrevPhoto()
                      }}
                      className="pointer-events-auto p-1.5 rounded-full bg-black/50 text-white hover:bg-black/80 backdrop-blur-md transition-all cursor-pointer hover:scale-110"
                      title="Foto Sebelumnya"
                    >
                      <ChevronLeft className="size-4" />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        handleNextPhoto()
                      }}
                      className="pointer-events-auto p-1.5 rounded-full bg-black/50 text-white hover:bg-black/80 backdrop-blur-md transition-all cursor-pointer hover:scale-110"
                      title="Foto Berikutnya"
                    >
                      <ChevronRight className="size-4" />
                    </button>
                  </div>
                )}
              </div>
            )
          })()}

          {/* Group Photo Strip (Horizontal miniature selector) */}
          {selectedCluster.photos.length > 1 && (
            <div className="flex items-center gap-1.5 px-3 py-2 bg-muted/40 border-b border-border/50 overflow-x-auto scrollbar-none">
              {selectedCluster.photos.map((p, idx) => {
                const thumb = p.thumbnail || p.preview || ""
                const ph = getThumbHashUrl(p.thumbHash)
                return (
                  <button
                    key={p.photoId}
                    onClick={() => setActivePhotoIndex(idx)}
                    className={`relative shrink-0 w-9 h-9 rounded-lg overflow-hidden border-2 transition-all cursor-pointer bg-neutral-900 ${
                      activePhotoIndex === idx
                        ? "border-emerald-500 scale-105 ring-1 ring-emerald-400"
                        : "border-transparent opacity-60 hover:opacity-100"
                    }`}
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
                        alt={p.name}
                        loading="lazy"
                        decoding="async"
                        className="absolute inset-0 h-full w-full object-cover"
                      />
                    )}
                  </button>
                )
              })}
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
              <Button
                type="button"
                size="sm"
                onClick={() => handleOpenPhotoViewer(selectedCluster.photos, activePhotoIndex)}
                className="flex-1 h-8.5 text-xs rounded-xl gap-1.5 font-semibold bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer shadow-xs"
                title="Buka foto dalam tampilan penuh"
              >
                <Eye className="size-3.5" />
                <span>Buka Foto</span>
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  mapInstanceRef.current?.flyTo(
                    [selectedCluster.latitude, selectedCluster.longitude],
                    17,
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
        <div className="absolute bottom-4 left-4 right-4 z-10 max-h-48 rounded-3xl backdrop-blur-2xl bg-background/85 dark:bg-neutral-900/85 border border-border/70 p-3 shadow-2xl animate-in slide-in-from-bottom duration-300">
          <div className="flex items-center justify-between pb-2 px-1">
            <div className="flex items-center gap-2">
              {/* Tab Selector: Photos on Map vs Untagged Photos */}
              <button
                type="button"
                onClick={() => setDrawerTab("map")}
                className={`flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-xl transition-all cursor-pointer ${
                  drawerTab === "map"
                    ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Sparkles className="size-3.5 text-emerald-500" />
                <span>Foto di Peta ({photos.length})</span>
              </button>

              {isAdmin && untaggedPhotos.length > 0 && (
                <button
                  type="button"
                  onClick={() => setDrawerTab("untagged")}
                  className={`flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-xl transition-all cursor-pointer ${
                    drawerTab === "untagged"
                      ? "bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <AlertCircle className="size-3.5 text-amber-500" />
                  <span>Belum Ada Koordinat ({untaggedPhotos.length})</span>
                </button>
              )}
            </div>

            <div className="flex items-center gap-1.5">
              {isAdmin && untaggedPhotos.length > 0 && (
                <button
                  type="button"
                  onClick={() => setUntaggedDialogOpen(true)}
                  className="text-xs text-amber-600 dark:text-amber-400 hover:underline font-semibold cursor-pointer hidden sm:inline"
                >
                  Kelola Semua ({untaggedPhotos.length})
                </button>
              )}
              <button
                onClick={() => setIsSidebarOpen(false)}
                className="text-muted-foreground hover:text-foreground text-xs cursor-pointer p-1"
              >
                <X className="size-3.5" />
              </button>
            </div>
          </div>

          {/* TAB 1: Photos on Map */}
          {drawerTab === "map" && (
            <>
              {photos.length === 0 ? (
                <div className="py-6 text-center text-xs text-muted-foreground">
                  Belum ada foto yang memiliki koordinat GPS.
                </div>
              ) : (
                <div className="flex items-center gap-2.5 overflow-x-auto pb-1 scrollbar-thin scrollbar-thumb-muted scrollbar-track-transparent">
                  {photos.map((photo) => {
                    const isSelected = currentPhoto?.photoId === photo.photoId
                    const thumb = photo.thumbnail || photo.preview || ""
                    const ph = getThumbHashUrl(photo.thumbHash)
                    return (
                      <div
                        key={photo.photoId}
                        onClick={() => handleFlyToPhoto(photo)}
                        className={`group relative shrink-0 w-24 h-24 sm:w-28 sm:h-28 rounded-2xl overflow-hidden cursor-pointer border-2 transition-all duration-200 hover:scale-105 active:scale-95 bg-neutral-900 ${
                          isSelected
                            ? "border-emerald-500 ring-2 ring-emerald-500/50 shadow-lg"
                            : "border-border/60 hover:border-foreground/50"
                        }`}
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
                            className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover:scale-110"
                          />
                        )}
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
            </>
          )}

          {/* TAB 2: Untagged Photos Carousel */}
          {drawerTab === "untagged" && (
            <div className="flex items-center gap-2.5 overflow-x-auto pb-1 scrollbar-thin scrollbar-thumb-muted scrollbar-track-transparent">
              {untaggedPhotos.map((photo) => {
                const thumb = photo.thumbnail || photo.preview || ""
                const ph = getThumbHashUrl(photo.thumbHash)
                return (
                  <div
                    key={photo.photoId}
                    className="group relative shrink-0 w-28 h-28 rounded-2xl overflow-hidden border border-amber-500/30 bg-neutral-900 shadow-md flex flex-col justify-between p-1.5"
                  >
                    {ph && (
                      <img
                        src={ph}
                        alt=""
                        className="absolute inset-0 h-full w-full object-cover blur-xs scale-110 opacity-75"
                        aria-hidden
                      />
                    )}
                    {thumb && (
                      <img
                        src={thumb}
                        alt={photo.name}
                        loading="lazy"
                        decoding="async"
                        className="absolute inset-0 h-full w-full object-cover opacity-75 group-hover:opacity-100 transition-opacity"
                      />
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent" />
                    <div className="relative z-10 flex items-center justify-between">
                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-500 text-black">
                        No GPS
                      </span>
                    </div>
                    <div className="relative z-10 space-y-1">
                      <p className="text-[10px] font-semibold text-white truncate leading-tight">
                        {photo.name}
                      </p>
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => setSingleGeotagPhotoId(photo.photoId)}
                        className="w-full h-6 text-[10px] rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold p-0 shadow-md cursor-pointer"
                      >
                        + Setel Lokasi
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Admin Untagged Photos Management Dialog */}
      {isAdmin && (
        <UntaggedPhotosDialog
          open={untaggedDialogOpen}
          onOpenChange={setUntaggedDialogOpen}
          untaggedPhotos={untaggedPhotos}
          onGeotagSuccess={handleGeotagSuccess}
        />
      )}

      {/* Single Geotag Direct Dialog from Bottom Drawer */}
      {singleGeotagPhotoId && (
        <PhotoBatchEditDialog
          open={Boolean(singleGeotagPhotoId)}
          onOpenChange={(next) => {
            if (!next) setSingleGeotagPhotoId(null)
          }}
          photoIds={[singleGeotagPhotoId]}
          onSuccess={(ids, changes) => {
            handleGeotagSuccess(ids, changes)
            setSingleGeotagPhotoId(null)
          }}
        />
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
            Foto yang Anda unggah belum memiliki data metadata lokasi GPS EXIF. Anda dapat menambahkan koordinat lokasi melalui tombol di bawah.
          </p>
          {isAdmin && untaggedPhotos.length > 0 ? (
            <Button
              type="button"
              size="sm"
              onClick={() => setUntaggedDialogOpen(true)}
              className="rounded-xl mt-2 text-xs bg-emerald-600 hover:bg-emerald-500 text-white font-semibold cursor-pointer"
            >
              Kelola {untaggedPhotos.length} Foto Tanpa Lokasi
            </Button>
          ) : (
            <Button asChild size="sm" className="rounded-xl mt-2 text-xs">
              <Link href="/photos">Kembali ke Galeri</Link>
            </Button>
          )}
        </div>
      )}

      {/* Fullscreen PhotoViewer Lightbox Modal directly on Map */}
      {viewerOpen && viewerPhotos.length > 0 && (
        <PhotoViewer
          open={viewerOpen}
          index={viewerIndex}
          photos={viewerPhotos}
          onBack={() => setViewerOpen(false)}
          onBrowserBack={() => setViewerOpen(false)}
          onPhotoUpdate={(updated) => {
            handleGeotagSuccess([updated.photoId], updated)
            setViewerPhotos((prev) =>
              prev.map((p) => (p.photoId === updated.photoId ? { ...p, ...updated } : p))
            )
          }}
        />
      )}
    </div>
  )
}
