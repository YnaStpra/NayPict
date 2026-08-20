"use client"

import { useState } from "react"
import { Calendar, Download, Eye, Heart, LoaderCircle } from "lucide-react"
import { toast } from "sonner"

import { Dialog } from "@/components/common/dialog"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Input } from "@/components/ui/input"
import { PhotoFavoriteEnum, PhotoVisibilityEnum } from "@/server/enums/photo-enum"
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
  // Track field toggle switches
  const [editVisibility, setEditVisibility] = useState(false)
  const [visibility, setVisibility] = useState<number>(PhotoVisibilityEnum.BOTH)

  const [editAllowDownload, setEditAllowDownload] = useState(false)
  const [allowDownload, setAllowDownload] = useState(true)

  const [editTakenTime, setEditTakenTime] = useState(false)
  const [takenTimeMode, setTakenTimeMode] = useState<"set" | "clear">("set")
  const [takenTimeValue, setTakenTimeValue] = useState<string>(() => {
    const now = new Date()
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset())
    return now.toISOString().slice(0, 16)
  })

  const [editFavorite, setEditFavorite] = useState(false)
  const [favorite, setFavorite] = useState<number>(PhotoFavoriteEnum.YES)

  const [loading, setLoading] = useState(false)

  // Reset or clear fields when closed
  const handleOpenChange = (nextOpen: boolean) => {
    onOpenChange(nextOpen)
    if (!nextOpen) {
      setEditVisibility(false)
      setEditAllowDownload(false)
      setEditTakenTime(false)
      setEditFavorite(false)
      setLoading(false)
    }
  }

  // Handle batch edit submission
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!photoIds.length) return

    if (!editVisibility && !editAllowDownload && !editTakenTime && !editFavorite) {
      toast.error("Please enable at least one metadata field to update.")
      return
    }

    const payload: {
      photoIds: string[]
      visibility?: number | null
      allowDownload?: boolean | null
      takenTime?: string | null
      favorite?: number | null
    } = {
      photoIds,
    }

    const clientUpdates: Partial<PhotoVo> = {}

    if (editVisibility) {
      payload.visibility = visibility
      clientUpdates.visibility = visibility
    }

    if (editAllowDownload) {
      payload.allowDownload = allowDownload
      clientUpdates.allowDownload = allowDownload ? 1 : 0
    }

    if (editTakenTime) {
      if (takenTimeMode === "clear") {
        payload.takenTime = ""
        clientUpdates.takenTime = null
      } else {
        const iso = new Date(takenTimeValue).toISOString()
        payload.takenTime = iso
        clientUpdates.takenTime = iso
      }
    }

    if (editFavorite) {
      payload.favorite = favorite
      clientUpdates.favorite = favorite
    }

    setLoading(true)
    try {
      await photoBatchEdit(payload)
      toast.success(`Updated metadata for ${photoIds.length} photo(s).`)
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
    <Dialog
      open={open}
      onOpenChange={handleOpenChange}
      title="Batch Edit Photo Metadata"
      description={`Update metadata across ${photoIds.length} selected photo(s). Only enabled sections will be modified.`}
      className="max-w-lg"
    >
      <form onSubmit={handleSubmit} className="space-y-4 py-1">
        {/* 1. Visibility Scope Section */}
        <div className="rounded-xl border border-border/70 p-3.5 bg-card/50 transition-colors">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Eye className="size-4 text-primary" />
              <Label htmlFor="toggle-vis" className="font-semibold text-sm cursor-pointer">
                Display Scope / Visibility
              </Label>
            </div>
            <Switch
              id="toggle-vis"
              checked={editVisibility}
              onCheckedChange={setEditVisibility}
            />
          </div>

          {editVisibility && (
            <div className="mt-3 pt-3 border-t border-border/50">
              <RadioGroup
                value={String(visibility)}
                onValueChange={(val) => setVisibility(Number(val))}
                className="gap-2"
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value={String(PhotoVisibilityEnum.BOTH)} id="vis-both" />
                  <Label htmlFor="vis-both" className="text-xs sm:text-sm cursor-pointer">
                    🌐 Both (Main Gallery & Albums)
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value={String(PhotoVisibilityEnum.GALLERY_ONLY)} id="vis-gallery" />
                  <Label htmlFor="vis-gallery" className="text-xs sm:text-sm cursor-pointer">
                    🖼️ Main Gallery Only
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value={String(PhotoVisibilityEnum.ALBUM_ONLY)} id="vis-album" />
                  <Label htmlFor="vis-album" className="text-xs sm:text-sm cursor-pointer">
                    📁 Albums Only
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value={String(PhotoVisibilityEnum.ARCHIVED)} id="vis-archived" />
                  <Label htmlFor="vis-archived" className="text-xs sm:text-sm cursor-pointer text-amber-500 font-medium">
                    📦 Archived (Hidden from public)
                  </Label>
                </div>
              </RadioGroup>
            </div>
          )}
        </div>

        {/* 2. Download Permission Section */}
        <div className="rounded-xl border border-border/70 p-3.5 bg-card/50 transition-colors">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Download className="size-4 text-primary" />
              <Label htmlFor="toggle-dl" className="font-semibold text-sm cursor-pointer">
                Public Download Permission
              </Label>
            </div>
            <Switch
              id="toggle-dl"
              checked={editAllowDownload}
              onCheckedChange={setEditAllowDownload}
            />
          </div>

          {editAllowDownload && (
            <div className="mt-3 pt-3 border-t border-border/50">
              <RadioGroup
                value={allowDownload ? "allow" : "deny"}
                onValueChange={(val) => setAllowDownload(val === "allow")}
                className="gap-2"
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="allow" id="dl-allow" />
                  <Label htmlFor="dl-allow" className="text-xs sm:text-sm cursor-pointer">
                    ⬇️ Allow Public Original Download
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="deny" id="dl-deny" />
                  <Label htmlFor="dl-deny" className="text-xs sm:text-sm cursor-pointer">
                    🔒 Protect / Disallow Download
                  </Label>
                </div>
              </RadioGroup>
            </div>
          )}
        </div>

        {/* 3. Capture Date & Time Section */}
        <div className="rounded-xl border border-border/70 p-3.5 bg-card/50 transition-colors">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Calendar className="size-4 text-primary" />
              <Label htmlFor="toggle-date" className="font-semibold text-sm cursor-pointer">
                Capture Date & Time
              </Label>
            </div>
            <Switch
              id="toggle-date"
              checked={editTakenTime}
              onCheckedChange={setEditTakenTime}
            />
          </div>

          {editTakenTime && (
            <div className="mt-3 pt-3 border-t border-border/50 space-y-2.5">
              <RadioGroup
                value={takenTimeMode}
                onValueChange={(val: "set" | "clear") => setTakenTimeMode(val)}
                className="gap-2"
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="set" id="date-set" />
                  <Label htmlFor="date-set" className="text-xs sm:text-sm cursor-pointer">
                    Set Specific Date & Time
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="clear" id="date-clear" />
                  <Label htmlFor="date-clear" className="text-xs sm:text-sm cursor-pointer text-muted-foreground">
                    Clear Capture Date (Leave blank)
                  </Label>
                </div>
              </RadioGroup>

              {takenTimeMode === "set" && (
                <div className="pt-1">
                  <Input
                    type="datetime-local"
                    value={takenTimeValue}
                    onChange={(e) => setTakenTimeValue(e.target.value)}
                    className="w-full text-sm"
                    required={editTakenTime && takenTimeMode === "set"}
                  />
                </div>
              )}
            </div>
          )}
        </div>

        {/* 4. Favorite Status Section */}
        <div className="rounded-xl border border-border/70 p-3.5 bg-card/50 transition-colors">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Heart className="size-4 text-primary" />
              <Label htmlFor="toggle-fav" className="font-semibold text-sm cursor-pointer">
                Favorite Status
              </Label>
            </div>
            <Switch
              id="toggle-fav"
              checked={editFavorite}
              onCheckedChange={setEditFavorite}
            />
          </div>

          {editFavorite && (
            <div className="mt-3 pt-3 border-t border-border/50">
              <RadioGroup
                value={String(favorite)}
                onValueChange={(val) => setFavorite(Number(val))}
                className="gap-2"
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value={String(PhotoFavoriteEnum.YES)} id="fav-yes" />
                  <Label htmlFor="fav-yes" className="text-xs sm:text-sm cursor-pointer text-red-500 font-medium">
                    ⭐ Mark as Favorite
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value={String(PhotoFavoriteEnum.NO)} id="fav-no" />
                  <Label htmlFor="fav-no" className="text-xs sm:text-sm cursor-pointer">
                    🤍 Remove from Favorites
                  </Label>
                </div>
              </RadioGroup>
            </div>
          )}
        </div>

        {/* Dialog Actions Footer */}
        <div className="flex items-center justify-end gap-2 pt-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={loading}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={loading || (!editVisibility && !editAllowDownload && !editTakenTime && !editFavorite)}
            className="gap-1.5"
          >
            {loading && <LoaderCircle className="size-4 animate-spin" />}
            <span>Apply Changes</span>
          </Button>
        </div>
      </form>
    </Dialog>
  )
}
