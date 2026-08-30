"use client"

import { useState, useMemo } from "react"
import {
  AlertCircle,
  Ban,
  Calendar,
  Check,
  CheckCircle2,
  Compass,
  Image as ImageIcon,
  LoaderCircle,
  MapPin,
  Search,
  X,
} from "lucide-react"
import { toast } from "sonner"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { PhotoBatchEditDialog } from "@/components/photo/photo-batch-edit-dialog"
import { type PhotoVo } from "@/server/entity/vo/photo"
import { formatRelativeTime } from "@/lib/date"
import { getThumbHashUrl } from "@/lib/thumb-hash"
import { toProxyMediaUrl } from "@/lib/url"
import { photoBatchEdit } from "@/request/photo"
import { useLocale } from "next-intl"
import { useModalBackHandler } from "@/hooks/use-modal-back-handler"

interface UntaggedPhotosDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  untaggedPhotos: PhotoVo[]
  onGeotagSuccess: (geotaggedIds: string[], changes: Partial<PhotoVo>) => void
}

export function UntaggedPhotosDialog({
  open,
  onOpenChange,
  untaggedPhotos,
  onGeotagSuccess,
}: UntaggedPhotosDialogProps) {
  // Intercept Android / mobile back gesture to close modal cleanly
  useModalBackHandler(open, onOpenChange)

  const locale = useLocale()
  const [searchQuery, setSearchQuery] = useState<string>("")
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [editingPhotoIds, setEditingPhotoIds] = useState<string[]>([])
  const [editDialogOpen, setEditDialogOpen] = useState<boolean>(false)
  const [ignoring, setIgnoring] = useState<boolean>(false)

  // Filter photos by search query
  const filteredPhotos = useMemo(() => {
    if (!searchQuery.trim()) return untaggedPhotos
    const q = searchQuery.toLowerCase()
    return untaggedPhotos.filter((p) => p.name.toLowerCase().includes(q))
  }, [untaggedPhotos, searchQuery])

  // Select all or deselect all
  const isAllSelected =
    filteredPhotos.length > 0 && selectedIds.length === filteredPhotos.length

  const toggleSelectAll = () => {
    if (isAllSelected) {
      setSelectedIds([])
    } else {
      setSelectedIds(filteredPhotos.map((p) => p.photoId))
    }
  }

  // Toggle single item selection
  const toggleSelectPhoto = (photoId: string) => {
    setSelectedIds((prev) =>
      prev.includes(photoId) ? prev.filter((id) => id !== photoId) : [...prev, photoId]
    )
  }

  // Open edit dialog for a single photo
  const handleEditSingle = (photoId: string) => {
    setEditingPhotoIds([photoId])
    setEditDialogOpen(true)
  }

  // Open edit dialog for multiple selected photos
  const handleEditSelected = () => {
    if (selectedIds.length === 0) return
    setEditingPhotoIds(selectedIds)
    setEditDialogOpen(true)
  }

  // Quick Ignore location for one or more photos (sets sentinel 999,999)
  const handleQuickIgnore = async (ids: string[]) => {
    if (!ids.length) return
    setIgnoring(true)
    try {
      await photoBatchEdit({
        photoIds: ids,
        latitude: 999,
        longitude: 999,
      })
      toast.success(`Ignored location for ${ids.length} photo(s).`)
      onGeotagSuccess(ids, { latitude: null, longitude: null, isLocationIgnored: true })
      setSelectedIds((prev) => prev.filter((id) => !ids.includes(id)))
    } catch (err: any) {
      toast.error(err.message || "Failed to ignore location.")
    } finally {
      setIgnoring(false)
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] flex flex-col p-6 gap-4">
          <DialogHeader>
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-xl bg-amber-500/10 text-amber-500">
                <AlertCircle className="size-5" />
              </div>
              <div>
                <DialogTitle className="text-lg font-bold flex items-center gap-2">
                  <span>Photos Missing GPS Coordinates</span>
                  <span className="px-2 py-0.5 text-xs font-bold rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30">
                    {untaggedPhotos.length} Photos
                  </span>
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                  Add location coordinates (DMS format such as <code>8°20&apos;43.0&quot;S 116°31&apos;58.9&quot;E</code> or device GPS) so photos appear on the interactive map, or mark them as <strong>Ignore</strong> if intentionally without location.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          {/* Search bar & Batch Action Toolbar */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 pt-1">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Search photos by name..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 text-xs h-9 bg-muted/40 rounded-xl"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer"
                >
                  <X className="size-3.5" />
                </button>
              )}
            </div>

            {filteredPhotos.length > 0 && (
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={toggleSelectAll}
                  className="text-xs h-9 rounded-xl border-border/80"
                >
                  {isAllSelected ? "Deselect All" : "Select All"}
                </Button>

                {selectedIds.length > 0 && (
                  <>
                    <Button
                      type="button"
                      size="sm"
                      onClick={handleEditSelected}
                      className="text-xs h-9 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white gap-1.5 font-semibold shadow-md animate-in fade-in duration-200"
                    >
                      <MapPin className="size-3.5" />
                      <span>Set Location ({selectedIds.length})</span>
                    </Button>

                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={ignoring}
                      onClick={() => handleQuickIgnore(selectedIds)}
                      className="text-xs h-9 rounded-xl border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/20 text-amber-600 dark:text-amber-400 gap-1.5 font-semibold shadow-xs animate-in fade-in duration-200"
                    >
                      {ignoring ? (
                        <LoaderCircle className="size-3.5 animate-spin" />
                      ) : (
                        <Ban className="size-3.5 text-amber-500" />
                      )}
                      <span>Ignore ({selectedIds.length})</span>
                    </Button>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Photo List Container */}
          <div className="flex-1 min-h-0 overflow-y-auto pr-1 space-y-2">
            {untaggedPhotos.length === 0 ? (
              <div className="py-12 flex flex-col items-center justify-center text-center space-y-3">
                <div className="p-3 rounded-2xl bg-emerald-500/10 text-emerald-500">
                  <CheckCircle2 className="size-8" />
                </div>
                <div>
                  <h4 className="font-bold text-sm text-foreground">
                    All Photos Have Coordinates!
                  </h4>
                  <p className="text-xs text-muted-foreground mt-1 max-w-sm">
                    All photos in your gallery are either mapped to the Interactive Photo Map or intentionally ignored.
                  </p>
                </div>
              </div>
            ) : filteredPhotos.length === 0 ? (
              <div className="py-10 text-center text-xs text-muted-foreground">
                No photos match your search &quot;{searchQuery}&quot;.
              </div>
            ) : (
              filteredPhotos.map((photo) => {
                const isSelected = selectedIds.includes(photo.photoId)
                const imgUrl = photo.thumbnail || photo.preview || ""

                return (
                  <div
                    key={photo.photoId}
                    className={`group flex items-center justify-between p-2.5 rounded-2xl border transition-all duration-200 ${
                      isSelected
                        ? "bg-emerald-500/10 border-emerald-500/40 shadow-xs"
                        : "bg-card/70 border-border/70 hover:border-border hover:bg-card"
                    }`}
                  >
                    {/* Thumbnail & Select Checkbox */}
                    <div
                      className="flex items-center gap-3 min-w-0 cursor-pointer"
                      onClick={() => toggleSelectPhoto(photo.photoId)}
                    >
                      <div
                        className={`size-4 rounded-md border flex items-center justify-center transition-colors shrink-0 ${
                          isSelected
                            ? "bg-emerald-500 border-emerald-500 text-white"
                            : "border-muted-foreground/40 bg-background"
                        }`}
                      >
                        {isSelected && <Check className="size-3 stroke-[3]" />}
                      </div>

                      <div className="relative size-12 rounded-xl overflow-hidden bg-neutral-900 shrink-0 border border-border/50">
                        {(() => {
                          const ph = getThumbHashUrl(photo.thumbHash)
                          return (
                            <>
                              {ph && (
                                <img
                                  src={ph}
                                  alt=""
                                  className="absolute inset-0 h-full w-full object-cover blur-xs scale-110"
                                  aria-hidden
                                />
                              )}
                              {imgUrl ? (
                                <img
                                  src={imgUrl}
                                  alt={photo.name}
                                  loading="lazy"
                                  decoding="async"
                                  onError={(e) => {
                                    const el = e.currentTarget
                                    if (el.src && !el.src.includes('/media/')) {
                                      el.src = toProxyMediaUrl(el.src)
                                    }
                                  }}
                                  className="absolute inset-0 h-full w-full object-cover transition-transform group-hover:scale-105"
                                />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                                  <ImageIcon className="size-5" />
                                </div>
                              )}
                            </>
                          )
                        })()}
                      </div>

                      {/* Photo Details */}
                      <div className="min-w-0 space-y-0.5">
                        <p className="font-semibold text-xs text-foreground truncate" title={photo.name}>
                          {photo.name}
                        </p>
                        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                          {photo.takenTime && (
                            <span className="flex items-center gap-1 truncate">
                              <Calendar className="size-3 text-primary/70 shrink-0" />
                              <span>{formatRelativeTime(photo.takenTime, locale)}</span>
                            </span>
                          )}
                          <span className="text-[10px] uppercase font-mono px-1.5 py-0.2 rounded bg-muted/60 text-muted-foreground shrink-0">
                            {photo.typeDesc || "IMG"}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex items-center gap-1.5 ml-2 shrink-0">
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        onClick={() => handleEditSingle(photo.photoId)}
                        className="h-8 text-xs px-2.5 sm:px-3 rounded-xl gap-1 font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20 border border-emerald-500/20 cursor-pointer"
                      >
                        <Compass className="size-3.5" />
                        <span>Set Location</span>
                      </Button>

                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        disabled={ignoring}
                        onClick={() => handleQuickIgnore([photo.photoId])}
                        className="h-8 text-xs px-2.5 rounded-xl gap-1 text-muted-foreground hover:text-amber-600 hover:bg-amber-500/10 cursor-pointer"
                        title="Ignore Location (Intentionally without GPS)"
                      >
                        <Ban className="size-3.5 text-amber-500/80" />
                        <span className="hidden sm:inline">Ignore</span>
                      </Button>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Batch Edit Coordinates Dialog */}
      {editDialogOpen && editingPhotoIds.length > 0 && (
        <PhotoBatchEditDialog
          open={editDialogOpen}
          onOpenChange={(next) => {
            setEditDialogOpen(next)
            if (!next) {
              setEditingPhotoIds([])
            }
          }}
          photoIds={editingPhotoIds}
          onSuccess={(ids, changes) => {
            onGeotagSuccess(ids, changes)
            setSelectedIds((prev) => prev.filter((id) => !ids.includes(id)))
          }}
        />
      )}
    </>
  )
}
