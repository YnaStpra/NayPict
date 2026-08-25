'use client';
import dynamic from "next/dynamic"
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
  SidebarTrigger,
} from "@/components/ui/sidebar"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { usePhotoList } from "@/hooks/use-photo-list"

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { toast } from 'sonner'
import { PhotoMasonry } from "@/components/photo/photo-masonry"
import { PHOTO_LIST_PAGE_SIZE } from "@/server/const/global"
import { photoList, photoRecycle } from "@/request/photo"
import { removePhotoIdFromUrl } from "@/lib/url"
import { albumAddPhoto, albumRemovePhoto } from "@/request/album"
import { usePhotoStore } from "@/store/photo-store"
import { useAlbumStore } from "@/store/album-store"
import { ArrowUpDown, CalendarDays, ChevronDown, ImageIcon, LayoutGrid, Plus, Sparkles } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { PhotoDateDrawer } from "@/components/photo/photo-date-drawer"
import { PhotoMasonrySkeleton } from "@/components/photo/photo-masonry-skeleton"
import { BackToTopButton } from "@/components/ui/back-to-top-button"
import { usePhotoContext } from "@/app/photos/provider"
import { useApp } from "@/app/provider"
import { UserTypeEnum } from "@/server/enums/user-enum"
import { useTranslations } from "next-intl"
import { type PhotoOnThisDayItemVo, type PhotoVo } from "@/server/entity/vo/photo"

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

const OnThisDayBanner = dynamic(
  () => import("@/components/photo/on-this-day-banner").then((mod) => mod.OnThisDayBanner),
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

// Render photo list page with Masonry & Infinite Canvas mode support.
export default function Page() {
  const t = useTranslations("photos")
  const { initialPhotos } = usePhotoContext()
  const { userInfo, sidebarOpen, setSidebarOpen, refreshAlbums } = useApp()
  const isAdmin = userInfo?.type === UserTypeEnum.ADMIN

  const isBrowser = useSyncExternalStore(emptySubscribe, () => true, () => false)
  const [viewMode, setViewMode] = useState<"masonry" | "infinite">("masonry")
  const [sortKey, setSortKey] = useState<SortOptionKey>("none")
  const [groupByDate, setGroupByDate] = useState<boolean>(false)
  const [isScrolled, setIsScrolled] = useState<boolean>(false)

  // Passive scroll listener for Adaptive Frosted Header
  useEffect(() => {
    let ticking = false
    const onScroll = () => {
      if (!ticking) {
        window.requestAnimationFrame(() => {
          setIsScrolled(window.scrollY > 20)
          ticking = false
        })
        ticking = true
      }
    }
    window.addEventListener("scroll", onScroll, { passive: true })
    onScroll()
    return () => window.removeEventListener("scroll", onScroll)
  }, [])

  const {
    photos,
    totalCount,
    hasMore,
    setPhotos,
    masonryKey,
    loadMorePhotos,
    refreshPhotoList,
    prependPhotos,
    removePhotos,
    updatePhoto,
    updatePhotos,
  } = usePhotoList({}, PHOTO_LIST_PAGE_SIZE, initialPhotos)

  const handleSortChange = (key: SortOptionKey) => {
    setSortKey(key)
    const option = SORT_OPTIONS.find((o) => o.key === key)
    if (option) {
      refreshPhotoList({
        sortBy: option.sortBy ?? null,
        sortOrder: option.sortOrder ?? null,
        shuffle: option.shuffle ?? false,
      })
    }
  }

  const [modelPhotoIndex, setModelPhotoIndex] = useState(0)
  const [showPhotoViewer, setShowPhotoViewer] = useState(false)
  const [viewerCustomPhotos, setViewerCustomPhotos] = useState<PhotoVo[] | null>(null)
  const [albumDialogOpen, setAlbumDialogOpen] = useState(false)
  const [albumPhotoIds, setAlbumPhotoIds] = useState<string[]>([])
  const openUpload = usePhotoStore((state) => state.openUpload)
  const uploadedPhotos = usePhotoStore((state) => state.uploadedPhotos)

  useEffect(() => {
    const previousScrollRestoration = window.history.scrollRestoration

    window.history.scrollRestoration = 'manual'
    window.scrollTo(0, 0)

    return () => {
      window.history.scrollRestoration = previousScrollRestoration
    }
  }, [])

  useEffect(() => {
    if (!uploadedPhotos.length) {
      return
    }

    const photosToAdd = usePhotoStore.getState().takeUploadedPhotos()

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

    // 1. If photo already exists in list, open it immediately
    const existingIndex = photos.findIndex((p) => p.photoId === targetPhotoId)
    if (existingIndex !== -1) {
      initialDeepLinkHandledRef.current = true
      queueMicrotask(() => {
        setModelPhotoIndex(existingIndex)
        setShowPhotoViewer(true)
      })
      return
    }

    // 2. Otherwise fetch the shared photo directly from backend once photos list initialized
    if (photos.length > 0) {
      initialDeepLinkHandledRef.current = true
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
          console.error('Failed to load shared photo:', err)
        })
    }
  }, [photos, setPhotos])

  const openPhoto = useCallback((index: number) => {
    setViewerCustomPhotos(null)
    setModelPhotoIndex(index)
    setShowPhotoViewer(true)
  }, [])

  const handleOnThisDayPhotoClick = useCallback((_photo: PhotoOnThisDayItemVo, index: number, list: PhotoOnThisDayItemVo[]) => {
    setViewerCustomPhotos(list)
    setModelPhotoIndex(index)
    setShowPhotoViewer(true)
  }, [])

  const closePhoto = useCallback(() => {
    setShowPhotoViewer(false)
    setViewerCustomPhotos(null)
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

  const openAlbumDialog = useCallback((photoIds: string[]) => {
    setAlbumPhotoIds(photoIds)
    setAlbumDialogOpen(true)
  }, [])

  const initialAlbumIds = useMemo(() => {
    if (albumPhotoIds.length === 1) {
      const p = photos.find((photo) => photo.photoId === albumPhotoIds[0])
      return p?.albums?.map((a) => a.albumId) ?? []
    }
    return []
  }, [albumPhotoIds, photos])

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

      const allAlbums = useAlbumStore.getState().albums
      const selectedAlbumObjs = allAlbums
        .filter((a) => albumIds.includes(a.albumId))
        .map((a) => ({ albumId: a.albumId, name: a.name }))

      setPhotos((prevPhotos) =>
        prevPhotos.map((photo) => {
          if (albumPhotoIds.includes(photo.photoId)) {
            return {
              ...photo,
              albums: selectedAlbumObjs,
            }
          }
          return photo
        })
      )
    } catch (err) {
      console.error("Failed to update photo albums:", err)
      toast.error("Failed to update photo albums.")
    }
  }

  function changePhotoTime(range: { startDate: Date, endDate: Date }) {
    refreshPhotoList({
      startTakenTime: range.startDate.toISOString(),
      endTakenTime: range.endDate.toISOString(),
    })
  }

  return (
    <>
      <SidebarProvider open={sidebarOpen} onOpenChange={setSidebarOpen}>
        <AppSidebar />
        <SidebarInset className="min-w-0 max-w-full">
          <header
            className={`sticky top-0 z-30 flex h-12 shrink-0 items-center justify-between gap-2 transition-all duration-300 ${
              isScrolled
                ? "bg-background/80 backdrop-blur-xl border-b border-border/60 shadow-xs"
                : "bg-transparent border-b border-transparent"
            }`}
          >
            <div className="flex min-w-0 items-center gap-2 px-4">
              <SidebarTrigger className="-ml-1" />
              <Separator
                orientation="vertical"
                className="mr-2 data-vertical:h-4 data-vertical:self-auto"
              />
              <Breadcrumb>
                <BreadcrumbList>
                  <BreadcrumbItem>
                    <BreadcrumbPage className="flex items-center gap-2">
                      <span>{t("title")}</span>
                    </BreadcrumbPage>
                  </BreadcrumbItem>
                </BreadcrumbList>
              </Breadcrumb>
            </div>
            <div className="flex items-center gap-1.5 px-4 z-30">
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

              {/* Photo Count Badge beside Grid Icon */}
              <div
                className="flex items-center gap-1.5 bg-muted/70 text-foreground text-xs font-semibold px-2.5 py-1 rounded-lg border border-border/50 select-none shadow-2xs"
                title={`${totalCount} Photos`}
              >
                <ImageIcon className="size-3.5 text-primary" />
                <span>{totalCount}</span>
              </div>

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
                            ? "bg-primary/15 text-primary border border-primary/20 shadow-2xs"
                            : "text-muted-foreground hover:text-foreground"
                        }`}
                        onClick={() => setGroupByDate((prev) => !prev)}
                      >
                        <CalendarDays className="size-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">
                      {groupByDate ? "Grouped by Date Taken (Click to flatten)" : "Group Photos by Date Taken"}
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}

              {/* Sort By Dropdown Menu */}
              <DropdownMenu>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <DropdownMenuTrigger asChild>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-8 gap-1.5 px-2.5 text-xs font-semibold rounded-lg shadow-2xs border-border/60"
                        >
                          <ArrowUpDown className="size-3.5 text-primary shrink-0" />
                          <span className="hidden md:inline-block max-w-[140px] truncate">
                            {SORT_OPTIONS.find((o) => o.key === sortKey)?.label || "Sort"}
                          </span>
                          <ChevronDown className="size-3 text-muted-foreground" />
                        </Button>
                      </DropdownMenuTrigger>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">Sort Gallery Photos</TooltipContent>
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

              <PhotoDateDrawer onRangeChange={changePhotoTime} />
              {userInfo && (
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  onClick={() => openUpload(null)}
                >
                  <Plus />
                </Button>
              )}
            </div>
          </header>
          <div className="px-1 md:pl-1 md:pr-0 min-w-0 max-w-full">
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
                <>
                  <OnThisDayBanner onPhotoClick={handleOnThisDayPhotoClick} />
                  <PhotoMasonry
                    photos={photos}
                    resetKey={masonryKey}
                    groupByDate={groupByDate}
                    onReachBottom={loadMorePhotos}
                    onPhotoOpen={openPhoto}
                    onPhotoDelete={recyclePhotos}
                    onAlbumOpen={openAlbumDialog}
                    onPhotosUpdated={isAdmin ? updatePhotos : undefined}
                  />
                  {!hasMore && photos.length > 0 && (
                    <div className="py-12 pb-16 text-center select-none">
                      <p className="text-sm font-medium text-muted-foreground/80 tracking-wide">
                        That&apos;s all the photos for now, stay tuned for the next photo hunt!
                      </p>
                    </div>
                  )}
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
        photos={viewerCustomPhotos ?? photos}
        onBack={closePhoto}
        onBrowserBack={closePhoto}
        onPhotoDelete={(photoId) => recyclePhotos([photoId])}
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
