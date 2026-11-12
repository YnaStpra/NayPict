"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Check, Loader2, Search, Sparkles, Trash2, X } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { type PhotoVo } from "@/server/entity/vo/photo"
import { PhotoStatusEnum, PhotoVisibilityEnum } from "@/server/enums/photo-enum"
import { landingPriorityGet, landingPrioritySet } from "@/request/setting"
import { photoList } from "@/request/photo"
import { toProxyMediaUrl } from "@/lib/url"
import { useModalBackHandler } from "@/hooks/use-modal-back-handler"

const MAX_PRIORITY_PHOTOS = 10
const PAGE_SIZE = 50

interface LandingPriorityDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved?: (photoIds: string[]) => void
}

function isEligibleLandingPhoto(photo: PhotoVo): boolean {
  if (photo.type?.startsWith("video/")) return false
  if (photo.status === PhotoStatusEnum.DELETE) return false
  return (
    photo.visibility === PhotoVisibilityEnum.BOTH ||
    photo.visibility === PhotoVisibilityEnum.GALLERY_ONLY ||
    photo.visibility === null ||
    photo.visibility === undefined
  )
}

export function LandingPriorityDialog({
  open,
  onOpenChange,
  onSaved,
}: LandingPriorityDialogProps) {
  useModalBackHandler(open, onOpenChange)

  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [selectedMap, setSelectedMap] = useState<Map<string, PhotoVo>>(new Map())
  const [candidates, setCandidates] = useState<PhotoVo[]>([])
  const [pagination, setPagination] = useState<{
    loadedOffset: number
    totalEligible: number | null
    hasMore: boolean
  }>({
    loadedOffset: 0,
    totalEligible: null,
    hasMore: false,
  })
  const [searchText, setSearchText] = useState("")
  const [debouncedKeyword, setDebouncedKeyword] = useState("")
  const [loadingInitial, setLoadingInitial] = useState(false)
  const [loadingCandidates, setLoadingCandidates] = useState(false)
  const [loadError, setLoadError] = useState(false)
  const [saving, setSaving] = useState(false)
  const scrollContainerRef = useRef<HTMLDivElement | null>(null)
  const loadMoreTriggerRef = useRef<HTMLDivElement | null>(null)

  // Debounce keyword searches cleanly
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedKeyword(searchText.trim())
    }, 250)
    return () => clearTimeout(timer)
  }, [searchText])

  // Load saved priority photos when dialog opens
  useEffect(() => {
    if (!open) return

    let active = true
    void (async () => {
      await Promise.resolve()
      if (!active) return
      setLoadingInitial(true)
      try {
        const res = await landingPriorityGet()
        if (!active) return
        const ids = Array.isArray(res?.photoIds) ? res.photoIds.slice(0, MAX_PRIORITY_PHOTOS) : []
        const map = new Map<string, PhotoVo>()
        for (const p of res?.photos || []) {
          map.set(p.photoId, p)
        }
        setSelectedIds(ids)
        setSelectedMap(map)
      } catch {
        if (active) toast.error("Failed to load current landing priority photos")
      } finally {
        if (active) setLoadingInitial(false)
      }
    })()

    return () => {
      active = false
    }
  }, [open])

  const fetchCandidates = useCallback(
    async (
      offset: number,
      keyword: string,
      append: boolean,
      isActive: () => boolean = () => true
    ) => {
      setLoadingCandidates(true)
      setLoadError(false)
      try {
        const res = await photoList({
          size: PAGE_SIZE,
          offset,
          sortBy: "takenTime",
          sortOrder: "desc",
          shuffle: false,
          status: PhotoStatusEnum.NORMAL,
          keyword: keyword || null,
        })

        if (!isActive()) return
        const rawList = res?.list || []
        const filtered = rawList.filter(isEligibleLandingPhoto)
        const nextOffset = offset + rawList.length

        // photoService.list skips COUNT on subsequent pages (offset > 0) and omits res.total;
        // preserve the page-1 total so Load More stays active until all photos are fetched.
        setPagination((prev) => {
          const resolvedTotal =
            typeof res?.total === "number"
              ? res.total
              : append
                ? prev.totalEligible
                : null
          const hasMore =
            resolvedTotal !== null
              ? nextOffset < resolvedTotal && rawList.length > 0
              : rawList.length >= PAGE_SIZE
          return {
            loadedOffset: nextOffset,
            totalEligible: resolvedTotal,
            hasMore,
          }
        })

        setSelectedMap((prev) => {
          const next = new Map(prev)
          for (const p of filtered) {
            if (!next.has(p.photoId)) {
              next.set(p.photoId, p)
            }
          }
          return next
        })

        setCandidates((prev) => {
          if (!append) return filtered
          const seen = new Set(prev.map((item) => item.photoId))
          return [...prev, ...filtered.filter((item) => !seen.has(item.photoId))]
        })
      } catch {
        if (isActive()) {
          setLoadError(true)
          toast.error("Failed to load gallery photos")
        }
      } finally {
        if (isActive()) setLoadingCandidates(false)
      }
    },
    []
  )

  // Fetch initial grid or refresh on search keyword change
  useEffect(() => {
    if (!open) return
    let active = true

    void (async () => {
      await Promise.resolve()
      if (!active) return
      await fetchCandidates(0, debouncedKeyword, false, () => active)
    })()

    return () => {
      active = false
    }
  }, [open, debouncedKeyword, fetchCandidates])

  // Auto-load next batch when scrolling near bottom of picker grid
  useEffect(() => {
    if (!open || !pagination.hasMore || loadingCandidates || loadError) return
    const root = scrollContainerRef.current
    const target = loadMoreTriggerRef.current
    if (!root || !target) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          void fetchCandidates(pagination.loadedOffset, debouncedKeyword, true)
        }
      },
      { root, rootMargin: "140px" }
    )

    observer.observe(target)
    return () => observer.disconnect()
  }, [
    open,
    pagination.hasMore,
    pagination.loadedOffset,
    loadingCandidates,
    loadError,
    debouncedKeyword,
    fetchCandidates,
  ])

  const togglePhoto = useCallback((photo: PhotoVo) => {
    setSelectedIds((prev) => {
      if (prev.includes(photo.photoId)) {
        return prev.filter((id) => id !== photo.photoId)
      }
      if (prev.length >= MAX_PRIORITY_PHOTOS) {
        toast.warning(`Maximum ${MAX_PRIORITY_PHOTOS} priority photos can be selected`)
        return prev
      }
      return [...prev, photo.photoId]
    })

    setSelectedMap((prev) => {
      if (prev.has(photo.photoId)) return prev
      const next = new Map(prev)
      next.set(photo.photoId, photo)
      return next
    })
  }, [])

  const removeSelectedId = useCallback((photoId: string) => {
    setSelectedIds((prev) => prev.filter((id) => id !== photoId))
  }, [])

  const selectedPhotos = useMemo(() => {
    return selectedIds
      .map((id) => selectedMap.get(id))
      .filter((p): p is PhotoVo => Boolean(p))
  }, [selectedIds, selectedMap])

  const hasMore = pagination.hasMore

  async function handleSave() {
    setSaving(true)
    try {
      const res = await landingPrioritySet(selectedIds)
      const saved = res?.photoIds ?? selectedIds
      toast.success(
        saved.length > 0
          ? `Saved ${saved.length} priority photo${saved.length === 1 ? "" : "s"} for landing gallery`
          : "Cleared landing gallery priority photos"
      )
      onSaved?.(saved)
      onOpenChange(false)
    } catch (err: unknown) {
      toast.error((err as Error)?.message || "Failed to save priority photos")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90dvh] flex flex-col p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-4 border-b shrink-0">
          <div className="flex items-center justify-between gap-3 pr-6">
            <DialogTitle className="flex items-center gap-2 text-lg">
              <Sparkles className="size-5 text-violet-500" />
              <span>Landing Page Priority Photos</span>
            </DialogTitle>
            <Badge
              variant={selectedIds.length >= MAX_PRIORITY_PHOTOS ? "default" : "secondary"}
              className="shrink-0 font-mono"
            >
              {selectedIds.length} / {MAX_PRIORITY_PHOTOS}
            </Badge>
          </div>
          <DialogDescription className="text-xs sm:text-sm">
            Select up to {MAX_PRIORITY_PHOTOS} public images that will always appear mixed randomly in every visitor&apos;s landing page infinite gallery. Main in-app galleries remain unaffected.
          </DialogDescription>
        </DialogHeader>

        {/* Active selection tray */}
        <div className="px-6 py-3 bg-muted/40 border-b shrink-0 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">
              Selected Priority Photos ({selectedIds.length}/{MAX_PRIORITY_PHOTOS})
            </span>
            {selectedIds.length > 0 && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs text-muted-foreground hover:text-destructive cursor-pointer"
                onClick={() => setSelectedIds([])}
              >
                <Trash2 className="size-3.5 mr-1" />
                Clear all
              </Button>
            )}
          </div>

          {loadingInitial ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
              <Loader2 className="size-3.5 animate-spin" />
              <span>Loading saved selection...</span>
            </div>
          ) : selectedIds.length === 0 ? (
            <p className="text-xs text-muted-foreground py-1">
              No priority photos selected yet. Landing gallery uses purely random public photos.
            </p>
          ) : (
            <div className="flex items-center gap-2 overflow-x-auto pb-1">
              {selectedIds.map((id, idx) => {
                const item = selectedMap.get(id)
                const thumbUrl = item
                  ? toProxyMediaUrl(item.thumbnail || item.preview || item.key || "")
                  : ""
                return (
                  <div
                    key={id}
                    className="relative group shrink-0 size-14 rounded-lg overflow-hidden border border-primary/50 bg-background shadow-xs"
                    title={item?.name || id}
                  >
                    {thumbUrl ? (
                      <img
                        src={thumbUrl}
                        alt={item?.name || "Priority photo"}
                        className="size-full object-cover"
                      />
                    ) : (
                      <div className="size-full flex items-center justify-center text-[10px] text-muted-foreground">
                        #{idx + 1}
                      </div>
                    )}
                    <span className="absolute top-0.5 left-0.5 px-1 rounded bg-black/70 text-white text-[10px] font-semibold">
                      #{idx + 1}
                    </span>
                    <button
                      type="button"
                      onClick={() => removeSelectedId(id)}
                      aria-label={`Remove ${item?.name || "photo"}`}
                      className="absolute top-0.5 right-0.5 size-4 rounded-full bg-black/75 text-white flex items-center justify-center opacity-80 hover:opacity-100 hover:bg-destructive transition-colors cursor-pointer"
                    >
                      <X className="size-2.5" />
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Search & Eligible Photo Picker Grid */}
        <div className="px-6 py-3 border-b shrink-0">
          <div className="relative">
            <Search className="size-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
            <Input
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder="Search public photos by name..."
              className="pl-9 h-9"
            />
          </div>
        </div>

        <div ref={scrollContainerRef} className="flex-1 overflow-y-auto px-6 py-4 min-h-[260px]">
          {candidates.length === 0 && !loadingCandidates ? (
            <div className="h-full min-h-[200px] flex flex-col items-center justify-center gap-3 text-center text-sm text-muted-foreground">
              <span>No eligible public photos found.</span>
              {hasMore && (
                <div ref={loadMoreTriggerRef}>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      void fetchCandidates(pagination.loadedOffset, debouncedKeyword, true)
                    }
                    className="cursor-pointer"
                  >
                    Load More Photos
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <>
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
                {candidates.map((photo) => {
                  const selIndex = selectedIds.indexOf(photo.photoId)
                  const isSelected = selIndex !== -1
                  const limitReached = !isSelected && selectedIds.length >= MAX_PRIORITY_PHOTOS
                  const thumbUrl = toProxyMediaUrl(photo.thumbnail || photo.preview || photo.key || "")

                  return (
                    <button
                      key={photo.photoId}
                      type="button"
                      onClick={() => togglePhoto(photo)}
                      className={`relative aspect-square rounded-xl overflow-hidden border text-left transition-all cursor-pointer group focus:outline-none focus:ring-2 focus:ring-primary ${
                        isSelected
                          ? "border-primary ring-2 ring-primary/80 shadow-md"
                          : limitReached
                            ? "border-border opacity-55 hover:opacity-75"
                            : "border-border hover:border-primary/60"
                      }`}
                    >
                      {thumbUrl ? (
                        <img
                          src={thumbUrl}
                          alt={photo.name}
                          loading="lazy"
                          className="size-full object-cover transition-transform duration-200 group-hover:scale-105"
                        />
                      ) : (
                        <div className="size-full bg-muted flex items-center justify-center text-xs text-muted-foreground p-2 text-center">
                          {photo.name}
                        </div>
                      )}

                      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/35 to-transparent p-1.5 pt-4">
                        <p className="text-[10px] text-white/95 truncate font-medium">
                          {photo.name}
                        </p>
                      </div>

                      <div
                        className={`absolute top-1.5 right-1.5 size-6 rounded-full flex items-center justify-center text-xs font-semibold shadow-sm transition-colors ${
                          isSelected
                            ? "bg-primary text-primary-foreground"
                            : "bg-black/55 text-white/90 border border-white/30"
                        }`}
                      >
                        {isSelected ? <Check className="size-3.5" /> : null}
                      </div>

                      {isSelected && (
                        <span className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded bg-black/75 text-white text-[10px] font-semibold">
                          #{selIndex + 1}
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>

              {hasMore && (
                <div ref={loadMoreTriggerRef} className="mt-4 flex justify-center">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={loadingCandidates}
                    onClick={() =>
                      void fetchCandidates(pagination.loadedOffset, debouncedKeyword, true)
                    }
                    className="cursor-pointer"
                  >
                    {loadingCandidates ? (
                      <>
                        <Loader2 className="size-3.5 mr-2 animate-spin" />
                        Loading...
                      </>
                    ) : pagination.totalEligible !== null ? (
                      `Load More Photos (${pagination.loadedOffset} / ${pagination.totalEligible})`
                    ) : (
                      "Load More Photos"
                    )}
                  </Button>
                </div>
              )}
            </>
          )}
        </div>

        <DialogFooter className="px-6 py-4 border-t bg-background shrink-0 flex items-center justify-between sm:justify-between gap-2">
          <div className="text-xs text-muted-foreground">
            {selectedPhotos.length > 0
              ? `${selectedPhotos.length} photo${selectedPhotos.length === 1 ? "" : "s"} pinned to landing pool`
              : "No photos pinned"}
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={saving}
              className="cursor-pointer"
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleSave}
              disabled={saving || loadingInitial}
              className="cursor-pointer"
            >
              {saving ? (
                <>
                  <Loader2 className="size-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                "Save Priority Photos"
              )}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
