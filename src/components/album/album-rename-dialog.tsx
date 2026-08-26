"use client"

import { useState, type KeyboardEvent } from "react"
import { useTranslations } from "next-intl"

import { Dialog } from "@/components/common/dialog"
import { Input } from "@/components/ui/input"

interface AlbumRenameDialogProps {
  open: boolean
  name: string
  onOpenChange: (open: boolean) => void
  onNameConfirm: (name: string) => void
}

// Rendering the pop-up window for modifying album name.
export function AlbumRenameDialog({ open, name, onOpenChange, onNameConfirm }: AlbumRenameDialogProps) {
  const t = useTranslations("albums")
  // inputName Save the album name in the pop-up input box.
  const [inputName, setInputName] = useState(name)

  // Submit the modified album name.
  function submitName() {
    const value = inputName.trim()

    if (!value) {
      return
    }

    onNameConfirm(value)
  }

  // Process input box and press Enter to confirm.
  function handleInputKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      submitName()
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={t("renameTitle")}
      className="w-full"
      showCloseButton={false}
      onConfirm={submitName}
    >
      <Input
        value={inputName}
        placeholder={t("namePlaceholder")}
        onChange={(event) => setInputName(event.target.value)}
        onKeyDown={handleInputKeyDown}
      />
    </Dialog>
  )
}
