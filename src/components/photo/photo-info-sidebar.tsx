"use client"

import { XIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { useTapAction } from "@/hooks/use-tap-action"
import { formatPhotoTakenDateTime } from "@/lib/date"
import { getThumbHashUrl } from "@/lib/thumb-hash"
import { formatPhotoLocation, getPhotoColorSpace, getPhotoDeviceParams, getPhotoShootingParams, getPhotoSoftware, getPhotoTimezone } from "@/lib/viewer-field"
import { type PhotoVo } from "@/server/entity/vo/photo"
import { useLocale, useTranslations } from "next-intl"

type PhotoInfoSidebarProps = {
  // Currently viewing photos。
  photo: PhotoVo | null
  // Close sidebar。
  onClose?: () => void
}

type PhotoViewerBlurBackgroundProps = {
  // of current photo thumbHash。
  thumbHash?: string | null
}

// Format storage location：storage name(Translated type)。
function formatStorageLocation(photo: PhotoVo, t: (key: string) => string) {
  if (!photo.storageName && !photo.storageTypeDesc) {
    return null
  }

  const type = photo.storageTypeDesc ? t(photo.storageTypeDesc) : "-"

  return `${photo.storageName ?? "-"} (${type})`
}

// Format photo name，Remove file suffix。
function formatPhotoName(name: string) {
  const index = name.lastIndexOf(".")

  return index > 0 ? name.slice(0, index) : name
}

// Format the number of bytes into MB。
function formatFileSize(size: number) {
  return `${(size / 1024 / 1024).toFixed(1)}MB`
}

// Format photo resolution。
function formatResolution(width: number | null, height: number | null) {
  if (!width || !height) {
    return null
  }

  return `${width} × ${height}`
}

// Format photo pixels（megapixels）。
function formatMegapixels(width: number | null, height: number | null) {
  if (!width || !height) {
    return null
  }

  return `${(width * height / 1_000_000).toFixed(1)} MP`
}

// Rendering a single line of photo information，label on the left，value on the right；Do not display if there is no value。
function PhotoInfoRow({
  label,
  value,
  wrap = false,
  twoLines = false,
}: {
  label: string
  value: string | null | undefined
  wrap?: boolean
  twoLines?: boolean
}) {
  if (!value) {
    return null
  }

  return (
    <div className={`flex min-w-0 justify-between gap-8 text-left text-sm ${wrap || twoLines ? "items-start" : "items-center"}`}>
      <span className="shrink-0 text-white/60">{label}</span>
      <span
        className={`min-w-0 flex-1 text-right text-white ${twoLines ? "line-clamp-2 break-all" : wrap ? "break-words whitespace-normal" : "truncate"}`}
        title={wrap ? undefined : value}
      >
        {value}
      </span>
    </div>
  )
}

// Render full screen blurred background，Stacked under the Details & Information sidebar。
export function PhotoViewerBlurBackground({ thumbHash }: PhotoViewerBlurBackgroundProps) {
  const thumbHashUrl = getThumbHashUrl(thumbHash)

  if (!thumbHashUrl) {
    return null
  }

  return (
    <div className="fixed inset-0 z-[-10] h-full w-full overflow-hidden">
      <img
        src={thumbHashUrl}
        alt=""
        className="h-full w-full scale-110 blur-sm object-cover"
        aria-hidden
      />
      <div className="absolute inset-0 bg-black/50" />
    </div>
  )
}

// Render sidebar close button（Mobile terminal md The following shows）。
function SidebarCloseButton({ onClose }: { onClose: () => void }) {
  const tap = useTapAction(onClose)

  return (
    <Button
      type="button"
      size="icon"
      variant="secondary"
      className="absolute top-2 right-2 z-10 rounded-full bg-black/40 text-white hover:bg-black/50 md:hidden"
      {...tap}
    >
      <XIcon />
      <span className="sr-only">Close</span>
    </Button>
  )
}

// Render photo information sidebar，fixed at Lightbox right side。
export function PhotoInfoSidebar({ photo, onClose }: PhotoInfoSidebarProps) {
  const t = useTranslations("photos.info")
  const storageT = useTranslations("storage")
  const locale = useLocale()
  const deviceParams = photo ? getPhotoDeviceParams(photo.exif) : []
  const shootingParams = photo ? getPhotoShootingParams(photo.exif) : []

  return (
    <aside className="fixed top-0 right-0 z-[41] flex h-full w-full flex-col overflow-y-auto bg-transparent backdrop-blur-xl text-white shadow-photo-sidebar md:w-80 md:shrink-0" onPointerDown={(event) => event.stopPropagation()}>
      {onClose && <SidebarCloseButton onClose={onClose} />}
      {photo && (
        <div className="text-left">
          <div className="px-4 pt-6.5 md:pt-4.5 text-sm font-medium">{t("basicInformation")}</div>
          <div className="space-y-1.5 px-4 py-2">
            <PhotoInfoRow label={t("fileName")} value={formatPhotoName(photo.name)} twoLines />
            <PhotoInfoRow label={t("format")} value={photo.typeDesc.toUpperCase()} />
            <PhotoInfoRow label={t("fileSize")} value={formatFileSize(photo.size)} />
            <PhotoInfoRow label={t("resolution")} value={formatResolution(photo.width, photo.height)} />
            <PhotoInfoRow label={t("megapixels")} value={formatMegapixels(photo.width, photo.height)} />
            <PhotoInfoRow label={t("colorSpace")} value={getPhotoColorSpace(photo.exif, t("uncalibrated"))} />
            <PhotoInfoRow label={t("dateTime")} value={formatPhotoTakenDateTime(photo.takenTime, locale)} />
            <PhotoInfoRow label={t("timeZone")} value={getPhotoTimezone(photo.exif)} />
            <PhotoInfoRow
              label={t("location")}
              value={formatPhotoLocation(photo.latitude, photo.longitude, photo.altitude)}
              wrap
            />
            <PhotoInfoRow label={t("software")} value={getPhotoSoftware(photo.exif)} wrap />
            <PhotoInfoRow label={t("storage")} value={formatStorageLocation(photo, storageT)} />
            <PhotoInfoRow label="Download" value={photo.allowDownload === 1 ? "↓ Downloadable" : "🔒 Protected"} />
          </div>
          {shootingParams.length > 0 && (
            <>
              <div className="px-4 pt-3 text-sm font-medium">{t("cameraSettings")}</div>
              <div className="space-y-1.5 px-4 py-2">
                {shootingParams.map((item) => (
                  <PhotoInfoRow key={item.key} label={t(item.key)} value={item.value} />
                ))}
              </div>
            </>
          )}
          {deviceParams.length > 0 && (
            <>
              <div className="px-4 pt-3 text-sm font-medium">{t("device")}</div>
              <div className="space-y-1.5 px-4 py-2">
                {deviceParams.map((item) => (
                  <PhotoInfoRow key={item.key} label={t(item.key)} value={item.value} wrap={item.wrap} />
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </aside>
  )
}
