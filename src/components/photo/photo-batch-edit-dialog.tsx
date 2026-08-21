"use client"

import { useState, useEffect } from "react"
import {
  Calendar,
  CheckCircle2,
  Compass,
  Download,
  Eye,
  Heart,
  LoaderCircle,
  LocateFixed,
  MapPin,
  Sparkles,
} from "lucide-react"
import { toast } from "sonner"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { PhotoVisibilityEnum } from "@/server/enums/photo-enum"
import { photoBatchEdit } from "@/request/photo"
import { type PhotoVo } from "@/server/entity/vo/photo"
import { decimalToDms, parseCoordinateString } from "@/lib/geo"

interface PhotoBatchEditDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  photoIds: string[]
  initialLatitude?: number | null
  initialLongitude?: number | null
  defaultLocationMode?: "set" | "unchanged" | "clear"
  onSuccess?: (photoIds: string[], updatedFields: Partial<PhotoVo>) => void
}

export function PhotoBatchEditDialog({
  open,
  onOpenChange,
  photoIds,
  initialLatitude,
  initialLongitude,
  defaultLocationMode,
  onSuccess,
}: PhotoBatchEditDialogProps) {
  // Category state values ('unchanged' means keep existing metadata)
  const [visibility, setVisibility] = useState<string>("unchanged")
  const [allowDownload, setAllowDownload] = useState<string>("unchanged")
  const [favorite, setFavorite] = useState<string>("unchanged")
  const [takenTimeMode, setTakenTimeMode] = useState<string>("unchanged")
  const [takenTimeValue, setTakenTimeValue] = useState<string>(() => {
    const now = new Date()
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset())
    return now.toISOString().slice(0, 16)
  })

  // Location state values
  const [locationMode, setLocationMode] = useState<string>("unchanged")
  const [coordInput, setCoordInput] = useState<string>("")
  const [latitude, setLatitude] = useState<string>("")
  const [longitude, setLongitude] = useState<string>("")
  const [isLocating, setIsLocating] = useState<boolean>(false)

  // Pre-fill coordinates when dialog opens with initial coordinates
  useEffect(() => {
    if (open && typeof initialLatitude === "number" && typeof initialLongitude === "number") {
      queueMicrotask(() => {
        setLocationMode(defaultLocationMode || "set")
        setLatitude(initialLatitude.toString())
        setLongitude(initialLongitude.toString())
        setCoordInput(decimalToDms(initialLatitude, initialLongitude))
      })
    }
  }, [open, initialLatitude, initialLongitude, defaultLocationMode])

  const [loading, setLoading] = useState(false)

  // Calculate modified count
  const isVisModified = visibility !== "unchanged"
  const isDlModified = allowDownload !== "unchanged"
  const isFavModified = favorite !== "unchanged"
  const isDateModified = takenTimeMode !== "unchanged"
  const isLocModified = locationMode !== "unchanged"

  const modifiedCount = [isVisModified, isDlModified, isFavModified, isDateModified, isLocModified].filter(Boolean).length
  const hasChanges = modifiedCount > 0

  // Live parsed coordinate from coordInput
  const parsedCoord = parseCoordinateString(coordInput)

  // Handle DMS or Decimal input change
  const handleCoordInputChange = (val: string) => {
    setCoordInput(val)
    const res = parseCoordinateString(val)
    if (res) {
      setLatitude(res.latitude.toString())
      setLongitude(res.longitude.toString())
    }
  }

  // Handle individual Latitude change
  const handleLatitudeChange = (val: string) => {
    setLatitude(val)
    const latNum = parseFloat(val)
    const lngNum = parseFloat(longitude)
    if (!isNaN(latNum) && !isNaN(lngNum)) {
      setCoordInput(decimalToDms(latNum, lngNum))
    }
  }

  // Handle individual Longitude change
  const handleLongitudeChange = (val: string) => {
    setLongitude(val)
    const latNum = parseFloat(latitude)
    const lngNum = parseFloat(val)
    if (!isNaN(latNum) && !isNaN(lngNum)) {
      setCoordInput(decimalToDms(latNum, lngNum))
    }
  }

  // Reset fields when dialog closes
  const handleOpenChange = (nextOpen: boolean) => {
    onOpenChange(nextOpen)
    if (!nextOpen) {
      setVisibility("unchanged")
      setAllowDownload("unchanged")
      setFavorite("unchanged")
      setTakenTimeMode("unchanged")
      setLocationMode("unchanged")
      setCoordInput("")
      setLatitude("")
      setLongitude("")
      setLoading(false)
    }
  }

  // Get current device GPS location
  const handleGetCurrentLocation = () => {
    if (typeof window === "undefined" || !navigator.geolocation) {
      toast.error("Geolocation is not supported by this browser.")
      return
    }

    setIsLocating(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = Number(pos.coords.latitude.toFixed(6))
        const lng = Number(pos.coords.longitude.toFixed(6))
        setLatitude(lat.toString())
        setLongitude(lng.toString())
        setCoordInput(decimalToDms(lat, lng))
        setIsLocating(false)
        toast.success("Successfully detected device GPS coordinates!")
      },
      (err) => {
        setIsLocating(false)
        toast.error(`Failed to obtain GPS location: ${err.message}`)
      },
      { enableHighAccuracy: true, timeout: 10000 }
    )
  }

  // Handle batch edit submission
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!photoIds.length) return

    if (!hasChanges) {
      toast.warning("Please select at least one metadata category to update.")
      return
    }

    const payload: {
      photoIds: string[]
      visibility?: number | null
      allowDownload?: boolean | null
      takenTime?: string | null
      favorite?: number | null
      latitude?: number | null
      longitude?: number | null
    } = {
      photoIds,
    }

    const clientUpdates: Partial<PhotoVo> = {}

    if (isVisModified) {
      const visNum = Number(visibility)
      payload.visibility = visNum
      clientUpdates.visibility = visNum
    }

    if (isDlModified) {
      const isAllowed = allowDownload === "allow"
      payload.allowDownload = isAllowed
      clientUpdates.allowDownload = isAllowed ? 1 : 0
    }

    if (isFavModified) {
      const favNum = Number(favorite)
      payload.favorite = favNum
      clientUpdates.favorite = favNum
    }

    if (isDateModified) {
      if (takenTimeMode === "clear") {
        payload.takenTime = ""
        clientUpdates.takenTime = null
      } else {
        const iso = new Date(takenTimeValue).toISOString()
        payload.takenTime = iso
        clientUpdates.takenTime = iso
      }
    }

    if (isLocModified) {
      if (locationMode === "clear") {
        payload.latitude = null
        payload.longitude = null
        clientUpdates.latitude = null
        clientUpdates.longitude = null
      } else if (locationMode === "set") {
        let finalLat: number | null = null
        let finalLng: number | null = null

        // Try parsed DMS input first, then manual lat/lng fields
        if (parsedCoord) {
          finalLat = parsedCoord.latitude
          finalLng = parsedCoord.longitude
        } else {
          const parsedFromInput = parseCoordinateString(coordInput)
          if (parsedFromInput) {
            finalLat = parsedFromInput.latitude
            finalLng = parsedFromInput.longitude
          } else {
            const latNum = parseFloat(latitude.trim())
            const lngNum = parseFloat(longitude.trim())
            if (!isNaN(latNum) && !isNaN(lngNum)) {
              finalLat = latNum
              finalLng = lngNum
            }
          }
        }

        if (
          finalLat === null ||
          finalLng === null ||
          isNaN(finalLat) ||
          isNaN(finalLng) ||
          finalLat < -90 ||
          finalLat > 90 ||
          finalLng < -180 ||
          finalLng > 180
        ) {
          toast.error("Invalid coordinates format! Enter DMS format (e.g. 8°20'43.0\"S 116°31'58.9\"E) or decimal format.")
          return
        }

        payload.latitude = finalLat
        payload.longitude = finalLng
        clientUpdates.latitude = finalLat
        clientUpdates.longitude = finalLng
      }
    }

    setLoading(true)
    try {
      await photoBatchEdit(payload)
      toast.success(`Successfully updated metadata for ${photoIds.length} photo(s).`)
      onSuccess?.(photoIds, clientUpdates)
      handleOpenChange(false)
    } catch (err: unknown) {
      console.error("Batch edit failed:", err)
      toast.error("Failed to update photo metadata.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-xl max-h-[90vh] flex flex-col p-6 gap-4">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <Sparkles className="size-5 text-primary" />
            <DialogTitle className="text-lg font-bold">
              Edit Metadata {photoIds.length === 1 ? "Photo" : `Batch (${photoIds.length} Photos)`}
            </DialogTitle>
          </div>
          <DialogDescription className="text-xs text-muted-foreground">
            Select new values for the categories you want to change. Options set to &quot;Keep Current&quot; will preserve original photo metadata.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex-1 min-h-0 overflow-y-auto space-y-3 pr-1 py-1">
          {/* 1. Visibility / Display Scope */}
          <div className="rounded-xl border border-border/80 bg-card p-3.5 space-y-2 shadow-2xs">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <Eye className="size-4 text-primary" />
                <span>1. Visibility & Display Scope</span>
              </div>
              {isVisModified && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
                  Will Change
                </span>
              )}
            </div>
            <Select value={visibility} onValueChange={setVisibility}>
              <SelectTrigger className="w-full text-xs h-9 bg-muted/30">
                <SelectValue placeholder="Select Visibility..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="unchanged" className="text-xs text-muted-foreground">
                  ⚪ — Keep Current (Unchanged) —
                </SelectItem>
                <SelectItem value={String(PhotoVisibilityEnum.BOTH)} className="text-xs">
                  🌐 Show Everywhere (Main Gallery & Albums)
                </SelectItem>
                <SelectItem value={String(PhotoVisibilityEnum.GALLERY_ONLY)} className="text-xs">
                  🖼️ Main Gallery Only
                </SelectItem>
                <SelectItem value={String(PhotoVisibilityEnum.ALBUM_ONLY)} className="text-xs">
                  📁 Album Only
                </SelectItem>
                <SelectItem value={String(PhotoVisibilityEnum.ARCHIVED)} className="text-xs text-amber-500 font-medium">
                  📦 Archive / Hide from Public
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* 2. Public Download Permission */}
          <div className="rounded-xl border border-border/80 bg-card p-3.5 space-y-2 shadow-2xs">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <Download className="size-4 text-primary" />
                <span>2. Public Download Permission</span>
              </div>
              {isDlModified && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
                  Will Change
                </span>
              )}
            </div>
            <Select value={allowDownload} onValueChange={setAllowDownload}>
              <SelectTrigger className="w-full text-xs h-9 bg-muted/30">
                <SelectValue placeholder="Select Download Permission..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="unchanged" className="text-xs text-muted-foreground">
                  ⚪ — Keep Current (Unchanged) —
                </SelectItem>
                <SelectItem value="allow" className="text-xs text-emerald-500 font-medium">
                  ⬇️ Allow Public Download (Original File)
                </SelectItem>
                <SelectItem value="deny" className="text-xs text-rose-500 font-medium">
                  🔒 Protect / Disable Public Download
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* 3. Favorite Status */}
          <div className="rounded-xl border border-border/80 bg-card p-3.5 space-y-2 shadow-2xs">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <Heart className="size-4 text-primary" />
                <span>3. Favorite Status</span>
              </div>
              {isFavModified && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
                  Will Change
                </span>
              )}
            </div>
            <Select value={favorite} onValueChange={setFavorite}>
              <SelectTrigger className="w-full text-xs h-9 bg-muted/30">
                <SelectValue placeholder="Select Favorite Status..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="unchanged" className="text-xs text-muted-foreground">
                  ⚪ — Keep Current (Unchanged) —
                </SelectItem>
                <SelectItem value="1" className="text-xs text-amber-500 font-medium">
                  ⭐ Mark as Favorite (Starred)
                </SelectItem>
                <SelectItem value="0" className="text-xs text-muted-foreground">
                  🤍 Remove from Favorites (Unstar)
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* 4. Date & Time Taken */}
          <div className="rounded-xl border border-border/80 bg-card p-3.5 space-y-2 shadow-2xs">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <Calendar className="size-4 text-primary" />
                <span>4. Date & Time Taken</span>
              </div>
              {isDateModified && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
                  Will Change
                </span>
              )}
            </div>
            <Select value={takenTimeMode} onValueChange={setTakenTimeMode}>
              <SelectTrigger className="w-full text-xs h-9 bg-muted/30">
                <SelectValue placeholder="Select Date Settings..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="unchanged" className="text-xs text-muted-foreground">
                  ⚪ — Keep Current (Unchanged) —
                </SelectItem>
                <SelectItem value="set" className="text-xs">
                  📅 Set New Date & Time
                </SelectItem>
                <SelectItem value="clear" className="text-xs text-destructive">
                  🗑️ Clear / Remove Taken Date
                </SelectItem>
              </SelectContent>
            </Select>

            {takenTimeMode === "set" && (
              <div className="pt-1">
                <Input
                  type="datetime-local"
                  value={takenTimeValue}
                  onChange={(e) => setTakenTimeValue(e.target.value)}
                  className="w-full text-xs h-9 bg-background"
                  required
                />
              </div>
            )}
          </div>

          {/* 5. GPS Location Coordinates (DMS & Decimal Formats) */}
          <div className="rounded-xl border border-border/80 bg-card p-3.5 space-y-2 shadow-2xs">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <MapPin className="size-4 text-emerald-500" />
                <span>5. GPS Coordinates (DMS / Google Maps)</span>
              </div>
              {isLocModified && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-500 border border-emerald-500/30">
                  Will Change
                </span>
              )}
            </div>
            <Select value={locationMode} onValueChange={setLocationMode}>
              <SelectTrigger className="w-full text-xs h-9 bg-muted/30">
                <SelectValue placeholder="Select GPS Location Setting..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="unchanged" className="text-xs text-muted-foreground">
                  ⚪ — Keep Current (Unchanged) —
                </SelectItem>
                <SelectItem value="set" className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                  📍 Set New GPS Coordinates
                </SelectItem>
                <SelectItem value="clear" className="text-xs text-destructive font-medium">
                  🗑️ Clear / Remove GPS Location
                </SelectItem>
              </SelectContent>
            </Select>

            {locationMode === "set" && (
              <div className="space-y-3 pt-1.5 animate-in fade-in-50 duration-200">
                {/* Unified DMS / Google Maps Coordinate String Input */}
                <div className="space-y-1">
                  <label className="text-[11px] font-medium text-foreground flex items-center justify-between">
                    <span className="flex items-center gap-1">
                      <Compass className="size-3 text-emerald-500" />
                      <span>Paste / Type Coordinates (DMS Format):</span>
                    </span>
                    <span className="text-[10px] text-muted-foreground font-mono">
                      e.g. 8°20&apos;43.0&quot;S 116°31&apos;58.9&quot;E
                    </span>
                  </label>
                  <Input
                    type="text"
                    placeholder={`8°20'43.0"S 116°31'58.9"E or -8.345278, 116.533028`}
                    value={coordInput}
                    onChange={(e) => handleCoordInputChange(e.target.value)}
                    className="text-xs h-9 bg-background font-mono"
                  />
                </div>

                {/* Parsed Coordinate Confirmation Card */}
                {parsedCoord && (
                  <div className="flex items-center justify-between p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/25 text-xs text-emerald-700 dark:text-emerald-300">
                    <div className="flex items-center gap-2 truncate">
                      <CheckCircle2 className="size-4 text-emerald-500 shrink-0" />
                      <div className="space-y-0.5 truncate">
                        <p className="font-semibold text-[11px] truncate">
                          {parsedCoord.dmsString}
                        </p>
                        <p className="text-[10px] text-muted-foreground font-mono">
                          Decimal: {parsedCoord.latitude}°, {parsedCoord.longitude}°
                        </p>
                      </div>
                    </div>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 shrink-0">
                      Valid
                    </span>
                  </div>
                )}

                {/* Direct Latitude & Longitude decimal values */}
                <div className="grid grid-cols-2 gap-2 pt-0.5">
                  <div className="space-y-1">
                    <label className="text-[11px] font-medium text-muted-foreground flex items-center gap-1">
                      <span>Latitude (Decimal)</span>
                    </label>
                    <Input
                      type="number"
                      step="any"
                      placeholder="-8.345278"
                      value={latitude}
                      onChange={(e) => handleLatitudeChange(e.target.value)}
                      className="text-xs h-8.5 bg-background font-mono"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] font-medium text-muted-foreground flex items-center gap-1">
                      <span>Longitude (Decimal)</span>
                    </label>
                    <Input
                      type="number"
                      step="any"
                      placeholder="116.533028"
                      value={longitude}
                      onChange={(e) => handleLongitudeChange(e.target.value)}
                      className="text-xs h-8.5 bg-background font-mono"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between pt-1">
                  <span className="text-[10px] text-muted-foreground">
                    Photos will automatically appear on the Interactive Map (/map).
                  </span>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={handleGetCurrentLocation}
                    disabled={isLocating}
                    className="h-7 text-[11px] gap-1 px-2.5 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20 border border-emerald-500/20 cursor-pointer"
                  >
                    {isLocating ? (
                      <LoaderCircle className="size-3 animate-spin" />
                    ) : (
                      <LocateFixed className="size-3" />
                    )}
                    <span>Use Device GPS</span>
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* Clean Single Footer Actions */}
          <DialogFooter className="flex-row items-center justify-end gap-2 pt-3 border-t border-border/60">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => handleOpenChange(false)}
              disabled={loading}
              className="text-xs h-9"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={loading || !hasChanges}
              className="text-xs h-9 px-4 gap-1.5 font-semibold cursor-pointer"
            >
              {loading && <LoaderCircle className="size-3.5 animate-spin" />}
              <span>
                {hasChanges
                  ? `Apply Changes (${modifiedCount} Categories)`
                  : "Select Categories to Change"}
              </span>
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
