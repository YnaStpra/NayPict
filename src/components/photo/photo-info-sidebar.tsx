"use client"

import { Archive, Eye, FolderHeart, FolderPlusIcon, Globe, Image as ImageIcon, InfoIcon, MapPin, MessageSquareIcon, Pencil, TrendingUp, XIcon } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { formatPhotoTakenDateTime } from "@/lib/date"
import { getThumbHashUrl } from "@/lib/thumb-hash"
import { getPhotoDeviceParams, getPhotoShootingParams, getPhotoSoftware, getPhotoTimezone } from "@/lib/viewer-field"
import { type PhotoVo } from "@/server/entity/vo/photo"
import { useLocale, useTranslations } from "next-intl"
import { useApp } from "@/app/provider"
import { UserTypeEnum } from "@/server/enums/user-enum"
import { PhotoVisibilityEnum } from "@/server/enums/photo-enum"
import { photoSetVisibility } from "@/request/photo"
import { commentList } from "@/request/comment"
import { PhotoComments } from "@/components/photo/photo-comments"
import { PhotoLocationMap } from "@/components/photo/photo-location-map"
import { PhotoBatchEditDialog } from "@/components/photo/photo-batch-edit-dialog"

type PhotoInfoSidebarProps = {
  // Currently viewing photos.
  photo: PhotoVo | null
  // Close sidebar.
  onClose?: () => void
  // Trigger open album dialog (Admin only).
  onAlbumOpen?: (photoId: string) => void
  // Trigger open insights dialog (Admin only).
  onInsightsOpen?: (photoId: string) => void
  // Callback when photo is updated (e.g. visibility change)
  onPhotoUpdate?: (photo: PhotoVo) => void
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
    <div className="fixed inset-0 z-[-10] h-full w-full overflow-hidden pointer-events-none select-none">
      <img
        src={thumbHashUrl}
        alt=""
        className="h-full w-full scale-110 blur-sm object-cover pointer-events-none select-none"
        aria-hidden
      />
      <div className="absolute inset-0 bg-black/50 pointer-events-none" />
    </div>
  )
}

// Render photo information & comments sidebar with tab switcher.
export function PhotoInfoSidebar({
  photo,
  onClose,
  onAlbumOpen,
  onInsightsOpen,
  onPhotoUpdate,
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
  const [commentCount, setCommentCount] = useState<number>(0)
  const [isUpdatingVisibility, setIsUpdatingVisibility] = useState(false)
  const [batchEditDialogOpen, setBatchEditDialogOpen] = useState(false)
  const currentTab = controlledTab ?? internalTab

  const asideRef = useRef<HTMLElement>(null)
  const infoScrollRef = useRef<HTMLDivElement>(null)

  // Fetch initial comment count and listen for real-time comment updates
  useEffect(() => {
    if (!photo?.photoId) {
      setCommentCount(0)
      return
    }

    let isMounted = true
    commentList(photo.photoId)
      .then((items) => {
        if (isMounted && Array.isArray(items)) {
          setCommentCount(items.length)
        }
      })
      .catch(() => {})

    let eventSource: EventSource | null = null
    if (typeof window !== "undefined" && typeof EventSource !== "undefined") {
      try {
        eventSource = new EventSource(`/api/photos/${encodeURIComponent(photo.photoId)}/comments/sse`)
        eventSource.addEventListener("comment_added", () => {
          setCommentCount((prev) => prev + 1)
        })
        eventSource.addEventListener("comment_deleted", () => {
          setCommentCount((prev) => Math.max(0, prev - 1))
        })
      } catch {}
    }

    return () => {
      isMounted = false
      if (eventSource) eventSource.close()
    }
  }, [photo?.photoId])

  const handleVisibilityChange = async (newVisibility: number) => {
    if (!photo || isUpdatingVisibility) return
    setIsUpdatingVisibility(true)
    try {
      await photoSetVisibility({
        photoIds: [photo.photoId],
        visibility: newVisibility,
      })
      const updatedPhoto: PhotoVo = {
        ...photo,
        visibility: newVisibility,
      }
      onPhotoUpdate?.(updatedPhoto)
      toast.success(t("visibilityUpdated") || "Display scope updated")
    } catch (err) {
      console.error("Failed to update photo visibility:", err)
      toast.error(t("visibilityUpdateFailed") || "Failed to update display scope")
    } finally {
      setIsUpdatingVisibility(false)
    }
  }

  // Full-panel mobile horizontal swipe gesture controller with strict binary snap (>= 50% closes, < 50% springs open)
  useEffect(() => {
    const asideEl = asideRef.current
    if (!asideEl) return

    let startX = 0
    let startY = 0
    let startTime = 0
    let isDetermined = false
    let isDraggingHorizontal = false
    let currentDragX = 0

    const onTouchStart = (e: TouchEvent) => {
      e.stopPropagation()
      if (window.innerWidth >= 768 || e.touches.length > 1) return
      const touch = e.touches[0]
      startX = touch.clientX
      startY = touch.clientY
      startTime = Date.now()
      isDetermined = false
      isDraggingHorizontal = false
      currentDragX = 0
    }

    const onTouchMove = (e: TouchEvent) => {
      e.stopPropagation()
      if (window.innerWidth >= 768 || e.touches.length > 1) return
      const touch = e.touches[0]
      const dx = touch.clientX - startX
      const dy = touch.clientY - startY

      if (!isDetermined) {
        if (Math.abs(dx) > 6 || Math.abs(dy) > 6) {
          isDetermined = true
          // If swiping rightwards with predominantly horizontal angle
          if (dx > 0 && Math.abs(dx) > Math.abs(dy) * 0.75) {
            isDraggingHorizontal = true
          }
        }
      }

      if (isDraggingHorizontal) {
        if (e.cancelable) {
          e.preventDefault()
        }
        currentDragX = Math.max(0, dx)
        asideEl.style.transition = "none"
        asideEl.style.transform = `translate3d(${currentDragX}px, 0, 0)`
      }
    }

    const onTouchEnd = (e: TouchEvent) => {
      e.stopPropagation()
      if (!isDraggingHorizontal) return
      isDraggingHorizontal = false
      isDetermined = false

      const dt = Math.max(1, Date.now() - startTime)
      const velocity = currentDragX / dt
      const panelWidth = asideEl.offsetWidth || window.innerWidth || 360

      // 50% screen width threshold or fast flick velocity (> 0.45 px/ms)
      const shouldClose = currentDragX >= panelWidth * 0.5 || (velocity > 0.45 && currentDragX > 40)

      if (shouldClose) {
        // Snap to 100% (CLOSED)
        asideEl.style.transition = "transform 0.22s cubic-bezier(0.22, 1, 0.36, 1)"
        asideEl.style.transform = "translate3d(100%, 0, 0)"
        setTimeout(() => {
          onClose?.()
        }, 220)
      } else {
        // Snap back to 0% (FULLY OPEN)
        asideEl.style.transition = "transform 0.26s cubic-bezier(0.22, 1, 0.36, 1)"
        asideEl.style.transform = "translate3d(0, 0, 0)"
      }
    }

    const onTouchCancel = (e: TouchEvent) => {
      e.stopPropagation()
      if (isDraggingHorizontal) {
        isDraggingHorizontal = false
        isDetermined = false
        asideEl.style.transition = "transform 0.26s cubic-bezier(0.22, 1, 0.36, 1)"
        asideEl.style.transform = "translate3d(0, 0, 0)"
      }
    }

    const stopPropagationOnly = (e: Event) => {
      e.stopPropagation()
    }

    asideEl.addEventListener("wheel", stopPropagationOnly, { passive: true })
    asideEl.addEventListener("pointerdown", stopPropagationOnly, { passive: true })
    asideEl.addEventListener("pointermove", stopPropagationOnly, { passive: true })
    asideEl.addEventListener("touchstart", onTouchStart, { passive: false })
    asideEl.addEventListener("touchmove", onTouchMove, { passive: false })
    asideEl.addEventListener("touchend", onTouchEnd, { passive: false })
    asideEl.addEventListener("touchcancel", onTouchCancel, { passive: false })

    return () => {
      asideEl.removeEventListener("wheel", stopPropagationOnly)
      asideEl.removeEventListener("pointerdown", stopPropagationOnly)
      asideEl.removeEventListener("pointermove", stopPropagationOnly)
      asideEl.removeEventListener("touchstart", onTouchStart)
      asideEl.removeEventListener("touchmove", onTouchMove)
      asideEl.removeEventListener("touchend", onTouchEnd)
      asideEl.removeEventListener("touchcancel", onTouchCancel)
    }
  }, [onClose])

  const handleTabChange = (tab: "info" | "comments") => {
    setInternalTab(tab)
    onTabChange?.(tab)
  }

  return (
    <aside
      ref={asideRef}
      className="fixed top-0 right-0 z-[60] flex h-full w-full flex-col overflow-hidden bg-neutral-950/90 backdrop-blur-2xl text-white shadow-photo-sidebar md:w-84 md:shrink-0 md:border-l md:border-white/10 pointer-events-auto touch-pan-y exif-drawer-spring will-change-transform"
      style={{ touchAction: "pan-y" }}
    >
      <PhotoViewerBlurBackground thumbHash={photo?.thumbHash} />

      {/* Mobile Left-Edge Swipe-Right Indicator */}
      <div
        className="md:hidden absolute left-1 top-1/2 -translate-y-1/2 z-30 pointer-events-none opacity-40"
        aria-hidden
      >
        <div className="w-1.5 h-10 rounded-full bg-white/40 shadow-xs" />
      </div>

      {photo && (
        <div className="relative z-10 flex flex-col flex-1 h-full min-h-0">
          {/* Top Header with title and close button */}
          <div className="flex items-center justify-between px-4 pt-3 pb-2 shrink-0 border-b border-white/10 select-none md:select-auto">
            <h2 className="text-sm font-bold text-white truncate pr-2" title={photo.name}>
              {formatPhotoName(photo.name)}
            </h2>
            {onClose && (
              <button
                type="button"
                onClick={onClose}
                className="p-1.5 rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                title="Close"
              >
                <XIcon className="size-4" />
              </button>
            )}
          </div>

          {/* Segmented Tab Switcher (Information vs Comments) */}
          <div className="px-4 pt-2.5 pb-1 shrink-0">
            <div className="flex rounded-xl bg-white/10 p-1 backdrop-blur-md border border-white/10">
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
                <div className="relative flex items-center">
                  <MessageSquareIcon className="size-3.5 text-emerald-400" />
                  <span className="absolute -top-0.5 -right-0.5 size-1.5 rounded-full bg-emerald-400 animate-ping opacity-75" />
                  <span className="absolute -top-0.5 -right-0.5 size-1.5 rounded-full bg-emerald-400" />
                </div>
                <span className={currentTab === "comments" ? "text-emerald-300 font-semibold" : "text-emerald-400/90"}>
                  Comments
                </span>
                {commentCount > 0 && (
                  <span className="ml-1 px-1.5 py-0.2 rounded-full bg-emerald-500/30 border border-emerald-400/40 text-[10px] font-bold text-emerald-300">
                    {commentCount}
                  </span>
                )}
              </button>
            </div>
          </div>

          {/* TAB 1: Information */}
          {currentTab === "info" && (
            <div
              ref={infoScrollRef}
              className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-4 py-3 pb-32 space-y-4 overscroll-contain pointer-events-auto touch-pan-y"
              style={{ touchAction: "pan-y" }}
            >
              {/* Admin Actions: Add to Album, Photo Insights, Edit Meta/Location & Display Scope */}
              {isAdmin && (
                <div className="flex flex-col gap-2.5">
                  <div className="flex items-center gap-2">
                    {onAlbumOpen && (
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        className="flex-1 justify-center gap-1.5 bg-white/10 text-white hover:bg-white/20 border border-white/20 text-xs font-medium cursor-pointer pointer-events-auto"
                        onClick={(e) => {
                          e.stopPropagation()
                          e.preventDefault()
                          onAlbumOpen(photo.photoId)
                        }}
                      >
                        <FolderPlusIcon className="size-3.5" />
                        <span>+ Album</span>
                      </Button>
                    )}
                    {onInsightsOpen && (
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        className="flex-1 justify-center gap-1.5 bg-primary/20 text-white hover:bg-primary/30 border border-primary/30 text-xs font-medium cursor-pointer pointer-events-auto"
                        onClick={(e) => {
                          e.stopPropagation()
                          e.preventDefault()
                          onInsightsOpen(photo.photoId)
                        }}
                      >
                        <TrendingUp className="size-3.5 text-primary" />
                        <span>Insights</span>
                      </Button>
                    )}
                    <Button
                      type="button"
                      size="sm"
                      className="flex-1 justify-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white border border-emerald-500/50 text-xs font-semibold shadow-md cursor-pointer pointer-events-auto transition-all hover:scale-[1.02]"
                      onClick={(e) => {
                        e.stopPropagation()
                        e.preventDefault()
                        setBatchEditDialogOpen(true)
                      }}
                      title="Edit metadata, tanggal, dan koordinat lokasi GPS"
                    >
                      <Pencil className="size-3.5" />
                      <span>Edit Metadata</span>
                    </Button>
                  </div>

                  {/* Admin Display Scope / Visibility Switcher */}
                  <div className="rounded-2xl border border-white/15 bg-white/5 p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-white/70 uppercase tracking-wider flex items-center gap-1.5">
                        <Eye className="size-3.5 text-amber-400" />
                        <span>{t("displayScope") || "Display Scope"}</span>
                      </span>
                      <span className="text-[11px] font-medium text-white/50 bg-white/10 px-2 py-0.5 rounded-full">
                        {photo.visibility === PhotoVisibilityEnum.GALLERY_ONLY
                          ? (t("visibilityGalleryOnly") || "Gallery Only")
                          : photo.visibility === PhotoVisibilityEnum.ALBUM_ONLY
                          ? (t("visibilityAlbumOnly") || "Album Only")
                          : photo.visibility === PhotoVisibilityEnum.ARCHIVED
                          ? (t("visibilityArchived") || "Archived")
                          : (t("visibilityBoth") || "Both")}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-1.5 pt-0.5">
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        disabled={isUpdatingVisibility}
                        className={`h-8 text-xs font-medium rounded-xl justify-start gap-1.5 px-2.5 transition-all cursor-pointer ${
                          photo.visibility === PhotoVisibilityEnum.BOTH || !photo.visibility
                            ? "bg-white/20 text-white font-semibold shadow-xs border border-white/25"
                            : "bg-black/30 text-white/70 hover:text-white hover:bg-white/10 border border-white/10"
                        }`}
                        onClick={() => handleVisibilityChange(PhotoVisibilityEnum.BOTH)}
                      >
                        <Globe className="size-3.5 text-emerald-400" />
                        <span className="truncate">{t("visibilityBoth") || "Both"}</span>
                      </Button>

                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        disabled={isUpdatingVisibility}
                        className={`h-8 text-xs font-medium rounded-xl justify-start gap-1.5 px-2.5 transition-all cursor-pointer ${
                          photo.visibility === PhotoVisibilityEnum.GALLERY_ONLY
                            ? "bg-white/20 text-white font-semibold shadow-xs border border-white/25"
                            : "bg-black/30 text-white/70 hover:text-white hover:bg-white/10 border border-white/10"
                        }`}
                        onClick={() => handleVisibilityChange(PhotoVisibilityEnum.GALLERY_ONLY)}
                      >
                        <ImageIcon className="size-3.5 text-sky-400" />
                        <span className="truncate">{t("visibilityGalleryOnly") || "Gallery Only"}</span>
                      </Button>

                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        disabled={isUpdatingVisibility}
                        className={`h-8 text-xs font-medium rounded-xl justify-start gap-1.5 px-2.5 transition-all cursor-pointer ${
                          photo.visibility === PhotoVisibilityEnum.ALBUM_ONLY
                            ? "bg-white/20 text-white font-semibold shadow-xs border border-white/25"
                            : "bg-black/30 text-white/70 hover:text-white hover:bg-white/10 border border-white/10"
                        }`}
                        onClick={() => handleVisibilityChange(PhotoVisibilityEnum.ALBUM_ONLY)}
                      >
                        <FolderHeart className="size-3.5 text-pink-400" />
                        <span className="truncate">{t("visibilityAlbumOnly") || "Album Only"}</span>
                      </Button>

                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        disabled={isUpdatingVisibility}
                        className={`h-8 text-xs font-medium rounded-xl justify-start gap-1.5 px-2.5 transition-all cursor-pointer ${
                          photo.visibility === PhotoVisibilityEnum.ARCHIVED
                            ? "bg-amber-500/30 text-amber-200 font-semibold shadow-xs border border-amber-400/40"
                            : "bg-black/30 text-white/70 hover:text-white hover:bg-white/10 border border-white/10"
                        }`}
                        onClick={() => handleVisibilityChange(PhotoVisibilityEnum.ARCHIVED)}
                      >
                        <Archive className="size-3.5 text-amber-400" />
                        <span className="truncate">{t("visibilityArchived") || "Archive / Hide"}</span>
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              <div>
                <div className="flex items-center justify-between pb-2">
                  <span className="text-xs font-semibold text-white/50 tracking-wider uppercase">
                    {t("basicInformation")}
                  </span>
                  {isAdmin && (
                    <button
                      type="button"
                      onClick={() => setBatchEditDialogOpen(true)}
                      className="flex items-center gap-1 text-[11px] font-semibold text-emerald-400 hover:text-emerald-300 hover:underline cursor-pointer"
                    >
                      <Pencil className="size-3" />
                      <span>Edit Metadata</span>
                    </button>
                  )}
                </div>
                <div className="space-y-2">
                  <PhotoInfoRow label={t("fileName")} value={formatPhotoName(photo.name)} twoLines />
                  <PhotoInfoRow label={t("format")} value={photo.typeDesc.toUpperCase()} />
                  <PhotoInfoRow label={t("fileSize")} value={formatFileSize(photo.size)} />
                  <PhotoInfoRow label={t("resolution")} value={formatResolution(photo.width, photo.height)} />
                  <PhotoInfoRow label={t("megapixels")} value={formatMegapixels(photo.width, photo.height)} />
                  <PhotoInfoRow label={t("dateTime")} value={formatPhotoTakenDateTime(photo.takenTime, locale)} />
                  <PhotoInfoRow label={t("timeZone")} value={getPhotoTimezone(photo.exif)} />
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

              {/* Visual Google Map Location Card (Positioned at the very bottom of photo info) */}
              {photo.latitude != null && photo.longitude != null && !isNaN(Number(photo.latitude)) && !isNaN(Number(photo.longitude)) ? (
                <div>
                  <div className="flex items-center justify-between pb-2">
                    <span className="text-xs font-semibold text-white/50 tracking-wider uppercase">
                      {t("location")}
                    </span>
                    {isAdmin && (
                      <button
                        type="button"
                        onClick={() => setBatchEditDialogOpen(true)}
                        className="flex items-center gap-1 text-[11px] font-semibold text-emerald-400 hover:text-emerald-300 hover:underline cursor-pointer"
                      >
                        <MapPin className="size-3" />
                        <span>Change Location</span>
                      </button>
                    )}
                  </div>
                  <PhotoLocationMap
                    latitude={Number(photo.latitude)}
                    longitude={Number(photo.longitude)}
                    altitude={photo.altitude != null ? Number(photo.altitude) : null}
                    thumbnail={photo.thumbnail}
                    preview={photo.preview}
                    photoName={photo.name}
                  />
                </div>
              ) : (
                isAdmin && (
                  <div>
                    <div className="pb-2 text-xs font-semibold text-white/50 tracking-wider uppercase">
                      {t("location")}
                    </div>
                    <div className="rounded-xl border border-dashed border-white/20 bg-white/5 p-3.5 text-center space-y-2">
                      <p className="text-xs text-white/60">This photo does not have GPS coordinates.</p>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => setBatchEditDialogOpen(true)}
                        className="h-7 text-xs rounded-lg border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20 gap-1.5 cursor-pointer"
                      >
                        <MapPin className="size-3" />
                        <span>Add GPS Location</span>
                      </Button>
                    </div>
                  </div>
                )
              )}
            </div>
          )}

          {/* TAB 2: Dedicated Spacious Comments View */}
          {currentTab === "comments" && (
            <div className="flex-1 flex flex-col min-h-0">
              <PhotoComments photoId={photo.photoId} />
            </div>
          )}

          {/* Edit Metadata & GPS Location Dialog */}
          {isAdmin && (
            <PhotoBatchEditDialog
              open={batchEditDialogOpen}
              onOpenChange={setBatchEditDialogOpen}
              photoIds={[photo.photoId]}
              initialName={photo.name}
              onSuccess={(_ids, changes) => {
                onPhotoUpdate?.({
                  ...photo,
                  ...changes,
                })
              }}
            />
          )}
        </div>
      )}
    </aside>
  )
}
