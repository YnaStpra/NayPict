"use client"

import { useState } from "react"
import { MoreHorizontalIcon } from "lucide-react"
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
  onRename: () => void
  onTop: () => void
  onDelete: () => void
  onChangeCover?: () => void
}

// Render the more operations menu in the upper right corner of the album card.
export function AlbumActionMenu({ shadow = true, onRename, onTop, onDelete, onChangeCover }: AlbumActionMenuProps) {
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
      <DropdownMenuContent align="end" className="w-32 min-w-32">
        {onChangeCover && (
          <DropdownMenuItem onSelect={onChangeCover}>
            Change Cover
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onSelect={onRename}>
          {t("actions.rename")}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onTop}>
          {t("actions.pin")}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onDelete}>
          {t("actions.delete")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
