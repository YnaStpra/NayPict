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
import { toast } from "sonner"

import { UserTypeEnum } from "@/server/enums/user-enum"

const AlbumMasonry = dynamic(
  () => import("@/components/album/album-masonry").then((mod) => mod.AlbumMasonry),
  { ssr: false },
)

const AlbumCoverDialog = dynamic(
  () => import("@/components/album/album-cover-dialog").then((mod) => mod.AlbumCoverDialog),
  { ssr: false },
)

export default function Page() {
  const t = useTranslations("albums")
  const { initialAlbums } = useAlbumContext()
  const { userInfo, sidebarOpen, setSidebarOpen, refreshAlbums } = useApp()
  const isAdmin = userInfo?.type === UserTypeEnum.ADMIN
  const [albums, setAlbums] = useState<AlbumVo[]>(initialAlbums)
  const [albumListKey, setAlbumListKey] = useState(0)
  const [renameOpen, setRenameOpen] = useState(false)
  const [renamingAlbum, setRenamingAlbum] = useState<AlbumVo | null>(null)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deletingAlbum, setDeletingAlbum] = useState<AlbumVo | null>(null)
  const [coverDialogOpen, setCoverDialogOpen] = useState(false)
  const [coverAlbum, setCoverAlbum] = useState<AlbumVo | null>(null)

  useEffect(() => {
    const previousScrollRestoration = window.history.scrollRestoration

    window.history.scrollRestoration = "manual"
    window.scrollTo(0, 0)

    return () => {
      window.history.scrollRestoration = previousScrollRestoration
    }
  }, [])

  async function getAlbumList() {
    const data = await albumList()

    setAlbums(data)
    setAlbumListKey((prev) => prev + 1)
  }

  async function refreshAlbumData() {
    await getAlbumList()
    await refreshAlbums()
  }

  function addAlbum(name: string) {
    albumAdd({ name })
      .then(() => {
        toast.success(`Album "${name}" berhasil dibuat!`)
        void refreshAlbumData()
      })
      .catch((err: unknown) => {
        console.error("Failed to add album:", err)
        toast.error((err as Error)?.message || "Gagal membuat album baru.")
      })
  }

  function renameAlbum(album: AlbumVo) {
    setRenamingAlbum(album)
    setRenameOpen(true)
  }

  function topAlbum(album: AlbumVo) {
    albumSetTop({
      albumId: album.albumId,
    }).then(() => {
      void refreshAlbumData()
    })
  }

  function openDeleteAlbum(album: AlbumVo) {
    if (album.photoTotal === 0) {
      deleteAlbum(album)
      return
    }

    setDeletingAlbum(album)
    setDeleteOpen(true)
  }

  function deleteAlbum(album: AlbumVo) {
    albumDelete({
      albumId: album.albumId,
    }).then(() => {
      void refreshAlbumData()
    })
  }

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

  function handleRenameOpenChange(open: boolean) {
    setRenameOpen(open)

    if (!open) {
      setRenamingAlbum(null)
    }
  }

  function handleDeleteOpenChange(open: boolean) {
    setDeleteOpen(open)

    if (!open) {
      setTimeout(() => {
        setDeletingAlbum(null)
      }, 300)
    }
  }

  function openChangeCover(album: AlbumVo) {
    setCoverAlbum(album)
    setCoverDialogOpen(true)
  }

  function handleCoverOpenChange(open: boolean) {
    setCoverDialogOpen(open)
    if (!open) {
      setTimeout(() => {
        setCoverAlbum(null)
      }, 300)
    }
  }

  return (
    <>
      <SidebarProvider open={sidebarOpen} onOpenChange={setSidebarOpen}>
        <AppSidebar />
        <SidebarInset>
          <header
            className="sticky top-0 z-30 flex h-12 shrink-0 items-center justify-between gap-2 bg-background/95 backdrop-blur-md border-b transition-[width,height] ease-linear">
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
            {isAdmin && (
              <div className="flex items-center gap-2 px-4 z-30">
                <AlbumAddDialog title={t("addTitle")} onNameConfirm={addAlbum} />
              </div>
            )}
          </header>
          <div className="px-2 md:pl-3 md:pr-2">
            <AlbumMasonry
              albums={albums}
              resetKey={albumListKey}
              onAlbumRename={isAdmin ? renameAlbum : undefined}
              onAlbumTop={isAdmin ? topAlbum : undefined}
              onAlbumDelete={isAdmin ? openDeleteAlbum : undefined}
              onAlbumChangeCover={isAdmin ? openChangeCover : undefined}
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
      <AlbumCoverDialog
        open={coverDialogOpen}
        album={coverAlbum}
        onOpenChange={handleCoverOpenChange}
        onSuccess={refreshAlbumData}
      />
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
