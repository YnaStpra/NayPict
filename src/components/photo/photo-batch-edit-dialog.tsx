"use client"

import { useState, useEffect } from "react"
import {
  Ban,
  Calendar,
  CheckCircle2,
  Compass,
  Download,
  Eye,
  FileText,
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
  defaultLocationMode?: "set" | "unchanged" | "clear" | "ignore"
  initialName?: string | null
  onSuccess?: (photoIds: string[], updatedFields: Partial<PhotoVo>) => void
}

export function PhotoBatchEditDialog({
  open,
  onOpenChange,
  photoIds,
  initialLatitude,
  initialLongitude,
  defaultLocationMode,
  initialName,
  onSuccess,
}: PhotoBatchEditDialogProps) {
  // Category state values ('unchanged' means keep existing metadata)
  const [visibility, setVisibility] = useState<string>("unchanged")
  const [allowDownload, setAllowDownload] = useState<string>("unchanged")
  const [takenTimeMode, setTakenTimeMode] = useState<string>("unchanged")
  const [takenTimeValue, setTakenTimeValue] = useState<string>(() => {
    const now = new Date()
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset())
    return now.toISOString().slice(0, 16)
  })

  // File name state values
  const [nameMode, setNameMode] = useState<string>("unchanged")
  const [nameInput, setNameInput] = useState<string>("")
  const [findText, setFindText] = useState<string>("")
  const [replaceText, setReplaceText] = useState<string>("")

  // Location state values
  const [locationMode, setLocationMode] = useState<string>(defaultLocationMode || "unchanged")
  const [coordInput, setCoordInput] = useState<string>("")
  const [latitude, setLatitude] = useState<string>("")
  const [longitude, setLongitude] = useState<string>("")
  const [isLocating, setIsLocating] = useState<boolean>(false)

  // Pre-fill coordinates and file name when dialog opens
  useEffect(() => {
    if (open) {
      if (initialName && photoIds.length === 1) {
        setNameInput(initialName)
      } else {
        setNameInput("")
      }
      setNameMode("unchanged")
      setFindText("")
      setReplaceText("")

      if (typeof initialLatitude === "number" && typeof initialLongitude === "number") {
        queueMicrotask(() => {
          setLocationMode(defaultLocationMode || "set")
          setLatitude(initialLatitude.toString())
          setLongitude(initialLongitude.toString())
          setCoordInput(decimalToDms(initialLatitude, initialLongitude))
        })
      } else if (defaultLocationMode) {
        setLocationMode(defaultLocationMode)
      }
    }
  }, [open, initialLatitude, initialLongitude, defaultLocationMode, initialName, photoIds.length])

  const [loading, setLoading] = useState(false)

  // Calculate modified count
  const isVisModified = visibility !== "unchanged"
  const isDlModified = allowDownload !== "unchanged"
  const isDateModified = takenTimeMode !== "unchanged"
  const isLocModified = locationMode !== "unchanged"
  const isNameModified =
    nameMode !== "unchanged" &&
    ((nameMode === "set" && nameInput.trim().length > 0) ||
      (nameMode === "prefix" && nameInput.trim().length > 0) ||
      (nameMode === "suffix" && nameInput.trim().length > 0) ||
      (nameMode === "replace" && findText.trim().length > 0))

  const modifiedCount = [
    isVisModified,
    isDlModified,
    isDateModified,
    isLocModified,
    isNameModified,
  ].filter(Boolean).length
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

  // Reset internal state when dialog closes
  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      setVisibility("unchanged")
      setAllowDownload("unchanged")
      setTakenTimeMode("unchanged")
      setLocationMode("unchanged")
      setNameMode("unchanged")
      setNameInput("")
      setFindText("")
      setReplaceText("")
      setCoordInput("")
      setLatitude("")
      setLongitude("")
    }
    onOpenChange(nextOpen)
  }

  // Get current device GPS location
  const handleGetCurrentLocation = () => {
    if (!navigator.geolocation) {
      toast.error("Geolocation is not supported by your browser.")
      return
    }

    setIsLocating(true)
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setIsLocating(false)
        const lat = position.coords.latitude
        const lng = position.coords.longitude
        setLatitude(lat.toString())
        setLongitude(lng.toString())
        setCoordInput(decimalToDms(lat, lng))
        toast.success("Device GPS coordinates captured successfully!")
      },
      (error) => {
        setIsLocating(false)
        toast.error(`Could not retrieve location: ${error.message}`)
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    )
  }

  // Handle batch edit submission
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!hasChanges) {
      toast.info("No changes were selected.")
      return
    }

    const payload: {
      photoIds: string[]
      visibility?: number
      allowDownload?: boolean
      takenTime?: string
      latitude?: number | null
      longitude?: number | null
      name?: string
      nameMode?: 'set' | 'prefix' | 'suffix' | 'replace'
      findText?: string
      replaceText?: string
    } = { photoIds }

    const clientUpdates: Partial<PhotoVo & { isLocationIgnored: boolean }> = {}

    if (isVisModified) {
      const visNum = Number(visibility)
      payload.visibility = visNum
      clientUpdates.visibility = visNum
    }

    if (isDlModified) {
      const dlBool = allowDownload === "true"
      payload.allowDownload = dlBool
      clientUpdates.allowDownload = dlBool ? 1 : 0
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

    if (isNameModified) {
      payload.nameMode = nameMode as any
      payload.name = nameInput.trim()
      payload.findText = findText
      payload.replaceText = replaceText
      if (photoIds.length === 1 && nameMode === "set") {
        clientUpdates.name = nameInput.trim()
      }
    }

    if (isLocModified) {
      if (locationMode === "clear") {
        payload.latitude = null
        payload.longitude = null
        clientUpdates.latitude = null
        clientUpdates.longitude = null
        clientUpdates.isLocationIgnored = false
      } else if (locationMode === "ignore") {
        payload.latitude = 999
        payload.longitude = 999
        clientUpdates.latitude = null
        clientUpdates.longitude = null
        clientUpdates.isLocationIgnored = true
      } else if (locationMode === "set") {
        let finalLat: number | null = null
        let finalLng: number | null = null

        // Try parsed DMS input first, then manual lat/lng fields
        if (parsedCoord) {
          finalLat = parsedCoord.latitude
          finalLng = parsedCoord.longitude
        } else {
          const latNum = parseFloat(latitude.trim())
          const lngNum = parseFloat(longitude.trim())
          if (!isNaN(latNum) && !isNaN(lngNum)) {
            finalLat = latNum
            finalLng = lngNum
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
        clientUpdates.isLocationIgnored = false
      }
    }

    setLoading(true)
    try {
      await photoBatchEdit(payload as any)
      toast.success(`Successfully updated metadata for ${photoIds.length} photo(s).`)
      onSuccess?.(photoIds, clientUpdates)
      handleOpenChange(false)
    } catch (err: any) {
      toast.error(err.message || "Failed to update metadata.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] flex flex-col p-6 gap-4">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-primary/10 text-primary">
              <Sparkles className="size-5" />
            </div>
            <div>
              <DialogTitle className="text-lg font-bold flex items-center gap-2">
                <span>Batch Edit Photo Metadata</span>
                <span className="px-2 py-0.5 text-xs font-bold rounded-full bg-primary/15 text-primary border border-primary/30">
                  {photoIds.length} Selected
                </span>
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                Update metadata for all selected photos simultaneously.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <form id="batch-edit-form" onSubmit={handleSubmit} className="flex-1 min-h-0 overflow-y-auto pr-1 space-y-4">
          {/* 1. Visibility & Scope */}
          <div className="rounded-xl border border-border/80 bg-card p-3.5 space-y-2 shadow-2xs">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <Eye className="size-4 text-primary" />
                <span>1. Visibility & Scope</span>
              </div>
              {isVisModified && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-primary/15 text-primary border border-primary/30">
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
                <SelectItem value={PhotoVisibilityEnum.BOTH.toString()} className="text-xs">
                  🌐 Both Gallery & Albums (Public)
                </SelectItem>
                <SelectItem value={PhotoVisibilityEnum.GALLERY_ONLY.toString()} className="text-xs">
                  🖼️ Gallery Only (Hidden from Albums)
                </SelectItem>
                <SelectItem value={PhotoVisibilityEnum.ALBUM_ONLY.toString()} className="text-xs">
                  📁 Album Only (Hidden from Main Masonry)
                </SelectItem>
                <SelectItem value={PhotoVisibilityEnum.ARCHIVED.toString()} className="text-xs">
                  📦 Archived (Admin Only / Hidden Everywhere)
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* 2. Download Permission */}
          <div className="rounded-xl border border-border/80 bg-card p-3.5 space-y-2 shadow-2xs">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <Download className="size-4 text-blue-500" />
                <span>2. Public Download Permission</span>
              </div>
              {isDlModified && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-500 border border-blue-500/30">
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
                <SelectItem value="true" className="text-xs">
                  ✅ Allowed (Guests can download original)
                </SelectItem>
                <SelectItem value="false" className="text-xs">
                  🔒 Protected (Guests cannot download)
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* 3. Taken Date & Time */}
          <div className="rounded-xl border border-border/80 bg-card p-3.5 space-y-2 shadow-2xs">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <Calendar className="size-4 text-amber-500" />
                <span>3. Taken Date & Time</span>
              </div>
              {isDateModified && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-500 border border-amber-500/30">
                  Will Change
                </span>
              )}
            </div>
            <Select value={takenTimeMode} onValueChange={setTakenTimeMode}>
              <SelectTrigger className="w-full text-xs h-9 bg-muted/30">
                <SelectValue placeholder="Select Date Setting..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="unchanged" className="text-xs text-muted-foreground">
                  ⚪ — Keep Current (Unchanged) —
                </SelectItem>
                <SelectItem value="set" className="text-xs">
                  📅 Set Specific Date & Time
                </SelectItem>
                <SelectItem value="clear" className="text-xs text-destructive">
                  🗑️ Clear / Reset Taken Time
                </SelectItem>
              </SelectContent>
            </Select>

            {takenTimeMode === "set" && (
              <div className="pt-1.5 animate-in fade-in-50 duration-200">
                <Input
                  type="datetime-local"
                  value={takenTimeValue}
                  onChange={(e) => setTakenTimeValue(e.target.value)}
                  className="w-full text-xs h-9 bg-background"
                />
              </div>
            )}
          </div>

          {/* 4. GPS Location */}
          <div className="rounded-xl border border-border/80 bg-card p-3.5 space-y-2 shadow-2xs">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <MapPin className="size-4 text-emerald-500" />
                <span>4. GPS Coordinates</span>
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
                <SelectItem value="ignore" className="text-xs text-amber-600 dark:text-amber-400 font-medium">
                  🚫 Ignore Location (No GPS Needed)
                </SelectItem>
                <SelectItem value="clear" className="text-xs text-destructive font-medium">
                  🗑️ Clear / Reset GPS Location
                </SelectItem>
              </SelectContent>
            </Select>

            {locationMode === "ignore" && (
              <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/25 text-xs text-amber-700 dark:text-amber-300 space-y-1 animate-in fade-in-50 duration-200">
                <div className="flex items-center gap-1.5 font-semibold">
                  <Ban className="size-3.5 text-amber-500 shrink-0" />
                  <span>Mark as Intentionally Without Location</span>
                </div>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  These photos will be ignored from geotagging. They will not appear on the map and will not be detected or listed in the untagged photos queue.
                </p>
              </div>
            )}

            {locationMode === "set" && (
              <div className="space-y-3 pt-1.5 animate-in fade-in-50 duration-200">
                <div className="space-y-1">
                  <label className="text-[11px] font-medium text-foreground flex items-center justify-between">
                    <span className="flex items-center gap-1">
                      <Compass className="size-3 text-emerald-500" />
                      <span>Paste Coordinates (DMS or Decimal):</span>
                    </span>
                  </label>
                  <Input
                    type="text"
                    placeholder={`8°20'43.0"S 116°31'58.9"E or -8.34, 116.53`}
                    value={coordInput}
                    onChange={(e) => handleCoordInputChange(e.target.value)}
                    className="text-xs h-9 bg-background font-mono"
                  />
                </div>

                {parsedCoord && (
                  <div className="flex items-center justify-between p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/25 text-xs text-emerald-700 dark:text-emerald-300">
                    <div className="flex items-center gap-2 truncate">
                      <CheckCircle2 className="size-4 text-emerald-500 shrink-0" />
                      <div className="space-y-0.5 truncate">
                        <p className="font-semibold text-[11px] truncate">
                          {parsedCoord.dmsString}
                        </p>
                      </div>
                    </div>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 shrink-0">
                      Valid
                    </span>
                  </div>
                )}

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

          {/* 5. Photo File Name */}
          <div className="rounded-xl border border-border/80 bg-card p-3.5 space-y-2 shadow-2xs">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <FileText className="size-4 text-purple-500" />
                <span>5. Photo File Name</span>
              </div>
              {isNameModified && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-500/15 text-purple-500 border border-purple-500/30">
                  Will Change
                </span>
              )}
            </div>

            <Select value={nameMode} onValueChange={setNameMode}>
              <SelectTrigger className="w-full text-xs h-9 bg-muted/30">
                <SelectValue placeholder="Select Rename Action..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="unchanged" className="text-xs text-muted-foreground">
                  ⚪ — Keep Current (Unchanged) —
                </SelectItem>
                <SelectItem value="set" className="text-xs text-purple-600 dark:text-purple-400 font-medium">
                  ✏️ {photoIds.length === 1 ? "Set New File Name" : "Set New Name (with Auto-Numbering)"}
                </SelectItem>
                <SelectItem value="prefix" className="text-xs">
                  ➕ Add Prefix (e.g. Vacation_)
                </SelectItem>
                <SelectItem value="suffix" className="text-xs">
                  ➕ Add Suffix (e.g. _edited)
                </SelectItem>
                <SelectItem value="replace" className="text-xs">
                  🔄 Find & Replace Text
                </SelectItem>
              </SelectContent>
            </Select>

            {/* Mode: Set */}
            {nameMode === "set" && (
              <div className="pt-1.5 space-y-1.5 animate-in fade-in-50 duration-200">
                <Input
                  type="text"
                  placeholder={photoIds.length === 1 ? "e.g. Sunset_at_Lombok" : "e.g. Trip_Bali_{n} or Bali_Photo"}
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  className="w-full text-xs h-9 bg-background"
                />
                {photoIds.length > 1 && (
                  <p className="text-[11px] text-muted-foreground leading-tight">
                    💡 Tip: Use <code className="bg-muted px-1 py-0.5 rounded text-foreground font-mono">{"{n}"}</code> for sequence numbers (e.g. <span className="text-foreground font-medium">Trip_{"{n}"}</span> becomes Trip_1, Trip_2...).
                  </p>
                )}
              </div>
            )}

            {/* Mode: Prefix */}
            {nameMode === "prefix" && (
              <div className="pt-1.5 space-y-1.5 animate-in fade-in-50 duration-200">
                <Input
                  type="text"
                  placeholder="e.g. 2025_ or Summer_"
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  className="w-full text-xs h-9 bg-background"
                />
                <p className="text-[11px] text-muted-foreground">
                  Adds this prefix to the beginning of each file name.
                </p>
              </div>
            )}

            {/* Mode: Suffix */}
            {nameMode === "suffix" && (
              <div className="pt-1.5 space-y-1.5 animate-in fade-in-50 duration-200">
                <Input
                  type="text"
                  placeholder="e.g. _compressed or _HD"
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  className="w-full text-xs h-9 bg-background"
                />
                <p className="text-[11px] text-muted-foreground">
                  Inserts this suffix at the end of each file name before the extension.
                </p>
              </div>
            )}

            {/* Mode: Find & Replace */}
            {nameMode === "replace" && (
              <div className="pt-1.5 space-y-2 animate-in fade-in-50 duration-200">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] text-muted-foreground font-medium">Find Text</label>
                    <Input
                      type="text"
                      placeholder="e.g. DSC_"
                      value={findText}
                      onChange={(e) => setFindText(e.target.value)}
                      className="w-full text-xs h-9 bg-background mt-0.5"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-muted-foreground font-medium">Replace With</label>
                    <Input
                      type="text"
                      placeholder="e.g. Photo_"
                      value={replaceText}
                      onChange={(e) => setReplaceText(e.target.value)}
                      className="w-full text-xs h-9 bg-background mt-0.5"
                    />
                  </div>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Replaces matching text across all selected photo names.
                </p>
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
