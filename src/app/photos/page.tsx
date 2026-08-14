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

import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { PhotoMasonry } from "@/components/photo/photo-masonry"
import { PHOTO_LIST_PAGE_SIZE } from "@/server/const/global"
import { PhotoFavoriteEnum } from "@/server/enums/photo-enum"
import { photoFavorite, photoRecycle } from "@/request/photo"
import { albumAddPhoto } from "@/request/album"
import { usePhotoStore } from "@/store/photo-store"
import { ArrowUpDown, ChevronDown, ImageIcon, LayoutGrid, Plus, Sparkles } from "lucide-react"
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
  { key: 'none', label: 'Default / Acak (Bawaan Web)', sortBy: null, sortOrder: null, shuffle: true },
  { key: 'takenTime_desc', label: 'Tanggal Foto (Terbaru)', sortBy: 'takenTime', sortOrder: 'desc', shuffle: false },
  { key: 'takenTime_asc', label: 'Tanggal Foto (Terlama)', sortBy: 'takenTime', sortOrder: 'asc', shuffle: false },
  { key: 'createTime_desc', label: 'Terakhir Ditambahkan', sortBy: 'createTime', sortOrder: 'desc', shuffle: false },
  { key: 'createTime_asc', label: 'Pertama Ditambahkan', sortBy: 'createTime', sortOrder: 'asc', shuffle: false },
  { key: 'size_desc', label: 'Ukuran Berkas (Terbesar)', sortBy: 'size', sortOrder: 'desc', shuffle: false },
  { key: 'size_asc', label: 'Ukuran Berkas (Terkecil)', sortBy: 'size', sortOrder: 'asc', shuffle: false },
  { key: 'name_asc', label: 'Nama Foto (A - Z)', sortBy: 'name', sortOrder: 'asc', shuffle: false },
  { key: 'name_desc', label: 'Nama Foto (Z - A)', sortBy: 'name', sortOrder: 'desc', shuffle: false },
]

// Render photo list page with Masonry & Infinite Canvas mode support.
export default function Page() {
  const t = useTranslations("photos")
  const { initialPhotos } = usePhotoContext()
  const { userInfo, sidebarOpen, setSidebarOpen, refreshAlbums } = useApp()
  const isAdmin = userInfo?.type === UserTypeEnum.ADMIN

  const [isBrowser, setIsBrowser] = useState(false)
  const [viewMode, setViewMode] = useState<"masonry" | "infinite">("masonry")
  const [sortKey, setSortKey] = useState<SortOptionKey>("none")

  const {
    photos,
    totalCount,
    hasMore,
    masonryKey,
    loadMorePhotos,
    refreshPhotoList,
    prependPhotos,
    removePhotos,
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
  const [albumDialogOpen, setAlbumDialogOpen] = useState(false)
  const [albumPhotoIds, setAlbumPhotoIds] = useState<string[]>([])
  const openUpload = usePhotoStore((state) => state.openUpload)
  const uploadedPhotos = usePhotoStore((state) => state.uploadedPhotos)

  useLayoutEffect(() => {
    setIsBrowser(true)
  }, [])

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

  const openPhoto = useCallback((index: number) => {
    setModelPhotoIndex(index)
    setShowPhotoViewer(true)
  }, [])

  function closePhoto() {
    setShowPhotoViewer(false)
  }

  const changePhotoFavorite = useCallback((index: number, setFavorite: (favorite: boolean) => void) => {
    const photo = photos[index]
    if (!photo) return
    const favorite = photo.favorite === PhotoFavoriteEnum.YES
      ? PhotoFavoriteEnum.NO
      : PhotoFavoriteEnum.YES

    photoFavorite({ photoIds: [photo.photoId], favorite })
      .then(() => {
        setFavorite(favorite === PhotoFavoriteEnum.YES)
        photo.favorite = favorite
      })
      .catch((err) => {
        console.error("Failed to update favorite:", err)
      })
  }, [photos])

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

  function changePhotoAlbum(albumIds: string[]) {
    if (!albumIds.length || !albumPhotoIds.length) return
    albumAddPhoto({ albumIds, photoIds: albumPhotoIds })
      .then(() => {
        toast.success("Album foto berhasil diperbarui!")
        void refreshAlbums()
        refreshPhotoList()
      })
      .catch((err) => {
        console.error("Failed to add photos to album:", err)
        toast.error("Gagal memperbarui album foto.")
      })
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
        <SidebarInset>
          <header
            className="sticky top-0 z-20 flex h-12 shrink-0 items-center justify-between gap-2 bg-background transition-[width,height] ease-linear">
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
                      variant={viewMode === "infinite" ? "secondary" : "ghost"}
                      className="size-8 rounded-lg"
                      onClick={() => setViewMode((prev) => (prev === "masonry" ? "infinite" : "masonry"))}
                    >
                      {viewMode === "infinite" ? <LayoutGrid className="size-4 text-primary" /> : <Sparkles className="size-4" />}
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
                            {SORT_OPTIONS.find((o) => o.key === sortKey)?.label || "Urutkan"}
                          </span>
                          <ChevronDown className="size-3 text-muted-foreground" />
                        </Button>
                      </DropdownMenuTrigger>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">Urutkan Foto Galeri</TooltipContent>
                  </Tooltip>
                </TooltipProvider>

                <DropdownMenuContent align="end" className="w-56 z-[50]">
                  <DropdownMenuLabel className="text-xs text-muted-foreground font-semibold px-2 py-1.5">
                    Urutkan Berdasarkan
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
                <>
                  <PhotoMasonry
                    photos={photos}
                    resetKey={masonryKey}
                    onReachBottom={loadMorePhotos}
                    onPhotoOpen={openPhoto}
                    onPhotoFavorite={isAdmin ? changePhotoFavorite : undefined}
                    onPhotoDelete={recyclePhotos}
                    onAlbumOpen={openAlbumDialog}
                  />
                  {!hasMore && photos.length > 0 && (
                    <div className="py-12 pb-16 text-center select-none">
                      <p className="text-sm font-medium text-muted-foreground/80 tracking-wide">
                        yahh fotonya sampe sini doang cuy, tunggu gw hunting lagi yeah..
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
        photos={photos}
        onBack={closePhoto}
        onBrowserBack={closePhoto}
        onPhotoDelete={(photoId) => recyclePhotos([photoId])}
        onAlbumOpen={isAdmin ? openAlbumDialog : undefined}
      />
      <AlbumSelectDialog
        open={albumDialogOpen}
        onOpenChange={setAlbumDialogOpen}
        onAlbumSelect={changePhotoAlbum}
      />
      <BackToTopButton />
    </>
  )
}
