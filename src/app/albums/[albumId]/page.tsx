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
import { albumAddPhoto, albumRemovePhoto, albumTogglePinPhoto } from "@/request/album"
import { useAlbumStore } from "@/store/album-store"
import { usePhotoStore } from "@/store/photo-store"
import { ArrowLeftIcon, ArrowUpDown, ChevronDown, ImageIcon, LayoutGrid, PlusIcon, Sparkles } from "lucide-react"
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
import { useAlbumPhotoContext } from "@/app/albums/[albumId]/provider"
import { useApp } from "@/app/provider"
import { PhotoDateDrawer } from "@/components/photo/photo-date-drawer"
import { PhotoMasonrySkeleton } from "@/components/photo/photo-masonry-skeleton"
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

type SortOptionKey = 'none' | 'takenTime_desc' | 'takenTime_asc' | 'createTime_desc' | 'createTime_asc' | 'size_desc' | 'size_asc' | 'name_asc' | 'name_desc'

const SORT_OPTIONS: { key: SortOptionKey; label: string; sortBy?: 'takenTime' | 'createTime' | 'size' | 'name' | null; sortOrder?: 'asc' | 'desc' | null; shuffle?: boolean }[] = [
  { key: 'none', label: 'Default / Random', sortBy: null, sortOrder: null, shuffle: true },
  { key: 'takenTime_desc', label: 'Taken Date (Newest)', sortBy: 'takenTime', sortOrder: 'desc', shuffle: false },
  { key: 'takenTime_asc', label: 'Taken Date (Oldest)', sortBy: 'takenTime', sortOrder: 'asc', shuffle: false },
  { key: 'createTime_desc', label: 'Recently Added', sortBy: 'createTime', sortOrder: 'desc', shuffle: false },
  { key: 'createTime_asc', label: 'Oldest Added', sortBy: 'createTime', sortOrder: 'asc', shuffle: false },
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
  const { initialPhotos } = useAlbumPhotoContext()
  const { userInfo, sidebarOpen, setSidebarOpen, refreshAlbums } = useApp()
  const isAdmin = userInfo?.type === UserTypeEnum.ADMIN
  const currentAlbumName = useAlbumStore((state) => state.currentAlbumName)
  const albumIdRef = useRef(albumId)
  const [viewMode, setViewMode] = useState<"masonry" | "infinite">("masonry")
  const [sortKey, setSortKey] = useState<SortOptionKey>("none")

  const {
    photos,
    totalCount,
    masonryKey,
    loadMorePhotos,
    refreshPhotoList,
    prependPhotos,
    removePhotos,
    updatePhoto,
    updatePhotos,
    setPhotos,
  } = usePhotoList({ albumId }, PHOTO_LIST_PAGE_SIZE, initialPhotos)

  const handleSortChange = (key: SortOptionKey) => {
    setSortKey(key)
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
  const [modelPhotoIndex, setModelPhotoIndex] = useState(0)
  const [showPhotoViewer, setShowPhotoViewer] = useState(false)
  // albumDialogOpen Control the opening status of the add album pop-up box。
  const [albumDialogOpen, setAlbumDialogOpen] = useState(false)
  // albumPhotoIds Save this photo to be added to other albums id。
  const [albumPhotoIds, setAlbumPhotoIds] = useState<string[]>([])
  const openUpload = usePhotoStore((state) => state.openUpload)
  const uploadedPhotos = usePhotoStore((state) => state.uploadedPhotos)

  useEffect(() => {
    // Disable browser scroll recovery when refreshing album photo page，and go back to the top of the photo list。
    const previousScrollRestoration = window.history.scrollRestoration

    window.history.scrollRestoration = 'manual'
    window.scrollTo(0, 0)

    return () => {
      window.history.scrollRestoration = previousScrollRestoration
    }
  }, [])

  useEffect(() => {
    // Sync current album id，For filtering when the upload is successful and consumed by the queue。
    albumIdRef.current = albumId
  }, [albumId])

  useEffect(() => {
    // Consumption upload success queue，Click on the new photo in the current album taken_time Insert the corresponding position in the list。
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

      toast.success("Photo albums updated successfully!")
      void refreshAlbums()

      // If removed from current album, remove from local list
      if (!albumIds.includes(albumId)) {
        removePhotos(albumPhotoIds)
      }
    } catch (err) {
      console.error("Failed to update photo albums:", err)
      toast.error("Failed to update photo albums.")
    }
  }

  // Toggle photo pin status in this album (admin only, max 3 photos)
  const handleTogglePin = useCallback(async (photoId: string) => {
    try {
      const res = await albumTogglePinPhoto({ albumId, photoId })
      const isPinned = res.isPinned

      setPhotos((prev) => {
        const targetPhoto = prev.find((p) => p.photoId === photoId)
        if (!targetPhoto) return prev

        const updatedPhoto = { ...targetPhoto, isPinned }
        const otherPhotos = prev.filter((p) => p.photoId !== photoId)

        if (isPinned) {
          // Place newly pinned photo at top, followed by existing pinned photos, then unpinned
          const existingPinned = otherPhotos.filter((p) => p.isPinned)
          const unpinnedList = otherPhotos.filter((p) => !p.isPinned)
          return [updatedPhoto, ...existingPinned, ...unpinnedList]
        } else {
          // If unpinned, keep remaining pinned at top, then unpinned photos
          const pinnedList = otherPhotos.filter((p) => p.isPinned)
          const unpinnedList = otherPhotos.filter((p) => !p.isPinned)
          return [...pinnedList, updatedPhoto, ...unpinnedList]
        }
      })

      if (isPinned) {
        toast.success("Photo pinned to the top of album!")
      } else {
        toast.success("Photo unpinned from album.")
      }
    } catch (err: unknown) {
      console.error("Failed to toggle pin photo:", err)
      const errorMsg = err instanceof Error ? err.message : "Failed to pin photo. Maximum 3 pinned photos allowed."
      toast.error(errorMsg)
    }
  }, [albumId, setPhotos])

  // Save the currently selected album photo time range，And filter the trigger list by shooting time。
  function changePhotoTime(range: { startDate: Date, endDate: Date }) {
    refreshPhotoList({
      albumId,
      startTakenTime: range.startDate.toISOString(),
      endTakenTime: range.endDate.toISOString(),
    })
  }

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
                onClick={() => router.push("/albums")}
                aria-label="Back to albums"
              >
                <ArrowLeftIcon className="size-4" />
              </Button>
              <Separator orientation="vertical" className="mr-2 h-4" />
              <Breadcrumb>
                <BreadcrumbList>
                  <BreadcrumbItem>
                    <BreadcrumbPage className="line-clamp-1 max-w-[200px] text-sm md:max-w-none">
                      {currentAlbumName || "..."}
                    </BreadcrumbPage>
                  </BreadcrumbItem>
                </BreadcrumbList>
              </Breadcrumb>
            </div>
            <div className="flex items-center gap-2 px-4">
              {/* View Mode Toggle: Masonry vs 3D Infinite Canvas */}
              <div className="flex items-center rounded-lg border bg-muted/40 p-0.5">
                <Button
                  type="button"
                  size="icon-sm"
                  variant={viewMode === "masonry" ? "secondary" : "ghost"}
                  className="size-7 rounded-md"
                  onClick={() => setViewMode("masonry")}
                  aria-label="Masonry grid view"
                  title="Masonry Grid"
                >
                  <LayoutGrid className="size-3.5" />
                </Button>
                <Button
                  type="button"
                  size="icon-sm"
                  variant={viewMode === "infinite" ? "secondary" : "ghost"}
                  className="size-7 rounded-md"
                  onClick={() => setViewMode("infinite")}
                  aria-label="3D Infinite gallery view"
                  title="3D Canvas (Infinite)"
                >
                  <Sparkles className="size-3.5 text-amber-500" />
                </Button>
              </div>

              {/* Photo Count Badge */}
              <div
                className="hidden sm:flex items-center gap-1.5 bg-muted/70 text-foreground text-xs font-semibold px-2.5 py-1 rounded-lg border border-border/50 select-none shadow-2xs"
                title={`${totalCount} Photos`}
              >
                <ImageIcon className="size-3.5 text-primary" />
                <span>{totalCount}</span>
              </div>

              {/* Sort Dropdown */}
              <DropdownMenu>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 gap-1.5 px-2.5 text-xs font-medium bg-background/80 backdrop-blur-sm border-dashed hover:border-solid hover:bg-accent/60 transition-all shadow-xs"
                        >
                          <ArrowUpDown className="size-3.5 text-primary shrink-0" />
                          <span className="hidden md:inline-block max-w-[140px] truncate">
                            {SORT_OPTIONS.find((o) => o.key === sortKey)?.label || "Sort"}
                          </span>
                          <ChevronDown className="size-3 text-muted-foreground" />
                        </Button>
                      </DropdownMenuTrigger>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">Sort Album Photos</TooltipContent>
                  </Tooltip>
                </TooltipProvider>

                <DropdownMenuContent align="end" className="w-56 z-[50]">
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

              <PhotoDateDrawer albumId={albumId} onRangeChange={changePhotoTime} />
              {isAdmin && (
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  onClick={() => openUpload(albumId)}
                >
                  <PlusIcon />
                </Button>
              )}
            </div>
          </header>
          <div className="px-1 md:pl-1 md:pr-0">
            {isBrowser ? (
              viewMode === "infinite" ? (
                <div className="relative w-full h-[calc(100vh-3.5rem)] rounded-xl overflow-hidden border bg-background/50">
                  <InfiniteGallery
                    photos={photos}
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
                <PhotoMasonry
                  photos={photos}
                  resetKey={masonryKey}
                  onReachBottom={loadMorePhotos}
                  onPhotoOpen={openPhoto}
                  onPhotoDelete={isAdmin ? recyclePhotos : undefined}
                  onAlbumOpen={isAdmin ? openAlbumDialog : undefined}
                  onAlbumRemove={isAdmin ? removeAlbumPhotos : undefined}
                  onPhotoPin={isAdmin ? handleTogglePin : undefined}
                  onPhotosUpdated={isAdmin ? updatePhotos : undefined}
                />
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
        photos={photos}
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
