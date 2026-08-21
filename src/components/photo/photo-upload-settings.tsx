"use client"

import { useState } from "react"
import { useTranslations } from "next-intl"

import { Slider } from "@/components/ui/slider"
import { Switch } from "@/components/ui/switch"

export interface PhotoUploadSettingsValue {
  concurrency: number
  retryOnFail: boolean
  allowDownload: boolean
  compressImage: boolean
}

const STORAGE_KEY = "photo-upload-settings"

const defaultSettings: PhotoUploadSettingsValue = {
  concurrency: 4,
  retryOnFail: false,
  allowDownload: false,
  compressImage: true,
}

// Limit the number of concurrencies to 1 arrive 12 between.
function clampConcurrency(value: number) {
  return Math.min(12, Math.max(1, Math.round(value)))
}

// Read photo upload settings from local storage, Returns default value when read fails.
export function readPhotoUploadSettings(): PhotoUploadSettingsValue {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)

    if (!raw) {
      return defaultSettings
    }

    const data = JSON.parse(raw) as Partial<PhotoUploadSettingsValue>

    return {
      concurrency: clampConcurrency(data.concurrency ?? defaultSettings.concurrency),
      retryOnFail: data.retryOnFail ?? defaultSettings.retryOnFail,
      allowDownload: data.allowDownload ?? defaultSettings.allowDownload,
      compressImage: data.compressImage ?? defaultSettings.compressImage,
    }
  } catch {
    return defaultSettings
  }
}

// Write photo upload settings to local storage.
function savePhotoUploadSettings(settings: PhotoUploadSettingsValue) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    concurrency: clampConcurrency(settings.concurrency),
    retryOnFail: settings.retryOnFail,
    allowDownload: settings.allowDownload,
    compressImage: settings.compressImage,
  }))
}

// Render photo upload Popover settings.
export function PhotoUploadSettings({ onChange }: { onChange?: () => void }) {
  const t = useTranslations("photos.upload")
  const [settings, setSettings] = useState<PhotoUploadSettingsValue>(() => readPhotoUploadSettings())

  // Merge updated settings and write to local storage.
  function updateSettings(patch: Partial<PhotoUploadSettingsValue>) {
    setSettings((prev) => {
      const next = { ...prev, ...patch }

      savePhotoUploadSettings(next)
      onChange?.()

      return next
    })
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Photo Compression Setting */}
      <div className="flex flex-col gap-2 pb-2 border-b border-border">
        <div className="flex items-center justify-between text-sm font-medium">
          <span>Compress Photo Size</span>
          <span className="text-xs font-semibold px-2 py-0.5 rounded bg-muted text-foreground">
            {settings.compressImage ? "High Quality (WebP/JPEG 85%)" : "Original"}
          </span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-muted-foreground">Auto-compress before upload</span>
          <Switch
            checked={settings.compressImage}
            onCheckedChange={(compressImage) => updateSettings({ compressImage })}
          />
        </div>
        <p className="text-[11px] text-muted-foreground leading-snug mt-0.5">
          Significantly reduces file size by 60%-85% while preserving visual photo clarity.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between text-sm font-medium">
          <span>{t("concurrentUploads")}</span>
          <span className="text-xs font-bold px-2 py-0.5 rounded bg-muted text-foreground">
            {settings.concurrency} parallel workers
          </span>
        </div>
        <Slider
          min={1}
          max={12}
          step={1}
          value={[settings.concurrency]}
          onValueChange={(value) => updateSettings({ concurrency: value[0] })}
        />
        <p className="text-[10px] text-muted-foreground">
          Increase parallel workers for faster batch uploads of large photo sets.
        </p>
      </div>
      <div className="flex flex-col gap-2">
        <div className="text-sm font-medium">{t("retryFailedUploads")}</div>
        <Switch
          checked={settings.retryOnFail}
          onCheckedChange={(retryOnFail) => updateSettings({ retryOnFail })}
        />
      </div>
      <div className="flex flex-col gap-2 border-t pt-3 border-border">
        <div className="flex items-center justify-between text-sm font-medium">
          <span>Download Protection</span>
          <span className="text-xs font-semibold px-2 py-0.5 rounded bg-muted text-foreground">
            {settings.allowDownload ? "Allow Download" : "Protected"}
          </span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-muted-foreground">Allow public downloads</span>
          <Switch
            checked={settings.allowDownload}
            onCheckedChange={(allowDownload) => updateSettings({ allowDownload })}
          />
        </div>
        <p className="text-[11px] text-muted-foreground leading-snug mt-0.5">
          Protected photos can be viewed publicly, but the original file cannot be downloaded.
        </p>
      </div>
    </div>
  )
}
