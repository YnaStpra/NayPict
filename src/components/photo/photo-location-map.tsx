"use client"

import { useEffect, useState, useMemo } from "react"
import { getReverseGeocode, type LocationReverseVo } from "@/request/location"
import { ExternalLink, MapPin } from "lucide-react"

// This component renders a Google Maps preview card with a photo thumbnail pin and full reverse-geocoded address.

interface PhotoLocationMapProps {
  latitude: number | null | undefined
  longitude: number | null | undefined
  altitude?: number | null | undefined
  thumbnail?: string | null
  preview?: string | null
  photoName?: string
  className?: string
}

// Convert GPS coordinates and zoom level to Web Mercator tile coordinates and pixel offsets.
function getMapTilePositions(lat: number, lng: number, zoom = 15, containerWidth = 320, containerHeight = 130) {
  const tileSize = 256
  const scale = Math.pow(2, zoom)

  // World coordinates
  const worldX = ((lng + 180) / 360) * scale * tileSize
  const latRad = (lat * Math.PI) / 180
  const worldY = ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * scale * tileSize

  // Center tile
  const centerTileX = Math.floor(worldX / tileSize)
  const centerTileY = Math.floor(worldY / tileSize)

  // Pixel offset of center relative to center tile top-left
  const offsetX = worldX - centerTileX * tileSize
  const offsetY = worldY - centerTileY * tileSize

  // Generate 3x3 surrounding tiles
  const tiles: { key: string; url: string; left: number; top: number }[] = []
  const maxTile = Math.pow(2, zoom) - 1

  const originX = containerWidth / 2 - offsetX
  const originY = containerHeight / 2 - offsetY

  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      const tileX = (centerTileX + dx + maxTile + 1) % (maxTile + 1)
      const tileY = Math.max(0, Math.min(maxTile, centerTileY + dy))
      
      // CartoDB Voyager tiles offer crisp, clean Google Maps-style light aesthetics
      const subdomains = ['a', 'b', 'c', 'd']
      const s = subdomains[Math.abs(tileX + tileY) % subdomains.length]
      const url = `https://${s}.basemaps.cartocdn.com/rastertiles/voyager/${zoom}/${tileX}/${tileY}@2x.png`

      tiles.push({
        key: `${tileX}-${tileY}`,
        url,
        left: originX + dx * tileSize,
        top: originY + dy * tileSize,
      })
    }
  }

  return tiles
}

export function PhotoLocationMap({
  latitude,
  longitude,
  thumbnail,
  preview,
  photoName,
  className = "",
}: PhotoLocationMapProps) {
  const [locationData, setLocationData] = useState<LocationReverseVo | null>(null)
  const latNum = latitude != null ? Number(latitude) : NaN
  const lngNum = longitude != null ? Number(longitude) : NaN
  const hasCoords = !isNaN(latNum) && !isNaN(lngNum) && isFinite(latNum) && isFinite(lngNum)
  const [loading, setLoading] = useState(hasCoords)

  useEffect(() => {
    if (!hasCoords) {
      return
    }

    let isMounted = true

    getReverseGeocode(latNum, lngNum)
      .then((res) => {
        if (isMounted) {
          setLocationData(res)
        }
      })
      .finally(() => {
        if (isMounted) {
          setLoading(false)
        }
      })

    return () => {
      isMounted = false
    }
  }, [latNum, lngNum, hasCoords])

  const tiles = useMemo(() => {
    if (!hasCoords) return []
    return getMapTilePositions(latNum, lngNum, 15, 340, 130)
  }, [latNum, lngNum, hasCoords])

  // If no GPS coordinates exist, hide the entire map & location block
  if (!hasCoords) {
    return null
  }

  const mapsUrl = `https://www.google.com/maps?q=${latNum},${lngNum}`
  const imageSrc = thumbnail || preview || ""

  const handleOpenGoogleMaps = () => {
    if (typeof window !== "undefined") {
      window.open(mapsUrl, "_blank", "noopener,noreferrer")
    }
  }

  return (
    <div
      onClick={handleOpenGoogleMaps}
      className={`group relative overflow-hidden rounded-xl border border-white/15 bg-zinc-900/90 shadow-md cursor-pointer transition-all duration-200 hover:border-white/30 hover:shadow-lg ${className}`}
      title="Open location in Google Maps"
    >
      {/* Top Map View */}
      <div className="relative h-32 w-full overflow-hidden bg-[#e5e3df]">
        {/* Render Map Tiles */}
        <div className="absolute inset-0 pointer-events-none select-none">
          {tiles.map((tile) => (
            <img
              key={tile.key}
              src={tile.url}
              alt=""
              draggable={false}
              className="absolute size-[256px] select-none object-cover"
              style={{
                left: `${tile.left}px`,
                top: `${tile.top}px`,
              }}
              onError={(e) => {
                // Fallback to OpenStreetMap standard tiles if CartoDB fails
                const img = e.currentTarget
                if (!img.src.includes('openstreetmap')) {
                  const parts = tile.key.split('-')
                  img.src = `https://tile.openstreetmap.org/15/${parts[0]}/${parts[1]}.png`
                }
              }}
            />
          ))}
        </div>

        {/* Center Custom Photo Pin Marker */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-[62%] flex flex-col items-center pointer-events-none z-10 filter drop-shadow-md transition-transform duration-200 group-hover:scale-105">
          {/* Photo Bubble */}
          <div className="size-12 rounded-xl border-2 border-white bg-white shadow-md overflow-hidden flex items-center justify-center">
            {imageSrc ? (
              <img
                src={imageSrc}
                alt={photoName || "Photo location"}
                className="size-full object-cover"
              />
            ) : (
              <div className="size-full bg-primary/20 flex items-center justify-center text-primary">
                <MapPin className="size-5" />
              </div>
            )}
          </div>
          {/* Pin Beak Triangle */}
          <div className="w-0 h-0 border-x-[5px] border-x-transparent border-t-[6px] border-t-white -mt-0.5" />
        </div>

        {/* Google Logo Watermark (bottom-left) */}
        <div className="absolute bottom-1.5 left-2 z-10 pointer-events-none flex items-center gap-1 select-none">
          <svg className="h-4 w-auto" viewBox="0 0 272 92" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M115.8 45.4c0 14.1-10.8 24.3-24.1 24.3-13.3 0-24.1-10.2-24.1-24.3 0-14.3 10.8-24.3 24.1-24.3 13.3 0 24.1 10 24.1 24.3zm-10.5 0c0-9.2-6.7-15.5-13.6-15.5-6.9 0-13.6 6.3-13.6 15.5 0 9 6.7 15.5 13.6 15.5 6.9 0 13.6-6.5 13.6-15.5z" fill="#EA4335"/>
            <path d="M168.1 45.4c0 14.1-10.8 24.3-24.1 24.3-13.3 0-24.1-10.2-24.1-24.3 0-14.3 10.8-24.3 24.1-24.3 13.3 0 24.1 10 24.1 24.3zm-10.5 0c0-9.2-6.7-15.5-13.6-15.5-6.9 0-13.6 6.3-13.6 15.5 0 9 6.7 15.5 13.6 15.5 6.9 0 13.6-6.5 13.6-15.5z" fill="#FBBC05"/>
            <path d="M217.7 22.5v44.6c0 18.3-10.8 25.8-23.6 25.8-12 0-19.3-8.1-22-14.6l9.2-3.8c1.6 3.9 5.6 8.4 12.8 8.4 8.3 0 13.5-5.2 13.5-14.8v-3.6h-.4c-2.5 3.1-7.2 5.8-13.2 5.8-12.6 0-24.1-11-24.1-25.2 0-14.4 11.5-25.3 24.1-25.3 6 0 10.7 2.7 13.2 5.7h.4v-4.4h10.1zm-9.3 23c0-9.1-5.6-15.6-12.9-15.6-7.2 0-12.9 6.5-12.9 15.6 0 8.9 5.7 15.4 12.9 15.4 7.3 0 12.9-6.5 12.9-15.4z" fill="#4285F4"/>
            <path d="M233.9 3.5h10.5v66.2h-10.5z" fill="#34A853"/>
            <path d="M266.3 53.6l8.4 5.6c-2.7 4-9.3 10.5-20.7 10.5-14.1 0-24.6-10.9-24.6-24.3 0-14.6 10.6-24.3 23.4-24.3 12.9 0 19.3 9.9 21.4 15.5l1.1 2.9-33.5 13.9c2.6 5.1 6.6 7.7 12.3 7.7 5.7 0 9.5-2.8 12.2-7.5zm-26-9.1l22.4-9.3c-1.2-2.1-3.9-3.5-6.9-3.5-8.4 0-12.7 7.5-15.5 12.8z" fill="#EA4335"/>
            <path d="M37.3 43.1v10.1h24.2c-.7 5.6-2.6 9.7-5.5 12.6-3.5 3.5-9 7.3-18.7 7.3-14.9 0-26.6-12.1-26.6-27.1s11.7-27.1 26.6-27.1c8.1 0 13.9 3.2 18.3 7.3l7.1-7.1C56.5 13.3 48.5 8.7 37.3 8.7 17.1 8.7 0 25.8 0 46s17.1 37.3 37.3 37.3c10.9 0 19.2-3.6 25.8-10.5 6.8-6.8 9-16.3 9-24 0-2.3-.2-4.5-.6-5.7H37.3z" fill="#4285F4"/>
          </svg>
        </div>

        {/* Hover External Link Badge (top-right) */}
        <div className="absolute top-2 right-2 z-10 flex items-center gap-1 rounded-md bg-black/60 backdrop-blur-md px-1.5 py-0.5 text-[10px] font-medium text-white/90 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
          <span>Open Maps</span>
          <ExternalLink className="size-2.5" />
        </div>
      </div>

      {/* Bottom Address Bar */}
      <div className="p-3 bg-black/75 backdrop-blur-md border-t border-white/10 text-left space-y-1.5">
        {loading && !locationData ? (
          <div className="space-y-1 animate-pulse">
            <div className="h-3 w-3/4 rounded bg-white/20" />
            <div className="h-2.5 w-1/2 rounded bg-white/15" />
          </div>
        ) : (
          <p className="text-xs text-white/90 leading-relaxed line-clamp-2 font-normal">
            {locationData?.address || `${latNum.toFixed(4)}°, ${lngNum.toFixed(4)}°`}
          </p>
        )}
        <div className="flex items-center justify-between pt-1 border-t border-white/10 text-[10px] text-white/60">
          <span className="font-mono">
            {latNum.toFixed(4)}°, {lngNum.toFixed(4)}°
          </span>
          <span className="text-emerald-400 group-hover:underline flex items-center gap-1">
            <span>Buka di Google Maps</span>
            <ExternalLink className="size-2.5" />
          </span>
        </div>
      </div>
    </div>
  )
}
