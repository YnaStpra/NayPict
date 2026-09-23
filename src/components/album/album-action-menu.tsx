"use client"

import { useState } from "react"
import {
  ArchiveIcon,
  ArchiveRestoreIcon,
  Edit3Icon,
  ImageIcon,
  MoreHorizontalIcon,
  Trash2Icon,
} from "lucide-react"
import { useTranslations } from "next-intl"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

interface AlbumActionMenuProps {
  // Whether the current button icon displays a shadow.
  shadow?: boolean
  isArchived?: boolean
  onRename?: () => void
  onDelete?: () => void
  onChangeCover?: () => void
  onArchive?: () => void
  onUnarchive?: () => void
}

// Render the more operations menu in the upper right corner of the album card.
export function AlbumActionMenu({
  shadow = true,
  isArchived = false,
  onRename,
  onDelete,
  onChangeCover,
  onArchive,
  onUnarchive,
}: AlbumActionMenuProps) {
  const t = useTranslations("albums")
  // open Record whether the current drop-down menu is open, Used to hide icon shadow when open.
  const [open, setOpen] = useState(false)
  const showShadow = shadow && !open

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="size-8 bg-transparent text-white/90 shadow-none hover:bg-transparent hover:text-white"
          aria-label="More album actions"
        >
          <MoreHorizontalIcon
            style={showShadow ? {
              filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.5)) drop-shadow(0 0 1px rgba(0,0,0,0.3))",
            } : undefined}
          />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-40 min-w-40">
        {onChangeCover && !isArchived && (
          <DropdownMenuItem onSelect={onChangeCover} className="gap-2 cursor-pointer">
            <ImageIcon className="size-4 text-muted-foreground" />
            <span>{t("actions.changeCover") || "Change Cover"}</span>
          </DropdownMenuItem>
        )}
        {onRename && (
          <DropdownMenuItem onSelect={onRename} className="gap-2 cursor-pointer">
            <Edit3Icon className="size-4 text-muted-foreground" />
            <span>{t("actions.rename")}</span>
          </DropdownMenuItem>
        )}
        {isArchived ? (
          onUnarchive && (
            <DropdownMenuItem onSelect={onUnarchive} className="gap-2 cursor-pointer">
              <ArchiveRestoreIcon className="size-4 text-muted-foreground" />
              <span>{t("actions.unarchive") || "Unarchive"}</span>
            </DropdownMenuItem>
          )
        ) : (
          onArchive && (
            <DropdownMenuItem onSelect={onArchive} className="gap-2 cursor-pointer">
              <ArchiveIcon className="size-4 text-muted-foreground" />
              <span>{t("actions.archive") || "Archive"}</span>
            </DropdownMenuItem>
          )
        )}
        {onDelete && (
          <DropdownMenuItem onSelect={onDelete} className="gap-2 text-destructive focus:text-destructive cursor-pointer">
            <Trash2Icon className="size-4" />
            <span>{t("actions.delete")}</span>
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
