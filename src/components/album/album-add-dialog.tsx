"use client"

import { useState, type KeyboardEvent } from "react"
import { Plus } from "lucide-react"
import { useTranslations } from "next-intl"

import { Dialog } from "@/components/common/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

interface AlbumAddDialogProps {
  title: string
  onNameConfirm: (name: string) => void
}

// Render a new album pop-up window，And after confirmation, hand the album name to the parent component。
export function AlbumAddDialog({ title, onNameConfirm }: AlbumAddDialogProps) {
  const t = useTranslations("albums")
  const [open, setOpen] = useState(false)
  const [name, setName] = useState("")

  // Submit the entered album name。
  function submitName() {
    const value = name.trim()

    if (!value) {
      return
    }

    onNameConfirm(value)
    setName("")
    setOpen(false)
  }

  // Process input box and press Enter to confirm。
  function handleInputKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      submitName()
    }
  }

  // Handle pop-up window opening status changes。
  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen)

    if (!nextOpen) {
      setName("")
    }
  }

  return (
    <Dialog
      title={title}
      className="w-full"
      open={open}
      onOpenChange={handleOpenChange}
      onConfirm={submitName}
      trigger={
        <Button
          type="button"
          size="icon"
          variant="ghost"
        >
          <Plus />
        </Button>
      }
    >
      <Input
        value={name}
        placeholder={t("namePlaceholder")}
        onChange={(event) => setName(event.target.value)}
        onKeyDown={handleInputKeyDown}
      />
    </Dialog>
  )
}
