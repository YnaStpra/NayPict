'use client';
import dynamic from "next/dynamic"
import { useParams, useRouter } from "next/navigation"
import { useTranslations } from "next-intl"

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

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { PhotoMasonry } from "@/components/photo/photo-masonry"
import { PHOTO_LIST_PAGE_SIZE } from "@/server/const/global"
import { PhotoFavoriteEnum } from "@/server/enums/photo-enum"
import { photoFavorite, photoRecycle } from "@/request/photo"
import { albumAddPhoto, albumRemovePhoto } from "@/request/album"
import { useAlbumStore } from "@/store/album-store"
import { usePhotoStore } from "@/store/photo-store"
import { ArrowLeftIcon, ImageIcon, LayoutGrid, PlusIcon, Sparkles } from "lucide-react"
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

export default function Page() {
  const t = useTranslations("albums")
  const router = useRouter()
  const { albumId } = useParams<{ albumId: string }>()
  const { initialPhotos } = useAlbumPhotoContext()
  const { userInfo, sidebarOpen, setSidebarOpen, refreshAlbums } = useApp()
  const isAdmin = userInfo?.type === UserTypeEnum.ADMIN
  const currentAlbumName = useAlbumStore((state) => state.currentAlbumName)
  const albumIdRef = useRef(albumId)
  // isBrowser Mark whether you are currently in the browser environment, SSR Stage display skeleton screen.
  const [isBrowser, setIsBrowser] = useState(false)
  const [viewMode, setViewMode] = useState<"masonry" | "infinite">("masonry")
  const {
    photos,
    totalCount,
    masonryKey,
    loadMorePhotos,
    refreshPhotoList,
    prependPhotos,
    removePhotos,
  } = usePhotoList({ albumId }, PHOTO_LIST_PAGE_SIZE, initialPhotos)
  const [modelPhotoIndex, setModelPhotoIndex] = useState(0)
  const [showPhotoViewer, setShowPhotoViewer] = useState(false)
  // albumDialogOpen Control the opening status of the add album pop-up box。
  const [albumDialogOpen, setAlbumDialogOpen] = useState(false)
  // albumPhotoIds Save this photo to be added to other albums id。
  const [albumPhotoIds, setAlbumPhotoIds] = useState<string[]>([])
  const openUpload = usePhotoStore((state) => state.openUpload)
  const uploadedPhotos = usePhotoStore((state) => state.uploadedPhotos)

  useLayoutEffect(() => {
    setIsBrowser(true)
  }, [])

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

  // Open photo details of current album model。
  const openPhoto = useCallback((index: number) => {
    setModelPhotoIndex(index)
    setShowPhotoViewer(true)
  }, [])

  // Close photo details model。
  function closePhoto() {
    setShowPhotoViewer(false)
  }

  // Switch the collection status of a single photo based on the photo subscript。
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

  function changePhotoAlbum(albumIds: string[]) {
    const targetAlbumIds = albumIds.filter((targetAlbumId) => targetAlbumId !== albumId)

    if (!targetAlbumIds.length || !albumPhotoIds.length) {
      return
    }

    albumAddPhoto({ albumIds: targetAlbumIds, photoIds: albumPhotoIds })
      .then(() => {
        void refreshAlbums()
      })
      .catch((err) => {
        console.error("Failed to add photos to album:", err)
      })
  }

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
            className="sticky top-0 z-20 flex h-12 shrink-0 items-center justify-between gap-2 bg-background transition-[width,height] ease-linear">
            <div className="flex min-w-0 items-center gap-2 px-4">
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="-ml-1"
                onClick={() => router.back()}
              >
                <ArrowLeftIcon />
                <span className="sr-only">Back</span>
              </Button>
              <Separator
                orientation="vertical"
                className="mr-2 data-vertical:h-4 data-vertical:self-auto"
              />
              <Breadcrumb>
                <BreadcrumbList>
                  <BreadcrumbItem>
                    <BreadcrumbPage>{currentAlbumName || t("title")}</BreadcrumbPage>
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
                  onPhotoFavorite={isAdmin ? changePhotoFavorite : undefined}
                  onPhotoDelete={isAdmin ? recyclePhotos : undefined}
                  onAlbumOpen={isAdmin ? openAlbumDialog : undefined}
                  onAlbumRemove={isAdmin ? removeAlbumPhotos : undefined}
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
