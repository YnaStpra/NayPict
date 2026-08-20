"use client"

import { useEffect } from "react"
import { CheckCheck, FolderMinusIcon, FolderPlusIcon, RotateCcwIcon, SlidersHorizontal, Trash2Icon, XIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"

interface PhotoSelectionDrawerProps {
  open: boolean
  selectedCount?: number
  onClose: () => void
  onDelete: () => void
  onSelectAll: () => void
  onRestore?: () => void
  onAlbumOpen?: () => void
  onAlbumRemove?: () => void
  onBatchEdit?: () => void
}

// Render the top action drawer in photo multi-select state.
export function PhotoSelectionDrawer({
  open,
  selectedCount = 0,
  onClose,
  onDelete,
  onSelectAll,
  onRestore,
  onAlbumOpen,
  onAlbumRemove,
  onBatchEdit,
}: PhotoSelectionDrawerProps) {
  useEffect(() => {
    if (!open) {
      return
    }

    // Press Esc to close the selection drawer and clear photo selection.
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

  return (
    <div
      className={[
        "fixed inset-x-0 top-0 z-40 border-b border-border/80 bg-background/95 backdrop-blur-md transition-transform duration-200 shadow-md",
        open ? "translate-y-0" : "-translate-y-full pointer-events-none shadow-none",
      ].join(" ")}
    >
      <TooltipProvider>
        <div className="relative flex h-12 items-center justify-between px-3 md:px-6">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={onClose}
              aria-label="Cancel selection"
              className="rounded-full"
            >
              <XIcon className="size-4" />
            </Button>
            {selectedCount > 0 && (
              <span className="text-xs sm:text-sm font-semibold text-foreground">
                {selectedCount} photo{selectedCount > 1 ? "s" : ""} selected
              </span>
            )}
          </div>

          <div className="flex items-center gap-1 sm:gap-1.5">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button size="icon-sm" variant="ghost" onClick={onSelectAll} aria-label="Select all photos">
                  <CheckCheck className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Select first 100</TooltipContent>
            </Tooltip>

            {onBatchEdit && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={onBatchEdit}
                    aria-label="Batch edit metadata"
                    className="h-8 gap-1.5 text-xs font-medium border-primary/40 text-primary hover:bg-primary/10"
                  >
                    <SlidersHorizontal className="size-3.5" />
                    <span className="hidden sm:inline">Edit Metadata</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">Edit Visibility, Date & Download Permission</TooltipContent>
              </Tooltip>
            )}

            {onAlbumOpen && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button size="icon-sm" variant="ghost" onClick={onAlbumOpen} aria-label="Add to album">
                    <FolderPlusIcon className="size-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">Add to Album</TooltipContent>
              </Tooltip>
            )}

            {onAlbumRemove && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button size="icon-sm" variant="ghost" onClick={onAlbumRemove} aria-label="Remove from album">
                    <FolderMinusIcon className="size-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">Remove from Album</TooltipContent>
              </Tooltip>
            )}

            {onRestore && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button size="icon-sm" variant="ghost" onClick={onRestore} aria-label="Restore photos">
                    <RotateCcwIcon className="size-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">Restore Photos</TooltipContent>
              </Tooltip>
            )}

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  onClick={onDelete}
                  aria-label="Delete photos"
                  className="hover:text-red-500 hover:bg-red-500/10"
                >
                  <Trash2Icon className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Move to Trash</TooltipContent>
            </Tooltip>
          </div>
        </div>
      </TooltipProvider>
    </div>
  )
}
