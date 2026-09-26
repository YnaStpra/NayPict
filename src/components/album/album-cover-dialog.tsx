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
import { toProxyMediaUrl } from "@/lib/url"
import { useModalBackHandler } from "@/hooks/use-modal-back-handler"

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
  // Intercept Android / mobile back gesture to close modal cleanly
  useModalBackHandler(open, onOpenChange)

  const [candidates, setCandidates] = useState<AlbumCoverCandidate[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open && album) {
      setLoading(true)
      albumGetCoverCandidates(album.albumId)
        .then((data) => setCandidates(data))
        .catch(() => toast.error("Failed to load album media"))
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
      toast.success("Album cover updated!")
      onSuccess()
      onOpenChange(false)
    } catch (err: unknown) {
      toast.error((err as Error)?.message || "Failed to update album cover")
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
    } catch (err: unknown) {
      toast.error((err as Error)?.message || "Failed to update album cover")
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
    } catch (err: unknown) {
      toast.error((err as Error)?.message || "Failed to auto-select album cover")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ImageIcon className="size-5 text-primary" />
            <span>Change Album Cover</span>
          </DialogTitle>
          <DialogDescription>
            Select a photo from <strong className="text-foreground">{album.name}</strong> to use as its cover. Only photos inside this album can be selected.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto min-h-0 space-y-4 py-2 [scrollbar-width:thin]">
          {loading ? (
            <div className="flex h-56 items-center justify-center text-muted-foreground text-sm">
              Loading photos from album...
            </div>
          ) : candidates.length === 0 ? (
            <div className="flex h-56 flex-col items-center justify-center text-muted-foreground gap-2.5 text-center p-4 rounded-xl border border-dashed bg-muted/20">
              <div className="flex size-12 items-center justify-center rounded-full bg-muted">
                <ImageIcon className="size-6 opacity-40" />
              </div>
              <p className="text-sm font-semibold text-foreground">No photos in this album</p>
              <p className="text-xs text-muted-foreground max-w-sm">
                Add photos or videos to this album first before selecting a cover.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Suggested Banner */}
              {suggestedCandidate && suggestedCandidate.photoId !== currentCoverPhotoId && (
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 rounded-xl border bg-primary/5 p-3">
                  <div className="flex items-center gap-3">
                    <div className="relative aspect-video w-20 shrink-0 overflow-hidden rounded-md bg-black/10 border">
                      <img
                        src={suggestedCandidate.thumbnail ?? suggestedCandidate.preview ?? ""}
                        alt={suggestedCandidate.name}
                        onError={(e) => {
                          const el = e.currentTarget
                          if (el.src && !el.src.includes('/media/')) {
                            el.src = toProxyMediaUrl(el.src)
                          }
                        }}
                        className="h-full w-full object-cover"
                      />
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5 text-xs font-semibold text-primary">
                        <SparklesIcon className="size-3.5 text-amber-500" />
                        AI Recommended Cover
                      </div>
                      <p className="text-xs text-muted-foreground line-clamp-1">
                        Best landscape composition ({suggestedCandidate.name})
                      </p>
                    </div>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    className="gap-1.5 shrink-0 self-end sm:self-center"
                    disabled={saving}
                    onClick={handleApplySuggested}
                  >
                    <CheckIcon className="size-3.5" />
                    Use Suggested
                  </Button>
                </div>
              )}

              {/* Photo Picker Grid */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">
                    Photos in this album ({candidates.length})
                  </span>
                  <span>Click any photo to set as cover</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5">
                  {candidates.map((photo) => {
                    const isCurrent = photo.photoId === currentCoverPhotoId
                    return (
                      <div
                        key={photo.photoId}
                        role="button"
                        tabIndex={0}
                        aria-label={`Set ${photo.name} as cover`}
                        className={`group relative aspect-square overflow-hidden rounded-xl border transition-all cursor-pointer ${
                          isCurrent
                            ? "ring-2 ring-primary ring-offset-2 ring-offset-background border-primary shadow-md"
                            : "hover:border-foreground/40 hover:shadow-sm"
                        }`}
                        onClick={() => handleSetManualCover(photo.photoId)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            handleSetManualCover(photo.photoId)
                          }
                        }}
                      >
                        <img
                          src={photo.thumbnail ?? photo.preview ?? ""}
                          alt=""
                          onError={(e) => {
                            const el = e.currentTarget
                            if (el.src && !el.src.includes('/media/')) {
                              el.src = toProxyMediaUrl(el.src)
                            }
                          }}
                          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105 select-none"
                        />
                        {isCurrent ? (
                          <div className="absolute top-2 right-2 flex items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold text-primary-foreground shadow-md">
                            <CheckIcon className="size-3" />
                            Current Cover
                          </div>
                        ) : (
                          <div className="absolute inset-0 bg-black/45 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center p-2">
                            <span className="text-xs font-semibold text-white bg-primary px-2.5 py-1 rounded-lg shadow-md transition-transform group-hover:scale-105">
                              Set as Cover
                            </span>
                          </div>
                        )}
                        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent p-1.5 pt-4 text-white text-[10px] truncate opacity-90">
                          {photo.name}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
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
            Auto Select Best
          </Button>
          <Button type="button" variant="secondary" size="sm" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
