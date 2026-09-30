'use client';
import dynamic from "next/dynamic"
import { useParams, useRouter } from "next/navigation"
import { toast } from "sonner"

import { AppSidebar } from "@/components/layout/app-sidebar"
import { Button } from "@/components/ui/button"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
} from "@/components/ui/breadcrumb"
import { Separator } from "@/components/ui/separator"
import {
  SidebarProvider,
  SidebarInset,
} from "@/components/ui/sidebar"
import { usePhotoList } from "@/hooks/use-photo-list"

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { PhotoMasonry } from "@/components/photo/photo-masonry"
import { PHOTO_LIST_PAGE_SIZE } from "@/server/const/global"
import { photoList, photoRecycle } from "@/request/photo"
import { removePhotoIdFromUrl } from "@/lib/url"
import { albumAddPhoto, albumRemovePhoto, albumTogglePinPhoto, albumUnarchive } from "@/request/album"
import { useAlbumStore } from "@/store/album-store"
import { usePhotoStore } from "@/store/photo-store"
import type { PhotoVo } from "@/server/entity/vo/photo"
import { emitCatalogSync } from "@/lib/catalog-sync"
import { Archive, ArrowLeftIcon, ArrowUpDown, CalendarDays, ChevronDown, ImageIcon, LayoutGrid, PlusIcon, Sparkles } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { OdometerCounter } from "@/components/ui/odometer-counter"
import { useAlbumPhotoContext } from "@/app/albums/[albumId]/provider"
import { useApp } from "@/app/provider"
import { PhotoMasonrySkeleton } from "@/components/photo/photo-masonry-skeleton"
import { GalleryBottomStatus } from "@/components/photo/gallery-bottom-status"
import { BackToTopButton } from "@/components/ui/back-to-top-button"
import { UserTypeEnum } from "@/server/enums/user-enum"

const AlbumSelectDialog = dynamic(
  () => import("@/components/album/album-select-dialog").then((mod) => mod.AlbumSelectDialog),
  { ssr: false }
)

const PhotoViewer = dynamic(
  () => import("@/components/photo/photo-viewer").then((mod) => mod.PhotoViewer),
  { ssr: false }
)

const InfiniteGallery = dynamic(
  () => import("@/components/gallery/infinite-gallery").then((mod) => mod.InfiniteGallery),
  { ssr: false }
)

type SortOptionKey = 'none' | 'takenTime_desc' | 'takenTime_asc' | 'createTime_desc' | 'createTime_asc' | 'type_asc' | 'type_desc' | 'size_desc' | 'size_asc' | 'name_asc' | 'name_desc'

const SORT_OPTIONS: { key: SortOptionKey; label: string; sortBy?: 'takenTime' | 'createTime' | 'size' | 'name' | 'type' | null; sortOrder?: 'asc' | 'desc' | null; shuffle?: boolean }[] = [
  { key: 'none', label: 'Default / Random', sortBy: null, sortOrder: null, shuffle: true },
  { key: 'takenTime_desc', label: 'Taken Date (Newest)', sortBy: 'takenTime', sortOrder: 'desc', shuffle: false },
  { key: 'takenTime_asc', label: 'Taken Date (Oldest)', sortBy: 'takenTime', sortOrder: 'asc', shuffle: false },
  { key: 'createTime_desc', label: 'Recently Added', sortBy: 'createTime', sortOrder: 'desc', shuffle: false },
  { key: 'createTime_asc', label: 'Oldest Added', sortBy: 'createTime', sortOrder: 'asc', shuffle: false },
  { key: 'type_asc', label: 'Media Type (Videos First)', sortBy: 'type', sortOrder: 'asc', shuffle: false },
  { key: 'type_desc', label: 'Media Type (Photos First)', sortBy: 'type', sortOrder: 'desc', shuffle: false },
  { key: 'size_desc', label: 'File Size (Largest)', sortBy: 'size', sortOrder: 'desc', shuffle: false },
  { key: 'size_asc', label: 'File Size (Smallest)', sortBy: 'size', sortOrder: 'asc', shuffle: false },
  { key: 'name_asc', label: 'Name (A - Z)', sortBy: 'name', sortOrder: 'asc', shuffle: false },
  { key: 'name_desc', label: 'Name (Z - A)', sortBy: 'name', sortOrder: 'desc', shuffle: false },
]

const emptySubscribe = () => () => {}

export default function Page() {
  const isBrowser = useSyncExternalStore(emptySubscribe, () => true, () => false)
  const router = useRouter()
  const { albumId } = useParams<{ albumId: string }>()
  const { initialPhotos, initialTotal, album } = useAlbumPhotoContext()
  const { userInfo, sidebarOpen, setSidebarOpen, refreshAlbums } = useApp()
  const isAdmin = userInfo?.type === UserTypeEnum.ADMIN
  const currentAlbumName = useAlbumStore((state) => state.currentAlbumName)
  const albumDisplayName = album?.name || currentAlbumName || "Album"
  const [isArchived, setIsArchived] = useState(album?.isArchived === 1)
  const albumIdRef = useRef(albumId)
  const [viewMode, setViewMode] = useState<"masonry" | "infinite">("masonry")
  const [sortKey, setSortKey] = useState<SortOptionKey>("none")
  const [groupByDate, setGroupByDate] = useState(false)

  const handleUnarchiveAlbum = useCallback(async () => {
    try {
      await albumUnarchive({ albumId })
      setIsArchived(false)
      toast.success("Album restored from archive!")
      refreshAlbums()
      emitCatalogSync("all")
    } catch (err) {
      console.error("Failed to unarchive album:", err)
      toast.error("Failed to restore album from archive.")
    }
  }, [albumId, refreshAlbums])

  const {
    photos,
    totalCount,
    hasMore,
    loadingMore,
    loadMoreError,
    retryLoadMore,
    isOffline,
    masonryKey,
    loadMorePhotos,
    refreshPhotoList,
    silentRefresh,
    prependPhotos,
    removePhotos,
    updatePhoto,
    updatePhotos,
    setPhotos,
  } = usePhotoList({ albumId }, PHOTO_LIST_PAGE_SIZE, initialPhotos, initialTotal)

  // For archived albums: if admin visits, fetch photos client-side; if non-admin visitor visits, redirect to /albums
  useEffect(() => {
    if (isArchived) {
      if (isAdmin) {
        refreshPhotoList({ albumId })
      } else if (userInfo !== undefined && !isAdmin) {
        router.replace("/albums")
      }
    }
  }, [isArchived, isAdmin, userInfo, albumId, refreshPhotoList, router])

  // Listen for catalog events to re-sync album photos and metadata
  useEffect(() => {
    const handleSync = () => {
      silentRefresh()
    }

    window.addEventListener("naypict:album-changed", handleSync)
    window.addEventListener("naypict:photo-changed", handleSync)

    return () => {
      window.removeEventListener("naypict:album-changed", handleSync)
      window.removeEventListener("naypict:photo-changed", handleSync)
    }
  }, [silentRefresh])

  const handleSortChange = (key: SortOptionKey) => {
    setSortKey(key)

    // Automatically enable Group by Date when sorting by Taken Date (Newest or Oldest), matching main gallery
    if (key === 'takenTime_desc' || key === 'takenTime_asc') {
      setGroupByDate(true)
    } else {
      setGroupByDate(false)
    }

    const option = SORT_OPTIONS.find((o) => o.key === key)
    if (option) {
      refreshPhotoList({
        albumId,
        sortBy: option.sortBy ?? null,
        sortOrder: option.sortOrder ?? null,
        shuffle: option.shuffle ?? false,
      })
    }
  }

  // Toggle Group by Date: allows toggling on/off without resetting active Taken Date sorting
  const toggleGroupByDate = () => {
    setGroupByDate((prev) => {
      const next = !prev
      if (sortKey === 'takenTime_desc' || sortKey === 'takenTime_asc') {
        return next
      }
      if (next) {
        handleSortChange('takenTime_asc')
      } else {
        handleSortChange('none')
      }
      return next
    })
  }

  const [modelPhotoIndex, setModelPhotoIndex] = useState(0)
  const [showPhotoViewer, setShowPhotoViewer] = useState(false)
  // albumDialogOpen Control the opening status of the add album pop-up box.
  const [albumDialogOpen, setAlbumDialogOpen] = useState(false)
  // albumPhotoIds Save this photo to be added to other albums id.
  const [albumPhotoIds, setAlbumPhotoIds] = useState<string[]>([])
  const openUpload = usePhotoStore((state) => state.openUpload)
  const uploadedPhotos = usePhotoStore((state) => state.uploadedPhotos)

  useEffect(() => {
    // Disable browser scroll recovery when refreshing album photo page, and go back to the top of the photo list.
    const previousScrollRestoration = window.history.scrollRestoration

    window.history.scrollRestoration = 'manual'
    window.scrollTo(0, 0)

    return () => {
      window.history.scrollRestoration = previousScrollRestoration
    }
  }, [])

  useEffect(() => {
    // Sync current album id, For filtering when the upload is successful and consumed by the queue.
    albumIdRef.current = albumId
  }, [albumId])

  useEffect(() => {
    // Consumption upload success queue, Click on the new photo in the current album taken_time Insert the corresponding position in the list.
    if (!uploadedPhotos.length) {
      return
    }

    const photosToAdd = usePhotoStore.getState().takeUploadedPhotos()
      .filter((photo) => photo.uploadAlbumId === albumIdRef.current)

    if (!photosToAdd.length) {
      return
    }

    queueMicrotask(() => {
      prependPhotos(photosToAdd)
      emitCatalogSync("photo")
    })
  }, [prependPhotos, uploadedPhotos])

  const initialDeepLinkHandledRef = useRef(false)

  // Automatically open photo once on initial load if ?photoId=... is in the URL (direct share link)
  useEffect(() => {
    if (typeof window === 'undefined' || initialDeepLinkHandledRef.current) return
    const targetPhotoId = new URLSearchParams(window.location.search).get('photoId')
    if (!targetPhotoId) return

    initialDeepLinkHandledRef.current = true

    const existingIndex = photos.findIndex((p) => p.photoId === targetPhotoId)
    if (existingIndex !== -1) {
      queueMicrotask(() => {
        setModelPhotoIndex(existingIndex)
        setShowPhotoViewer(true)
      })
      return
    }

    photoList({ photoIds: [targetPhotoId], size: 1 })
      .then((res) => {
        if (res?.list && res.list.length > 0) {
          const targetPhoto = res.list[0]
          setPhotos((prev) => {
            if (prev.some((p) => p.photoId === targetPhoto.photoId)) {
              return prev
            }
            return [targetPhoto, ...prev]
          })
          setModelPhotoIndex(0)
          setShowPhotoViewer(true)
        }
      })
      .catch((err) => {
        console.error('Failed to load shared photo in album:', err)
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Open photo details of current album model.
  const openPhoto = useCallback((index: number) => {
    setModelPhotoIndex(index)
    setShowPhotoViewer(true)
  }, [])

  // Close photo details model.
  const closePhoto = useCallback(() => {
    setShowPhotoViewer(false)
    removePhotoIdFromUrl()
  }, [])

  const recyclePhotos = useCallback((photoIds: string[]) => {
    if (!photoIds || !photoIds.length) return
    photoRecycle({ photoIds })
      .then(() => {
        removePhotos(photoIds)
        emitCatalogSync("photo")
      })
      .catch((err) => {
        console.error("Failed to recycle photos:", err)
      })
  }, [removePhotos])

  const removeAlbumPhotos = useCallback((photoIds: string[]) => {
    if (!photoIds || !photoIds.length) return
    albumRemovePhoto({ albumId, photoIds })
      .then(() => {
        removePhotos(photoIds)
        void refreshAlbums()
        emitCatalogSync("all")
      })
      .catch((err) => {
        console.error("Failed to remove photos from album:", err)
      })
  }, [albumId, removePhotos, refreshAlbums])

  const openAlbumDialog = useCallback((photoIds: string[]) => {
    setAlbumPhotoIds(photoIds)
    setAlbumDialogOpen(true)
  }, [])

  const initialAlbumIds = useMemo(() => {
    if (albumPhotoIds.length === 1) {
      const p = photos.find((photo) => photo.photoId === albumPhotoIds[0])
      const existing = p?.albums?.map((a) => a.albumId) ?? []
      return Array.from(new Set([...existing, albumId]))
    }
    return [albumId]
  }, [albumPhotoIds, photos, albumId])

  async function changePhotoAlbum(albumIds: string[]) {
    if (!albumPhotoIds.length) return

    const addedAlbumIds = albumIds.filter((id) => !initialAlbumIds.includes(id))
    const removedAlbumIds = initialAlbumIds.filter((id) => !albumIds.includes(id))

    try {
      if (addedAlbumIds.length > 0) {
        await albumAddPhoto({ albumIds: addedAlbumIds, photoIds: albumPhotoIds })
      }
      if (removedAlbumIds.length > 0) {
        for (const remAlbumId of removedAlbumIds) {
          await albumRemovePhoto({ albumId: remAlbumId, photoIds: albumPhotoIds })
        }
      }

      toast.success("Media albums updated successfully!")
      void refreshAlbums()
      emitCatalogSync("all")

      // If removed from current album, remove from local list
      if (!albumIds.includes(albumId)) {
        removePhotos(albumPhotoIds)
      }
    } catch (err) {
      console.error("Failed to update media albums:", err)
      toast.error("Failed to update media albums.")
    }
  }

  // Toggle photo pin status in this album with Optimistic UI Mutation (0ms perceived latency & auto-rollback)
  const handleTogglePin = useCallback(async (photoId: string) => {
    let rollbackPhotos: PhotoVo[] | null = null

    // 1. Optimistically update local photos order and pin badge immediately
    setPhotos((prev) => {
      rollbackPhotos = prev
      const targetPhoto = prev.find((p) => p.photoId === photoId)
      if (!targetPhoto) return prev

      const nextPinned = !targetPhoto.isPinned
      const updatedPhoto: PhotoVo = { ...targetPhoto, isPinned: nextPinned }
      const otherPhotos = prev.filter((p) => p.photoId !== photoId)

      if (nextPinned) {
        const existingPinned = otherPhotos.filter((p) => p.isPinned)
        const unpinnedList = otherPhotos.filter((p) => !p.isPinned)
        return [updatedPhoto, ...existingPinned, ...unpinnedList]
      } else {
        const pinnedList = otherPhotos.filter((p) => p.isPinned)
        const unpinnedList = otherPhotos.filter((p) => !p.isPinned)
        return [...pinnedList, updatedPhoto, ...unpinnedList]
      }
    })

    try {
      const res = await albumTogglePinPhoto({ albumId, photoId })
      const isPinned = res.isPinned

      if (isPinned) {
        toast.success("Item pinned to the top of album!")
      } else {
        toast.success("Item unpinned from album.")
      }
      emitCatalogSync("album")
    } catch (err: unknown) {
      // 2. Revert back to original state on server error
      if (rollbackPhotos) {
        setPhotos(rollbackPhotos)
      }
      console.error("Failed to toggle pin item:", err)
      const errorMsg = err instanceof Error ? err.message : "Failed to pin item. Maximum 3 pinned items allowed."
      toast.error(errorMsg)
    }
  }, [albumId, setPhotos])

  const displayAlbumPhotos = useMemo(() => {
    if (sortKey === 'none') return photos
    return photos.map((p) => ({ ...p, isPinned: false }))
  }, [photos, sortKey])

  return (
    <>
      <SidebarProvider open={sidebarOpen} onOpenChange={setSidebarOpen}>
        <AppSidebar />
        <SidebarInset>
          <header
            className="sticky top-0 z-30 flex h-12 shrink-0 items-center justify-between gap-2 bg-background/95 backdrop-blur-md border-b transition-[width,height] ease-linear">
            <div className="flex min-w-0 items-center gap-2 px-4">
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="shrink-0"
                onClick={() => router.push(isArchived ? "/archive" : "/albums")}
                aria-label={isArchived ? "Back to archive" : "Back to albums"}
              >
                <ArrowLeftIcon className="size-4" />
              </Button>
              <Separator orientation="vertical" className="mr-2 h-4" />
              <Breadcrumb>
                <BreadcrumbList>
                  {isArchived && (
                    <>
                      <BreadcrumbItem>
                        <Button
                          variant="link"
                          className="h-auto p-0 text-xs font-normal text-muted-foreground hover:text-foreground"
                          onClick={() => router.push("/archive")}
                        >
                          Archive
                        </Button>
                      </BreadcrumbItem>
                      <BreadcrumbItem>
                        <span className="text-muted-foreground">/</span>
                      </BreadcrumbItem>
                    </>
                  )}
                  <BreadcrumbItem>
                    <BreadcrumbPage className="line-clamp-1 max-w-[200px] text-sm md:max-w-none flex items-center gap-1.5">
                      <span>{albumDisplayName}</span>
                      {isArchived && (
                        <span className="text-[10px] uppercase font-semibold tracking-wider bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 px-1.5 py-0.5 rounded">
                          Archived
                        </span>
                      )}
                    </BreadcrumbPage>
                  </BreadcrumbItem>
                </BreadcrumbList>
              </Breadcrumb>
            </div>
            <div className="flex items-center gap-1.5 px-4 z-30">
              {/* Photo Count Badge beside Infinite Gallery */}
              <div
                className="flex items-center gap-1.5 bg-muted/70 text-foreground text-xs font-semibold px-2.5 py-1 rounded-lg border border-border/50 select-none shadow-2xs tabular-nums"
                title={`${totalCount} Photos in Album`}
              >
                <ImageIcon className="size-3.5 text-emerald-500 dark:text-emerald-400 shrink-0" />
                <OdometerCounter target={totalCount} duration={900} />
              </div>

              {/* View Mode Toggle: Masonry vs 3D Infinite Canvas */}
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="size-8 p-0 rounded-full hover:bg-muted/60 transition-all duration-200 hover:scale-110 active:scale-95"
                      onClick={() => setViewMode((prev) => (prev === "masonry" ? "infinite" : "masonry"))}
                    >
                      {viewMode === "infinite" ? (
                        <LayoutGrid className="size-4.5 text-cyan-400 drop-shadow-[0_0_4px_rgba(34,211,238,0.8)] animate-pulse" />
                      ) : (
                        <Sparkles className="size-4.5 text-amber-400 dark:text-amber-300 drop-shadow-[0_0_4px_rgba(251,191,36,0.85)] animate-pulse" />
                      )}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">
                    {viewMode === "infinite" ? "Switch to Masonry Grid View" : "Switch to Infinite Canvas View"}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>

              {/* Group Photos by Date Taken Toggle */}
              {viewMode === "masonry" && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        type="button"
                        variant={groupByDate ? "secondary" : "ghost"}
                        size="icon"
                        className={`size-8 rounded-lg transition-all duration-200 cursor-pointer ${
                          groupByDate
                            ? "bg-sky-500/15 text-sky-500 dark:text-sky-400 border border-sky-500/30 shadow-2xs"
                            : "text-sky-500 dark:text-sky-400 hover:bg-sky-500/10 hover:text-sky-600 dark:hover:text-sky-300"
                        }`}
                        onClick={toggleGroupByDate}
                      >
                        <CalendarDays className="size-4 text-sky-500 dark:text-sky-400" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">
                      {groupByDate ? "Grouped by Date Taken (Click to flatten)" : "Group Media by Date Taken"}
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}

              {/* Sort Dropdown (Icon-only with panah bawah dan atas) */}
              <DropdownMenu modal={false}>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <DropdownMenuTrigger asChild>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="size-8 rounded-lg transition-all duration-200 cursor-pointer hover:bg-violet-500/10 active:scale-95 text-violet-500 dark:text-violet-400 border border-border/50 hover:border-violet-500/30 shadow-2xs"
                          aria-label="Sort Album Photos"
                        >
                          <ArrowUpDown className="size-4 text-violet-500 dark:text-violet-400 shrink-0" />
                        </Button>
                      </DropdownMenuTrigger>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">
                      {`Sort: ${SORT_OPTIONS.find((o) => o.key === sortKey)?.label || "Default"}`}
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>

                <DropdownMenuContent align="end" className="w-64 z-[50]">
                  <DropdownMenuLabel className="text-xs text-muted-foreground font-semibold px-2 py-1.5">
                    Sort By
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuRadioGroup value={sortKey} onValueChange={(val) => handleSortChange(val as SortOptionKey)}>
                    {SORT_OPTIONS.map((opt) => (
                      <DropdownMenuRadioItem key={opt.key} value={opt.key} className="text-xs font-medium cursor-pointer py-1.5">
                        {opt.label}
                      </DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                </DropdownMenuContent>
              </DropdownMenu>

              {isAdmin && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="size-8 rounded-lg transition-all duration-200 cursor-pointer hover:bg-emerald-500/10 active:scale-95 text-emerald-500 dark:text-emerald-400"
                        onClick={() => openUpload(albumId)}
                        aria-label="Add Media to Album"
                      >
                        <PlusIcon className="size-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">Add Media to Album</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
            </div>
          </header>
          {isArchived && (
            <div className="mx-3 my-2.5 flex items-center justify-between gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-xs md:text-sm text-amber-700 dark:text-amber-400">
              <div className="flex items-center gap-2 font-medium">
                <Archive className="size-4 shrink-0 text-amber-500" />
                <span>This album is archived. Its photos and videos are hidden from the public gallery.</span>
              </div>
              {isAdmin && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs border-amber-500/40 bg-background/80 hover:bg-amber-500/20 text-foreground"
                  onClick={handleUnarchiveAlbum}
                >
                  Unarchive Album
                </Button>
              )}
            </div>
          )}
          <div className="px-1 md:pl-1 md:pr-0">
            {isBrowser ? (
              viewMode === "infinite" ? (
                <div className="relative w-full h-[calc(100vh-3.5rem)] rounded-xl overflow-hidden border bg-background/50">
                  <InfiniteGallery
                    photos={displayAlbumPhotos}
                    onPhotoClick={(index) => openPhoto(index)}
                    density={10}
                    imageWidth={180}
                    imageHeight={180}
                    rounded={6}
                    dragSpeed={20}
                    driftAmount={15}
                    friction={10}
                  />
                </div>
              ) : (
                <>
                  <PhotoMasonry
                    photos={displayAlbumPhotos}
                    resetKey={masonryKey}
                    groupByDate={groupByDate}
                    groupByType={sortKey === 'type_asc' || sortKey === 'type_desc'}
                    onReachBottom={loadMorePhotos}
                    onPhotoOpen={openPhoto}
                    onPhotoDelete={isAdmin ? recyclePhotos : undefined}
                    onAlbumOpen={isAdmin ? openAlbumDialog : undefined}
                    onAlbumRemove={isAdmin ? removeAlbumPhotos : undefined}
                    onPhotoPin={isAdmin && sortKey === 'none' ? handleTogglePin : undefined}
                    onPhotosUpdated={isAdmin ? updatePhotos : undefined}
                  />
                  <GalleryBottomStatus
                    type="album"
                    totalCount={totalCount}
                    loadedCount={photos.length}
                    hasMore={hasMore}
                    loadingMore={loadingMore}
                    loadMoreError={loadMoreError}
                    isOffline={isOffline}
                    onReachBottom={loadMorePhotos}
                    onRetry={retryLoadMore}
                  />
                </>
              )
            ) : (
              <PhotoMasonrySkeleton photos={initialPhotos} />
            )}
          </div>
        </SidebarInset>
      </SidebarProvider>
      <PhotoViewer
        open={showPhotoViewer}
        index={modelPhotoIndex}
        photos={displayAlbumPhotos}
        onBack={closePhoto}
        onBrowserBack={closePhoto}
        onPhotoUpdate={updatePhoto}
        onAlbumOpen={isAdmin ? openAlbumDialog : undefined}
      />
      <AlbumSelectDialog
        open={albumDialogOpen}
        onOpenChange={setAlbumDialogOpen}
        onAlbumSelect={changePhotoAlbum}
        initialSelectedAlbumIds={initialAlbumIds}
      />
      <BackToTopButton />
    </>
  )
}
