"use client"

import { Column, ColumnDef } from "@tanstack/react-table"
import { IconCircleCheckFilled, IconCircleXFilled } from "@tabler/icons-react"
import { ArrowUpDown, MoreHorizontal } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { StorageTypeEnum } from "@/server/enums/storage-enum"
import { type StorageVo } from "@/server/entity/vo/storage"
import { useTranslations } from "next-intl"

interface SortableHeaderProps {
  label: string
  column: Column<StorageVo, unknown>
}

interface StorageColumnsOptions {
  onEdit: (storage: StorageVo) => void
  onSetTop: (storageId: string) => void
  onToggleStatus: (storageId: string) => void
  onDelete: (storage: StorageVo) => void
}

// Render header button with fixed sort icon.
function SortableHeader({ label, column }: SortableHeaderProps) {
  return (
    <Button
      type="button"
      variant="ghost"
      className="-ml-2 h-8 px-2"
      onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
    >
      {label}
      <ArrowUpDown />
    </Button>
  )
}

// Format storage capacity as readable text.
function formatCapacity(size: number) {
  if (!size) {
    return "0 B"
  }

  const units = ["B", "KB", "MB", "GB", "TB"]
  const index = Math.min(Math.floor(Math.log(size) / Math.log(1024)), units.length - 1)
  const value = size / 1024 ** index

  return `${value.toFixed(value >= 10 || index === 0 ? 0 : 1)} ${units[index]}`
}

// Render storage status logo.
function StorageStatusBadge({ status }: { status: number }) {
  const t = useTranslations("storage")
  const disabled = status === 1
  const Icon = disabled ? IconCircleXFilled : IconCircleCheckFilled
  const text = disabled ? t("disabled") : t("active")

  return (
    <Badge variant="outline" className="px-1.5 text-muted-foreground">
      <Icon className={disabled ? "fill-red-500" : "fill-green-500 dark:fill-green-400"} />
      {text}
    </Badge>
  )
}

// Create a storage list column configuration with internationalized copy.
export function useStorageColumns({ onEdit, onSetTop, onToggleStatus, onDelete }: StorageColumnsOptions): ColumnDef<StorageVo>[] {
  const t = useTranslations("storage")

  return [
    {
      id: "index",
      header: t("columns.index"),
      enableHiding: false,
      cell: ({ row }) => row.index + 1,
    },
    {
      accessorKey: "name",
      header: t("columns.name"),
      meta: {
        className: 'w-1/3'
      }
    },
    {
      accessorKey: "type",
      header: t("columns.type"),
      cell: ({ row }) => t("objectStorage"),
    },
    {
      accessorKey: "usedCapacity",
      meta: {
        label: t("columns.usedCapacity"),
      },
      header: ({ column }) => <SortableHeader label={t("columns.usedCapacity")} column={column} />,
      cell: ({ row }) => formatCapacity(row.original.usedCapacity),
    },
    {
      accessorKey: "photoTotal",
      meta: {
        label: t("columns.photoCount"),
      },
      header: ({ column }) => <SortableHeader label={t("columns.photoCount")} column={column} />,
    },
    {
      accessorKey: "status",
      header: t("columns.status"),
      cell: ({ row }) => <StorageStatusBadge status={row.original.status ?? 0} />,
    },
    {
      id: "actions",
      header: t("columns.actions"),
      enableHiding: false,
      meta: {
        className: "text-right"
      },
      cell: ({ row }) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label="Open actions menu">
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem onClick={() => onEdit(row.original)}>{t("edit")}</DropdownMenuItem>
            <DropdownMenuItem onClick={() => onToggleStatus(row.original.storageId)}>
              {row.original.status === 0 ? t("disable") : t("enable")}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onSetTop(row.original.storageId)}>{t("pin")}</DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => onDelete(row.original)}
            >
              {t("delete")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ]
}
