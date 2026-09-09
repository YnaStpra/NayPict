"use client"

import { useState } from "react"
import { useTranslations } from "next-intl"

import { Slider } from "@/components/ui/slider"
import { Switch } from "@/components/ui/switch"

export interface PhotoUploadSettingsValue {
  photoConcurrency: number
  videoConcurrency: number
  concurrency: number
  retryOnFail: boolean
  allowDownload: boolean
  compressImage: boolean
  compressVideo: boolean
}

const STORAGE_KEY = "photo-upload-settings"

const defaultSettings: PhotoUploadSettingsValue = {
  photoConcurrency: 8,
  videoConcurrency: 4,
  concurrency: 8,
  retryOnFail: false,
  allowDownload: false,
  compressImage: true,
  compressVideo: true,
}

// Limit the number of photo concurrencies between 1 and 8.
function clampPhotoConcurrency(value: number) {
  return Math.min(8, Math.max(1, Math.round(value)))
}

// Limit the number of video concurrencies between 1 and 4.
function clampVideoConcurrency(value: number) {
  return Math.min(4, Math.max(1, Math.round(value)))
}

// Read photo upload settings from local storage, Returns default value when read fails.
export function readPhotoUploadSettings(): PhotoUploadSettingsValue {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)

    if (!raw) {
      return defaultSettings
    }

    const data = JSON.parse(raw) as Partial<PhotoUploadSettingsValue>

    const photoConcurrency = clampPhotoConcurrency(
      data.photoConcurrency ?? data.concurrency ?? defaultSettings.photoConcurrency
    )
    const videoConcurrency = clampVideoConcurrency(
      data.videoConcurrency ?? defaultSettings.videoConcurrency
    )

    return {
      photoConcurrency,
      videoConcurrency,
      concurrency: photoConcurrency,
      retryOnFail: data.retryOnFail ?? defaultSettings.retryOnFail,
      allowDownload: data.allowDownload ?? defaultSettings.allowDownload,
      compressImage: data.compressImage ?? defaultSettings.compressImage,
      compressVideo: data.compressVideo ?? defaultSettings.compressVideo,
    }
  } catch {
    return defaultSettings
  }
}

// Write photo upload settings to local storage.
function savePhotoUploadSettings(settings: PhotoUploadSettingsValue) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    photoConcurrency: clampPhotoConcurrency(settings.photoConcurrency),
    videoConcurrency: clampVideoConcurrency(settings.videoConcurrency),
    concurrency: clampPhotoConcurrency(settings.photoConcurrency),
    retryOnFail: settings.retryOnFail,
    allowDownload: settings.allowDownload,
    compressImage: settings.compressImage,
    compressVideo: settings.compressVideo,
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

      {/* Video Compression Setting */}
      <div className="flex flex-col gap-2 pb-2 border-b border-border">
        <div className="flex items-center justify-between text-sm font-medium">
          <span>Compress Video Size</span>
          <span className="text-xs font-semibold px-2 py-0.5 rounded bg-muted text-foreground">
            {settings.compressVideo ? "Smart 720p HD (H.264/WebM)" : "Original"}
          </span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-muted-foreground">Auto-compress before upload</span>
          <Switch
            checked={settings.compressVideo}
            onCheckedChange={(compressVideo) => updateSettings({ compressVideo })}
          />
        </div>
        <p className="text-[11px] text-muted-foreground leading-snug mt-0.5">
          Downscales 4K / 1080p videos to optimized 720p HD (~1.5 Mbps) for ultra-low file sizes with near-original visual fidelity.
        </p>
      </div>

      {/* Photo Concurrency */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between text-sm font-medium">
          <span>Photo Upload Workers</span>
          <span className="text-xs font-bold px-2 py-0.5 rounded bg-muted text-foreground">
            {settings.photoConcurrency} parallel (max 8)
          </span>
        </div>
        <Slider
          min={1}
          max={8}
          step={1}
          value={[settings.photoConcurrency]}
          onValueChange={(value) => updateSettings({ photoConcurrency: value[0] })}
        />
        <p className="text-[10px] text-muted-foreground">
          Parallel compression and upload workers for photos (up to 8).
        </p>
      </div>

      {/* Video Concurrency */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between text-sm font-medium">
          <span>Video Upload &amp; Compress Workers</span>
          <span className="text-xs font-bold px-2 py-0.5 rounded bg-muted text-foreground">
            {settings.videoConcurrency} parallel (max 4)
          </span>
        </div>
        <Slider
          min={1}
          max={4}
          step={1}
          value={[settings.videoConcurrency]}
          onValueChange={(value) => updateSettings({ videoConcurrency: value[0] })}
        />
        <p className="text-[10px] text-muted-foreground">
          Parallel compression and upload workers for videos (capped at 4 to prevent hardware encoder overload).
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
