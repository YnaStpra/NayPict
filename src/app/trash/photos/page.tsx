'use client';

import { useCallback, useEffect, useLayoutEffect, useState } from 'react'
import { PhotoMasonry } from "@/components/photo/photo-masonry"
import { useRouter } from "next/navigation"

import { AppSidebar } from "@/components/layout/app-sidebar"
import { AlertDialogDestructive } from "@/components/common/alert-destructive"
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
import { photoClear, photoDelete, photoRestore } from "@/request/photo"
import { toast } from "sonner"
import { PHOTO_LIST_PAGE_SIZE } from "@/server/const/global"
import { PhotoStatusEnum } from "@/server/enums/photo-enum"
import { useTrashPhotoContext } from "@/app/trash/photos/provider"
import { useApp } from "@/app/provider"
import { Button } from "@/components/ui/button"
import { ArrowLeftIcon, BrushCleaning } from "lucide-react"
import { PhotoMasonrySkeleton } from "@/components/photo/photo-masonry-skeleton"
import { useTranslations } from "next-intl"

export default function Page() {
  const t = useTranslations("trash")
  const router = useRouter()
  const { initialPhotos } = useTrashPhotoContext()
  const { sidebarOpen, setSidebarOpen } = useApp()
  // isBrowser Mark whether you are currently in the browser environment，SSR Stage display skeleton screen。
  const [isBrowser, setIsBrowser] = useState(false)
  // deleteOpen Control the open state of the complete deletion confirmation pop-up box。
  const [deleteOpen, setDeleteOpen] = useState(false)
  // deletingPhotoIds Save photos currently awaiting confirmation of complete deletion id。
  const [deletingPhotoIds, setDeletingPhotoIds] = useState<string[]>([])
  // clearOpen Control the opening status of the empty recycle bin confirmation pop-up box。
  const [clearOpen, setClearOpen] = useState(false)
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
    // Disable browser scroll recovery when refreshing recycle bin photo page，and go back to the top of the photo list。
    const previousScrollRestoration = window.history.scrollRestoration

    window.history.scrollRestoration = 'manual'
    window.scrollTo(0, 0)

    return () => {
      window.history.scrollRestoration = previousScrollRestoration
    }
  }, [])

  // Open the batch complete deletion confirmation pop-up box。
  const openDeletePhotos = useCallback((photoIds: string[]) => {
    setDeletingPhotoIds(photoIds)
    setDeleteOpen(true)
  }, [])

  // Open the empty recycle bin confirmation popup。
  function openClearPhotos() {
    if (!photos.length) {
      return
    }

    setClearOpen(true)
  }

  // Completely delete selected photos in the Recycle Bin in batches。
  function deletePhotos() {
    const photoIds = deletingPhotoIds

    setDeleteOpen(false)
    setTimeout(() => {
      setDeletingPhotoIds([])
    }, 300)

    photoDelete({ photoIds }).then(() => {
      removePhotos(photoIds)
    })
  }

  // Empty the current user's recycle bin photos，During the period, the loading and success status are prompted at the top.。
  function clearPhotos() {
    setClearOpen(false)

    toast.promise(
      photoClear().then(() => {
        setPhotos([])
        refreshMasonry()
      }),
      {
        loading: t("clearing"),
        success: t("cleared"),
      }
    )
  }

  // Restore selected photos from Recycle Bin，and remove it from the current recycle bin list。
  const restorePhotos = useCallback((photoIds: string[]) => {
    photoRestore({ photoIds }).then(() => {
      removePhotos(photoIds)
    })
  }, [removePhotos])

  // Handle complete deletion confirmation dialog box open state。
  function handleDeleteOpenChange(open: boolean) {
    setDeleteOpen(open)

    if (!open) {
      setTimeout(() => {
        setDeletingPhotoIds([])
      }, 300)
    }
  }

  // Handling the open status of the empty recycle bin confirmation pop-up box。
  function handleClearOpenChange(open: boolean) {
    setClearOpen(open)
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
                    <BreadcrumbPage className="flex items-center gap-2">
                      <span>{t("title")}</span>
                    </BreadcrumbPage>
                  </BreadcrumbItem>
                </BreadcrumbList>
              </Breadcrumb>
            </div>
            <div className="fixed left-[calc(100vw-3.5rem)]  md:left-[calc(100vw-4rem)] top-0 flex h-12 items-center gap-3 px-4">
              <Button
                type="button"
                size="icon"
                variant="ghost"
                onClick={openClearPhotos}
              >
                <BrushCleaning />
              </Button>
            </div>
          </header>
          <div className="px-1 md:pl-1 md:pr-0">
            {isBrowser ? (
              <PhotoMasonry
                photos={photos}
                resetKey={masonryKey}
                onReachBottom={loadMorePhotos}
                onPhotoDelete={openDeletePhotos}
                onPhotoRestore={restorePhotos}
              />
            ) : (
              <PhotoMasonrySkeleton photos={initialPhotos} />
            )}
          </div>
        </SidebarInset>
      </SidebarProvider>
      <AlertDialogDestructive
        open={deleteOpen}
        onOpenChange={handleDeleteOpenChange}
        title={t("deletePhotosTitle")}
        description={t("deletePhotosDescription")}
        onConfirm={deletePhotos}
      />
      <AlertDialogDestructive
        open={clearOpen}
        onOpenChange={handleClearOpenChange}
        title={t("clearTitle")}
        description={t("clearDescription")}
        confirmText={t("clear")}
        onConfirm={clearPhotos}
      />
    </>
  )
}
