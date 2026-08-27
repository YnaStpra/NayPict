"use client"

import { useEffect, useRef, useState, useCallback, useMemo } from "react"
import dynamic from "next/dynamic"
import Link from "next/link"
import { toast } from "sonner"

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
  ListFilter,
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
import { toProxyMediaUrl } from "@/lib/url"
import { useLocale } from "next-intl"
import { useApp } from "@/app/provider"
import { UserTypeEnum } from "@/server/enums/user-enum"
import { UntaggedPhotosDialog } from "@/components/map/untagged-photos-dialog"
import { AllSpotsDialog } from "@/components/map/all-spots-dialog"
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
    label: "Google Streets",
    subtitle: "Official Google Maps streets & buildings",
    icon: "🗺️",
    badge: "Popular",
    tileUrl: "https://mt{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}",
    subdomains: ["0", "1", "2", "3"],
    maxZoom: 20,
  },
  {
    key: "google-hybrid",
    label: "Satellite Hybrid",
    subtitle: "High-resolution satellite view with street labels",
    icon: "🛰️",
    badge: "Satellite",
    tileUrl: "https://mt{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}",
    subdomains: ["0", "1", "2", "3"],
    maxZoom: 20,
  },
  {
    key: "google-terrain",
    label: "Terrain & Relief",
    subtitle: "Topography, mountain contours & elevation data",
    icon: "⛰️",
    badge: "Topography",
    tileUrl: "https://mt{s}.google.com/vt/lyrs=p&x={x}&y={y}&z={z}",
    subdomains: ["0", "1", "2", "3"],
    maxZoom: 20,
  },
  {
    key: "carto-dark",
    label: "Dark Mode",
    subtitle: "High-contrast dark night mode (CartoDB)",
    icon: "🌙",
    badge: "Dark",
    tileUrl: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
    subdomains: "abcd",
    maxZoom: 19,
  },
  {
    key: "carto-light",
    label: "Light Minimal",
    subtitle: "Clean & smooth monochrome aesthetic (Voyager)",
    icon: "☀️",
    badge: "Light",
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
// and sort custom chosen cover photo to the front of the spot array
function groupExactGeoSpots(
  photos: PhotoVo[],
  maxDistanceKm = 0.008,
  covers: Record<string, string> = {}
): GeoSpot[] {
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

  // If a custom cover photo is configured for this spot, sort it to the front (index 0)
  spots.forEach((spot) => {
    const key = `${spot.latitude.toFixed(5)}_${spot.longitude.toFixed(5)}`
    const coverPhotoId = covers[key] || covers[spot.id]
    if (coverPhotoId) {
      const coverIdx = spot.photos.findIndex((p) => p.photoId === coverPhotoId)
      if (coverIdx > 0) {
        const [coverPhoto] = spot.photos.splice(coverIdx, 1)
        spot.photos.unshift(coverPhoto)
      }
    }
  })

  return spots
}

// 2. Compute dynamic screen-level clusters based on current map zoom and pixel collision distance with Viewport Bounding-Box Virtualization
function computeScreenClusters(
  spots: GeoSpot[],
  map: LType.Map,
  basePixelRadius = 44
): MapClusterMarker[] {
  if (!spots.length) return []

  // Dynamic Viewport Cluster Resolution: Adapt collision radius based on zoom level to minimize DOM nodes on world view
  const zoom = map.getZoom()
  const pixelRadius = zoom < 6 ? 64 : zoom < 10 ? 52 : zoom > 14 ? 32 : basePixelRadius

  // Viewport Virtualization: Filter spots within active bounding box (+25% margin for smooth panning)
  // This drastically eliminates O(N^2) pixel distance collision calculations for off-screen markers.
  const bounds = map.getBounds().pad(0.25)
  const visibleSpots = spots.filter((s) => bounds.contains([s.latitude, s.longitude]))

  const clusters: MapClusterMarker[] = []
  const visited = new Set<string>()

  for (let i = 0; i < visibleSpots.length; i++) {
    const spot = visibleSpots[i]
    if (visited.has(spot.id)) continue

    const pA = map.latLngToLayerPoint([spot.latitude, spot.longitude])
    const clusterSpots: GeoSpot[] = [spot]
    visited.add(spot.id)

    for (let j = i + 1; j < visibleSpots.length; j++) {
      const other = visibleSpots[j]
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
  const thumbnailStripRef = useRef<HTMLDivElement>(null)

  const [photos, setPhotos] = useState<PhotoVo[]>([])
  const [untaggedPhotos, setUntaggedPhotos] = useState<PhotoVo[]>([])
  const [loading, setLoading] = useState<boolean>(true)
  const [mapReady, setMapReady] = useState<boolean>(false)
  const [selectedCluster, setSelectedCluster] = useState<GeoSpot | null>(null)
  const [activePhotoIndex, setActivePhotoIndex] = useState<number>(0)

  // Custom spot cover photos dictionary (mapping spot coordinate key -> chosen photoId)
  const [spotCovers, setSpotCovers] = useState<Record<string, string>>(() => {
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem("naypict_spot_covers")
        if (saved) return JSON.parse(saved)
      } catch (e) {
        console.error("Failed to parse spot covers:", e)
      }
    }
    return {}
  })

  // Bottom drawer panel state (defaults to closed)
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(false)
  const [drawerTab, setDrawerTab] = useState<"spots" | "map" | "untagged">("spots")

  // Map layer/style switcher state
  const [mapStyle, setMapStyle] = useState<MapStyleKey>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("naypict_map_style") as MapStyleKey
      if (saved && MAP_STYLE_OPTIONS.some((o) => o.key === saved)) return saved
    }
    return "google-streets"
  })
  const [isLayerMenuOpen, setIsLayerMenuOpen] = useState<boolean>(false)

  // Dialog states
  const [untaggedDialogOpen, setUntaggedDialogOpen] = useState<boolean>(false)
  const [allSpotsDialogOpen, setAllSpotsDialogOpen] = useState<boolean>(false)
  const [singleGeotagPhotoId, setSingleGeotagPhotoId] = useState<string | null>(null)
  const [editSpotDialogOpen, setEditSpotDialogOpen] = useState<boolean>(false)
  const [spotToEdit, setSpotToEdit] = useState<GeoSpot | null>(null)

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

  // Group photos that are at the exact same physical spot, prioritizing custom cover photo
  const geoSpots = useMemo(() => {
    return groupExactGeoSpots(photos, 0.008, spotCovers)
  }, [photos, spotCovers])

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

  // Set custom pin cover photo for a spot
  const handleSetSpotCover = useCallback(
    (spot: GeoSpot, photo: PhotoVo) => {
      const key = `${spot.latitude.toFixed(5)}_${spot.longitude.toFixed(5)}`
      setSpotCovers((prev) => {
        const next = { ...prev, [key]: photo.photoId, [spot.id]: photo.photoId }
        if (typeof window !== "undefined") {
          localStorage.setItem("naypict_spot_covers", JSON.stringify(next))
        }
        return next
      })

      // Also update selectedCluster in-place so chosen photo moves to index 0
      setSelectedCluster((prev) => {
        if (!prev || prev.id !== spot.id) return prev
        const photosCopy = [...prev.photos]
        const targetIdx = photosCopy.findIndex((p) => p.photoId === photo.photoId)
        if (targetIdx > 0) {
          const [chosen] = photosCopy.splice(targetIdx, 1)
          photosCopy.unshift(chosen)
        }
        return {
          ...prev,
          photos: photosCopy,
        }
      })
      setActivePhotoIndex(0)

      toast.success(`Photo "${photo.name}" set as map pin cover!`)
    },
    []
  )

  // Smart Thumbnail Memory Buffer: Pre-cache adjacent spot photos for instant 0ms switching
  useEffect(() => {
    if (!selectedCluster || !selectedCluster.photos.length) return
    const photos = selectedCluster.photos
    const indicesToPreload = [activePhotoIndex - 1, activePhotoIndex + 1].filter(
      (idx) => idx >= 0 && idx < photos.length
    )
    indicesToPreload.forEach((idx) => {
      const p = photos[idx]
      const src = p?.thumbnail || p?.preview
      if (src && typeof window !== "undefined") {
        const img = new Image()
        img.src = src
      }
    })
  }, [selectedCluster, activePhotoIndex])

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
      const isSelected = selectedCluster?.id === cluster.id
      const count = cluster.photos.length
      const isMulti = count > 1

      // Custom HTML pin marker with ultra-high-contrast dual contour, luminescent ambient halo, ground anchor shadow, and calibrated pointer
      const customIcon = L.divIcon({
        className: "photo-marker-icon",
        html: `
          <div class="relative cursor-pointer transition-all duration-200 transform hover:scale-110 select-none ${
            isSelected ? "scale-115 z-50" : ""
          }">
            <!-- High-Contrast Ground Anchor Shadow on Map Surface -->
            <div class="absolute -bottom-2 left-1/2 -translate-x-1/2 w-6 h-2 bg-black/85 rounded-full blur-[1.5px] pointer-events-none"></div>

            <!-- Luminescent Ambient Halo / Glow (Continuous Visibility) -->
            <div class="pin-contrast-halo ${isSelected ? "pin-contrast-halo-selected" : ""}"></div>
            ${isSelected || count > 3 ? `<div class="radar-pin-halo"></div>` : ""}

            ${
              isMulti
                ? `
              <!-- Stacked cards behind for multi-photo depth with high-contrast emerald & black borders -->
              <div class="absolute inset-0 rounded-2xl bg-neutral-900 border-2 border-emerald-500/90 rotate-6 scale-95 shadow-md shadow-black/80 ring-1 ring-black/90 pointer-events-none"></div>
              <div class="absolute inset-0 rounded-2xl bg-neutral-900 border-2 border-emerald-400/90 -rotate-3 scale-95 shadow-md shadow-black/80 ring-1 ring-black/90 pointer-events-none"></div>
            `
                : ""
            }

            <!-- Main Photo Frame with high-contrast dual contour (Outer Black Ring + Crisp White/Emerald Stroke + Emerald Ambient Glow) -->
            <div class="relative w-10.5 h-10.5 rounded-2xl overflow-hidden shadow-[0_4px_16px_rgba(0,0,0,0.85)] ${
              isSelected
                ? "border-[2.5px] border-emerald-300 ring-2 ring-emerald-400 ring-offset-2 ring-offset-neutral-950 shadow-emerald-500/50"
                : "border-[2.5px] border-white ring-2 ring-black/95 shadow-[0_0_12px_rgba(16,185,129,0.5),0_4px_14px_rgba(0,0,0,0.85)]"
            } bg-neutral-900">
              ${
                imgUrl
                  ? `<img src="${imgUrl}" alt="" onerror="if(this.src&&!this.src.includes('/media/')){this.src=this.src.replace(/^https?:\\/\\/[^\\/]+/, '/media')}" style="position: absolute !important; top: 0 !important; left: 0 !important; width: 100% !important; height: 100% !important; min-width: 100% !important; min-height: 100% !important; max-width: none !important; max-height: none !important; object-fit: cover !important; object-position: center center !important; display: block !important;" loading="lazy" decoding="async" />`
                  : `<div class="w-full h-full bg-emerald-600 flex items-center justify-center text-white text-xs font-bold">📷</div>`
              }
            </div>

            <!-- Calibrated bottom anchor pointer tip with dual-contour contrast -->
            <div class="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-3 h-3 rotate-45 ${
              isSelected
                ? "bg-emerald-300 border-r-[2.5px] border-b-[2.5px] border-emerald-300 ring-1 ring-black/90"
                : "bg-white border-r-[2.5px] border-b-[2.5px] border-white ring-1 ring-black/90"
            } shadow-[0_2px_4px_rgba(0,0,0,0.9)] pointer-events-none"></div>

            ${
              isMulti
                ? `
              <!-- High-Contrast Count Badge on Top Right -->
              <div class="absolute -top-2 -right-2 px-1.5 py-0.5 min-w-5 h-5 rounded-full ${
                cluster.isMultiLocation ? "bg-sky-500 ring-2 ring-black/90" : "bg-emerald-500 ring-2 ring-black/90"
              } text-white font-black text-[11px] leading-none flex items-center justify-center shadow-[0_2px_8px_rgba(0,0,0,0.9)] border-2 border-white pointer-events-none">
                ${count}
              </div>
            `
                : ""
            }
          </div>
        `,
        iconSize: [42, 50],
        iconAnchor: [21, 48],
        popupAnchor: [0, -46],
      })

      const marker = L.marker([cluster.latitude, cluster.longitude], { icon: customIcon })

      // Magnetic Micro-Card Float on Hover (Instant Preview Popover)
      const photoDate = topPhoto.takenTime ? formatRelativeTime(topPhoto.takenTime, locale) : ""
      const photoName = topPhoto.name || "Photo"
      const photoTitle = photoName.lastIndexOf('.') > 0 ? photoName.slice(0, photoName.lastIndexOf('.')) : photoName

      marker.bindTooltip(
        `
        <div class="map-hover-card-content text-white text-left select-none pointer-events-none">
          <div class="relative w-full h-24 rounded-lg overflow-hidden bg-neutral-900 mb-1.5 border border-white/10 shadow-inner">
            ${
              imgUrl
                ? `<img src="${imgUrl}" alt="${photoTitle}" onerror="if(this.src&&!this.src.includes('/media/')){this.src=this.src.replace(/^https?:\\/\\/[^\\/]+/, '/media')}" style="width: 100%; height: 100%; object-fit: cover; display: block;" loading="lazy" />`
                : `<div class="w-full h-full flex items-center justify-center text-xs">📷</div>`
            }
            ${
              count > 1
                ? `<div class="absolute bottom-1 right-1 px-1.5 py-0.5 rounded-full bg-black/70 backdrop-blur-md text-[10px] font-bold text-white border border-white/20">✨ ${count} Photos</div>`
                : ""
            }
          </div>
          <div class="text-xs font-bold truncate text-white leading-tight">${photoTitle}</div>
          ${photoDate ? `<div class="text-[10px] text-white/60 mt-0.5">${photoDate}</div>` : ""}
        </div>
      `,
        {
          className: "map-hover-card-tooltip",
          direction: "top",
          offset: [0, -48],
          opacity: 1,
        }
      )

      // Marker click:
      // If multi-location cluster at lower zoom -> cinematic fly-to zoom in and separate pins!
      // If single spot or max zoom -> select spot and cinematic fly-to camera glide!
      marker.on("click", () => {
        if (cluster.isMultiLocation && map.getZoom() < 18) {
          const bounds = L.latLngBounds(cluster.spots.map((s) => [s.latitude, s.longitude]))
          map.flyToBounds(bounds, { padding: [80, 80], maxZoom: 18, duration: 1.4, easeLinearity: 0.25 })
        } else {
          const spotToSelect = cluster.spots[0]
          setSelectedCluster(spotToSelect)
          setActivePhotoIndex(0)
          map.flyTo([spotToSelect.latitude, spotToSelect.longitude], Math.max(map.getZoom(), 16), {
            duration: 1.4,
            easeLinearity: 0.25,
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
  }, [mapReady, geoSpots, selectedCluster?.id, locale])

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

  // Center map on a specific photo from bottom carousel with Cinematic Fly-To Glide
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
          duration: 1.4,
          easeLinearity: 0.25,
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
        !isNaN(changes.longitude) &&
        changes.latitude >= -90 &&
        changes.latitude <= 90 &&
        changes.longitude >= -180 &&
        changes.longitude <= 180
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
  const handleNextPhoto = useCallback(() => {
    if (!selectedCluster || selectedCluster.photos.length <= 1) return
    setActivePhotoIndex((prev) => (prev + 1) % selectedCluster.photos.length)
  }, [selectedCluster])

  const handlePrevPhoto = useCallback(() => {
    if (!selectedCluster || selectedCluster.photos.length <= 1) return
    setActivePhotoIndex((prev) =>
      prev === 0 ? selectedCluster.photos.length - 1 : prev - 1
    )
  }, [selectedCluster])

  // Auto-scroll the thumbnail strip to keep the active photo centered and visible
  useEffect(() => {
    if (!thumbnailStripRef.current) return
    const container = thumbnailStripRef.current
    const activeBtn = container.children[activePhotoIndex] as HTMLElement | undefined
    if (activeBtn) {
      activeBtn.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
        inline: "center",
      })
    }
  }, [activePhotoIndex, selectedCluster])

  // Support keyboard navigation (ArrowLeft / ArrowRight / Escape) when spot card is selected
  useEffect(() => {
    if (!selectedCluster || viewerOpen || editSpotDialogOpen || untaggedDialogOpen || allSpotsDialogOpen) return

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "ArrowRight") {
        e.preventDefault()
        handleNextPhoto()
      } else if (e.key === "ArrowLeft") {
        e.preventDefault()
        handlePrevPhoto()
      } else if (e.key === "Escape") {
        e.preventDefault()
        setSelectedCluster(null)
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [selectedCluster, viewerOpen, editSpotDialogOpen, untaggedDialogOpen, allSpotsDialogOpen, handleNextPhoto, handlePrevPhoto])

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
            {photos.length} photos • {geoSpots.length} spots
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
            title="Switch map style (Google Streets, Satellite, Terrain, Dark Mode)"
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
                  <span>Map Styles & Layers</span>
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

        {/* Admin Manage All Spots Button */}
        {isAdmin && geoSpots.length > 0 && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setAllSpotsDialogOpen(true)}
            className="h-9 px-3 text-xs rounded-2xl backdrop-blur-xl bg-background/80 dark:bg-neutral-900/80 border-border/70 shadow-xl gap-1.5 cursor-pointer hover:scale-105 transition-all text-emerald-600 dark:text-emerald-400 font-semibold"
            title="Open and manage all photo map spots"
          >
            <ListFilter className="size-3.5 text-emerald-500" />
            <span>Manage All Spots ({geoSpots.length})</span>
          </Button>
        )}

        {/* Fit All Photos Button */}
        {photos.length > 0 && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleFitAll}
            className="h-9 px-3 text-xs rounded-2xl backdrop-blur-xl bg-background/80 dark:bg-neutral-900/80 border-border/70 shadow-xl gap-1.5 cursor-pointer hover:scale-105 transition-all"
            title="Fit view to show all mapped photos"
          >
            <LocateFixed className="size-3.5 text-primary" />
            <span className="hidden sm:inline">View All</span>
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
                title="Manage photos missing GPS location coordinates"
              >
                <AlertCircle className="size-3.5 text-amber-500 animate-bounce" />
                <span className="font-bold">{untaggedPhotos.length} Untagged Photos</span>
              </Button>
            ) : (
              <div className="hidden lg:flex items-center gap-1.5 px-3 py-1.5 rounded-2xl backdrop-blur-xl bg-background/80 dark:bg-neutral-900/80 border border-emerald-500/30 text-emerald-500 text-xs font-semibold shadow-xl">
                <CheckCircle2 className="size-3.5" />
                <span>All Photos Geotagged</span>
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
          <span className="hidden sm:inline">{isSidebarOpen ? "Close Panel" : "Open Panel"}</span>
        </Button>
      </div>

      {/* Floating Photo Preview Card (When a marker/spot is clicked) */}
      {selectedCluster && currentPhoto && (
        <div className="absolute top-20 right-4 z-20 w-80 max-w-[calc(100vw-2rem)] rounded-3xl overflow-hidden backdrop-blur-2xl bg-background/90 dark:bg-neutral-900/90 border border-border/80 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
          {/* Main Photo Image with Instant ThumbHash Blur and Eager Thumbnail Loading */}
          {(() => {
            const previewSrc = currentPhoto.thumbnail || currentPhoto.preview || ""
            const placeholder = getThumbHashUrl(currentPhoto.thumbHash)
            const spotKey = `${selectedCluster.latitude.toFixed(5)}_${selectedCluster.longitude.toFixed(5)}`
            const activeCoverId = spotCovers[spotKey] || spotCovers[selectedCluster.id] || selectedCluster.photos[0]?.photoId
            const isCoverPhoto = currentPhoto.photoId === activeCoverId

            return (
              <div
                className="relative aspect-4/3 w-full bg-neutral-950 overflow-hidden group cursor-pointer"
                onClick={() => handleOpenPhotoViewer(selectedCluster.photos, activePhotoIndex)}
                title="Click to open full photo view"
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
                    onError={(e) => {
                      const el = e.currentTarget
                      if (el.src && !el.src.includes('/media/')) {
                        el.src = toProxyMediaUrl(el.src)
                      }
                    }}
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
                  title="Close Preview"
                >
                  <X className="size-4" />
                </button>

                {/* Admin Set Cover Button (When spot has > 1 photo) */}
                {isAdmin && selectedCluster.photos.length > 1 && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      handleSetSpotCover(selectedCluster, currentPhoto)
                    }}
                    className={`absolute top-3 right-11 px-2.5 py-1 rounded-full backdrop-blur-md text-[11px] font-bold shadow-lg transition-all cursor-pointer flex items-center gap-1 z-10 ${
                      isCoverPhoto
                        ? "bg-amber-500 text-black ring-2 ring-amber-300 shadow-amber-500/40"
                        : "bg-black/60 text-white hover:bg-black/80 hover:text-amber-300"
                    }`}
                    title={
                      isCoverPhoto
                        ? "This photo is the active pin cover"
                        : "Set this photo as the map pin cover"
                    }
                  >
                    <Sparkles className={`size-3 ${isCoverPhoto ? "fill-current text-black" : "text-amber-300"}`} />
                    <span>{isCoverPhoto ? "Pin Cover" : "Set as Cover"}</span>
                  </button>
                )}

                {/* Cluster Multi-Photo Badge */}
                {selectedCluster.photos.length > 1 && (
                  <div className="absolute top-3 left-3 px-2.5 py-1 rounded-full bg-emerald-500/90 text-white text-[11px] font-bold shadow-lg backdrop-blur-md flex items-center gap-1.5">
                    <Images className="size-3" />
                    <span>
                      {activePhotoIndex + 1} / {selectedCluster.photos.length} Photos at This Spot
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
                      title="Previous Photo"
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
                      title="Next Photo"
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
            <div
              ref={thumbnailStripRef}
              className="flex items-center gap-1.5 px-3 py-2 bg-muted/40 border-b border-border/50 overflow-x-auto scrollbar-none scroll-smooth"
            >
              {(() => {
                const spotKey = `${selectedCluster.latitude.toFixed(5)}_${selectedCluster.longitude.toFixed(5)}`
                const activeCoverId = spotCovers[spotKey] || spotCovers[selectedCluster.id] || selectedCluster.photos[0]?.photoId

                return selectedCluster.photos.map((p, idx) => {
                  const thumb = p.thumbnail || p.preview || ""
                  const ph = getThumbHashUrl(p.thumbHash)
                  const isCover = p.photoId === activeCoverId

                  return (
                    <button
                      key={p.photoId}
                      onClick={() => setActivePhotoIndex(idx)}
                      className={`relative shrink-0 w-9 h-9 rounded-lg overflow-hidden border-2 transition-all cursor-pointer bg-neutral-900 ${
                        activePhotoIndex === idx
                          ? "border-emerald-500 scale-105 ring-1 ring-emerald-400"
                          : isCover
                          ? "border-amber-400/80 opacity-90 hover:opacity-100"
                          : "border-transparent opacity-60 hover:opacity-100"
                      }`}
                      title={isCover ? `Pin Cover: ${p.name}` : p.name}
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
                        <div className="absolute top-0.5 right-0.5 size-3 rounded-full bg-amber-500 text-black flex items-center justify-center text-[7px] font-black shadow-xs pointer-events-none">
                          ★
                        </div>
                      )}
                    </button>
                  )
                })
              })()}
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
              {isAdmin ? (
                <button
                  type="button"
                  onClick={() => setEditSpotDialogOpen(true)}
                  className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 hover:text-emerald-500 hover:underline flex items-center gap-1 cursor-pointer"
                  title="Edit location coordinates for all photos in this pin"
                >
                  <MapPin className="size-3 text-emerald-500" />
                  <span>Edit Spot ({selectedCluster.photos.length})</span>
                </button>
              ) : (
                <span className="text-[10px] font-semibold text-emerald-500 uppercase tracking-wider">
                  GPS EXIF
                </span>
              )}
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-2 pt-1">
              <Button
                type="button"
                size="sm"
                onClick={() => handleOpenPhotoViewer(selectedCluster.photos, activePhotoIndex)}
                className="flex-1 h-8.5 text-xs rounded-xl gap-1.5 font-semibold bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer shadow-xs"
                title="Open photo in full viewer"
              >
                <Eye className="size-3.5" />
                <span>Open Photo</span>
              </Button>
              {isAdmin && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setEditSpotDialogOpen(true)}
                  className="h-8.5 px-2.5 text-xs rounded-xl gap-1.5 border-emerald-500/40 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10 cursor-pointer"
                  title="Edit GPS location for all photos in this pin"
                >
                  <MapPin className="size-3 text-emerald-500" />
                  <span>Edit Spot</span>
                </Button>
              )}
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
                className="h-8.5 px-2.5 text-xs rounded-xl gap-1.5"
                title="Focus Camera"
              >
                <Expand className="size-3.5" />
                <span>Focus</span>
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Bottom Floating Horizontal Carousel Drawer */}
      {isSidebarOpen && (
        <div className="absolute bottom-4 left-4 right-4 z-10 max-h-52 rounded-3xl backdrop-blur-2xl bg-background/85 dark:bg-neutral-900/85 border border-border/70 p-3 shadow-2xl animate-in slide-in-from-bottom duration-300">
          <div className="flex items-center justify-between pb-2 px-1">
            <div className="flex items-center gap-2">
              {/* Tab Selector: Spots List vs Photos vs Untagged */}
              <button
                type="button"
                onClick={() => setDrawerTab("spots")}
                className={`flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-xl transition-all cursor-pointer ${
                  drawerTab === "spots"
                    ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <MapPin className="size-3.5 text-emerald-500" />
                <span>Spots List ({geoSpots.length})</span>
              </button>

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
                <span>All Photos ({photos.length})</span>
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
                  <span>Untagged ({untaggedPhotos.length})</span>
                </button>
              )}
            </div>

            <div className="flex items-center gap-2">
              {isAdmin && (
                <button
                  type="button"
                  onClick={() => setAllSpotsDialogOpen(true)}
                  className="text-xs text-emerald-600 dark:text-emerald-400 hover:underline font-semibold cursor-pointer hidden sm:inline"
                >
                  Manage All ({geoSpots.length} Spots)
                </button>
              )}
              <button
                onClick={() => setIsSidebarOpen(false)}
                className="text-muted-foreground hover:text-foreground text-xs cursor-pointer p-1"
                title="Close Panel"
              >
                <X className="size-3.5" />
              </button>
            </div>
          </div>

          {/* TAB 1: Spots List (Grouped Physical Locations) */}
          {drawerTab === "spots" && (
            <>
              {geoSpots.length === 0 ? (
                <div className="py-6 text-center text-xs text-muted-foreground">
                  No photo spots yet.
                </div>
              ) : (
                <div className="flex items-center gap-2.5 overflow-x-auto pb-1 scrollbar-thin scrollbar-thumb-muted scrollbar-track-transparent">
                  {geoSpots.map((spot) => {
                    const isSelected = selectedCluster?.id === spot.id
                    const topPhoto = spot.photos[0]
                    const thumb = topPhoto?.thumbnail || topPhoto?.preview || ""
                    const ph = getThumbHashUrl(topPhoto?.thumbHash)
                    return (
                      <div
                        key={spot.id}
                        onClick={() => {
                          setSelectedCluster(spot)
                          setActivePhotoIndex(0)
                          mapInstanceRef.current?.flyTo([spot.latitude, spot.longitude], 17, {
                            duration: 1.4,
                            easeLinearity: 0.25,
                          })
                        }}
                        className={`group relative shrink-0 w-28 h-28 rounded-2xl overflow-hidden cursor-pointer border-2 transition-all duration-200 hover:scale-105 active:scale-95 bg-neutral-900 flex flex-col justify-between p-1.5 ${
                          isSelected
                            ? "border-emerald-500 ring-2 ring-emerald-500/50 shadow-lg"
                            : "border-border/60 hover:border-emerald-500/50"
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
                            alt={topPhoto?.name || ""}
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
                        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent" />

                        {/* Top Badge: Photo count in spot */}
                        <div className="relative z-10 flex items-center justify-between">
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-500 text-white shadow-md flex items-center gap-0.5">
                            <MapPin className="size-2.5" />
                            <span>{spot.photos.length} Photos</span>
                          </span>
                          {isAdmin && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation()
                                setSpotToEdit(spot)
                              }}
                              className="p-1 rounded-md bg-black/60 hover:bg-emerald-600 text-white transition-colors"
                              title="Edit location for this spot"
                            >
                              <MapPin className="size-3" />
                            </button>
                          )}
                        </div>

                        {/* Bottom Label: Coordinates & Photo Name */}
                        <div className="relative z-10 space-y-0.5">
                          <p className="text-[10px] font-bold text-white truncate leading-tight">
                            {topPhoto?.name}
                          </p>
                          <p className="text-[9px] text-white/80 font-mono truncate">
                            {spot.latitude.toFixed(4)}°, {spot.longitude.toFixed(4)}°
                          </p>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </>
          )}

          {/* TAB 2: All Photos List */}
          {drawerTab === "map" && (
            <>
              {photos.length === 0 ? (
                <div className="py-6 text-center text-xs text-muted-foreground">
                  No photos have GPS coordinates yet.
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
                            onError={(e) => {
                              const el = e.currentTarget
                              if (el.src && !el.src.includes('/media/')) {
                                el.src = toProxyMediaUrl(el.src)
                              }
                            }}
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

          {/* TAB 3: Untagged Photos Carousel */}
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
                        onError={(e) => {
                          const el = e.currentTarget
                          if (el.src && !el.src.includes('/media/')) {
                            el.src = toProxyMediaUrl(el.src)
                          }
                        }}
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
                        + Set Location
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Admin All Spots Management Dialog */}
      {isAdmin && (
        <AllSpotsDialog
          open={allSpotsDialogOpen}
          onOpenChange={setAllSpotsDialogOpen}
          spots={geoSpots}
          spotCovers={spotCovers}
          onSelectSpot={(spot) => {
            setSelectedCluster(spot)
            setActivePhotoIndex(0)
            mapInstanceRef.current?.flyTo([spot.latitude, spot.longitude], 17, {
              duration: 1.4,
              easeLinearity: 0.25,
            })
          }}
          onEditSpot={(spot) => {
            setSpotToEdit(spot)
            setAllSpotsDialogOpen(false)
          }}
          onSetSpotCover={handleSetSpotCover}
          onOpenViewer={(photoList, startIdx) => {
            handleOpenPhotoViewer(photoList, startIdx)
          }}
        />
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

      {/* Admin Direct Spot Edit Dialog from All Spots List */}
      {isAdmin && spotToEdit && (
        <PhotoBatchEditDialog
          open={Boolean(spotToEdit)}
          onOpenChange={(next) => {
            if (!next) setSpotToEdit(null)
          }}
          photoIds={spotToEdit.photos.map((p) => p.photoId)}
          initialLatitude={spotToEdit.latitude}
          initialLongitude={spotToEdit.longitude}
          defaultLocationMode="set"
          onSuccess={(ids, changes) => {
            // Update all affected photos in photos state
            setPhotos((prev) =>
              prev.map((p) => (ids.includes(p.photoId) ? { ...p, ...changes } : p))
            )

            // If new coordinates are provided, fly to the new location and update selectedCluster
            if (
              typeof changes.latitude === "number" &&
              typeof changes.longitude === "number" &&
              !isNaN(changes.latitude) &&
              !isNaN(changes.longitude)
            ) {
              const newLat = changes.latitude
              const newLon = changes.longitude

              setSelectedCluster((prev) =>
                prev && ids.some((id) => prev.photos.some((p) => p.photoId === id))
                  ? {
                      ...prev,
                      latitude: newLat,
                      longitude: newLon,
                      photos: prev.photos.map((p) =>
                        ids.includes(p.photoId) ? { ...p, ...changes } : p
                      ),
                    }
                  : prev
              )

              mapInstanceRef.current?.flyTo([newLat, newLon], 16, {
                duration: 1.2,
              })
            }
            setSpotToEdit(null)
          }}
        />
      )}

      {/* Loading Overlay */}
      {loading && (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-background/80 backdrop-blur-md gap-3">
          <Loader2 className="size-8 animate-spin text-emerald-500" />
          <p className="text-sm font-semibold text-foreground">Loading Map & Photo Locations...</p>
        </div>
      )}

      {/* Empty State when no photos have GPS coordinates */}
      {!loading && photos.length === 0 && (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-20 w-96 max-w-[calc(100vw-2rem)] p-6 rounded-3xl backdrop-blur-2xl bg-background/95 dark:bg-neutral-900/95 border border-border/80 shadow-2xl text-center space-y-3">
          <div className="size-12 rounded-2xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center mx-auto">
            <MapPin className="size-6" />
          </div>
          <h3 className="font-bold text-base text-foreground">No Geotagged Photos Yet</h3>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Your uploaded photos do not contain GPS location EXIF metadata yet. You can add coordinates to your photos using the button below.
          </p>
          {isAdmin && untaggedPhotos.length > 0 ? (
            <Button
              type="button"
              size="sm"
              onClick={() => setUntaggedDialogOpen(true)}
              className="rounded-xl mt-2 text-xs bg-emerald-600 hover:bg-emerald-500 text-white font-semibold cursor-pointer"
            >
              Manage {untaggedPhotos.length} Untagged Photos
            </Button>
          ) : (
            <Button asChild size="sm" className="rounded-xl mt-2 text-xs">
              <Link href="/photos">Back to Gallery</Link>
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

      {/* Admin Edit Spot Location Dialog for all photos in the selected pin */}
      {isAdmin && editSpotDialogOpen && selectedCluster && (
        <PhotoBatchEditDialog
          open={editSpotDialogOpen}
          onOpenChange={setEditSpotDialogOpen}
          photoIds={selectedCluster.photos.map((p) => p.photoId)}
          initialLatitude={selectedCluster.latitude}
          initialLongitude={selectedCluster.longitude}
          defaultLocationMode="set"
          onSuccess={(ids, changes) => {
            // Update all affected photos in photos state
            setPhotos((prev) =>
              prev.map((p) => (ids.includes(p.photoId) ? { ...p, ...changes } : p))
            )

            // If new coordinates are provided, fly to the new location and update selectedCluster
            if (
              typeof changes.latitude === "number" &&
              typeof changes.longitude === "number" &&
              !isNaN(changes.latitude) &&
              !isNaN(changes.longitude)
            ) {
              const newLat = changes.latitude
              const newLon = changes.longitude

              setSelectedCluster((prev) =>
                prev
                  ? {
                      ...prev,
                      latitude: newLat,
                      longitude: newLon,
                      photos: prev.photos.map((p) =>
                        ids.includes(p.photoId) ? { ...p, ...changes } : p
                      ),
                    }
                  : null
              )

              mapInstanceRef.current?.flyTo([newLat, newLon], 16, {
                duration: 1.2,
              })
            }
            setEditSpotDialogOpen(false)
          }}
        />
      )}
    </div>
  )
}
