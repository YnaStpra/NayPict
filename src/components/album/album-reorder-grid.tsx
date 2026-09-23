"use client"

import { useState } from "react"
import {
  Check,
  ChevronLeft,
  ChevronRight,
  GripVertical,
  Loader2,
  SlidersHorizontal,
  X,
} from "lucide-react"
import { useTranslations } from "next-intl"

import { Button } from "@/components/ui/button"
import { getThumbHashUrl } from "@/lib/thumb-hash"
import { toProxyMediaUrl } from "@/lib/url"
import { type AlbumVo } from "@/server/entity/vo/album"

interface AlbumReorderGridProps {
  albums: AlbumVo[]
  onSave: (orderedAlbums: AlbumVo[]) => Promise<void>
  onCancel: () => void
}

export function AlbumReorderGrid({ albums, onSave, onCancel }: AlbumReorderGridProps) {
  const t = useTranslations("albums")
  const [items, setItems] = useState<AlbumVo[]>(() => [...albums])
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  // Swap or move item from one index to another
  function moveItem(fromIndex: number, toIndex: number) {
    if (toIndex < 0 || toIndex >= items.length || fromIndex === toIndex) return

    setItems((prev) => {
      const next = [...prev]
      const [moved] = next.splice(fromIndex, 1)
      next.splice(toIndex, 0, moved)
      return next
    })
  }

  // Handle HTML5 drag start
  function handleDragStart(index: number, e: React.DragEvent) {
    setDraggedIndex(index)
    e.dataTransfer.effectAllowed = "move"
    e.dataTransfer.setData("text/plain", String(index))
  }

  // Handle HTML5 drag over
  function handleDragOver(index: number, e: React.DragEvent) {
    e.preventDefault()
    e.dataTransfer.dropEffect = "move"
    if (dragOverIndex !== index) {
      setDragOverIndex(index)
    }
  }

  // Handle HTML5 drop
  function handleDrop(targetIndex: number, e: React.DragEvent) {
    e.preventDefault()
    if (draggedIndex !== null && draggedIndex !== targetIndex) {
      moveItem(draggedIndex, targetIndex)
    }
    setDraggedIndex(null)
    setDragOverIndex(null)
  }

  // Clean up drag states
  function handleDragEnd() {
    setDraggedIndex(null)
    setDragOverIndex(null)
  }

  async function handleConfirmSave() {
    setIsSaving(true)
    try {
      await onSave(items)
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="space-y-4 pb-12 animate-in fade-in duration-200">
      {/* Reorder Sticky Top Toolbar */}
      <div className="sticky top-12 z-20 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-primary/20 bg-background/95 p-3 sm:p-4 shadow-lg backdrop-blur-md">
        <div className="flex items-center gap-2.5">
          <div className="flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <SlidersHorizontal className="size-5" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground">
              {t("reorderTitle") || "Arrange Albums"}
            </h3>
            <p className="text-xs text-muted-foreground">
              {t("reorderDesc") || "Drag cards or use arrow buttons to arrange albums, then save your custom order."}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 ml-auto">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={isSaving}
            onClick={onCancel}
            className="gap-1.5 cursor-pointer"
          >
            <X className="size-3.5" />
            {t("cancelReorder") || "Cancel"}
          </Button>

          <Button
            type="button"
            size="sm"
            disabled={isSaving}
            onClick={handleConfirmSave}
            className="gap-1.5 shadow-sm cursor-pointer"
          >
            {isSaving ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Check className="size-3.5" />
            )}
            {t("saveOrder") || "Save Order"}
          </Button>
        </div>
      </div>

      {/* Grid of Draggable & Reorderable Album Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 sm:gap-4">
        {items.map((album, index) => {
          const placeholder = getThumbHashUrl(album.thumbHash)
          const isDragging = draggedIndex === index
          const isTargeted = dragOverIndex === index && draggedIndex !== index

          return (
            <div
              key={album.albumId}
              draggable={!isSaving}
              onDragStart={(e) => handleDragStart(index, e)}
              onDragOver={(e) => handleDragOver(index, e)}
              onDrop={(e) => handleDrop(index, e)}
              onDragEnd={handleDragEnd}
              className={`group relative aspect-square overflow-hidden rounded-2xl border bg-neutral-900 shadow-md select-none transition-all duration-200 cursor-grab active:cursor-grabbing ${
                isDragging
                  ? "opacity-40 scale-95 ring-2 ring-primary border-primary shadow-xl"
                  : isTargeted
                  ? "ring-2 ring-primary ring-offset-2 ring-offset-background scale-[1.02] border-primary"
                  : "hover:shadow-lg hover:border-white/20"
              }`}
              style={{
                backgroundColor: placeholder ? undefined : "rgba(128,128,128,0.1)",
                backgroundImage: placeholder ? `url("${placeholder}")` : undefined,
                backgroundSize: "cover",
                backgroundPosition: "center",
              }}
            >
              {album.thumbnail ? (
                <img
                  src={album.thumbnail}
                  alt={album.name}
                  loading="lazy"
                  decoding="async"
                  onError={(e) => {
                    const el = e.currentTarget
                    if (el.src && !el.src.includes("/media/")) {
                      el.src = toProxyMediaUrl(el.src)
                    }
                  }}
                  className="absolute inset-0 h-full w-full object-cover pointer-events-none transition-transform duration-300 group-hover:scale-105"
                />
              ) : (
                <div className="absolute inset-0 bg-muted/40" />
              )}

              {/* Gradient vignette for legibility */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-black/40 pointer-events-none" />

              {/* Top Header Controls: Rank Badge & Drag Indicator */}
              <div className="absolute inset-x-2 top-2 z-10 flex items-center justify-between pointer-events-none">
                <span className="flex items-center gap-1 rounded-full bg-black/60 px-2 py-0.5 text-xs font-mono font-bold text-white shadow-md backdrop-blur-md border border-white/15">
                  #{index + 1}
                </span>

                <div className="flex size-7 items-center justify-center rounded-full bg-black/60 text-white/90 shadow-md backdrop-blur-md border border-white/15 group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                  <GripVertical className="size-4" />
                </div>
              </div>

              {/* Bottom Content: Album Name & Count */}
              <div className="absolute inset-x-2.5 bottom-12 pointer-events-none text-left">
                <div className="text-xs text-white/80 font-normal drop-shadow">
                  {album.photoTotal} items
                </div>
                <div className="truncate text-sm font-semibold text-white drop-shadow">
                  {album.name}
                </div>
              </div>

              {/* Bottom Move Arrow Controls (for precision & touch screens) */}
              <div className="absolute inset-x-2 bottom-2 z-10 flex items-center justify-between gap-1.5 bg-black/70 rounded-xl p-1 backdrop-blur-md border border-white/15">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  disabled={index === 0 || isSaving}
                  onClick={(e) => {
                    e.stopPropagation()
                    moveItem(index, index - 1)
                  }}
                  className="size-7 rounded-lg text-white hover:bg-white/20 disabled:opacity-30 cursor-pointer"
                  aria-label={`Move ${album.name} earlier`}
                >
                  <ChevronLeft className="size-4" />
                </Button>

                <span className="text-[11px] font-medium text-white/70 select-none">
                  Move
                </span>

                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  disabled={index === items.length - 1 || isSaving}
                  onClick={(e) => {
                    e.stopPropagation()
                    moveItem(index, index + 1)
                  }}
                  className="size-7 rounded-lg text-white hover:bg-white/20 disabled:opacity-30 cursor-pointer"
                  aria-label={`Move ${album.name} later`}
                >
                  <ChevronRight className="size-4" />
                </Button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
