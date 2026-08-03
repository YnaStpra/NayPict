"use client"

import { useState } from "react"
import { useTranslations } from "next-intl"

import { Slider } from "@/components/ui/slider"
import { Switch } from "@/components/ui/switch"

interface PhotoUploadSettingsValue {
  concurrency: number
  retryOnFail: boolean
}

const STORAGE_KEY = "photo-upload-settings"

const defaultSettings: PhotoUploadSettingsValue = {
  concurrency: 4,
  retryOnFail: false,
}

// Limit the number of concurrencies to 1 arrive 5 between。
function clampConcurrency(value: number) {
  return Math.min(5, Math.max(1, Math.round(value)))
}

// Read photo upload settings from local storage，Returns default value when read fails。
export function readPhotoUploadSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)

    if (!raw) {
      return defaultSettings
    }

    const data = JSON.parse(raw) as Partial<PhotoUploadSettingsValue>

    return {
      concurrency: clampConcurrency(data.concurrency ?? defaultSettings.concurrency),
      retryOnFail: data.retryOnFail ?? defaultSettings.retryOnFail,
    }
  } catch {
    return defaultSettings
  }
}

// Write photo upload settings to local storage。
function savePhotoUploadSettings(settings: PhotoUploadSettingsValue) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    concurrency: clampConcurrency(settings.concurrency),
    retryOnFail: settings.retryOnFail,
  }))
}

// Render photo upload Popover settings within。
export function PhotoUploadSettings({ onChange }: { onChange?: () => void }) {
  const t = useTranslations("photos.upload")
  const [settings, setSettings] = useState<PhotoUploadSettingsValue>(() => readPhotoUploadSettings()) // Current settings read from local storage。

  // Merge updated settings and write to local storage。
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
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between text-sm font-medium">
          <span>{t("concurrentUploads")}</span>
          <span className="text-muted-foreground">{settings.concurrency}</span>
        </div>
        <Slider
          min={1}
          max={5}
          step={1}
          value={[settings.concurrency]}
          onValueChange={(value) => updateSettings({ concurrency: value[0] })}
        />
      </div>
      <div className="flex flex-col gap-2">
        <div className="text-sm font-medium">{t("retryFailedUploads")}</div>
        <Switch
          checked={settings.retryOnFail}
          onCheckedChange={(retryOnFail) => updateSettings({ retryOnFail })}
        />
      </div>
    </div>
  )
}
