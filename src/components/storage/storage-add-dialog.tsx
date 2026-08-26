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
import { StorageTypeEnum } from "@/server/enums/storage-enum"
import { type StorageInto } from "@/server/entity/storage"
import { type StorageVo } from "@/server/entity/vo/storage"
import { useTranslations } from "next-intl"

type StorageAddForm = Omit<StorageInto, "storageId" | "userId">
type StorageAddFormErrors = Partial<Record<keyof StorageAddForm, string>>

interface StorageAddDialogProps {
  title: string
  open: boolean
  storage?: StorageVo | null
  onOpenChange: (open: boolean) => void
  onStorageConfirm: (storage: StorageInto) => void
}

// Create storage form initial value.
function createStorageForm(storage?: StorageVo | null): StorageAddForm {
  if (storage) {
    return {
      name: storage.name,
      type: storage.type,
      domain: storage.domain ?? "",
      bucket: storage.bucket ?? "",
      region: storage.region ?? "",
      endpoint: storage.endpoint ?? "",
      accessKey: storage.accessKey ?? "",
      secretKey: storage.secretKey ?? "",
      status: storage.status,
    }
  }

  return {
    name: "",
    type: StorageTypeEnum.S3,
    domain: "",
    bucket: "",
    region: "",
    endpoint: "",
    accessKey: "",
    secretKey: "",
  }
}

// Render storage pop-up window, And after confirmation, hand the storage configuration to the parent component for storage..
export function StorageAddDialog({ title, open, storage, onOpenChange, onStorageConfirm }: StorageAddDialogProps) {
  const t = useTranslations("storage")
  // Only Cloudflare R2 (S3-compatible) is supported in production.
  const storageTypeOptions = [
    { label: t("objectStorage"), value: StorageTypeEnum.S3, disabled: false },
  ]
  // resetTimerRef Reset the form's timer after the save-close animation ends.
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // form Save the stored form data in the current pop-up box.
  const [form, setForm] = useState<StorageAddForm>(() => createStorageForm(storage))
  // errors Save current form field validation errors.
  const [errors, setErrors] = useState<StorageAddFormErrors>({})

  const isS3 = form.type === StorageTypeEnum.S3
  // Type is always S3-compatible; locking is not needed.
  const typeLocked = false

  useEffect(() => {
    return () => {
      if (resetTimerRef.current) {
        clearTimeout(resetTimerRef.current)
      }
    }
  }, [])

  // Update text input field.
  function updateField(field: keyof StorageAddForm, value: string) {
    setForm((prev) => ({
      ...prev,
      [field]: value,
    }))
    setErrors((prev) => ({
      ...prev,
      [field]: undefined,
    }))
  }

  // Update storage type.
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

  // Reset new storage form.
  function resetForm() {
    setForm(createStorageForm())
    setErrors({})
  }

  // Delay reset form, Avoid changing the content back to the default type during the closing animation.
  function resetFormAfterClose() {
    if (resetTimerRef.current) {
      clearTimeout(resetTimerRef.current)
    }

    resetTimerRef.current = setTimeout(() => {
      resetForm()
      resetTimerRef.current = null
    }, 300)
  }

  // Verify the required fields in the new storage form.
  function validateForm() {
    const nextErrors: StorageAddFormErrors = {}

    if (!form.name.trim()) {
      nextErrors.name = t("nameRequired")
    }

    if (!form.type) {
      nextErrors.type = t("typeRequired")
    }

    if (isS3) {
      if (!form.bucket?.trim()) {
        nextErrors.bucket = t("bucketRequired")
      }

      if (!form.endpoint?.trim()) {
        nextErrors.endpoint = t("endpointRequired")
      }

      if (!form.accessKey?.trim()) {
        nextErrors.accessKey = t("accessKeyRequired")
      }

      if (!form.secretKey?.trim()) {
        nextErrors.secretKey = t("secretKeyRequired")
      }
    }

    setErrors(nextErrors)

    return Object.keys(nextErrors).length === 0
  }

  // Submit storage configuration to parent component.
  function submitStorage() {
    const name = form.name.trim()

    if (!validateForm()) {
      return
    }

    onStorageConfirm({
      ...form,
      storageId: storage?.storageId ?? "",
      name,
      domain: isS3 ? form.domain?.trim() || null : null,
      bucket: isS3 ? form.bucket?.trim() || null : null,
      region: isS3 ? form.region?.trim() || null : null,
      endpoint: isS3 ? form.endpoint?.trim() || null : null,
      accessKey: isS3 ? form.accessKey?.trim() || null : null,
      secretKey: isS3 ? form.secretKey?.trim() || null : null,
    })
    handleOpenChange(false)
  }

  // Handle pop-up window opening status changes.
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
      onConfirm={submitStorage}
      preventMobileAutoFocus
    >
      <div className="grid gap-4">
        <div className="grid gap-2">
          <label className="text-sm font-medium">{t("name")}</label>
          <Input
            value={form.name}
            placeholder={t("namePlaceholder")}
            aria-invalid={Boolean(errors.name)}
            onChange={(event) => updateField("name", event.target.value)}
          />
          {errors.name && <p className="text-sm text-destructive">{errors.name}</p>}
        </div>

        <div className="grid gap-2">
          <label className="text-sm font-medium">{t("type")}</label>
          <Select value={String(form.type)} onValueChange={updateType} disabled={typeLocked}>
            <SelectTrigger className="w-full" aria-invalid={Boolean(errors.type)} disabled={typeLocked}>
              <SelectValue placeholder={t("typePlaceholder")} />
            </SelectTrigger>
            <SelectContent>
              {storageTypeOptions.map((option) => (
                <SelectItem
                  key={option.value}
                  value={String(option.value)}
                  disabled={option.disabled}
                  className={option.disabled ? "text-muted-foreground" : ""}
                >
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {errors.type && <p className="text-sm text-destructive">{errors.type}</p>}
        </div>

        {isS3 && (
          <div className="grid gap-3">
            <div className="grid gap-2">
              <Input
                value={form.domain ?? ""}
                placeholder={t("domainPlaceholder")}
                aria-invalid={Boolean(errors.domain)}
                onChange={(event) => updateField("domain", event.target.value)}
              />
              {errors.domain && <p className="text-sm text-destructive">{errors.domain}</p>}
            </div>
            <div className="grid gap-2">
              <Input
                value={form.bucket ?? ""}
                placeholder={t("bucket")}
                aria-invalid={Boolean(errors.bucket)}
                onChange={(event) => updateField("bucket", event.target.value)}
              />
              {errors.bucket && <p className="text-sm text-destructive">{errors.bucket}</p>}
            </div>
            <div className="grid gap-2">
              <Input
                value={form.region ?? ""}
                placeholder={t("region")}
                onChange={(event) => updateField("region", event.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Input
                value={form.endpoint ?? ""}
                placeholder={t("endpoint")}
                aria-invalid={Boolean(errors.endpoint)}
                onChange={(event) => updateField("endpoint", event.target.value)}
              />
              {errors.endpoint && <p className="text-sm text-destructive">{errors.endpoint}</p>}
            </div>
            <div className="grid gap-2">
              <Input
                value={form.accessKey ?? ""}
                placeholder="Access Key"
                aria-invalid={Boolean(errors.accessKey)}
                onChange={(event) => updateField("accessKey", event.target.value)}
              />
              {errors.accessKey && <p className="text-sm text-destructive">{errors.accessKey}</p>}
            </div>
            <div className="grid gap-2">
              <Input
                value={form.secretKey ?? ""}
                placeholder="Secret Key"
                type="text"
                aria-invalid={Boolean(errors.secretKey)}
                onChange={(event) => updateField("secretKey", event.target.value)}
              />
              {errors.secretKey && <p className="text-sm text-destructive">{errors.secretKey}</p>}
            </div>
          </div>
        )}
      </div>
    </Dialog>
  )
}

export { StorageTypeEnum }
