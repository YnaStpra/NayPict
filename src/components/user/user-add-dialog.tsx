"use client"

import { useEffect, useRef, useState } from "react"

import { Dialog } from "@/components/common/dialog"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { type UserAddBo, type UserSetBo } from "@/server/entity/bo/user"
import { type UserVo } from "@/server/entity/vo/user"
import { UserTypeEnum, UserTypeOptions } from "@/server/enums/user-enum"
import { useTranslations } from "next-intl"

type UserForm = UserAddBo
type UserFormErrors = Partial<Record<keyof UserForm, string>>

interface UserAddDialogProps {
  title: string
  open: boolean
  user?: UserVo | null
  onOpenChange: (open: boolean) => void
  onUserConfirm: (user: UserAddBo | UserSetBo) => void
}

// Create user form initial value。
function createUserForm(user?: UserVo | null): UserForm {
  if (user) {
    return {
      username: user.username,
      password: "",
      type: user.type,
    }
  }

  return {
    username: "",
    password: "",
    type: UserTypeEnum.NORMAL,
  }
}

// Render a new or edit user pop-up window，And after confirmation, the user information is handed over to the parent component for storage.。
export function UserAddDialog({ title, open, user, onOpenChange, onUserConfirm }: UserAddDialogProps) {
  const t = useTranslations("users")
  const userTypeOptions = UserTypeOptions.map((option) => ({
    ...option,
    label: option.value === UserTypeEnum.ADMIN ? t("admin") : t("user"),
  }))
  // resetTimerRef Reset the form's timer after the save-close animation ends。
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // form Save the user form data in the current pop-up box。
  const [form, setForm] = useState<UserForm>(() => createUserForm(user))
  // errors Save current form field validation errors。
  const [errors, setErrors] = useState<UserFormErrors>({})

  useEffect(() => {
    return () => {
      if (resetTimerRef.current) {
        clearTimeout(resetTimerRef.current)
      }
    }
  }, [])

  useEffect(() => {
    if (open) {
      setForm(createUserForm(user))
      setErrors({})
    }
  }, [open, user])

  // Update text input field。
  function updateField(field: "username" | "password", value: string) {
    setForm((prev) => ({
      ...prev,
      [field]: value,
    }))
    setErrors((prev) => ({
      ...prev,
      [field]: undefined,
    }))
  }

  // Update user type。
  function updateType(value: string) {
    setForm((prev) => ({
      ...prev,
      type: Number(value),
    }))
    setErrors((prev) => ({
      ...prev,
      type: undefined,
    }))
  }

  // Reset userform。
  function resetForm() {
    setForm(createUserForm())
    setErrors({})
  }

  // Delay reset form，Avoid changing the content back to the default value during the closing animation。
  function resetFormAfterClose() {
    if (resetTimerRef.current) {
      clearTimeout(resetTimerRef.current)
    }

    resetTimerRef.current = setTimeout(() => {
      resetForm()
      resetTimerRef.current = null
    }, 300)
  }

  // Verify required fields of user form。
  function validateForm() {
    const nextErrors: UserFormErrors = {}

    if (!form.username.trim()) {
      nextErrors.username = t("usernameRequired")
    }

    if (!form.password.trim() && !user) {
      nextErrors.password = t("passwordRequired")
    }

    if (!form.type) {
      nextErrors.type = t("typeRequired")
    }

    setErrors(nextErrors)

    return Object.keys(nextErrors).length === 0
  }

  // Submit user information to parent component。
  function submitUser() {
    if (!validateForm()) {
      return
    }

    const payload = {
      username: form.username.trim(),
      password: form.password.trim(),
      type: form.type,
    }

    if (user) {
      onUserConfirm({
        userId: user.userId,
        username: payload.username,
        type: payload.type,
        ...(payload.password ? { password: payload.password } : {}),
      })
    } else {
      onUserConfirm(payload)
    }

    handleOpenChange(false)
  }

  // Handle pop-up window opening status changes。
  function handleOpenChange(nextOpen: boolean) {
    if (nextOpen && resetTimerRef.current) {
      clearTimeout(resetTimerRef.current)
      resetTimerRef.current = null
    }

    onOpenChange(nextOpen)

    if (!nextOpen) {
      resetFormAfterClose()
    }
  }

  return (
    <Dialog
      title={title}
      className="w-full sm:max-w-sm"
      open={open}
      onOpenChange={handleOpenChange}
      onConfirm={submitUser}
      preventMobileAutoFocus
    >
      <div className="grid gap-4">
        <div className="grid gap-2">
          <label className="text-sm font-medium">{t("username")}</label>
          <Input
            value={form.username}
            placeholder={t("usernamePlaceholder")}
            autoComplete="off"
            name="username"
            aria-invalid={Boolean(errors.username)}
            onChange={(event) => updateField("username", event.target.value)}
          />
          {errors.username && <p className="text-sm text-destructive">{errors.username}</p>}
        </div>

        <div className="grid gap-2">
          <label className="text-sm font-medium">{t("password")}</label>
          <Input
            value={form.password}
            placeholder={user ? t("newPassword") : t("passwordPlaceholder")}
            type="password"
            autoComplete="new-password"
            name="new-password"
            aria-invalid={Boolean(errors.password)}
            onChange={(event) => updateField("password", event.target.value)}
          />
          {errors.password && <p className="text-sm text-destructive">{errors.password}</p>}
        </div>

        <div className="grid gap-2">
          <label className="text-sm font-medium">{t("type")}</label>
          <Select value={String(form.type)} onValueChange={updateType}>
            <SelectTrigger className="w-full" aria-invalid={Boolean(errors.type)}>
              <SelectValue placeholder={t("typePlaceholder")} />
            </SelectTrigger>
            <SelectContent>
              {userTypeOptions.map((option) => (
                <SelectItem key={option.value} value={String(option.value)}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {errors.type && <p className="text-sm text-destructive">{errors.type}</p>}
        </div>
      </div>
    </Dialog>
  )
}
