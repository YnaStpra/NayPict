"use client"

import { useEffect } from "react"
import { CheckCheck, FolderMinusIcon, FolderPlusIcon, RotateCcwIcon, Trash2Icon, XIcon } from "lucide-react"

import { Button } from "@/components/ui/button"

interface PhotoSelectionDrawerProps {
  open: boolean
  onClose: () => void
  onDelete: () => void
  onSelectAll: () => void
  onRestore?: () => void
  onAlbumOpen?: () => void
  onAlbumRemove?: () => void
}

// Render the top action drawer in photo multi-select state。
export function PhotoSelectionDrawer({ open, onClose, onDelete, onSelectAll, onRestore, onAlbumOpen, onAlbumRemove }: PhotoSelectionDrawerProps) {
  useEffect(() => {
    if (!open) {
      return
    }

    // press Esc Close the selection drawer，and clear photo selection。
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose()
      }
    }

    window.addEventListener("keydown", handleKeyDown)

    return () => {
      window.removeEventListener("keydown", handleKeyDown)
    }
  }, [open, onClose])

  // Notify the upper layer to open the album selection pop-up box。
  function openAlbumDialog() {
    onAlbumOpen?.()
  }

  // Notify the upper layer to move the selected photo out of the current album。
  function removeAlbumPhotos() {
    onAlbumRemove?.()
  }


  return (
    <div
      className={[
        "fixed inset-x-0 top-0 z-40 border-[var(--border)] bg-background transition-transform duration-200",
        open ? "translate-y-0 shadow-photo-bottom" : "-translate-y-full shadow-none",
      ].join(" ")}
    >
      <div className="relative flex h-11.75 items-center justify-between px-4">
        <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Cancel selection">
          <XIcon />
        </Button>
        <div />
        <div
          className={[
            "fixed flex flex-row-reverse items-center gap-1",
            onAlbumRemove
              ? "left-[calc(100vw-9.25rem)] md:left-[calc(100vw-9.75rem)]"
              : "left-[calc(100vw-7rem)] md:left-[calc(100vw-7.5rem)]",
          ].join(" ")}
        >
          <Button size="icon" variant="ghost" onClick={onSelectAll} aria-label="Select all photos">
            <CheckCheck />
          </Button>
          {onRestore && (
            <Button size="icon" variant="ghost" onClick={onRestore} aria-label="Restore photos">
              <RotateCcwIcon />
            </Button>
          )}
          <Button size="icon" variant="ghost" onClick={onDelete} aria-label="Delete photos">
            <Trash2Icon />
          </Button>
          {onAlbumOpen && (
            <Button size="icon" variant="ghost" onClick={openAlbumDialog} aria-label="Add to album">
              <FolderPlusIcon />
            </Button>
          )}
          {onAlbumRemove && (
            <Button size="icon" variant="ghost" onClick={removeAlbumPhotos} aria-label="Remove from album">
              <FolderMinusIcon />
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
