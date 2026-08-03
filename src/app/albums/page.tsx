"use client"

import { AppSidebar } from "@/components/layout/app-sidebar"
import { AlertDialogDestructive } from "@/components/common/alert-destructive"
import { AlbumAddDialog } from "@/components/album/album-add-dialog"
import { AlbumRenameDialog } from "@/components/album/album-rename-dialog"
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
import dynamic from "next/dynamic"
import { useEffect, useState } from "react"
import { useAlbumContext } from "@/app/albums/provider"
import { useApp } from "@/app/provider"
import { albumAdd, albumDelete, albumList, albumSetName, albumSetTop } from "@/request/album"
import { type AlbumVo } from "@/server/entity/vo/album"
import { useTranslations } from "next-intl"

const AlbumMasonry = dynamic(
  () => import("@/components/album/album-masonry").then((mod) => mod.AlbumMasonry),
  { ssr: false },
)

export default function Page() {
  const t = useTranslations("albums")
  const { initialAlbums } = useAlbumContext()
  const { sidebarOpen, setSidebarOpen, refreshAlbums } = useApp()
  // albums Save the album list displayed on the current page。
  const [albums, setAlbums] = useState<AlbumVo[]>(initialAlbums)
  // albumListKey Used to force refresh the album waterfall flow layout。
  const [albumListKey, setAlbumListKey] = useState(0)
  // renameOpen Control the opening state of the name modification dialog box。
  const [renameOpen, setRenameOpen] = useState(false)
  // renamingAlbum Save the album whose name is currently being modified。
  const [renamingAlbum, setRenamingAlbum] = useState<AlbumVo | null>(null)
  // deleteOpen Control the opening state of the delete confirmation pop-up box。
  const [deleteOpen, setDeleteOpen] = useState(false)
  // deletingAlbum Save the album currently awaiting deletion confirmation。
  const [deletingAlbum, setDeletingAlbum] = useState<AlbumVo | null>(null)

  useEffect(() => {
    // Disable browser scroll recovery when refreshing album page，and go back to the top of the list。
    const previousScrollRestoration = window.history.scrollRestoration

    window.history.scrollRestoration = "manual"
    window.scrollTo(0, 0)

    return () => {
      window.history.scrollRestoration = previousScrollRestoration
    }
  }, [])

  // Load all album data。
  async function getAlbumList() {
    const data = await albumList()

    setAlbums(data)
    setAlbumListKey((prev) => prev + 1)
  }

  // Re-query the album page list and global album selection list。
  async function refreshAlbumData() {
    await getAlbumList()
    await refreshAlbums()
  }

  // Add album，and move the new album to the top of the list。
  function addAlbum(name: string) {
    albumAdd({ name }).then(() => {
      void refreshAlbumData()
    })
  }

  // Open the modify album name pop-up box。
  function renameAlbum(album: AlbumVo) {
    setRenamingAlbum(album)
    setRenameOpen(true)
  }

  // Handle photo album pinning operation。
  function topAlbum(album: AlbumVo) {
    albumSetTop({
      albumId: album.albumId,
    }).then(() => {
      void refreshAlbumData()
    })
  }

  // Open the delete confirmation popup。
  function openDeleteAlbum(album: AlbumVo) {
    if (album.photoTotal === 0) {
      deleteAlbum(album)
      return
    }

    setDeletingAlbum(album)
    setDeleteOpen(true)
  }

  // Update current list after deleting album。
  function deleteAlbum(album: AlbumVo) {
    albumDelete({
      albumId: album.albumId,
    }).then(() => {
      void refreshAlbumData()
    })
  }

  // Update current list after confirming deletion of album。
  function confirmDeleteAlbum() {
    const album = deletingAlbum

    if (!album) {
      return
    }

    setDeleteOpen(false)
    setTimeout(() => {
      setDeletingAlbum(null)
    }, 300)

    deleteAlbum(album)
  }

  // Submit new album name，Update the album name in the current list after success。
  function renameAlbumName(name: string) {
    const album = renamingAlbum

    if (!album) {
      return
    }

    setRenameOpen(false)
    setTimeout(() => {
      setRenamingAlbum(null)
    }, 300)

    albumSetName({
      albumId: album.albumId,
      name,
    }).then(() => {
      void refreshAlbumData()
    })
  }

  // Handle the open state of the name modification pop-up box。
  function handleRenameOpenChange(open: boolean) {
    setRenameOpen(open)

    if (!open) {
      setRenamingAlbum(null)
    }
  }

  // Handling the open state of the deletion confirmation pop-up box。
  function handleDeleteOpenChange(open: boolean) {
    setDeleteOpen(open)

    if (!open) {
      setTimeout(() => {
        setDeletingAlbum(null)
      }, 300)
    }
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
                    <BreadcrumbPage>{t("title")}</BreadcrumbPage>
                  </BreadcrumbItem>
                </BreadcrumbList>
              </Breadcrumb>
            </div>
            <div className="fixed left-[calc(100vw-3.5rem)]  md:left-[calc(100vw-4rem)] top-0 flex h-12 items-center gap-3 px-4">
              <AlbumAddDialog title={t("addTitle")} onNameConfirm={addAlbum} />
            </div>
          </header>
          <div className="px-2 md:pl-3 md:pr-2">
            <AlbumMasonry
              albums={albums}
              resetKey={albumListKey}
              onAlbumRename={renameAlbum}
              onAlbumTop={topAlbum}
              onAlbumDelete={openDeleteAlbum}
            />
          </div>
        </SidebarInset>
      </SidebarProvider>
      {renamingAlbum && (
        <AlbumRenameDialog
          open={renameOpen}
          name={renamingAlbum.name}
          onOpenChange={handleRenameOpenChange}
          onNameConfirm={renameAlbumName}
        />
      )}
      <AlertDialogDestructive
        open={deleteOpen}
        onOpenChange={handleDeleteOpenChange}
        title={t("deleteTitle")}
        description={t("deleteDescription")}
        onConfirm={confirmDeleteAlbum}
      />
    </>
  )
}
