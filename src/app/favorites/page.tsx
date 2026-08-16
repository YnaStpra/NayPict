'use client';
import dynamic from "next/dynamic"
import { AppSidebar } from "@/components/layout/app-sidebar"
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
import { usePhotoList } from "@/hooks/use-photo-list"
import { PHOTO_LIST_PAGE_SIZE } from "@/server/const/global"
import { PhotoFavoriteEnum } from "@/server/enums/photo-enum"

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { PhotoMasonry } from "@/components/photo/photo-masonry"
import { photoFavorite, photoList, photoRecycle } from "@/request/photo"
import { removePhotoIdFromUrl } from "@/lib/url"
import { albumAddPhoto } from "@/request/album"
import { useAlbumStore } from "@/store/album-store"
import { useFavoriteContext } from "@/app/favorites/provider"
import { useApp } from "@/app/provider"
import { UserTypeEnum } from "@/server/enums/user-enum"
import { PhotoDateDrawer } from "@/components/photo/photo-date-drawer"
import { PhotoMasonrySkeleton } from "@/components/photo/photo-masonry-skeleton"
import { useTranslations } from "next-intl"

const AlbumSelectDialog = dynamic(
  () => import("@/components/album/album-select-dialog").then((mod) => mod.AlbumSelectDialog),
  { ssr: false }
)

const PhotoViewer = dynamic(
  () => import("@/components/photo/photo-viewer").then((mod) => mod.PhotoViewer),
  { ssr: false }
)

export default function Page() {
  const t = useTranslations("favorites")
  const { initialPhotos } = useFavoriteContext()
  const { userInfo, sidebarOpen, setSidebarOpen, refreshAlbums } = useApp()
  const isAdmin = userInfo?.type === UserTypeEnum.ADMIN
  // isBrowser Mark whether you are currently in the browser environment，SSR Stage display skeleton screen。
  const [isBrowser, setIsBrowser] = useState(false)
  const {
    photos,
    masonryKey,
    loadMorePhotos,
    refreshPhotoList,
    removePhotos,
    setPhotos,
  } = usePhotoList({ favorite: PhotoFavoriteEnum.YES }, PHOTO_LIST_PAGE_SIZE, initialPhotos)
  const [modelPhotoIndex, setModelPhotoIndex] = useState(0)
  const [showPhotoViewer, setShowPhotoViewer] = useState(false)
  // albumDialogOpen Control the opening status of the add album pop-up box。
  const [albumDialogOpen, setAlbumDialogOpen] = useState(false)
  // albumPhotoIds Save the photos to be added to the album this time id。
  const [albumPhotoIds, setAlbumPhotoIds] = useState<string[]>([])

  useLayoutEffect(() => {
    setIsBrowser(true)
  }, [])

  useEffect(() => {
    // Disable browser scroll recovery when refreshing favorites，and go back to the top of the photo list。
    const previousScrollRestoration = window.history.scrollRestoration

    window.history.scrollRestoration = 'manual'
    window.scrollTo(0, 0)

    return () => {
      window.history.scrollRestoration = previousScrollRestoration
    }
  }, [])

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
        console.error('Failed to load shared photo in favorites:', err)
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Open favorite photo details model.
  const openPhoto = useCallback((index: number) => {
    setModelPhotoIndex(index)
    setShowPhotoViewer(true)
  }, [])

  // Close photo details model.
  const closePhoto = useCallback(() => {
    setShowPhotoViewer(false)
    removePhotoIdFromUrl()
  }, [])

  // Switch the collection status of a single photo based on the photo subscript。
  const changePhotoFavorite = useCallback((index: number, setFavorite: (favorite: boolean) => void) => {
    const photo = photos[index]
    const favorite = photo.favorite === PhotoFavoriteEnum.YES
      ? PhotoFavoriteEnum.NO
      : PhotoFavoriteEnum.YES

    photoFavorite({ photoIds: [photo.photoId], favorite }).then(() => {
      setFavorite(favorite === PhotoFavoriteEnum.YES)
      photo.favorite = favorite
    })
  }, [photos])

  // Recycle selected collection photos in batches。
  const recyclePhotos = useCallback((photoIds: string[]) => {
    photoRecycle({ photoIds }).then(() => {
      removePhotos(photoIds)
    })
  }, [removePhotos])

  // Open the pop-up box for adding collected photos to albums in batches。
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

  // After selecting the album, add the favorite photos to the album。
  function changePhotoAlbum(albumIds: string[]) {
    albumAddPhoto({ albumIds, photoIds: albumPhotoIds }).then(() => {
      void refreshAlbums()

      const allAlbums = useAlbumStore.getState().albums
      const selectedAlbumObjs = allAlbums
        .filter((a: any) => albumIds.includes(a.albumId))
        .map((a: any) => ({ albumId: a.albumId, name: a.name }))

      setPhotos((prevPhotos: any[]) =>
        prevPhotos.map((photo: any) => {
          if (albumPhotoIds.includes(photo.photoId)) {
            const existingAlbums = photo.albums ?? []
            const combinedMap = new Map<string, { albumId: string; name: string }>()

            existingAlbums.forEach((a: any) => combinedMap.set(a.albumId, a))
            selectedAlbumObjs.forEach((a: any) => combinedMap.set(a.albumId, a))

            return {
              ...photo,
              albums: Array.from(combinedMap.values()),
            }
          }
          return photo
        })
      )
    })
  }

  // Save the currently selected time range of favorite photos，And filter the trigger list by shooting time。
  function changePhotoTime(range: { startDate: Date, endDate: Date }) {
    refreshPhotoList({
      favorite: PhotoFavoriteEnum.YES,
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
            <div className="fixed left-[calc(100vw-3.5rem)]  md:left-[calc(100vw-4rem)] top-0 flex h-12 items-center gap-1 px-4">
              <PhotoDateDrawer favorite={PhotoFavoriteEnum.YES} onRangeChange={changePhotoTime} />
            </div>
          </header>
          <div className="px-1 md:pl-1 md:pr-0">
            {isBrowser ? (
              <PhotoMasonry
                photos={photos}
                resetKey={masonryKey}
                onReachBottom={loadMorePhotos}
                onPhotoOpen={openPhoto}
                onPhotoFavorite={changePhotoFavorite}
                onPhotoDelete={recyclePhotos}
                onAlbumOpen={openAlbumDialog}
              />
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
        initialSelectedAlbumIds={initialAlbumIds}
      />
    </>
  )
}
