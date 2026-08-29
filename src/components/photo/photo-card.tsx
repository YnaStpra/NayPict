"use client"

import { memo, useEffect, useMemo, useRef, useState, type MouseEvent } from "react"
import { FolderIcon, PinIcon } from "lucide-react"
import { type RenderComponentProps } from "masonic"
import { useIsMobile } from "@/hooks/use-mobile"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { formatPhotoTakenDate, formatRecycleTime } from "@/lib/date"
import { getThumbHashUrl } from "@/lib/thumb-hash"
import { toProxyMediaUrl } from "@/lib/url"
import { PhotoStatusEnum } from "@/server/enums/photo-enum"
import { type PhotoVo } from "@/server/entity/vo/photo"
import { useLocale, useTranslations } from "next-intl"
import { useApp } from "@/app/provider"
import { UserTypeEnum } from "@/server/enums/user-enum"

type TouchHoverCloseRef = {
  current: (() => void) | null
}

type PhotoCardProps = RenderComponentProps<PhotoVo> & {
  selected?: boolean
  selectionActive?: boolean
  onOpen?: () => void
  onSelectedChange?: (photoId: string, selected: boolean) => void
  onPhotoPin?: (photoId: string, isPinned: boolean) => void
  touchHoverCloseRef?: TouchHoverCloseRef
}

// Format photo file size.
function formatPhotoSize(size: number) {
  if (size < 1024) {
    return `${size}B`
  }

  if (size < 1024 * 1024) {
    return `${Math.round(size / 1024)}KB`
  }

  return `${(size / 1024 / 1024).toFixed(1)}MB`
}

// Format photo display name, remove file extension.
function formatPhotoName(name: string) {
  const index = name.lastIndexOf('.')

  return index > 0 ? name.slice(0, index) : name
}

// Rendering a single photo card in a waterfall flow.
export const PhotoCard = memo(function PhotoCard({
  data,
  index,
  width,
  selected = false,
  selectionActive = false,
  onOpen,
  onSelectedChange,
  onPhotoPin,
  touchHoverCloseRef,
}: PhotoCardProps) {
  const { userInfo } = useApp()
  const isAdmin = userInfo?.type === UserTypeEnum.ADMIN
  const t = useTranslations("photos")
  const locale = useLocale()
  const src = data.thumbnail || data.preview || data.key
  const ratio = data.width && data.height ? data.height / data.width : 1
  const placeholder = useMemo(() => getThumbHashUrl(data.thumbHash), [data.thumbHash])
  // showTouchHover Record whether floating information is displayed after long pressing on the mobile terminal.
  const [showTouchHover, setShowTouchHover] = useState(false)
  // holdHover Momentarily lock hover information when clicking to open viewer, Avoid instant retraction of zoom animation.
  const [holdHover, setHoldHover] = useState(false)
  // Multi-tier fallback src state: thumbnail -> preview -> original key
  const [imageSrc, setImageSrc] = useState<string | null>(() => data.thumbnail || data.preview || data.key || null)
  // imageError Record whether all photo URLs failed to load.
  const [imageError, setImageError] = useState(false)
  // isMobile Determine whether the current viewport is the mobile terminal.
  const isMobile = useIsMobile()
  const showHover = showTouchHover || holdHover
  // Predictive hover dwell timer
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const imgRef = useRef<HTMLImageElement | null>(null)
  const isPriority = typeof index === "number" && index < 12

  // Reset image source and state when photo actually changes
  const prevPhotoIdRef = useRef(data.photoId)
  useEffect(() => {
    if (prevPhotoIdRef.current !== data.photoId) {
      prevPhotoIdRef.current = data.photoId
      setImageSrc(data.thumbnail || data.preview || data.key || null)
      setImageError(false)
    }
  }, [data.photoId, data.thumbnail, data.preview, data.key])

  // Proactive Fallback Watchdog: If thumbnail stalls > 3s without error, seamlessly switch to preview/original
  useEffect(() => {
    if (imageError) return
    if (imageSrc === data.thumbnail && data.preview && data.preview !== data.thumbnail) {
      const timer = setTimeout(() => {
        setImageSrc(data.preview)
      }, 3000)
      return () => clearTimeout(timer)
    }
  }, [imageSrc, imageError, data.thumbnail, data.preview])

  // Handle graceful image fallback across all media tiers and CDN fallback
  function handleImageError() {
    // 1. If image failed on an external CDN (e.g. Brave Shields / privacy blocking), immediately fallback to first-party proxy
    if (imageSrc && !imageSrc.startsWith('/media/')) {
      const fallback = data.thumbnail || data.preview || data.key
      if (fallback) {
        const proxyUrl = toProxyMediaUrl(fallback)
        if (proxyUrl && proxyUrl !== imageSrc) {
          setImageSrc(proxyUrl)
          return
        }
      }
    }

    // 2. Try higher-res tiers
    if (data.preview && imageSrc !== data.preview && imageSrc !== toProxyMediaUrl(data.preview)) {
      setImageSrc(data.preview)
    } else if (data.key && imageSrc !== data.key && imageSrc !== toProxyMediaUrl(data.key)) {
      setImageSrc(data.key)
    } else {
      setImageError(true)
    }
  }

  // Predictive hover prefetching with intent dwell time (>50ms) & requestIdleCallback
  function handleMouseEnter() {
    if (isMobile) return
    hoverTimerRef.current = setTimeout(() => {
      if (typeof window !== "undefined") {
        const prefetch = () => {
          if (data.preview) {
            const img = new Image()
            img.decoding = "async"
            img.src = data.preview
          }
          // Prefetch Lightbox bundle ahead of click
          import("@/components/photo/photo-viewer").catch(() => {})
        }

        if ("requestIdleCallback" in window) {
          window.requestIdleCallback(prefetch, { timeout: 150 })
        } else {
          prefetch()
        }
      }
    }, 50)
  }

  // Predictive touch-start prefetching for instant mobile lightbox opening
  function handleTouchStart() {
    if (typeof window !== "undefined" && data.preview) {
      const img = new Image()
      img.decoding = "async"
      img.src = data.preview
      import("@/components/photo/photo-viewer").catch(() => {})
    }
  }

  function handleMouseLeave() {
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current)
      hoverTimerRef.current = null
    }
  }

  // Toggle the selection status of the current photo.
  function changeSelected(checked: boolean) {
    onSelectedChange?.(data.photoId, checked)
  }

  // Open or select according to current mode when clicking on photo.
  function handlePhotoClick(event: MouseEvent<HTMLDivElement>) {
    if (showTouchHover) {
      event.stopPropagation()
      setShowTouchHover(false)
      if (touchHoverCloseRef) {
        touchHoverCloseRef.current = null
      }
      return
    }

    if (selectionActive) {
      changeSelected(!selected)
      return
    }

    // Not available on mobile hover enlarge, No need to lock floating information.
    if (!isMobile) {
      setHoldHover(true)
      setTimeout(() => setHoldHover(false), 200)
    }

    onOpen?.()
  }

  // Block system menu when long pressing photo, and display the original hover Information that just appeared.
  function handlePhotoContextMenu(event: MouseEvent<HTMLDivElement>) {
    if (window.innerWidth >= 1024) {
      return
    }

    event.preventDefault()

    if (showTouchHover) {
      setShowTouchHover(false)

      if (touchHoverCloseRef) {
        touchHoverCloseRef.current = null
      }

      return
    }

    touchHoverCloseRef?.current?.()
    setShowTouchHover(true)

    if (touchHoverCloseRef) {
      touchHoverCloseRef.current = () => setShowTouchHover(false)
    }
  }

  const cardHeight = Math.max(1, Math.round(width * ratio))

  return (
    <div
      className="group relative overflow-hidden houdini-smooth-card touch-press-feedback"
      onClick={handlePhotoClick}
      onContextMenu={handlePhotoContextMenu}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onTouchStart={handleTouchStart}
      style={{
        width,
        height: cardHeight,
        contain: "paint layout",
        transform: "translateZ(0)",
        willChange: "auto",
        backgroundColor: placeholder ? undefined : "rgba(128,128,128,0.08)",
        backgroundImage: placeholder ? `url("${placeholder}")` : undefined,
        backgroundSize: "cover",
        backgroundPosition: "center",
        // Dynamic Layout Stability CSS Custom Properties (CLS = 0.000)
        ["--aspect-ratio" as string]: `${ratio}`,
        ["--intrinsic-width" as string]: `${width}px`,
        ["--intrinsic-height" as string]: `${cardHeight}px`,
      }}
    >
      {imageError ? (
        <div className="absolute inset-0 flex items-center justify-center px-3 text-center text-sm text-muted-foreground bg-muted/60">
          {t("imageLoadFailed")}
        </div>
      ) : (
        <img
          ref={imgRef}
          src={imageSrc ?? undefined}
          loading={isPriority ? "eager" : "lazy"}
          fetchPriority={isPriority ? "high" : "auto"}
          decoding="async"
          alt={data.name}
          draggable={false}
          className={[
            "absolute inset-0 h-full w-full object-cover spring-zoom-img",
            selectionActive ? "" : "group-hover:scale-[1.035]",
            showHover && !selectionActive ? "scale-[1.035]" : "",
          ].join(" ")}
          onError={handleImageError}
        />
      )}
      {selected && (
        <div className="pointer-events-none absolute inset-0 bg-black/60" />
      )}
      {/* Pinned Photo Badge (Visible to all in album view) */}
      {data.isPinned && (
        <div
          className="absolute top-2 left-2 z-10 flex items-center gap-1 rounded-full bg-primary/90 text-primary-foreground backdrop-blur-md px-2 py-0.5 text-[11px] font-semibold shadow-md border border-primary/20 elastic-pop-badge"
          title="Pinned di album (Urutan teratas)"
        >
          <PinIcon className="size-3 fill-current rotate-45" />
          <span>Pinned</span>
        </div>
      )}
      {data.status === PhotoStatusEnum.DELETE && (
        <div
          className="pointer-events-none absolute top-[7px] left-[7px] z-10 text-base font-semibold text-white"
          style={{
            filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.4)) drop-shadow(0 0 1px rgba(0,0,0,0.3))",
          }}
        >
          {formatRecycleTime(data.recycleTime, locale)}
        </div>
      )}
      {isAdmin && (
        <div
          className={[
            "absolute top-[6px] right-[6px] z-10 flex size-6 items-center justify-center opacity-0 transition-opacity duration-200 group-hover:opacity-100 elastic-pop-badge",
            selected || selectionActive || showHover ? "opacity-100" : "",
          ].join(" ")}
          onClick={(event) => event.stopPropagation()}
        >
          <Checkbox
            aria-label={`Select photo ${data.name}`}
            checked={selected}
            className="!size-4.5 rounded-full border-0 !bg-white/35 data-[state=checked]:!bg-[#e5e5e5] data-[state=checked]:!text-black [&_svg]:!size-3"
            onCheckedChange={(checked) => changeSelected(checked === true)}
          />
        </div>
      )}
      {!selectionActive && (
        <div
          className={[
            "pointer-events-none absolute inset-0 bg-[linear-gradient(to_bottom,rgba(0,0,0,0.20),rgba(0,0,0,0.05)_24%,rgba(0,0,0,0.10)_58%,rgba(0,0,0,0.50))] opacity-0 transition-opacity duration-300 group-hover:opacity-100",
            showHover ? "opacity-100" : "",
          ].join(" ")}
        />
      )}
      {/* Admin Pin/Unpin Action Button (In Album View) */}
      {isAdmin && onPhotoPin && !selectionActive && !selected && (
        <Button
          type="button"
          size="icon-sm"
          className={[
            "absolute right-2.5 bottom-1 z-10 rounded-full bg-black/40 backdrop-blur-md opacity-0 transition-all duration-200 hover:bg-black/60 group-hover:opacity-100 cursor-pointer",
            data.isPinned
              ? "text-amber-400 opacity-100 bg-black/60"
              : ["text-white/90", isMobile ? "pointer-events-none" : ""].join(" "),
            showHover ? "opacity-100 pointer-events-auto" : "",
          ].join(" ")}
          onClick={(event) => {
            event.stopPropagation()
            onPhotoPin(data.photoId, Boolean(data.isPinned))
          }}
          aria-label={data.isPinned ? `Unpin ${data.name} from album` : `Pin ${data.name} to album top`}
          title={data.isPinned ? "Unpin photo from album" : "Pin photo to the top of album (Maximum 3 photos)"}
        >
          <PinIcon className={`size-3.5 rotate-45 ${data.isPinned ? "fill-amber-400 text-amber-400" : "text-white"}`} />
        </Button>
      )}
      {!selectionActive && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 p-2.5 pr-2.5 pb-2.5 text-white">
          <div className="**:duration-300">
            {data.albums && data.albums.length > 0 && (
              <div className={["mb-1.5 flex flex-wrap items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-300", showHover ? "opacity-100" : ""].join(" ")}>
                {data.albums.map((album) => (
                  <span
                    key={album.albumId}
                    className="inline-flex items-center gap-1 rounded-full bg-black/60 text-amber-300 backdrop-blur-md px-2 py-0.5 text-[11px] font-medium border border-amber-400/35 shadow-sm truncate max-w-[170px]"
                    title={`Album: ${album.name}`}
                  >
                    <FolderIcon className="size-3 text-amber-400 shrink-0 fill-amber-400/20" />
                    <span className="truncate">{album.name}</span>
                  </span>
                ))}
              </div>
            )}
            <h3 className={["mb-1 truncate text-sm font-medium opacity-0 group-hover:opacity-100", showHover ? "opacity-100" : ""].join(" ")}>
              {formatPhotoName(data.name)}
            </h3>
            <div className="mb-1 flex justify-start">
              <span className={["text-xs text-white/85 opacity-0 group-hover:opacity-100", showHover ? "opacity-100" : ""].join(" ")}>
                {formatPhotoTakenDate(data.takenTime, locale)}
              </span>
            </div>
            <div className={["flex flex-wrap justify-start gap-1 text-xs text-white/85 opacity-0 group-hover:opacity-100", showHover ? "opacity-100" : ""].join(" ")}>
              <span>{data.typeDesc.toUpperCase()}</span>
              <span> • </span>
              <span>
                {data.width} × {data.height}
              </span>
              {
                innerWidth < 768 ? (
                  <div>{formatPhotoSize(data.size)}</div>
                ) : (
                  <>
                    <span> • </span>
                    <span>{formatPhotoSize(data.size)}</span>
                  </>
                )
              }
            </div>
          </div>
        </div>
      )}
    </div>
  )
})
