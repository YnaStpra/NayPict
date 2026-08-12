"use client"

import { useEffect, useState } from "react"
import { CheckIcon, SparklesIcon, Wand2Icon, ImageIcon } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { type AlbumVo } from "@/server/entity/vo/album"
import { albumGetCoverCandidates, albumSetCover, type AlbumCoverCandidate } from "@/request/album"

interface AlbumCoverDialogProps {
  open: boolean
  album: AlbumVo | null
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
}

function getOrientationLabel(width: number | null, height: number | null) {
  if (!width || !height) return "Image"
  if (width > height) return "Landscape"
  if (width < height) return "Portrait"
  return "Square"
}

export function AlbumCoverDialog({ open, album, onOpenChange, onSuccess }: AlbumCoverDialogProps) {
  const [candidates, setCandidates] = useState<AlbumCoverCandidate[]>([])
  const [loading, setLoading] = useState(false)
  const [showPicker, setShowPicker] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open && album) {
      setLoading(true)
      setShowPicker(false)
      albumGetCoverCandidates(album.albumId)
        .then((data) => setCandidates(data))
        .catch(() => toast.error("Failed to load album photos"))
        .finally(() => setLoading(false))
    }
  }, [open, album])

  if (!album) return null

  const suggestedCandidate = candidates[0] ?? null
  const currentCoverPhotoId = album.coverPhotoId

  async function handleApplySuggested() {
    if (!suggestedCandidate || !album) return
    setSaving(true)
    try {
      await albumSetCover({ albumId: album.albumId, photoId: suggestedCandidate.photoId })
      toast.success("Album cover updated to suggested photo!")
      onSuccess()
      onOpenChange(false)
    } catch {
      toast.error("Failed to update album cover")
    } finally {
      setSaving(false)
    }
  }

  async function handleSetManualCover(photoId: string) {
    if (!album) return
    setSaving(true)
    try {
      await albumSetCover({ albumId: album.albumId, photoId })
      toast.success("Album cover updated!")
      onSuccess()
      onOpenChange(false)
    } catch {
      toast.error("Failed to update album cover")
    } finally {
      setSaving(false)
    }
  }

  async function handleAutoSelect() {
    if (!album) return
    setSaving(true)
    try {
      await albumSetCover({ albumId: album.albumId, autoSelect: true })
      toast.success("Automatic cover selection applied!")
      onSuccess()
      onOpenChange(false)
    } catch {
      toast.error("Failed to auto-select album cover")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <SparklesIcon className="size-4 text-primary" />
            <span>Manage Album Cover</span>
          </DialogTitle>
          <DialogDescription>
            NayPict automatically calculates and suggests the best landscape cover photo. You can accept the suggestion or manually choose a photo.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto min-h-0 space-y-4 py-2 [scrollbar-width:thin]">
          {loading ? (
            <div className="flex h-48 items-center justify-center text-muted-foreground text-sm">
              Loading album photos...
            </div>
          ) : candidates.length === 0 ? (
            <div className="flex h-48 flex-col items-center justify-center text-muted-foreground gap-2">
              <ImageIcon className="size-8 opacity-40" />
              <p className="text-sm font-medium">No photos in this album</p>
              <p className="text-xs">Add photos to the album to enable cover selection.</p>
            </div>
          ) : (
            <>
              {/* Suggested Cover Section */}
              {suggestedCandidate && (
                <div className="rounded-xl border bg-muted/30 p-3 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                      <SparklesIcon className="size-3.5 text-amber-500" />
                      Suggested Album Cover
                    </span>
                    {album.isManualCover && (
                      <span className="text-[11px] font-medium px-2 py-0.5 rounded bg-muted text-muted-foreground">
                        Manual Cover Set
                      </span>
                    )}
                  </div>
                  <div className="flex gap-3 items-center">
                    <div className="relative aspect-[4/3] w-36 shrink-0 overflow-hidden rounded-lg bg-black/10 border">
                      <img
                        src={suggestedCandidate.thumbnail ?? suggestedCandidate.preview ?? ""}
                        alt={suggestedCandidate.name}
                        className="h-full w-full object-cover"
                      />
                    </div>
                    <div className="flex-1 min-w-0 space-y-1 text-left text-xs">
                      <p className="font-semibold text-sm truncate">{suggestedCandidate.name}</p>
                      <p className="text-muted-foreground">
                        {getOrientationLabel(suggestedCandidate.width, suggestedCandidate.height)}
                        {suggestedCandidate.width && suggestedCandidate.height && (
                          <span> • {suggestedCandidate.width} × {suggestedCandidate.height}</span>
                        )}
                      </p>
                      <p className="text-amber-500/90 font-mono text-[11px]">
                        Cover Score: {suggestedCandidate.score} pts
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 pt-1">
                    <Button
                      type="button"
                      size="sm"
                      className="gap-1.5"
                      disabled={saving}
                      onClick={handleApplySuggested}
                    >
                      <CheckIcon className="size-3.5" />
                      Use Suggested Cover
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={saving}
                      onClick={() => setShowPicker((prev) => !prev)}
                    >
                      {showPicker ? "Hide Photos" : "Choose Another"}
                    </Button>
                  </div>
                </div>
              )}

              {/* Photo Picker Grid */}
              {showPicker && (
                <div className="space-y-2 border-t pt-3">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>Select a photo from this album:</span>
                    <span>{candidates.length} photos</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                    {candidates.map((photo) => {
                      const isCurrent = photo.photoId === currentCoverPhotoId
                      return (
                        <div
                          key={photo.photoId}
                          className={`group relative aspect-square overflow-hidden rounded-lg border cursor-pointer ${isCurrent ? "ring-2 ring-primary" : ""}`}
                          onClick={() => handleSetManualCover(photo.photoId)}
                        >
                          <img
                            src={photo.thumbnail ?? photo.preview ?? ""}
                            alt={photo.name}
                            className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105"
                          />
                          {isCurrent && (
                            <div className="absolute top-1 right-1 flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                              <CheckIcon className="size-3" />
                            </div>
                          )}
                          <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center p-1">
                            <span className="text-[11px] font-semibold text-white bg-primary/90 px-2 py-1 rounded shadow">
                              Set as Cover
                            </span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        <DialogFooter className="flex-row items-center justify-between gap-2 border-t pt-3 sm:justify-between">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="gap-1.5 text-xs text-muted-foreground hover:text-foreground"
            disabled={saving || candidates.length === 0}
            onClick={handleAutoSelect}
          >
            <Wand2Icon className="size-3.5" />
            Auto Select Cover
          </Button>
          <Button type="button" variant="secondary" size="sm" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
