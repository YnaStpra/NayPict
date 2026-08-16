"use client"

import { FolderPlusIcon, InfoIcon, MessageSquareIcon, TrendingUp, XIcon } from "lucide-react"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import { useTapAction } from "@/hooks/use-tap-action"
import { formatPhotoTakenDateTime } from "@/lib/date"
import { getThumbHashUrl } from "@/lib/thumb-hash"
import { formatPhotoLocation, getPhotoDeviceParams, getPhotoShootingParams, getPhotoSoftware, getPhotoTimezone } from "@/lib/viewer-field"
import { type PhotoVo } from "@/server/entity/vo/photo"
import { useLocale, useTranslations } from "next-intl"
import { useApp } from "@/app/provider"
import { UserTypeEnum } from "@/server/enums/user-enum"
import { PhotoComments } from "@/components/photo/photo-comments"

type PhotoInfoSidebarProps = {
  // Currently viewing photos.
  photo: PhotoVo | null
  // Close sidebar.
  onClose?: () => void
  // Trigger open album dialog (Admin only).
  onAlbumOpen?: (photoId: string) => void
  // Trigger open insights dialog (Admin only).
  onInsightsOpen?: (photoId: string) => void
  // Initial active tab ("info" | "comments")
  defaultTab?: "info" | "comments"
}

type PhotoViewerBlurBackgroundProps = {
  // of current photo thumbHash.
  thumbHash?: string | null
}

// Format album names array into human-readable list string (e.g. "Album A & Album B" or "Album A, Album B & Album C")
export function formatAlbumList(albums?: { albumId: string; name: string }[]): string {
  if (!albums || albums.length === 0) return ""
  const names = albums.map((a) => a.name)
  if (names.length === 1) return names[0]
  if (names.length === 2) return `${names[0]} & ${names[1]}`
  return `${names.slice(0, -1).join(", ")} & ${names[names.length - 1]}`
}

// Format storage location: storage name(Translated type).
function formatStorageLocation(photo: PhotoVo, t: (key: string) => string) {
  if (!photo.storageName && !photo.storageTypeDesc) {
    return null
  }

  const type = photo.storageTypeDesc ? t(photo.storageTypeDesc) : "-"

  return `${photo.storageName ?? "-"} (${type})`
}

// Format photo name, Remove file suffix.
function formatPhotoName(name: string) {
  const index = name.lastIndexOf(".")

  return index > 0 ? name.slice(0, index) : name
}

// Format the number of bytes into MB.
function formatFileSize(size: number) {
  return `${(size / 1024 / 1024).toFixed(1)}MB`
}

// Format photo resolution.
function formatResolution(width: number | null, height: number | null) {
  if (!width || !height) {
    return null
  }

  return `${width} × ${height}`
}

// Format photo pixels (megapixels).
function formatMegapixels(width: number | null, height: number | null) {
  if (!width || !height) {
    return null
  }

  return `${(width * height / 1_000_000).toFixed(1)} MP`
}

// Rendering a single line of photo information.
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

// Render full screen blurred background.
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

// Render sidebar close button.
function SidebarCloseButton({ onClose }: { onClose: () => void }) {
  const tap = useTapAction(onClose)

  return (
    <Button
      type="button"
      size="icon"
      variant="secondary"
      className="absolute top-3.5 right-3.5 z-20 size-7 rounded-full bg-white/10 border border-white/15 text-white/80 hover:text-white hover:bg-white/20 transition-all cursor-pointer"
      {...tap}
    >
      <XIcon className="size-3.5" />
      <span className="sr-only">Close</span>
    </Button>
  )
}

// Render photo information & comments sidebar with tab switcher.
export function PhotoInfoSidebar({
  photo,
  onClose,
  onAlbumOpen,
  onInsightsOpen,
  activeTab: controlledTab,
  onTabChange,
}: PhotoInfoSidebarProps & {
  activeTab?: "info" | "comments"
  onTabChange?: (tab: "info" | "comments") => void
}) {
  const t = useTranslations("photos.info")
  const storageT = useTranslations("storage")
  const locale = useLocale()
  const { userInfo } = useApp()
  const isAdmin = userInfo?.type === UserTypeEnum.ADMIN
  const deviceParams = photo ? getPhotoDeviceParams(photo.exif) : []
  const shootingParams = photo ? getPhotoShootingParams(photo.exif) : []

  const [internalTab, setInternalTab] = useState<"info" | "comments">("info")
  const currentTab = controlledTab ?? internalTab

  const handleTabChange = (tab: "info" | "comments") => {
    setInternalTab(tab)
    onTabChange?.(tab)
  }

  return (
    <aside
      className="fixed top-0 right-0 z-[41] flex h-full w-full flex-col overflow-y-auto bg-transparent backdrop-blur-xl text-white shadow-photo-sidebar md:w-84 md:shrink-0"
      onPointerDown={(event) => event.stopPropagation()}
    >
      {onClose && <SidebarCloseButton onClose={onClose} />}

      {photo && (
        <div className="flex flex-col h-full text-left pb-6">
          {/* Segmented Tab Navigation: Info vs Comments */}
          <div className="pl-4 pr-12 pt-3.5 shrink-0">
            <div className="flex items-center p-1 rounded-xl bg-white/10 border border-white/15 backdrop-blur-md">
              <button
                type="button"
                onClick={() => handleTabChange("info")}
                className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                  currentTab === "info"
                    ? "bg-white/20 text-white shadow-sm font-semibold"
                    : "text-white/60 hover:text-white"
                }`}
              >
                <InfoIcon className="size-3.5" />
                <span>Information</span>
              </button>
              <button
                type="button"
                onClick={() => handleTabChange("comments")}
                className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                  currentTab === "comments"
                    ? "bg-white/20 text-white shadow-sm font-semibold"
                    : "text-white/60 hover:text-white"
                }`}
              >
                <MessageSquareIcon className="size-3.5" />
                <span>Comments</span>
              </button>
            </div>
          </div>

          {/* TAB 1: Information */}
          {currentTab === "info" && (
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
              {/* Admin Actions: Add to Album & Photo Insights */}
              {isAdmin && (
                <div className="flex flex-col gap-2">
                  {onAlbumOpen && (
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      className="w-full justify-center gap-2 bg-white/10 text-white hover:bg-white/20 border border-white/20 text-xs font-medium cursor-pointer pointer-events-auto"
                      onClick={(e) => {
                        e.stopPropagation()
                        e.preventDefault()
                        onAlbumOpen(photo.photoId)
                      }}
                    >
                      <FolderPlusIcon className="size-3.5" />
                      <span>+ Add to Album</span>
                    </Button>
                  )}
                  {onInsightsOpen && (
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      className="w-full justify-center gap-2 bg-primary/20 text-white hover:bg-primary/30 border border-primary/30 text-xs font-medium cursor-pointer pointer-events-auto"
                      onClick={(e) => {
                        e.stopPropagation()
                        e.preventDefault()
                        onInsightsOpen(photo.photoId)
                      }}
                    >
                      <TrendingUp className="size-3.5 text-primary" />
                      <span>Photo Insights</span>
                    </Button>
                  )}
                </div>
              )}

              <div>
                <div className="pb-2 text-xs font-semibold text-white/50 tracking-wider uppercase">
                  {t("basicInformation")}
                </div>
                <div className="space-y-2">
                  <PhotoInfoRow label={t("fileName")} value={formatPhotoName(photo.name)} twoLines />
                  <PhotoInfoRow label={t("format")} value={photo.typeDesc.toUpperCase()} />
                  <PhotoInfoRow label={t("fileSize")} value={formatFileSize(photo.size)} />
                  <PhotoInfoRow label={t("resolution")} value={formatResolution(photo.width, photo.height)} />
                  <PhotoInfoRow label={t("megapixels")} value={formatMegapixels(photo.width, photo.height)} />
                  <PhotoInfoRow label={t("dateTime")} value={formatPhotoTakenDateTime(photo.takenTime, locale)} />
                  <PhotoInfoRow label={t("timeZone")} value={getPhotoTimezone(photo.exif)} />
                  <PhotoInfoRow
                    label={t("location")}
                    value={formatPhotoLocation(photo.latitude, photo.longitude, photo.altitude)}
                    wrap
                  />
                  <PhotoInfoRow label={t("software")} value={getPhotoSoftware(photo.exif)} wrap />
                  {photo.albums && photo.albums.length > 0 && (
                    <PhotoInfoRow
                      label="Album"
                      value={formatAlbumList(photo.albums)}
                      wrap
                    />
                  )}
                  {isAdmin && (
                    <PhotoInfoRow label={t("storage")} value={formatStorageLocation(photo, storageT)} />
                  )}
                  <PhotoInfoRow label="Download" value={photo.allowDownload === 1 ? "↓ Downloadable" : "🔒 Protected"} />
                </div>
              </div>

              {shootingParams.length > 0 && (
                <div>
                  <div className="pb-2 text-xs font-semibold text-white/50 tracking-wider uppercase">
                    {t("cameraSettings")}
                  </div>
                  <div className="space-y-2">
                    {shootingParams.map((item) => (
                      <PhotoInfoRow key={item.key} label={t(item.key)} value={item.value} />
                    ))}
                  </div>
                </div>
              )}

              {deviceParams.length > 0 && (
                <div>
                  <div className="pb-2 text-xs font-semibold text-white/50 tracking-wider uppercase">
                    {t("device")}
                  </div>
                  <div className="space-y-2">
                    {deviceParams.map((item) => (
                      <PhotoInfoRow key={item.key} label={t(item.key)} value={item.value} wrap={item.wrap} />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: Dedicated Spacious Comments View */}
          {currentTab === "comments" && (
            <div className="flex-1 flex flex-col min-h-0">
              <PhotoComments photoId={photo.photoId} />
            </div>
          )}
        </div>
      )}
    </aside>
  )
}
