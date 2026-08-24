"use client"

import { useEffect, useMemo, useState, type MouseEvent } from "react"
import { FolderIcon, PinIcon } from "lucide-react"
import { type RenderComponentProps } from "masonic"
import { useIsMobile } from "@/hooks/use-mobile"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { formatPhotoTakenDate, formatRecycleTime } from "@/lib/date"
import { getThumbHashUrl } from "@/lib/thumb-hash"
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
export function PhotoCard({
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
  // showTouchHover Record whether floating information is displayed after long pressing on the mobile terminal。
  const [showTouchHover, setShowTouchHover] = useState(false)
  // holdHover Momentarily lock hover information when clicking to open viewer，Avoid instant retraction of zoom animation。
  const [holdHover, setHoldHover] = useState(false)
  // Multi-tier fallback src state: thumbnail -> preview -> original key
  const [imageSrc, setImageSrc] = useState<string | null>(() => data.thumbnail || data.preview || data.key || null)
  // imageError Record whether all photo URLs failed to load.
  const [imageError, setImageError] = useState(false)
  // isMobile Determine whether the current viewport is the mobile terminal。
  const isMobile = useIsMobile()
  const showHover = showTouchHover || holdHover

  // Reset image source when data changes
  useEffect(() => {
    setImageSrc(data.thumbnail || data.preview || data.key || null)
    setImageError(false)
  }, [data.thumbnail, data.preview, data.key])

  // Handle graceful image fallback
  function handleImageError() {
    if (imageSrc === data.thumbnail && data.preview && data.preview !== data.thumbnail) {
      setImageSrc(data.preview)
    } else if (imageSrc !== data.key && data.key) {
      setImageSrc(data.key)
    } else {
      setImageError(true)
    }
  }

  // Toggle the selection status of the current photo。
  function changeSelected(checked: boolean) {
    onSelectedChange?.(data.photoId, checked)
  }

  // Open or select according to current mode when clicking on photo。
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

    // Not available on mobile hover enlarge，No need to lock floating information。
    if (!isMobile) {
      setHoldHover(true)
      setTimeout(() => setHoldHover(false), 200)
    }

    onOpen?.()
  }

  // Block system menu when long pressing photo，and display the original hover Information that just appeared。
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
      className="group relative overflow-hidden bg-muted"
      onClick={handlePhotoClick}
      onContextMenu={handlePhotoContextMenu}
      style={{
        width,
        height: cardHeight,
        contain: "paint layout",
        contentVisibility: "auto",
        containIntrinsicSize: `${width}px ${cardHeight}px`,
      }}
    >
      {placeholder && (
        <img
          src={placeholder}
          alt=""
          className="absolute inset-0 h-full w-full scale-110 blur-sm"
          aria-hidden
          draggable={false}
        />
      )}
      {imageError ? (
        <div className="absolute inset-0 flex items-center justify-center px-3 text-center text-sm text-muted-foreground">
          {t("imageLoadFailed")}
        </div>
      ) : (
        <img
          src={imageSrc ?? undefined}
          srcSet={
            data.thumbnail && data.preview && data.thumbnail !== data.preview
              ? `${data.thumbnail} 480w, ${data.preview} 1280w`
              : undefined
          }
          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, (max-width: 1536px) 33vw, 25vw"
          loading="lazy"
          decoding="async"
          crossOrigin="anonymous"
          alt={data.name}
          draggable={false}
          className={[
            "absolute inset-0 h-full w-full object-cover duration-350",
            selectionActive ? "" : "group-hover:scale-105",
            showHover && !selectionActive ? "scale-105" : "",
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
          className="absolute top-2 left-2 z-10 flex items-center gap-1 rounded-full bg-primary/90 text-primary-foreground backdrop-blur-md px-2 py-0.5 text-[11px] font-semibold shadow-md border border-primary/20"
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
            "absolute top-[6px] right-[6px] z-10 flex size-6 items-center justify-center opacity-0 transition-opacity duration-200 group-hover:opacity-100",
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
}
