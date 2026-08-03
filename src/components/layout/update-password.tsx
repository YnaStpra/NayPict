"use client"

import { useState } from "react"

import { Dialog } from "@/components/common/dialog"
import { Input } from "@/components/ui/input"
import { userSetUserPassword } from "@/request/user"
import { useTranslations } from "next-intl"

interface UpdatePasswordProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

// Render the current user's password change popup window。
export function UpdatePassword({ open, onOpenChange }: UpdatePasswordProps) {
  const t = useTranslations("layout.password")
  // password Save the currently entered new password。
  const [password, setPassword] = useState("")
  // confirmPassword Save the currently entered confirmation password。
  const [confirmPassword, setConfirmPassword] = useState("")
  // error Save password input box verification error。
  const [error, setError] = useState("")

  // Reset change password form。
  function resetForm() {
    setPassword("")
    setConfirmPassword("")
    setError("")
  }

  // Update the password input box content。
  function updatePassword(value: string) {
    setPassword(value)
    setError("")
  }

  // Update the content of the confirmation password input box。
  function updateConfirmPassword(value: string) {
    setConfirmPassword(value)
    setError("")
  }

  // Handle pop-up window opening status changes。
  function handleOpenChange(nextOpen: boolean) {
    onOpenChange(nextOpen)

    if (!nextOpen) {
      resetForm()
    }
  }

  // Submit new password for current user。
  function submitPassword() {
    const nextPassword = password.trim()
    const nextConfirmPassword = confirmPassword.trim()

    if (!nextPassword) {
      setError(t("passwordRequired"))
      return
    }

    if (!nextConfirmPassword) {
      setError(t("confirmationRequired"))
      return
    }

    if (nextPassword !== nextConfirmPassword) {
      setError(t("passwordMismatch"))
      return
    }

    onOpenChange(false)

    userSetUserPassword({ password: nextPassword }).then(() => {
      resetForm()
    })
  }

  return (
    <Dialog
      title={t("title")}
      className="w-full sm:max-w-sm"
      open={open}
      showCloseButton={false}
      onOpenChange={handleOpenChange}
      onConfirm={submitPassword}
    >
      <div className="grid gap-2">
        <Input
          name="new-password"
          autoComplete="new-password"
          value={password}
          placeholder={t("newPassword")}
          type="password"
          aria-invalid={Boolean(error)}
          className="mb-1"
          onChange={(event) => updatePassword(event.target.value)}
        />
        <Input
          name="new-password"
          autoComplete="new-password"
          value={confirmPassword}
          placeholder={t("confirmPassword")}
          type="password"
          aria-invalid={Boolean(error)}
          onChange={(event) => updateConfirmPassword(event.target.value)}
        />
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>
    </Dialog>
  )
}
