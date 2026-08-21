"use client"

import { useState } from "react"
import { Calendar, Compass, Download, Eye, Heart, LoaderCircle, LocateFixed, MapPin, Sparkles } from "lucide-react"
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

interface PhotoBatchEditDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  photoIds: string[]
  onSuccess?: (photoIds: string[], updatedFields: Partial<PhotoVo>) => void
}

export function PhotoBatchEditDialog({
  open,
  onOpenChange,
  photoIds,
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
  const [latitude, setLatitude] = useState<string>("")
  const [longitude, setLongitude] = useState<string>("")
  const [isLocating, setIsLocating] = useState<boolean>(false)

  const [loading, setLoading] = useState(false)

  // Calculate modified count
  const isVisModified = visibility !== "unchanged"
  const isDlModified = allowDownload !== "unchanged"
  const isFavModified = favorite !== "unchanged"
  const isDateModified = takenTimeMode !== "unchanged"
  const isLocModified = locationMode !== "unchanged"

  const modifiedCount = [isVisModified, isDlModified, isFavModified, isDateModified, isLocModified].filter(Boolean).length
  const hasChanges = modifiedCount > 0

  // Reset fields when dialog closes
  const handleOpenChange = (nextOpen: boolean) => {
    onOpenChange(nextOpen)
    if (!nextOpen) {
      setVisibility("unchanged")
      setAllowDownload("unchanged")
      setFavorite("unchanged")
      setTakenTimeMode("unchanged")
      setLocationMode("unchanged")
      setLatitude("")
      setLongitude("")
      setLoading(false)
    }
  }

  // Get current device GPS location
  const handleGetCurrentLocation = () => {
    if (typeof window === "undefined" || !navigator.geolocation) {
      toast.error("Geolokasi tidak didukung oleh peramban ini.")
      return
    }

    setIsLocating(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLatitude(pos.coords.latitude.toFixed(6))
        setLongitude(pos.coords.longitude.toFixed(6))
        setIsLocating(false)
        toast.success("Berhasil mendeteksi koordinat GPS perangkat!")
      },
      (err) => {
        setIsLocating(false)
        toast.error(`Gagal mendapatkan lokasi GPS: ${err.message}`)
      },
      { enableHighAccuracy: true, timeout: 10000 }
    )
  }

  // Handle batch edit submission
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!photoIds.length) return

    if (!hasChanges) {
      toast.warning("Silakan pilih setidaknya satu kategori metadata untuk diubah.")
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
        const latNum = parseFloat(latitude.trim())
        const lngNum = parseFloat(longitude.trim())

        if (isNaN(latNum) || isNaN(lngNum) || latNum < -90 || latNum > 90 || lngNum < -180 || lngNum > 180) {
          toast.error("Koordinat GPS tidak valid! Latitude harus (-90 s/d 90) dan Longitude (-180 s/d 180).")
          return
        }

        payload.latitude = latNum
        payload.longitude = lngNum
        clientUpdates.latitude = latNum
        clientUpdates.longitude = lngNum
      }
    }

    setLoading(true)
    try {
      await photoBatchEdit(payload)
      toast.success(`Berhasil memperbarui metadata untuk ${photoIds.length} foto.`)
      onSuccess?.(photoIds, clientUpdates)
      handleOpenChange(false)
    } catch (err: unknown) {
      console.error("Batch edit failed:", err)
      toast.error("Gagal memperbarui metadata foto massal.")
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
              Edit Metadata {photoIds.length === 1 ? "Foto" : `Massal (${photoIds.length} Foto)`}
            </DialogTitle>
          </div>
          <DialogDescription className="text-xs text-muted-foreground">
            Pilih nilai baru untuk kategori yang ingin diubah. Opsi yang disetel ke &quot;Tidak Diubah&quot; akan mempertahankan metadata asli foto.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex-1 min-h-0 overflow-y-auto space-y-3 pr-1 py-1">
          {/* 1. Tipe Visibilitas / Display Scope */}
          <div className="rounded-xl border border-border/80 bg-card p-3.5 space-y-2 shadow-2xs">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <Eye className="size-4 text-primary" />
                <span>1. Visibilitas & Ruang Tampil</span>
              </div>
              {isVisModified && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
                  Akan Diubah
                </span>
              )}
            </div>
            <Select value={visibility} onValueChange={setVisibility}>
              <SelectTrigger className="w-full text-xs h-9 bg-muted/30">
                <SelectValue placeholder="Pilih Visibilitas..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="unchanged" className="text-xs text-muted-foreground">
                  ⚪ — Biarkan Sekarang (Tidak Diubah) —
                </SelectItem>
                <SelectItem value={String(PhotoVisibilityEnum.BOTH)} className="text-xs">
                  🌐 Tampilkan di Semua (Galeri Utama & Album)
                </SelectItem>
                <SelectItem value={String(PhotoVisibilityEnum.GALLERY_ONLY)} className="text-xs">
                  🖼️ Hanya Galeri Utama
                </SelectItem>
                <SelectItem value={String(PhotoVisibilityEnum.ALBUM_ONLY)} className="text-xs">
                  📁 Hanya di Album
                </SelectItem>
                <SelectItem value={String(PhotoVisibilityEnum.ARCHIVED)} className="text-xs text-amber-500 font-medium">
                  📦 Arsipkan (Sembunyikan dari Publik)
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* 2. Izin Unduh Publik */}
          <div className="rounded-xl border border-border/80 bg-card p-3.5 space-y-2 shadow-2xs">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <Download className="size-4 text-primary" />
                <span>2. Izin Pengunduhan Publik</span>
              </div>
              {isDlModified && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
                  Akan Diubah
                </span>
              )}
            </div>
            <Select value={allowDownload} onValueChange={setAllowDownload}>
              <SelectTrigger className="w-full text-xs h-9 bg-muted/30">
                <SelectValue placeholder="Pilih Izin Unduh..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="unchanged" className="text-xs text-muted-foreground">
                  ⚪ — Biarkan Sekarang (Tidak Diubah) —
                </SelectItem>
                <SelectItem value="allow" className="text-xs text-emerald-500 font-medium">
                  ⬇️ Izinkan Unduh Publik (Original File)
                </SelectItem>
                <SelectItem value="deny" className="text-xs text-rose-500 font-medium">
                  🔒 Lindungi / Kunci Unduhan Publik
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* 3. Status Favorit */}
          <div className="rounded-xl border border-border/80 bg-card p-3.5 space-y-2 shadow-2xs">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <Heart className="size-4 text-primary" />
                <span>3. Status Foto Favorit</span>
              </div>
              {isFavModified && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
                  Akan Diubah
                </span>
              )}
            </div>
            <Select value={favorite} onValueChange={setFavorite}>
              <SelectTrigger className="w-full text-xs h-9 bg-muted/30">
                <SelectValue placeholder="Pilih Status Favorit..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="unchanged" className="text-xs text-muted-foreground">
                  ⚪ — Biarkan Sekarang (Tidak Diubah) —
                </SelectItem>
                <SelectItem value="1" className="text-xs text-amber-500 font-medium">
                  ⭐ Tandai Sebagai Favorit (Starred)
                </SelectItem>
                <SelectItem value="0" className="text-xs text-muted-foreground">
                  🤍 Hapus dari Favorit (Unstar)
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* 4. Tanggal & Waktu Pengambilan */}
          <div className="rounded-xl border border-border/80 bg-card p-3.5 space-y-2 shadow-2xs">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <Calendar className="size-4 text-primary" />
                <span>4. Tanggal & Waktu Pengambilan</span>
              </div>
              {isDateModified && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
                  Akan Diubah
                </span>
              )}
            </div>
            <Select value={takenTimeMode} onValueChange={setTakenTimeMode}>
              <SelectTrigger className="w-full text-xs h-9 bg-muted/30">
                <SelectValue placeholder="Pilih Pengaturan Tanggal..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="unchanged" className="text-xs text-muted-foreground">
                  ⚪ — Biarkan Sekarang (Tidak Diubah) —
                </SelectItem>
                <SelectItem value="set" className="text-xs">
                  📅 Setel Tanggal & Waktu Baru
                </SelectItem>
                <SelectItem value="clear" className="text-xs text-destructive">
                  🗑️ Kosongkan / Hapus Tanggal Pengambilan
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

          {/* 5. Koordinat Lokasi GPS (Latitude & Longitude) */}
          <div className="rounded-xl border border-border/80 bg-card p-3.5 space-y-2 shadow-2xs">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <MapPin className="size-4 text-emerald-500" />
                <span>5. Koordinat Lokasi GPS (Map & Exif)</span>
              </div>
              {isLocModified && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-500 border border-emerald-500/30">
                  Akan Diubah
                </span>
              )}
            </div>
            <Select value={locationMode} onValueChange={setLocationMode}>
              <SelectTrigger className="w-full text-xs h-9 bg-muted/30">
                <SelectValue placeholder="Pilih Pengaturan Lokasi GPS..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="unchanged" className="text-xs text-muted-foreground">
                  ⚪ — Biarkan Sekarang (Tidak Diubah) —
                </SelectItem>
                <SelectItem value="set" className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                  📍 Setel Koordinat GPS Baru
                </SelectItem>
                <SelectItem value="clear" className="text-xs text-destructive font-medium">
                  🗑️ Kosongkan / Hapus Lokasi GPS
                </SelectItem>
              </SelectContent>
            </Select>

            {locationMode === "set" && (
              <div className="space-y-2 pt-1.5 animate-in fade-in-50 duration-200">
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <label className="text-[11px] font-medium text-muted-foreground flex items-center gap-1">
                      <Compass className="size-3 text-emerald-500" />
                      <span>Latitude (Lintang)</span>
                    </label>
                    <Input
                      type="number"
                      step="any"
                      placeholder="e.g. -6.2088"
                      value={latitude}
                      onChange={(e) => setLatitude(e.target.value)}
                      className="text-xs h-9 bg-background"
                      required
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] font-medium text-muted-foreground flex items-center gap-1">
                      <Compass className="size-3 text-emerald-500" />
                      <span>Longitude (Bujur)</span>
                    </label>
                    <Input
                      type="number"
                      step="any"
                      placeholder="e.g. 106.8456"
                      value={longitude}
                      onChange={(e) => setLongitude(e.target.value)}
                      className="text-xs h-9 bg-background"
                      required
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between pt-0.5">
                  <span className="text-[10px] text-muted-foreground">
                    Foto akan otomatis muncul pada Peta Interaktif (/map).
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
                    <span>Gunakan GPS Perangkat</span>
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
              Batal
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
                  ? `Terapkan (${modifiedCount} Kategori)`
                  : "Pilih Kategori untuk Mengubah"}
              </span>
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
