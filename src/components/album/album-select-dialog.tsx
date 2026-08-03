"use client"

import { useEffect, useState } from "react"
import { useTranslations } from "next-intl"

import { Dialog } from "@/components/common/dialog"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item"
import { useAlbumStore } from "@/store/album-store"

interface AlbumSelectDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onAlbumSelect: (albumIds: string[]) => void
}

// Render the album selection popup used when adding to an album。
export function AlbumSelectDialog({ open, onOpenChange, onAlbumSelect }: AlbumSelectDialogProps) {
  const t = useTranslations("albums")
  const albums = useAlbumStore((state) => state.albums)
  // selectedAlbumIds Save the currently selected album id list。
  const [selectedAlbumIds, setSelectedAlbumIds] = useState<string[]>([])

  // Clear the selected album after closing the pop-up box。
  useEffect(() => {
    if (!open) {
      setSelectedAlbumIds([])
    }
  }, [open])

  // Switch the current multi-selected album。
  function changeAlbum(albumId: string) {
    setSelectedAlbumIds((prev) => (
      prev.includes(albumId)
        ? prev.filter((item) => item !== albumId)
        : [...prev, albumId]
    ))
  }

  // After selecting the album, select the album id The list is passed to the parent component，and close the pop-up box。
  function selectAlbum(albumIds: string[]) {
    onAlbumSelect(albumIds)
    onOpenChange(false)
  }

  // Save current selection，Close the popup directly when there is no selection。
  function saveAlbum() {
    if (!selectedAlbumIds.length) {
      onOpenChange(false)
      return
    }

    selectAlbum(selectedAlbumIds)
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
                className="h-20.5 [contain-intrinsic-size:100%_82px] [content-visibility:auto]"
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
