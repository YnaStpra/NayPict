/* eslint-disable react-hooks/set-state-in-effect */
'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import dynamic from "next/dynamic"
import { toast } from "sonner"
import { useTranslations } from "next-intl"
import { BrushCleaning, ShieldAlert, Trash2 } from "lucide-react"

import { AppSidebar } from "@/components/layout/app-sidebar"
import { AlertDialogDestructive } from "@/components/common/alert-destructive"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
} from "@/components/ui/breadcrumb"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import {
  SidebarProvider,
  SidebarInset,
  SidebarTrigger,
} from "@/components/ui/sidebar"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { PhotoMasonry } from "@/components/photo/photo-masonry"
import { PhotoMasonrySkeleton } from "@/components/photo/photo-masonry-skeleton"
import { usePhotoList } from "@/hooks/use-photo-list"
import { photoClear, photoDelete, photoList, photoRestore } from "@/request/photo"
import { PHOTO_LIST_PAGE_SIZE } from "@/server/const/global"
import { PhotoStatusEnum } from "@/server/enums/photo-enum"
import { UserTypeEnum } from "@/server/enums/user-enum"
import { useTrashContext } from "@/app/trash/provider"
import { useApp } from "@/app/provider"
import { removePhotoIdFromUrl } from "@/lib/url"

const PhotoViewer = dynamic(
  () => import("@/components/photo/photo-viewer").then((mod) => mod.PhotoViewer),
  { ssr: false }
)

export default function TrashPage() {
  const t = useTranslations()
  // initialPhotos queried by server layout for immediate rendering
  const { initialPhotos } = useTrashContext()
  // App context containing auth state and sidebar toggles
  const { userInfo, sidebarOpen, setSidebarOpen } = useApp()
  // Check if current logged-in user is admin
  const isAdmin = userInfo?.type === UserTypeEnum.ADMIN

  // isBrowser marks if running on client for masonry hydration
  const [isBrowser, setIsBrowser] = useState(false)
  // deleteOpen controls single/batch permanent deletion dialog
  const [deleteOpen, setDeleteOpen] = useState(false)
  // deletingPhotoIds stores photo IDs selected for permanent deletion
  const [deletingPhotoIds, setDeletingPhotoIds] = useState<string[]>([])
  // clearOpen controls empty trash dialog
  const [clearOpen, setClearOpen] = useState(false)
  // modelPhotoIndex stores current active index for photo lightbox viewer
  const [modelPhotoIndex, setModelPhotoIndex] = useState(0)
  // showPhotoViewer controls photo lightbox open state
  const [showPhotoViewer, setShowPhotoViewer] = useState(false)

  // Infinite scroll photo list hook for recycled photos
  const {
    photos,
    setPhotos,
    masonryKey,
    loadMorePhotos,
    removePhotos,
    refreshMasonry,
  } = usePhotoList({ status: PhotoStatusEnum.DELETE }, PHOTO_LIST_PAGE_SIZE, initialPhotos)

  useLayoutEffect(() => {
    setIsBrowser(true)
  }, [])

  useEffect(() => {
    // Disable browser scroll restoration to ensure top position on mount
    const previousScrollRestoration = window.history.scrollRestoration
    window.history.scrollRestoration = 'manual'
    window.scrollTo(0, 0)

    return () => {
      window.history.scrollRestoration = previousScrollRestoration
    }
  }, [])

  // Ref to prevent multiple initial deep-link photo openings
  const initialDeepLinkHandledRef = useRef(false)

  useEffect(() => {
    // Handle ?photoId= query param deep linking directly into lightbox
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

    photoList({ photoIds: [targetPhotoId], size: 1, status: PhotoStatusEnum.DELETE })
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
        console.error("Failed to fetch photo for deep link in trash:", err)
      })
  }, [photos, setPhotos])

  // Open photo in lightbox viewer
  const openPhoto = useCallback((index: number) => {
    setModelPhotoIndex(index)
    setShowPhotoViewer(true)
  }, [])

  // Close photo lightbox viewer
  const closePhoto = useCallback(() => {
    setShowPhotoViewer(false)
    removePhotoIdFromUrl()
  }, [])

  // Open permanent deletion confirmation dialog for specific photo IDs
  const openDeletePhotos = useCallback((photoIds: string[]) => {
    setDeletingPhotoIds(photoIds)
    setDeleteOpen(true)
  }, [])

  // Open empty trash confirmation dialog
  const openClearPhotos = useCallback(() => {
    if (!photos.length) return
    setClearOpen(true)
  }, [photos.length])

  // Execute permanent deletion of selected photos
  const deletePhotos = useCallback(() => {
    const photoIds = deletingPhotoIds

    setDeleteOpen(false)
    setTimeout(() => {
      setDeletingPhotoIds([])
    }, 300)

    photoDelete({ photoIds }).then(() => {
      removePhotos(photoIds)
      toast.success("Photo(s) permanently deleted")
    })
  }, [deletingPhotoIds, removePhotos])

  // Empty all photos from the recycle bin
  const clearPhotos = useCallback(() => {
    setClearOpen(false)

    toast.promise(
      photoClear().then(() => {
        setPhotos([])
        refreshMasonry()
      }),
      {
        loading: t("trash.clearing") || "Emptying trash",
        success: t("trash.cleared") || "Trash emptied",
      }
    )
  }, [refreshMasonry, setPhotos, t])

  // Restore photos from trash back to active gallery/albums
  const restorePhotos = useCallback((photoIds: string[]) => {
    photoRestore({ photoIds }).then(() => {
      removePhotos(photoIds)
      toast.success("Photo(s) restored")
    })
  }, [removePhotos])

  // Handle deletion dialog visibility state change
  function handleDeleteOpenChange(open: boolean) {
    setDeleteOpen(open)
    if (!open) {
      setTimeout(() => {
        setDeletingPhotoIds([])
      }, 300)
    }
  }

  // Handle empty trash dialog visibility state change
  function handleClearOpenChange(open: boolean) {
    setClearOpen(open)
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
              The Trash area is restricted to gallery administrators.
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
                      <Trash2 className="size-4 text-red-500" />
                      <span>{t("trash.title") || "Trash"}</span>
                    </BreadcrumbPage>
                  </BreadcrumbItem>
                </BreadcrumbList>
              </Breadcrumb>
            </div>

            <div className="flex items-center gap-2 px-4">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={photos.length === 0}
                      onClick={openClearPhotos}
                      className="h-8 gap-1.5 text-xs text-muted-foreground hover:text-red-500 hover:border-red-500/50"
                    >
                      <BrushCleaning className="size-3.5" />
                      <span className="hidden sm:inline">{t("trash.clear") || "Empty Trash"}</span>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">
                    <p>{t("trash.clear") || "Empty Trash"}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          </header>

          <div className="px-1 md:pl-1 md:pr-0">
            {isBrowser ? (
              photos.length > 0 ? (
                <PhotoMasonry
                  photos={photos}
                  resetKey={masonryKey}
                  onReachBottom={loadMorePhotos}
                  onPhotoOpen={openPhoto}
                  onPhotoDelete={openDeletePhotos}
                  onPhotoRestore={restorePhotos}
                />
              ) : (
                <div className="flex h-[60vh] flex-col items-center justify-center gap-3 text-center px-4">
                  <div className="flex size-14 items-center justify-center rounded-full bg-muted">
                    <Trash2 className="size-7 text-muted-foreground/60" />
                  </div>
                  <h3 className="text-lg font-semibold">{t("trash.emptyTitle") || "Trash is Empty"}</h3>
                  <p className="text-sm text-muted-foreground max-w-sm">
                    {t("trash.emptyDescription") || "Photos you delete will appear here."}
                  </p>
                </div>
              )
            ) : (
              <PhotoMasonrySkeleton photos={initialPhotos} />
            )}
          </div>
        </SidebarInset>
      </SidebarProvider>

      {/* Lightbox Photo Viewer */}
      <PhotoViewer
        open={showPhotoViewer}
        index={modelPhotoIndex}
        photos={photos}
        onBack={closePhoto}
        onBrowserBack={closePhoto}
        onPhotoDelete={(photoId) => openDeletePhotos([photoId])}
      />

      {/* Permanent Delete Confirmation Dialog */}
      <AlertDialogDestructive
        open={deleteOpen}
        onOpenChange={handleDeleteOpenChange}
        title={t("trash.deletePhotosTitle") || "Permanently Delete These Photos?"}
        description={t("trash.deletePhotosDescription") || "These photos will be permanently deleted and can't be recovered."}
        onConfirm={deletePhotos}
      />

      {/* Empty Trash Confirmation Dialog */}
      <AlertDialogDestructive
        open={clearOpen}
        onOpenChange={handleClearOpenChange}
        title={t("trash.clearTitle") || "Empty the Trash?"}
        description={t("trash.clearDescription") || "All photos in the trash will be permanently deleted."}
        confirmText={t("trash.clear") || "Empty trash"}
        onConfirm={clearPhotos}
      />
    </>
  )
}
