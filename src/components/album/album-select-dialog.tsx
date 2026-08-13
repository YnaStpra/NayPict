"use client"

import { useEffect, useState } from "react"
import { useTranslations } from "next-intl"
import { PlusIcon, CheckIcon } from "lucide-react"
import { toast } from "sonner"

import { Dialog } from "@/components/common/dialog"
import { Checkbox } from "@/components/ui/checkbox"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item"
import { useAlbumStore } from "@/store/album-store"
import { albumAdd } from "@/request/album"
import { useApp } from "@/app/provider"

interface AlbumSelectDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onAlbumSelect: (albumIds: string[]) => void
  initialSelectedAlbumIds?: string[]
}

// Render the album selection popup used when adding photos to an album.
export function AlbumSelectDialog({ open, onOpenChange, onAlbumSelect, initialSelectedAlbumIds }: AlbumSelectDialogProps) {
  const t = useTranslations("albums")
  const albums = useAlbumStore((state) => state.albums)
  const { refreshAlbums } = useApp()

  // selectedAlbumIds saves the currently selected album ID list.
  const [selectedAlbumIds, setSelectedAlbumIds] = useState<string[]>([])
  const [creating, setCreating] = useState(false)
  const [newAlbumName, setNewAlbumName] = useState("")

  // Clear selected albums & creation state after closing popup.
  useEffect(() => {
    if (open) {
      if (initialSelectedAlbumIds && initialSelectedAlbumIds.length > 0) {
        setSelectedAlbumIds(initialSelectedAlbumIds)
      }
    } else {
      setSelectedAlbumIds([])
      setCreating(false)
      setNewAlbumName("")
    }
  }, [open, initialSelectedAlbumIds])

  // Toggle album selection.
  function changeAlbum(albumId: string) {
    setSelectedAlbumIds((prev) => (
      prev.includes(albumId)
        ? prev.filter((item) => item !== albumId)
        : [...prev, albumId]
    ))
  }

  // Confirm selection and notify parent component.
  function selectAlbum(albumIds: string[]) {
    onAlbumSelect(albumIds)
    onOpenChange(false)
  }

  function saveAlbum() {
    if (!selectedAlbumIds.length) {
      onOpenChange(false)
      return
    }

    selectAlbum(selectedAlbumIds)
  }

  // Handle new album creation directly inside the selection dialog.
  async function handleCreateNewAlbum() {
    const name = newAlbumName.trim()
    if (!name) return

    try {
      const res = await albumAdd({ name })
      await refreshAlbums()
      const createdId = (res as any)?.data || (res as any)?.albumId || (typeof res === "string" ? res : null)

      if (createdId) {
        setSelectedAlbumIds((prev) => [...prev, String(createdId)])
      }

      toast.success(t("createSuccess", { defaultMessage: `Album "${name}" berhasil dibuat` }))
      setNewAlbumName("")
      setCreating(false)
    } catch (err: any) {
      toast.error(err.message || "Gagal membuat album baru")
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={t("addPhotosTitle")}
      showCloseButton={false}
      onConfirm={saveAlbum}
    >
      <div className="flex flex-col gap-3 max-h-[60vh] overflow-auto pb-0.25">
        {/* Button / Form to create a new album on the fly */}
        {!creating ? (
          <Button
            type="button"
            variant="outline"
            className="w-full justify-start gap-2 border-dashed text-sm text-foreground hover:bg-accent"
            onClick={() => setCreating(true)}
          >
            <PlusIcon className="size-4" />
            <span>+ Create New Album / Album Baru</span>
          </Button>
        ) : (
          <div className="flex items-center gap-2 p-2 rounded-lg border bg-muted/30">
            <Input
              autoFocus
              value={newAlbumName}
              placeholder={t("namePlaceholder", { defaultMessage: "Nama album baru..." })}
              className="h-9 text-sm bg-background"
              onChange={(e) => setNewAlbumName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCreateNewAlbum()
                if (e.key === "Escape") setCreating(false)
              }}
            />
            <Button size="sm" className="h-9 shrink-0 gap-1" onClick={handleCreateNewAlbum}>
              <CheckIcon className="size-3.5" />
              <span>Buat</span>
            </Button>
            <Button size="sm" variant="ghost" className="h-9 shrink-0" onClick={() => setCreating(false)}>
              Batal
            </Button>
          </div>
        )}

        {!albums.length && (
          <div className="py-8 text-center text-sm text-muted-foreground">
            {t("empty")}
          </div>
        )}

        {!!albums.length && (
          <ItemGroup className="gap-2">
            {albums.map((album) => (
              <Item
                key={album.albumId}
                variant="outline"
                role="listitem"
                className="h-20.5 [contain-intrinsic-size:100%_82px] [content-visibility:auto] cursor-pointer"
                onClick={() => changeAlbum(album.albumId)}
              >
                <ItemMedia variant="image" className="size-14 rounded-md">
                  {album.thumbnail ? (
                    <img
                      src={album.thumbnail}
                      alt={album.name}
                      crossOrigin="anonymous"
                    />
                  ) : (
                    <span className="h-full w-full bg-muted" />
                  )}
                </ItemMedia>
                <ItemContent>
                  <ItemTitle>{album.name}</ItemTitle>
                  <ItemDescription>{album.photoTotal}</ItemDescription>
                </ItemContent>
                <ItemContent className="flex-none">
                  <Checkbox
                    checked={selectedAlbumIds.includes(album.albumId)}
                    aria-label={`Select ${album.name}`}
                    onClick={(event) => event.stopPropagation()}
                    onCheckedChange={() => changeAlbum(album.albumId)}
                  />
                </ItemContent>
              </Item>
            ))}
          </ItemGroup>
        )}
      </div>
    </Dialog>
  )
}
