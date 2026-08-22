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
import { PhotoVisibilityEnum } from "@/server/enums/photo-enum"

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { toast } from "sonner"
import { PhotoMasonry } from "@/components/photo/photo-masonry"
import { photoList, photoRecycle } from "@/request/photo"
import { removePhotoIdFromUrl } from "@/lib/url"
import { albumAddPhoto, albumRemovePhoto } from "@/request/album"
import { useArchiveContext } from "@/app/archive/provider"
import { useApp } from "@/app/provider"
import { UserTypeEnum } from "@/server/enums/user-enum"
import { PhotoMasonrySkeleton } from "@/components/photo/photo-masonry-skeleton"
import { Archive, ShieldAlert } from "lucide-react"
import { useTranslations } from "next-intl"

const AlbumSelectDialog = dynamic(
  () => import("@/components/album/album-select-dialog").then((mod) => mod.AlbumSelectDialog),
  { ssr: false }
)

const PhotoViewer = dynamic(
  () => import("@/components/photo/photo-viewer").then((mod) => mod.PhotoViewer),
  { ssr: false }
)

const emptySubscribe = () => () => {}

export default function ArchivePage() {
  const isBrowser = useSyncExternalStore(emptySubscribe, () => true, () => false)
  const t = useTranslations()
  const { initialPhotos } = useArchiveContext()
  const { userInfo, sidebarOpen, setSidebarOpen, refreshAlbums } = useApp()
  const isAdmin = userInfo?.type === UserTypeEnum.ADMIN

  const {
    photos,
    masonryKey,
    loadMorePhotos,
    removePhotos,
    updatePhoto,
    updatePhotos,
    setPhotos,
  } = usePhotoList({ visibility: PhotoVisibilityEnum.ARCHIVED }, PHOTO_LIST_PAGE_SIZE, initialPhotos)

  const [modelPhotoIndex, setModelPhotoIndex] = useState(0)
  const [showPhotoViewer, setShowPhotoViewer] = useState(false)
  const [albumDialogOpen, setAlbumDialogOpen] = useState(false)
  const [albumPhotoIds, setAlbumPhotoIds] = useState<string[]>([])

  useEffect(() => {
    const previousScrollRestoration = window.history.scrollRestoration
    window.history.scrollRestoration = 'manual'
    window.scrollTo(0, 0)
    return () => {
      window.history.scrollRestoration = previousScrollRestoration
    }
  }, [])

  const initialDeepLinkHandledRef = useRef(false)

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
          setPhotos((prev) => {
            if (prev.some((p) => p.photoId === targetPhotoId)) return prev
            return [res.list[0], ...prev]
          })
          setModelPhotoIndex(0)
          setShowPhotoViewer(true)
        }
      })
      .catch((err) => {
        console.error("Failed to fetch photo for deep link in archive:", err)
      })
  }, [photos, setPhotos])

  const openPhoto = useCallback((index: number) => {
    setModelPhotoIndex(index)
    setShowPhotoViewer(true)
  }, [])

  const closePhoto = useCallback(() => {
    setShowPhotoViewer(false)
    removePhotoIdFromUrl()
  }, [])

  const recyclePhotos = useCallback((photoIds: string[]) => {
    if (!photoIds || !photoIds.length) return
    photoRecycle({ photoIds })
      .then(() => {
        removePhotos(photoIds)
        toast.success(t("photos.recycled") || "Moved to trash")
      })
      .catch((err) => {
        console.error("Failed to recycle photos:", err)
      })
  }, [removePhotos, t])

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

    const addedAlbumIds = albumIds.filter((id: string) => !initialAlbumIds.includes(id))
    const removedAlbumIds = initialAlbumIds.filter((id: string) => !albumIds.includes(id))

    try {
      const tasks: Promise<unknown>[] = []
      if (addedAlbumIds.length > 0) {
        tasks.push(albumAddPhoto({ albumIds: addedAlbumIds, photoIds: albumPhotoIds }))
      }
      if (removedAlbumIds.length > 0) {
        for (const remAlbumId of removedAlbumIds) {
          tasks.push(albumRemovePhoto({ albumId: remAlbumId, photoIds: albumPhotoIds }))
        }
      }
      await Promise.all(tasks)
      toast.success(t("albums.updated") || "Albums updated")
      refreshAlbums()
    } catch (err) {
      console.error("Failed to update photo albums:", err)
    }
  }

  if (!isAdmin) {
    return (
      <SidebarProvider open={sidebarOpen} onOpenChange={setSidebarOpen}>
        <AppSidebar />
        <SidebarInset>
          <div className="flex h-[80vh] flex-col items-center justify-center gap-3 text-center px-4">
            <ShieldAlert className="size-12 text-muted-foreground" />
            <h2 className="text-xl font-bold">Admin Access Required</h2>
            <p className="text-sm text-muted-foreground max-w-sm">
              The Archive area is restricted to gallery administrators.
            </p>
          </div>
        </SidebarInset>
      </SidebarProvider>
    )
  }

  return (
    <>
      <SidebarProvider open={sidebarOpen} onOpenChange={setSidebarOpen}>
        <AppSidebar />
        <SidebarInset>
          <header className="sticky top-0 z-30 flex h-12 shrink-0 items-center justify-between gap-2 bg-background/95 backdrop-blur-md border-b transition-[width,height] ease-linear">
            <div className="flex min-w-0 items-center gap-2 px-4">
              <SidebarTrigger className="-ml-1" />
              <Separator
                orientation="vertical"
                className="mr-2 data-vertical:h-4 data-vertical:self-auto"
              />
              <Breadcrumb>
                <BreadcrumbList>
                  <BreadcrumbItem>
                    <BreadcrumbPage className="flex items-center gap-1.5">
                      <Archive className="size-4 text-amber-500" />
                      <span>{t("archive.title") || "Archive"}</span>
                    </BreadcrumbPage>
                  </BreadcrumbItem>
                </BreadcrumbList>
              </Breadcrumb>
            </div>
          </header>

          <div className="px-3 md:pl-3 md:pr-2 pb-12">
            {isBrowser ? (
              photos.length === 0 ? (
                <div className="flex h-[60vh] flex-col items-center justify-center gap-3 text-center px-4">
                  <div className="size-16 rounded-3xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
                    <Archive className="size-8 text-amber-500" />
                  </div>
                  <h3 className="text-lg font-bold">{t("archive.emptyTitle") || "No Archived Photos"}</h3>
                  <p className="text-xs text-muted-foreground max-w-sm">
                    {t("archive.emptyDescription") || "Photos hidden from both Main Gallery and Albums will appear here."}
                  </p>
                </div>
              ) : (
                <PhotoMasonry
                  photos={photos}
                  resetKey={masonryKey}
                  onReachBottom={loadMorePhotos}
                  onPhotoOpen={openPhoto}
                  onPhotoDelete={recyclePhotos}
                  onAlbumOpen={openAlbumDialog}
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
        onPhotoDelete={(photoId) => recyclePhotos([photoId])}
        onPhotoUpdate={updatePhoto}
        onAlbumOpen={openAlbumDialog}
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
