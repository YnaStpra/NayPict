"use client"

import {
  type CSSProperties,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import { AnimatePresence } from "framer-motion"
import useEmblaCarousel from "embla-carousel-react"
import {
  ArrowLeftIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronsUpDownIcon,
  CircleAlertIcon,
  CircleIcon,
  FolderIcon,
  FolderPlusIcon,
  LockIcon,
  Menu,
  LoaderCircleIcon,
  MaximizeIcon,
  MessageSquare,
  MinimizeIcon,
  PanelRightClose,
  PanelRightOpen,
  Play,
  RotateCcwSquare,
  Share2Icon,
  Sparkles,
  Trash2Icon,
  Wifi,
  WifiOff,
} from "lucide-react"
import { toast } from "sonner"
import dynamic from "next/dynamic"

import { PhotoInfoSidebar, PhotoViewerBlurBackground, formatAlbumList } from "@/components/photo/photo-info-sidebar"
import { PhotoViewerAmbientGlow } from "@/components/photo/photo-ambient-glow"
import { AnalogFilmStripCompact } from "@/components/photo/analog-film-strip"
import { PhotoReactions } from "@/components/photo/photo-reactions"
import { VideoPlayer } from "@/components/video/video-player"
import { prebufferVideo } from "@/lib/video-prebuffer"
import { loadedThumbnails } from "@/components/photo/photo-card"
import { getIsOffline, notifyConnectionRestored } from "@/lib/network-status"

// Dynamic code-splitting: Lazy-load heavy dialog bundles on demand to drastically minimize initial photo viewer bundle
const PhotoInsightsDialog = dynamic(
  () => import("@/components/photo/photo-insights-dialog").then((mod) => mod.PhotoInsightsDialog),
  { ssr: false }
)
const PhotoStoryDialog = dynamic(
  () => import("@/components/photo/photo-story-dialog").then((mod) => mod.PhotoStoryDialog),
  { ssr: false }
)
const PhotoBatchEditDialog = dynamic(
  () => import("@/components/photo/photo-batch-edit-dialog").then((mod) => mod.PhotoBatchEditDialog),
  { ssr: false }
)
import { cn } from "@/lib/utils"
import { InstagramIcon } from "@/components/icons/instagram"
import { useTapAction } from "@/hooks/use-tap-action"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { getThumbHashUrl } from "@/lib/thumb-hash"
import { removePhotoIdFromUrl, setPhotoIdInUrl, toProxyMediaUrl } from "@/lib/url"
import { recordPhotoShare, recordPhotoView } from "@/request/insights"
import { trackVisitorMedia } from "@/hooks/use-visitor-tracker"
import { PhotoHeartBurst } from "@/components/photo/photo-heart-burst"
import { reactionSync } from "@/lib/reaction-sync"
import { type PhotoVo } from "@/server/entity/vo/photo"
import { usePhotoStore } from "@/store/photo-store"
import { useApp } from "@/app/provider"
import { UserTypeEnum } from "@/server/enums/user-enum"
import { useTranslations } from "next-intl"
import { useModalBackHandler } from "@/hooks/use-modal-back-handler"

interface PhotoViewerProps {
  // Controls viewer visibility.
  open: boolean
  // Currently opened photo index.
  index: number
  // Photo list passed from parent.
  photos: PhotoVo[]
  // Executed on viewer close.
  onBack?: () => void
  // Executed on browser back button.
  onBrowserBack?: () => void
  // Executed on photo delete.
  onPhotoDelete?: (photoId: string) => void
  // Executed on photo update (e.g. visibility change).
  onPhotoUpdate?: (photo: PhotoVo) => void
  // Executed on album select open.
  onAlbumOpen?: (photoIds: string[]) => void
}

type PhotoSlideType = {
  // Current photo ID.
  photoId: string
  // Current photo original key.
  key: string | null
  // Current photo original size.
  originalSize: number
  // Current photo preview URL.
  preview: string
  // Thumbnail URL.
  thumbnail: string
  // ThumbHash blurred background URL.
  thumbHashUrl?: string
  // Album list photo belongs to.
  albums?: { albumId: string; name: string }[]
  // MIME type (image/jpeg, video/mp4, etc.)
  mediaType?: string
  // EXIF metadata JSON string.
  exif?: string | null
  width?: number
  height?: number
  alt?: string
  src: string
}

type OriginalPhoto = {
  // The original image that has been loaded currently key.
  key: string
}

type OriginalProgress = {
  // Number of bytes currently loaded.
  loaded: number
  // The total number of bytes of the current original image.
  total: number
}

type PreviewRequestMap = Map<string, () => void>

type LoadOriginalImageParams = {
  photoId: string
  src: string
  totalSize: number
  setOriginalPhoto: (photo: OriginalPhoto | null) => void
  setOriginalProgress: (progress: OriginalProgress | null) => void
  setShowOriginalProgress: (show: boolean) => void
  setOriginalError: (error: boolean) => void
  abortOriginalRef: { current: (() => void) | null }
  hideTimerRef: { current: ReturnType<typeof setTimeout> | null }
  setPhotoCache: (photoId: string, src: string) => void
}

// Generate fade-in and fade-out styles based on the display state of the action button.
function getActionVisibleClass(showActions: boolean) {
  return showActions ? "opacity-100" : "pointer-events-none opacity-0"
}

// Format the number of bytes into MB.
function formatMB(size: number) {
  return `${(size / 1024 / 1024).toFixed(1)}MB`
}

// Close all preview image requests, and clear the current request Map.
function closePreviewRequests(requests: PreviewRequestMap) {
  const aborts = Array.from(requests.values())
  requests.clear()
  aborts.forEach((abort) => {
    abort()
  })
}

// Load the original image and directly update the status related to the original image in the viewer.
function loadOriginalImage({
  photoId,
  src,
  totalSize,
  setOriginalPhoto,
  setOriginalProgress,
  setShowOriginalProgress,
  setOriginalError,
  abortOriginalRef,
  hideTimerRef,
  setPhotoCache,
}: LoadOriginalImageParams) {
  const xhr = new XMLHttpRequest()
  const abortOriginal = () => {
    xhr.abort()
  }

  function clearCurrentRequest() {
    if (abortOriginalRef.current === abortOriginal) {
      abortOriginalRef.current = null
    }
  }

  if (hideTimerRef.current) {
    clearTimeout(hideTimerRef.current)
    hideTimerRef.current = null
  }
  setShowOriginalProgress(true)
  setOriginalError(false)
  setOriginalProgress({
    loaded: 0,
    total: totalSize,
  })

  xhr.open("GET", src)
  xhr.responseType = "arraybuffer"
  xhr.onprogress = (event) => {
    setOriginalProgress({
      loaded: event.loaded,
      total: event.lengthComputable ? event.total : totalSize,
    })
  }
  xhr.onload = () => {
    if (xhr.status >= 200 && xhr.status < 300) {
      setOriginalProgress({
        loaded: xhr.response.byteLength,
        total: xhr.response.byteLength,
      })
      setPhotoCache(photoId, src)
      setOriginalPhoto({
        key: src,
      })

      hideTimerRef.current = setTimeout(() => {
        hideTimerRef.current = null
        setShowOriginalProgress(false)
      }, 800)
    } else {
      setOriginalError(true)
      setShowOriginalProgress(true)
    }
    clearCurrentRequest()
  }
  xhr.onerror = () => {
    setOriginalError(true)
    setShowOriginalProgress(true)
    clearCurrentRequest()
  }
  xhr.onabort = () => {
    clearCurrentRequest()
  }
  xhr.send()

  return abortOriginal
}

// Silently load preview, Replace the current display image after the request is completed.
function loadPreviewImage(
  src: string,
  photoId: string,
  currentPhotoIdRef: { current: string | null },
  setOriginalPhoto: (photo: OriginalPhoto | null) => void,
  previewRequestsRef: { current: PreviewRequestMap },
  getPhotoCache: (photoId: string) => string | undefined,
  setPhotoCache: (photoId: string, src: string) => void,
  onLoaded?: () => void
) {
  if (!src) return

  const cachedSrc = getPhotoCache(photoId)
  if (cachedSrc) {
    if (currentPhotoIdRef.current === photoId) {
      onLoaded?.()
    }
    return
  }

  const img = new Image()
  img.crossOrigin = "anonymous"
  img.decoding = "async"
  if ("fetchPriority" in img) {
    ;(img as any).fetchPriority = "high"
  }
  const abortPreview = () => {
    img.onload = null
    img.onerror = null
    img.src = ""
  }

  previewRequestsRef.current.set(photoId, abortPreview)

  function clearCurrentRequest() {
    if (previewRequestsRef.current.get(photoId) === abortPreview) {
      previewRequestsRef.current.delete(photoId)
    }
  }

  img.onload = () => {
    loadedThumbnails.add(src)
    setPhotoCache(photoId, src)
    if (currentPhotoIdRef.current === photoId) {
      onLoaded?.()
    }
    clearCurrentRequest()
  }

  img.onerror = () => {
    clearCurrentRequest()
  }

  img.src = src
}

// Render original progress button.
function OriginalProgressButton({
  progress,
  error,
}: {
  progress: OriginalProgress | null
  error: boolean
}) {
  const t = useTranslations("photos.viewer")
  if (!progress) {
    return null
  }

  const percent = Math.round((progress.loaded / progress.total) * 100)

  return (
    <Button
      type="button"
      variant="secondary"
      className="absolute right-3 md:right-4 bottom-16 md:bottom-20 z-[450] h-auto gap-3 rounded-xl bg-black/80 px-3 py-2 text-white transition-opacity duration-200 hover:bg-black/80 pointer-events-auto"
    >
      {error ? (
        <CircleAlertIcon className="size-4 text-red-500" />
      ) : (
        <LoaderCircleIcon className="size-4 animate-spin text-white" />
      )}
      <span className="flex flex-col items-start leading-none">
        <span className={["text-xs font-medium", error ? "text-red-500" : "text-white"].join(" ")}>
          <span className="text-xs mr-[1px]"> {error ? t("loadFailed") : t("loading")} </span>
          {!error && <span className="text-white/70"> {percent}%</span>}
        </span>
        <span className="text-xs text-white/70">
          {formatMB(progress.loaded)} / {formatMB(progress.total)}
        </span>
      </span>
    </Button>
  )
}

// Render previous slide button on desktop.
function PrevButton({
  showActions,
  onClick,
  disabled,
}: {
  showActions: boolean
  onClick: () => void
  disabled: boolean
}) {
  if (disabled) return null

  return (
    <Button
      type="button"
      size="icon"
      variant="secondary"
      className={[
        "absolute top-1/2 left-3 z-40 hidden rounded-full bg-black/40 text-white transition-opacity duration-200 hover:bg-black/50 md:inline-flex cursor-pointer pointer-events-auto",
        getActionVisibleClass(showActions),
      ].join(" ")}
      style={{ transform: "translateY(-50%)" }}
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
    >
      <ChevronLeftIcon />
      <span className="sr-only">Previous photo</span>
    </Button>
  )
}

// Render next slide button on desktop.
function NextButton({
  showActions,
  onClick,
  disabled,
}: {
  showActions: boolean
  onClick: () => void
  disabled: boolean
}) {
  if (disabled) return null

  return (
    <Button
      type="button"
      size="icon"
      variant="secondary"
      className={[
        "absolute top-1/2 right-3 md:right-4 z-40 hidden rounded-full bg-black/40 text-white transition-opacity duration-200 hover:bg-black/50 md:inline-flex cursor-pointer pointer-events-auto",
        getActionVisibleClass(showActions),
      ].join(" ")}
      style={{ transform: "translateY(-50%)" }}
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
    >
      <ChevronRightIcon />
      <span className="sr-only">Next photo</span>
    </Button>
  )
}

// Render Cinematic Mode toggle button.
function CinematicButton({
  showActions,
  isCinematicMode,
  onToggle,
}: {
  showActions: boolean
  isCinematicMode: boolean
  onToggle: () => void
}) {
  const tap = useTapAction(onToggle)

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            size="icon"
            variant="secondary"
            className={[
              "rounded-full text-white transition-opacity duration-200 cursor-pointer pointer-events-auto",
              isCinematicMode ? "bg-black/60 hover:bg-black/70" : "bg-black/40 hover:bg-black/50",
            ].join(" ")}
            aria-label={isCinematicMode ? "Exit cinematic mode" : "Enter cinematic mode"}
            {...tap}
          >
            {isCinematicMode ? <MinimizeIcon /> : <MaximizeIcon />}
            <span className="sr-only">{isCinematicMode ? "Exit cinematic mode" : "Enter cinematic mode"}</span>
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          <p>{isCinematicMode ? "Exit Cinematic Mode (F)" : "Cinematic Mode (F)"}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

// Render photo comments button in toolbar.
function CommentsButton({
  showActions,
  open,
  onToggle,
}: {
  showActions: boolean
  open: boolean
  onToggle: () => void
}) {
  const tap = useTapAction(onToggle)

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            size="icon"
            variant="secondary"
            className={[
              "rounded-full text-white transition-opacity duration-200 cursor-pointer pointer-events-auto",
              open ? "bg-black/70 hover:bg-black/70 border border-white/30 text-emerald-400" : "bg-black/40 hover:bg-black/50",
              getActionVisibleClass(showActions),
            ].join(" ")}
            {...tap}
          >
            <MessageSquare className="size-4" />
            <span className="sr-only">Media comments</span>
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          <p>Comments</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

// Render photo information & comments button, Click to switch the information sidebar on the right.
function InfoButton({
  open,
  onToggle,
}: {
  showActions: boolean
  open: boolean
  onToggle: () => void
}) {
  const tap = useTapAction(onToggle)

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            size="icon"
            variant="secondary"
            className={[
              "relative rounded-full text-white transition-opacity duration-200 cursor-pointer pointer-events-auto",
              open ? "bg-black/70 hover:bg-black/70 border border-white/30" : "bg-black/40 hover:bg-black/50",
            ].join(" ")}
            {...tap}
          >
            <Menu className="md:hidden" />
            {open ? (
              <PanelRightClose className="hidden md:block" />
            ) : (
              <PanelRightOpen className="hidden md:block" />
            )}
            <span className="sr-only">Media information & comments</span>
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          <p>Information & Comments</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

// Render spin button.
function RotateButton({
  showActions,
  onRotate,
}: {
  showActions: boolean
  onRotate: () => void
}) {
  const tap = useTapAction(onRotate)

  return (
    <Button
      type="button"
      size="icon"
      variant="secondary"
      className="rounded-full bg-black/40 text-white transition-opacity duration-200 hover:bg-black/50 cursor-pointer pointer-events-auto"
      {...tap}
    >
      <RotateCcwSquare />
      <span className="sr-only">Rotate photo</span>
    </Button>
  )
}

// Render share button.
function ShareButton({
  showActions,
  slide,
}: {
  showActions: boolean
  slide?: PhotoSlideType | null
}) {
  const t = useTranslations("photos.viewer")
  const { userInfo } = useApp()
  const isAdmin = userInfo?.type === UserTypeEnum.ADMIN

  const handleShare = async () => {
    if (!slide?.photoId || typeof window === "undefined") return

    if (!isAdmin) {
      recordPhotoShare(slide.photoId)
    }
    trackVisitorMedia(slide.photoId, "share")

    const url = new URL(window.location.href)
    url.searchParams.set("photoId", slide.photoId)
    const shareUrl = url.toString()

    const isVideo = Boolean(slide.mediaType?.startsWith("video/"))
    const defaultTitle = isVideo ? "Video" : "Photo"

    if (navigator.share) {
      try {
        await navigator.share({
          title: slide.alt || defaultTitle,
          text: `Check out "${slide.alt || defaultTitle}" on NayPict`,
          url: shareUrl,
        })
        return
      } catch (err: unknown) {
        if (err instanceof Error && err.name === "AbortError") {
          return
        }
      }
    }

    try {
      await navigator.clipboard.writeText(shareUrl)
      toast.success(t("copied"))
    } catch {
      toast.error(t("copyFailed"))
    }
  }

  const tap = useTapAction(handleShare)

  return (
    <Button
      type="button"
      size="icon"
      variant="secondary"
      className="rounded-full bg-black/40 text-white transition-opacity duration-200 hover:bg-black/50 cursor-pointer pointer-events-auto"
      title={t("share")}
      {...tap}
    >
      <Share2Icon className="size-4" />
      <span className="sr-only">{t("share")}</span>
    </Button>
  )
}

// Render Instagram Story Card generator button.
function StoryCardButton({
  showActions,
  onOpenStory,
}: {
  showActions: boolean
  onOpenStory: () => void
}) {
  const t = useTranslations("photos.viewer")
  const tap = useTapAction(onOpenStory)

  return (
    <Button
      type="button"
      size="icon"
      variant="secondary"
      className="rounded-full bg-gradient-to-tr from-pink-600 via-rose-500 to-amber-500 text-white transition-all duration-200 hover:scale-110 hover:opacity-100 shadow-md shadow-pink-500/30 border border-white/20 cursor-pointer pointer-events-auto"
      title={t("createStory")}
      {...tap}
    >
      <InstagramIcon className="size-4" />
      <span className="sr-only">{t("storyCard")}</span>
    </Button>
  )
}

// Render add to album button in toolbar (Admin only).
function AddToAlbumButton({
  showActions,
  onAlbumOpen,
  photoId,
}: {
  showActions: boolean
  onAlbumOpen?: (photoIds: string[]) => void
  photoId?: string
}) {
  function handleAddToAlbum(e: React.MouseEvent) {
    e.stopPropagation()
    e.preventDefault()
    if (!photoId) return
    onAlbumOpen?.([photoId])
  }

  if (!onAlbumOpen) return null

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            size="icon"
            variant="secondary"
            className="rounded-full bg-black/40 text-white transition-opacity duration-200 hover:bg-black/60 cursor-pointer pointer-events-auto"
            onClick={handleAddToAlbum}
          >
            <FolderPlusIcon className="size-4" />
            <span className="sr-only">Add to album</span>
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          <p>Add to Album</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

// Render delete photo button in toolbar (Admin only).
function DeleteButton({
  showActions,
  onDelete,
}: {
  showActions: boolean
  onDelete?: () => void
}) {
  const tap = useTapAction(() => onDelete?.())

  if (!onDelete) return null

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            size="icon"
            variant="secondary"
            className="rounded-full bg-black/40 text-white transition-opacity duration-200 hover:bg-red-600/80 cursor-pointer pointer-events-auto"
            {...tap}
          >
            <Trash2Icon className="size-4" />
            <span className="sr-only">Delete photo</span>
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          <p>Move to Trash</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

// Render bottom-left album badge overlay when previewing photos that belong to one or more albums.
function AlbumOverlayBadge({
  albums,
  isCinematicMode,
}: {
  albums?: { albumId: string; name: string }[]
  isCinematicMode: boolean
}) {
  if (!albums || albums.length === 0 || isCinematicMode) {
    return null
  }

  const albumText = formatAlbumList(albums)

  return (
    <div className="absolute top-14 left-2 md:top-16 md:left-3 z-40 flex items-center gap-1.5 rounded-full bg-black/75 px-3 py-1 text-xs text-white backdrop-blur-md border border-white/15 shadow-lg select-none max-w-[85vw] md:max-w-md truncate">
      <FolderIcon className="size-3.5 text-primary shrink-0" />
      <span className="font-medium text-white/70 shrink-0">In Albums:</span>
      <span className="font-semibold text-white truncate" title={albumText}>
        {albumText}
      </span>
    </div>
  )
}

// Floating Liquid Glass Quick Reaction & Comment Pill (Mobile & Desktop)
function LightboxInteractionBar({
  photoId,
  exif,
  showActions,
  isCinematicMode,
  onOpenComments,
  onOpenInfo,
}: {
  photoId?: string
  exif?: string | null
  showActions: boolean
  isCinematicMode: boolean
  onOpenComments: () => void
  onOpenInfo: () => void
}) {
  if (isCinematicMode) return null

  return (
    <div
      className={[
        "fixed left-3 bottom-14 sm:bottom-16 md:bottom-22 z-40 flex flex-col items-start gap-2 transition-all duration-300 pointer-events-auto select-none max-w-[calc(100vw-1.5rem)]",
        getActionVisibleClass(showActions),
      ].join(" ")}
    >
      {/* 35mm Analog Film Strip HUD Badge (Positioned directly above the Reaction Bar) */}
      {exif && onOpenInfo && (
        <AnalogFilmStripCompact
          exif={exif}
          onClick={onOpenInfo}
        />
      )}

      <div className="flex items-center gap-1.5 p-1 rounded-full bg-neutral-950/85 backdrop-blur-xl border border-white/15 shadow-2xl shadow-black/60 max-w-full overflow-x-auto no-scrollbar">
        {photoId && (
          <div className="flex items-center pl-1">
            <PhotoReactions photoId={photoId} compact />
          </div>
        )}

        <div className="h-4 w-px bg-white/20 my-auto shrink-0" />

        {/* Comment Trigger Button */}
        <button
          type="button"
          onClick={onOpenComments}
          className="group flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold text-white bg-white/10 hover:bg-white/20 active:scale-95 transition-all duration-200 border border-white/10 cursor-pointer shrink-0"
          aria-label="Open Comments"
        >
          <MessageSquare className="size-3.5 text-emerald-400 transition-transform group-hover:scale-110" />
          <span className="tracking-wide text-[11px] sm:text-xs">Comment</span>
        </button>

        {/* Info Trigger Button */}
        <button
          type="button"
          onClick={onOpenInfo}
          className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium text-white/75 hover:text-white hover:bg-white/15 active:scale-95 transition-all duration-200 cursor-pointer shrink-0"
          aria-label="Media Details"
        >
          <CircleAlertIcon className="size-3.5 text-white/80" />
          <span className="text-[10px] sm:text-[11px] font-medium">Info</span>
        </button>
      </div>
    </div>
  )
}

// Render close button.
function CloseButton({
  showActions,
  onClose,
}: {
  showActions: boolean
  onClose: () => void
}) {
  const tap = useTapAction(onClose)

  return (
    <Button
      type="button"
      size="icon"
      variant="secondary"
      className={[
        "absolute top-2 left-2 md:top-3 md:left-3 z-40 rounded-full bg-black/40 text-white transition-opacity duration-200 hover:bg-black/50 cursor-pointer pointer-events-auto",
        getActionVisibleClass(showActions),
      ].join(" ")}
      {...tap}
    >
      <ArrowLeftIcon />
      <span className="sr-only">Back</span>
    </Button>
  )
}

// Render bottom thumbnail filmstrip for quick photo navigation
function PhotoViewerThumbnails({
  photos,
  viewIndex,
  onSelect,
  isSidebarOpen,
  visible,
}: {
  photos: PhotoVo[]
  viewIndex: number
  onSelect: (index: number) => void
  isSidebarOpen: boolean
  visible: boolean
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const activeThumbRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    if (activeThumbRef.current) {
      activeThumbRef.current.scrollIntoView({
        behavior: "smooth",
        inline: "center",
        block: "nearest",
      })
    }
  }, [viewIndex])

  return (
    <div
      className={cn(
        "fixed bottom-0 inset-x-0 z-40 transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] select-none pointer-events-auto",
        isSidebarOpen ? "md:pr-[336px]" : "",
        !visible ? "opacity-0 pointer-events-none translate-y-full" : "opacity-100 translate-y-0"
      )}
    >
      <div className="h-12 md:h-16 flex items-center justify-center bg-black/75 backdrop-blur-xl border-t border-white/10 px-2">
        <div
          ref={containerRef}
          className="flex items-center gap-1.5 h-full overflow-x-auto no-scrollbar py-1.5 max-w-full"
        >
          {photos.map((photo, idx) => {
            const isActive = idx === viewIndex
            const isVideo = Boolean(photo.type?.startsWith("video/"))
            return (
              <button
                key={photo.photoId || idx}
                type="button"
                ref={isActive ? activeThumbRef : undefined}
                onClick={(e) => {
                  e.stopPropagation()
                  onSelect(idx)
                }}
                className={cn(
                  "relative shrink-0 h-full aspect-square rounded-md overflow-hidden transition-all duration-200 cursor-pointer focus:outline-none",
                  isActive
                    ? "ring-2 ring-white scale-105 opacity-100 z-10 shadow-lg shadow-black/50"
                    : "opacity-40 hover:opacity-80 hover:scale-100"
                )}
                aria-label={`View photo ${idx + 1}`}
              >
                {photo.thumbnail || photo.preview ? (
                  <img
                    src={photo.thumbnail || photo.preview}
                    alt=""
                    className="w-full h-full object-cover pointer-events-none select-none"
                    loading="lazy"
                  />
                ) : photo.thumbHash ? (
                  <img
                    src={getThumbHashUrl(photo.thumbHash)}
                    alt=""
                    className="w-full h-full object-cover pointer-events-none"
                  />
                ) : (
                  <div className="w-full h-full bg-neutral-800" />
                )}
                {isVideo && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/40 pointer-events-none">
                    <Play className="size-2 text-white fill-current ml-0.5" />
                  </div>
                )}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// Progressive image slide with zoom, pan, and double-tap gestures
function PhotoSlideImage({
  slide,
  originalPhoto,
  rotate,
  fullscreenOpen,
  isActive = true,
  onSingleTap,
  onDoubleTapHeart,
  onZoomChange,
}: {
  slide: PhotoSlideType
  originalPhoto: OriginalPhoto | null
  rotate: number
  fullscreenOpen: boolean
  isActive?: boolean
  onSingleTap: () => void
  onDoubleTapHeart: (coords: { x: number; y: number }) => void
  onZoomChange: (isZoomed: boolean) => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const initialSrc = originalPhoto?.key === slide.preview || originalPhoto?.key === slide.key
    ? originalPhoto.key
    : slide.src || slide.preview || slide.thumbnail || ""
  const [currentSrc, setCurrentSrc] = useState<string>(initialSrc)
  const isInitiallyLoaded = Boolean(initialSrc && loadedThumbnails.has(initialSrc))
  const [loaded, setLoaded] = useState(isInitiallyLoaded)
  const [showHdBadge, setShowHdBadge] = useState(false)
  const [isOnline, setIsOnline] = useState(() => (typeof navigator !== "undefined" ? navigator.onLine : true))
  const [isSlowLoading, setIsSlowLoading] = useState(false)
  const slowTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Zoom & Pan state
  const [scale, setScale] = useState(1)
  const [position, setPosition] = useState({ x: 0, y: 0 })
  const lastTapTimeRef = useRef<number>(0)
  const singleTapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isDraggingRef = useRef(false)
  const dragStartRef = useRef({ x: 0, y: 0, posX: 0, posY: 0 })
  const pinchStartDistRef = useRef<number | null>(null)
  const pinchStartScaleRef = useRef(1)

  // Reset zoom whenever this slide becomes inactive
  useEffect(() => {
    if (!isActive) {
      setScale(1)
      setPosition({ x: 0, y: 0 })
      onZoomChange(false)
    }
  }, [isActive, onZoomChange])

  useEffect(() => {
    if (typeof window === "undefined") return

    const handleOnline = () => {
      setIsOnline(true)
      if (!loaded && currentSrc) {
        const img = new Image()
        img.crossOrigin = "anonymous"
        img.src = currentSrc
      }
    }

    const handleOffline = () => {
      setIsOnline(false)
    }

    window.addEventListener("online", handleOnline)
    window.addEventListener("offline", handleOffline)

    return () => {
      window.removeEventListener("online", handleOnline)
      window.removeEventListener("offline", handleOffline)
    }
  }, [loaded, currentSrc])

  useEffect(() => {
    if (slowTimerRef.current) {
      clearTimeout(slowTimerRef.current)
      slowTimerRef.current = null
    }

    if (!loaded) {
      slowTimerRef.current = setTimeout(() => {
        setIsSlowLoading(true)
      }, 3500)
    } else {
      setIsSlowLoading(false)
    }

    return () => {
      if (slowTimerRef.current) {
        clearTimeout(slowTimerRef.current)
        slowTimerRef.current = null
      }
    }
  }, [loaded])

  useEffect(() => {
    const targetSrc = originalPhoto?.key === slide.preview || originalPhoto?.key === slide.key
      ? originalPhoto.key
      : slide.src || slide.preview || slide.thumbnail || ""
    setCurrentSrc(targetSrc)
    const isTargetLoaded = Boolean(targetSrc && loadedThumbnails.has(targetSrc))
    setLoaded(isTargetLoaded)
    setShowHdBadge(false)
  }, [slide.src, slide.preview, slide.thumbnail, originalPhoto?.key])

  const handleImageLoaded = () => {
    if (currentSrc) {
      loadedThumbnails.add(currentSrc)
    }
    setLoaded(true)
    setShowHdBadge(true)
    setTimeout(() => {
      setShowHdBadge(false)
    }, 1400)
    if (getIsOffline()) {
      notifyConnectionRestored()
    }
  }

  // Pointer interactions for double tap zoom and pan
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === "mouse" && e.button !== 0) return

    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      posX: position.x,
      posY: position.y,
    }

    if (scale > 1) {
      isDraggingRef.current = true
      ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
    }
  }

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingRef.current || scale <= 1) return

    const dx = e.clientX - dragStartRef.current.x
    const dy = e.clientY - dragStartRef.current.y

    // Allow smooth panning when zoomed
    setPosition({
      x: dragStartRef.current.posX + dx,
      y: dragStartRef.current.posY + dy,
    })
  }

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const wasDragging = isDraggingRef.current
    isDraggingRef.current = false
    try {
      ;(e.target as HTMLElement).releasePointerCapture?.(e.pointerId)
    } catch {}

    const dx = Math.abs(e.clientX - dragStartRef.current.x)
    const dy = Math.abs(e.clientY - dragStartRef.current.y)

    // Tap detected (pointer moved < 8px)
    if (dx < 8 && dy < 8) {
      const now = Date.now()
      const timeSinceLast = now - lastTapTimeRef.current

      if (timeSinceLast < 300) {
        // Double tap!
        if (singleTapTimerRef.current) {
          clearTimeout(singleTapTimerRef.current)
          singleTapTimerRef.current = null
        }
        lastTapTimeRef.current = 0

        if (scale > 1) {
          // Zoom out back to 1x
          setScale(1)
          setPosition({ x: 0, y: 0 })
          onZoomChange(false)
        } else {
          // Zoom in to 2.5x centered on tap point
          onDoubleTapHeart({ x: e.clientX, y: e.clientY })
          setScale(2.5)

          const rect = containerRef.current?.getBoundingClientRect()
          if (rect) {
            const offsetX = (rect.width / 2 - (e.clientX - rect.left)) * 1.5
            const offsetY = (rect.height / 2 - (e.clientY - rect.top)) * 1.5
            setPosition({ x: offsetX, y: offsetY })
          }
          onZoomChange(true)
        }
      } else {
        lastTapTimeRef.current = now
        if (singleTapTimerRef.current) {
          clearTimeout(singleTapTimerRef.current)
        }
        singleTapTimerRef.current = setTimeout(() => {
          if (scale <= 1) {
            onSingleTap()
          }
          singleTapTimerRef.current = null
        }, 280)
      }
    }
  }

  // Multi-touch Pinch to Zoom on mobile
  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length === 2) {
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      )
      pinchStartDistRef.current = dist
      pinchStartScaleRef.current = scale
    }
  }

  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length === 2 && pinchStartDistRef.current) {
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      )
      const ratio = dist / pinchStartDistRef.current
      const nextScale = Math.min(Math.max(pinchStartScaleRef.current * ratio, 1), 4)
      setScale(nextScale)
      onZoomChange(nextScale > 1.05)
    }
  }

  const handleTouchEnd = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length < 2 && pinchStartDistRef.current) {
      pinchStartDistRef.current = null
      if (scale < 1.05) {
        setScale(1)
        setPosition({ x: 0, y: 0 })
        onZoomChange(false)
      }
    }
  }

  const normalizedRotate = rotate % 360
  const sideways = normalizedRotate === 90 || normalizedRotate === 270
  const thumbnailHeight = typeof window !== "undefined" && window.innerWidth < 768 ? 48 : 64
  const rotateWidthOffset = fullscreenOpen ? 0 : thumbnailHeight

  return (
    <div
      ref={containerRef}
      className="relative flex h-full w-full items-center justify-center overflow-hidden select-none touch-none"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      style={{
        contain: "layout paint",
        transform: "translateZ(0)",
      }}
    >
      {/* Top Streaming Indeterminate Progress Line (Active visible slide only) */}
      {!loaded && isActive && (
        <div className="pointer-events-none absolute top-0 left-0 right-0 h-1 z-30 overflow-hidden bg-white/10">
          <div className="h-full w-1/3 bg-gradient-to-r from-emerald-500 via-teal-300 to-emerald-500 rounded-full hd-progress-indeterminate shadow-[0_0_8px_rgba(16,185,129,0.8)]" />
        </div>
      )}

      {/* Floating Glassmorphic Progress Badge (Active while HD streaming on visible slide) */}
      {!loaded && !isOnline && isActive && (
        <div className="pointer-events-none absolute bottom-36 sm:bottom-40 md:bottom-44 z-30 flex items-center gap-2 rounded-2xl bg-rose-950/85 px-4 py-2 text-xs font-medium text-rose-200 shadow-2xl backdrop-blur-xl border border-rose-500/30 animate-in fade-in zoom-in-95 duration-200">
          <WifiOff className="size-4 text-rose-400 shrink-0" />
          <span className="font-semibold text-[11px] sm:text-xs">Connection Lost — Waiting for network...</span>
        </div>
      )}

      {!loaded && isOnline && isSlowLoading && isActive && (
        <div className="pointer-events-none absolute bottom-36 sm:bottom-40 md:bottom-44 z-30 flex items-center gap-2 rounded-2xl bg-amber-950/85 px-4 py-2 text-xs font-medium text-amber-200 shadow-2xl backdrop-blur-xl border border-amber-500/30 animate-in fade-in zoom-in-95 duration-200">
          <Wifi className="size-4 text-amber-400 shrink-0 animate-pulse" />
          <span className="font-semibold text-[11px] sm:text-xs">Slow connection detected — Loading HD photo...</span>
        </div>
      )}

      {!loaded && isOnline && !isSlowLoading && isActive && (
        <div className="pointer-events-none absolute bottom-36 sm:bottom-40 md:bottom-44 z-30 flex flex-col items-center gap-1.5 rounded-2xl bg-black/80 px-4 py-2 text-xs font-medium text-white shadow-2xl backdrop-blur-xl border border-white/20 animate-in fade-in zoom-in-95 duration-200">
          <div className="flex items-center gap-2">
            <LoaderCircleIcon className="size-3.5 animate-spin text-emerald-400 shrink-0" />
            <span className="font-semibold tracking-wide text-[11px] sm:text-xs text-white/90">
              Loading high quality HD...
            </span>
          </div>
          <div className="h-1 w-28 sm:w-36 overflow-hidden rounded-full bg-white/15">
            <div className="h-full w-full bg-gradient-to-r from-emerald-500 via-teal-300 to-emerald-500 hd-progress-shimmer rounded-full" />
          </div>
        </div>
      )}

      {/* Floating HD Ready Success Badge */}
      {loaded && showHdBadge && isActive && (
        <div className="pointer-events-none absolute bottom-36 sm:bottom-40 md:bottom-44 z-30 flex items-center gap-1.5 rounded-full bg-emerald-950/85 px-3.5 py-1 text-xs font-medium text-emerald-300 shadow-xl backdrop-blur-xl border border-emerald-500/30 animate-in fade-in zoom-in-95 duration-200">
          <Sparkles className="size-3 text-emerald-400 shrink-0" />
          <span className="font-semibold text-[11px] sm:text-xs">HD Quality Ready</span>
        </div>
      )}

      {/* Instant crisp thumbnail backdrop while full-resolution HD streams in */}
      {slide.thumbnail && !loaded && (
        <img
          src={slide.thumbnail}
          alt=""
          aria-hidden
          crossOrigin="anonymous"
          decoding="async"
          className="absolute select-none max-w-none object-contain pointer-events-none transition-opacity duration-300"
          style={{
            width: sideways ? `calc(100cqh - ${rotateWidthOffset}px)` : "100%",
            height: sideways ? "100vw" : "100%",
            transform: `translate3d(${position.x}px, ${position.y}px, 0) scale(${scale}) rotate(${rotate}deg)`,
            backfaceVisibility: "hidden",
          }}
        />
      )}

      {/* Fallback instant ThumbHash blur if no thumbnail exists */}
      {!slide.thumbnail && slide.thumbHashUrl && !loaded && (
        <img
          src={slide.thumbHashUrl}
          alt=""
          aria-hidden
          decoding="async"
          className="absolute select-none max-w-none object-contain pointer-events-none transition-opacity duration-300"
          style={{
            width: sideways ? `calc(100cqh - ${rotateWidthOffset}px)` : "100%",
            height: sideways ? "100vw" : "100%",
            transform: `translate3d(${position.x}px, ${position.y}px, 0) scale(${scale}) rotate(${rotate}deg)`,
            backfaceVisibility: "hidden",
          }}
        />
      )}

      <img
        src={currentSrc}
        alt={slide.alt}
        draggable={false}
        crossOrigin="anonymous"
        fetchPriority={isActive ? "high" : "low"}
        decoding="async"
        onContextMenu={(e) => e.preventDefault()}
        className="select-none max-w-none object-contain transition-opacity duration-200"
        onLoad={handleImageLoaded}
        ref={(el) => {
          if (el && el.complete && el.naturalWidth > 0 && !loaded) {
            handleImageLoaded()
          }
        }}
        onError={() => {
          if (currentSrc && !currentSrc.startsWith("/media/")) {
            setCurrentSrc(toProxyMediaUrl(currentSrc))
          } else if (slide.thumbnail && currentSrc !== slide.thumbnail) {
            setCurrentSrc(slide.thumbnail)
          }
        }}
        style={{
          width: sideways ? `calc(100cqh - ${rotateWidthOffset}px)` : "100%",
          height: sideways ? "100vw" : "100%",
          transform: `translate3d(${position.x}px, ${position.y}px, 0) scale(${scale}) rotate(${rotate}deg)`,
          transformStyle: "preserve-3d",
          backfaceVisibility: "hidden",
          imageRendering: "-webkit-optimize-contrast",
          willChange: scale > 1 ? "transform" : "auto",
          opacity: loaded ? 1 : 0,
          cursor: scale > 1 ? "grab" : "default",
        }}
      />
    </div>
  )
}

// Render photo detail viewer with high-performance Embla Carousel engine
export function PhotoViewer({
  open,
  index,
  photos,
  onBack,
  onBrowserBack,
  onPhotoDelete,
  onPhotoUpdate,
  onAlbumOpen,
}: PhotoViewerProps) {
  const { userInfo } = useApp()
  const isAdmin = userInfo?.type === UserTypeEnum.ADMIN
  const [viewIndex, setViewIndex] = useState(index)

  // Sidebar state
  const infoOpen = usePhotoStore((state) => state.infoOpen)
  const setInfoOpen = usePhotoStore((state) => state.setInfoOpen)
  const [infoTab, setInfoTab] = useState<"info" | "comments">("info")

  // Loaded original & progress states
  const [originalPhoto, setOriginalPhoto] = useState<OriginalPhoto | null>(null)
  const [originalProgress, setOriginalProgress] = useState<OriginalProgress | null>(null)
  const [showOriginalProgress, setShowOriginalProgress] = useState(false)
  const [originalError, setOriginalError] = useState(false)

  // UI visibility & presentation mode
  const [showActions, setShowActions] = useState(true)
  const [zoomLevel, setZoomLevel] = useState(1)
  const [fullscreenOpen, setFullscreenOpen] = useState(false)
  const [isCinematicMode, setIsCinematicMode] = useState(false)
  const [showViewerHeartBurst, setShowViewerHeartBurst] = useState(false)
  const [viewerBurstCoords, setViewerBurstCoords] = useState<{ x: number; y: number } | null>(null)
  const [isVideoScrubbing, setIsVideoScrubbing] = useState(false)
  const [isVideoFullscreen, setIsVideoFullscreen] = useState(false)

  // Carousel boundary flags
  const [canScrollPrev, setCanScrollPrev] = useState(false)
  const [canScrollNext, setCanScrollNext] = useState(false)

  // Vertical pull-to-dismiss gesture state
  const [pullY, setPullY] = useState(0)
  const [isPulling, setIsPulling] = useState(false)
  const pullStartRef = useRef<{ x: number; y: number } | null>(null)

  // Idle controls hiding in cinematic mode
  const [isIdleHidden, setIsIdleHidden] = useState(false)
  const controlsVisible = !isCinematicMode || !isIdleHidden
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Rotations map per photo
  const [photoRotates, setPhotoRotates] = useState<Record<string, number>>({})

  // Global cache
  const getPhotoCache = usePhotoStore((state) => state.getPhotoCache)
  const setPhotoCache = usePhotoStore((state) => state.setPhotoCache)

  const abortOriginalRef = useRef<(() => void) | null>(null)
  const previewRequestsRef = useRef<PreviewRequestMap>(new Map())
  const currentPhotoIdRef = useRef<string | null>(photos[index]?.photoId ?? null)
  const openScrollYRef = useRef(typeof window === "undefined" ? 0 : window.scrollY)
  const historyPushedRef = useRef(false)
  const onBrowserBackRef = useRef(onBrowserBack)
  const originalProgressHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastViewedMapRef = useRef<Map<string, number>>(new Map())

  // Sub-dialog states
  const [insightsDialogOpen, setInsightsDialogOpen] = useState(false)
  const [insightsPhotoId, setInsightsPhotoId] = useState<string | null>(null)
  const [storyDialogOpen, setStoryDialogOpen] = useState(false)
  const [batchEditDialogOpen, setBatchEditDialogOpen] = useState(false)

  // Media privacy shield: Blackout viewer when browser tab or space is hidden/switched
  const [isViewerObscured, setIsViewerObscured] = useState(false)

  useEffect(() => {
    if (!open || isAdmin || typeof window === "undefined") {
      setIsViewerObscured(false)
      return
    }

    const handleVisibility = () => {
      setIsViewerObscured(document.hidden)
    }

    document.addEventListener("visibilitychange", handleVisibility)
    return () => {
      document.removeEventListener("visibilitychange", handleVisibility)
    }
  }, [open, isAdmin])

  const isAnySubModalOpen = storyDialogOpen || insightsDialogOpen || batchEditDialogOpen

  const storyDialogOpenRef = useRef(storyDialogOpen)
  storyDialogOpenRef.current = storyDialogOpen
  const insightsDialogOpenRef = useRef(insightsDialogOpen)
  insightsDialogOpenRef.current = insightsDialogOpen
  const batchEditDialogOpenRef = useRef(batchEditDialogOpen)
  batchEditDialogOpenRef.current = batchEditDialogOpen
  const infoOpenRef = useRef(infoOpen)
  infoOpenRef.current = infoOpen
  const isCinematicModeRef = useRef(isCinematicMode)
  isCinematicModeRef.current = isCinematicMode
  const isZoomedRef = useRef(false)
  const isVideoScrubbingRef = useRef(false)
  const isVideoFullscreenRef = useRef(false)

  // Hook mobile back gesture for photo info sidebar / comments drawer on mobile (<768px)
  useModalBackHandler(open && infoOpen && typeof window !== "undefined" && window.innerWidth < 768, (val) => setInfoOpen(val))

  // Gesture hint
  const [showGestureHint, setShowGestureHint] = useState(false)
  const [hintFading, setHintFading] = useState(false)

  // Format slides
  const slides = useMemo<PhotoSlideType[]>(() => (
    photos.map((photo) => {
      const isVideo = Boolean(photo.type?.startsWith("video/"))
      const isDummyThumbHash = !photo.thumbHash || photo.thumbHash.startsWith("00080204") || photo.thumbHash.startsWith("00080205")
      return {
        photoId: photo.photoId,
        key: photo.key,
        originalSize: photo.size,
        preview: photo.preview || photo.thumbnail || "",
        src: isVideo
          ? toProxyMediaUrl(photo.key || photo.preview || "")
          : (photo.preview || photo.key || photo.thumbnail || ""),
        thumbnail: photo.thumbnail || photo.preview || "",
        thumbHashUrl: isDummyThumbHash ? undefined : getThumbHashUrl(photo.thumbHash),
        albums: photo.albums,
        width: photo.width ?? undefined,
        height: photo.height ?? undefined,
        alt: photo.name,
        mediaType: photo.type,
        exif: photo.exif,
      }
    })
  ), [photos])

  const isCurrentVideo = Boolean(photos[viewIndex]?.type?.startsWith("video/"))
  const actionsVisible = showActions && zoomLevel <= 1 && controlsVisible

  // Initialize Embla Carousel with momentum physics and protected interactive drags
  const [emblaRef, emblaApi] = useEmblaCarousel({
    startIndex: index,
    loop: false,
    duration: 25,
    skipSnaps: false,
    watchDrag: (_api, event) => {
      if (isZoomedRef.current || isVideoScrubbingRef.current || isVideoFullscreenRef.current) {
        return false
      }
      const target = event.target as HTMLElement | null
      if (
        target?.closest(
          "button, a, input, textarea, [role='slider'], .no-drag, [data-prevent-swipe], .group\\/scrubber"
        )
      ) {
        return false
      }
      return true
    },
  })

  // Sync refs to prevent video scrubbing or zooming conflicts with Embla
  useEffect(() => {
    isZoomedRef.current = zoomLevel > 1
  }, [zoomLevel])

  useEffect(() => {
    isVideoScrubbingRef.current = isVideoScrubbing
  }, [isVideoScrubbing])

  useEffect(() => {
    isVideoFullscreenRef.current = isVideoFullscreen
  }, [isVideoFullscreen])

  // Sync carousel slide selection with viewer state
  const handleSelectSlide = useCallback(() => {
    if (!emblaApi) return
    const selected = emblaApi.selectedScrollSnap()
    setViewIndex(selected)
    setCanScrollPrev(emblaApi.canScrollPrev())
    setCanScrollNext(emblaApi.canScrollNext())
    handleView(selected)
  }, [emblaApi])

  useEffect(() => {
    if (!emblaApi) return
    handleSelectSlide()
    emblaApi.on("select", handleSelectSlide)
    emblaApi.on("reInit", handleSelectSlide)
    return () => {
      emblaApi.off("select", handleSelectSlide)
      emblaApi.off("reInit", handleSelectSlide)
    }
  }, [emblaApi, handleSelectSlide])

  // Sync when viewer is opened with a new index
  useEffect(() => {
    if (!emblaApi || !open) return
    if (emblaApi.selectedScrollSnap() !== index) {
      emblaApi.scrollTo(index, true)
    }
  }, [emblaApi, open, index])

  // Responsive desktop sidebar layout: keep Lightbox full-screen so backdrop never exposes underlying page
  const isSidebarOpen = infoOpen && !fullscreenOpen && !isCinematicMode

  // Re-init Embla when desktop sidebar toggles
  useEffect(() => {
    if (!emblaApi) return
    const timer = setTimeout(() => {
      emblaApi.reInit()
    }, 320)
    return () => clearTimeout(timer)
  }, [isSidebarOpen, emblaApi])

  // Reset video flags on slide transition or viewer close
  useEffect(() => {
    setIsVideoFullscreen(false)
    setIsVideoScrubbing(false)
  }, [viewIndex, open])

  // Stable callbacks for video player interaction bar buttons
  const handleOpenComments = useCallback(() => {
    setInfoTab("comments")
    setInfoOpen(true)
  }, [setInfoOpen])

  const handleOpenInfo = useCallback(() => {
    setInfoTab("info")
    setInfoOpen(true)
  }, [setInfoOpen])

  // Speculative prefetcher
  useEffect(() => {
    if (!open || typeof window === "undefined") return

    const prefetchAdjacent = () => {
      const candidates = [
        photos[viewIndex + 1],
        photos[viewIndex - 1],
        photos[viewIndex + 2],
        photos[viewIndex - 2],
        photos[viewIndex + 3],
        photos[viewIndex - 3],
      ]

      for (const p of candidates) {
        if (!p) continue
        const isVid = Boolean(p.type?.startsWith("video/"))
        if (isVid) {
          const videoUrl = p.key || p.preview
          if (videoUrl) {
            prebufferVideo(videoUrl)
          }
        } else {
          const url = p.preview || p.thumbnail
          if (url && !loadedThumbnails.has(url)) {
            const img = new Image()
            img.crossOrigin = "anonymous"
            img.decoding = "async"
            if ("fetchPriority" in img) {
              ;(img as any).fetchPriority = "high"
            }
            img.onload = () => {
              loadedThumbnails.add(url)
            }
            img.src = url
          }
        }
      }
    }

    if ("requestIdleCallback" in window) {
      const handle = window.requestIdleCallback(prefetchAdjacent, { timeout: 150 })
      return () => window.cancelIdleCallback(handle)
    } else {
      const timer = setTimeout(prefetchAdjacent, 50)
      return () => clearTimeout(timer)
    }
  }, [open, viewIndex, photos])

  // Shows mobile gesture hint
  useEffect(() => {
    if (!open || typeof window === "undefined" || window.innerWidth >= 768) {
      setShowGestureHint(false)
      setHintFading(false)
      return
    }

    const STORAGE_KEY = "naypict_gesture_hint_count"
    try {
      const shownCount = parseInt(localStorage.getItem(STORAGE_KEY) || "0", 10)
      if (shownCount >= 3) return

      localStorage.setItem(STORAGE_KEY, String(shownCount + 1))
      setShowGestureHint(true)
      setHintFading(false)

      const fadeTimer = setTimeout(() => {
        setHintFading(true)
      }, 1800)

      const hideTimer = setTimeout(() => {
        setShowGestureHint(false)
      }, 2300)

      return () => {
        clearTimeout(fadeTimer)
        clearTimeout(hideTimer)
      }
    } catch {}
  }, [open])

  // Cinematic mode toggle
  const toggleCinematicMode = useCallback(() => {
    setIsCinematicMode((prev) => {
      const next = !prev
      if (next) {
        try {
          if (typeof document !== "undefined" && document.fullscreenEnabled && document.documentElement.requestFullscreen) {
            document.documentElement.requestFullscreen().catch(() => {})
          }
        } catch {}
      } else {
        try {
          if (typeof document !== "undefined" && document.fullscreenElement && document.exitFullscreen) {
            document.exitFullscreen().catch(() => {})
          }
        } catch {}
      }
      return next
    })
  }, [])

  useEffect(() => {
    if (typeof document === "undefined") return

    function handleFullscreenChange() {
      if (!document.fullscreenElement) {
        setIsCinematicMode(false)
      }
    }

    document.addEventListener("fullscreenchange", handleFullscreenChange)
    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange)
    }
  }, [])

  // Keyboard navigation & shortcuts
  useEffect(() => {
    if (!open || isAnySubModalOpen) return

    function handleKeyDown(event: KeyboardEvent) {
      if (isAnySubModalOpen) return

      const target = event.target as HTMLElement | null
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return
      }

      if (event.key === "ArrowLeft") {
        event.preventDefault()
        emblaApi?.scrollPrev()
      } else if (event.key === "ArrowRight") {
        event.preventDefault()
        emblaApi?.scrollNext()
      } else if (event.key === "f" || event.key === "F") {
        event.preventDefault()
        toggleCinematicMode()
      } else if (event.key === "Escape") {
        if (infoOpen) {
          event.preventDefault()
          event.stopPropagation()
          setInfoOpen(false)
          return
        }
        if (isCinematicMode) {
          event.preventDefault()
          event.stopPropagation()
          toggleCinematicMode()
          return
        }
        closeViewer()
      }
    }

    window.addEventListener("keydown", handleKeyDown, true)
    return () => {
      window.removeEventListener("keydown", handleKeyDown, true)
    }
  }, [open, isAnySubModalOpen, emblaApi, infoOpen, isCinematicMode, toggleCinematicMode, setInfoOpen])

  // Auto-hide UI controls after 2.5s idle when in Cinematic Mode
  useEffect(() => {
    if (!open || !isCinematicMode) {
      if (idleTimerRef.current) {
        clearTimeout(idleTimerRef.current)
        idleTimerRef.current = null
      }
      return
    }

    function resetIdleTimer() {
      setIsIdleHidden(false)
      if (idleTimerRef.current) {
        clearTimeout(idleTimerRef.current)
      }
      idleTimerRef.current = setTimeout(() => {
        setIsIdleHidden(true)
      }, 2500)
    }

    resetIdleTimer()

    window.addEventListener("pointermove", resetIdleTimer)
    window.addEventListener("touchstart", resetIdleTimer)
    window.addEventListener("keydown", resetIdleTimer)

    return () => {
      if (idleTimerRef.current) {
        clearTimeout(idleTimerRef.current)
        idleTimerRef.current = null
      }
      window.removeEventListener("pointermove", resetIdleTimer)
      window.removeEventListener("touchstart", resetIdleTimer)
      window.removeEventListener("keydown", resetIdleTimer)
    }
  }, [open, isCinematicMode])

  const onBackRef = useRef(onBack)
  onBackRef.current = onBack

  useEffect(() => {
    onBrowserBackRef.current = onBrowserBack
  }, [onBrowserBack])

  const photosRef = useRef(photos)
  photosRef.current = photos
  const indexRef = useRef(index)
  indexRef.current = index

  useLayoutEffect(() => {
    if (!open) {
      removePhotoIdFromUrl()
      return
    }

    openScrollYRef.current = window.scrollY

    function handlePopState(event?: PopStateEvent) {
      if (
        event?.state?.photoViewerOpen ||
        (typeof window !== "undefined" && window.history.state?.photoViewerOpen)
      ) {
        return
      }

      if (
        storyDialogOpenRef.current ||
        insightsDialogOpenRef.current ||
        batchEditDialogOpenRef.current ||
        (infoOpenRef.current && typeof window !== "undefined" && window.innerWidth < 768) ||
        isCinematicModeRef.current
      ) {
        return
      }

      if (typeof window !== "undefined") {
        (window as unknown as { __last_subview_dismiss_time?: number }).__last_subview_dismiss_time = Date.now()
      }
      historyPushedRef.current = false
      removePhotoIdFromUrl()
      const callback = onBrowserBackRef.current ?? onBackRef.current
      callback?.()
    }

    const initialPhoto = photosRef.current[indexRef.current]
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href)
      if (initialPhoto?.photoId) {
        url.searchParams.set("photoId", initialPhoto.photoId)
      }

      window.history.pushState(
        {
          ...window.history.state,
          photoViewerOpen: true,
          photoId: initialPhoto?.photoId,
        },
        "",
        url.toString(),
      )
      historyPushedRef.current = true
    }
    window.addEventListener("popstate", handlePopState)

    return () => {
      window.removeEventListener("popstate", handlePopState)
      removePhotoIdFromUrl()
    }
  }, [open])

  useEffect(() => {
    if (!open) return

    return () => {
      if (originalProgressHideTimerRef.current) {
        clearTimeout(originalProgressHideTimerRef.current)
      }
      abortOriginalRef.current?.()
      closePreviewRequests(previewRequestsRef.current)
      requestAnimationFrame(restoreListScroll)
    }
  }, [open])

  // View handler
  function handleView(nextIndex: number) {
    setIsVideoScrubbing(false)
    setViewIndex(nextIndex)
    setShowActions(true)

    const photo = photos[nextIndex]
    if (!photo) return
    const preview = photo.preview
    currentPhotoIdRef.current = photo.photoId

    setPhotoIdInUrl(photo.photoId)

    const now = Date.now()
    const lastViewedAt = lastViewedMapRef.current.get(photo.photoId) || 0
    if (now - lastViewedAt > 30_000) {
      lastViewedMapRef.current.set(photo.photoId, now)
      if (!isAdmin) {
        recordPhotoView(photo.photoId)
      }
      trackVisitorMedia(photo.photoId, "view")
    }

    if (originalProgressHideTimerRef.current) {
      clearTimeout(originalProgressHideTimerRef.current)
      originalProgressHideTimerRef.current = null
    }
    abortOriginalRef.current?.()
    closePreviewRequests(previewRequestsRef.current)
    setOriginalProgress(null)
    setOriginalError(false)
    setShowOriginalProgress(false)

    if (!preview) return

    loadPreviewImage(preview, photo.photoId, currentPhotoIdRef, setOriginalPhoto, previewRequestsRef, getPhotoCache, setPhotoCache)
  }

  function rotatePhoto(photoId: string) {
    setPhotoRotates((prev) => ({
      ...prev,
      [photoId]: (prev[photoId] ?? 0) + 90,
    }))
  }

  function restoreListScroll() {
    window.scrollTo(0, openScrollYRef.current)
  }

  function closeViewer() {
    if (typeof window !== "undefined") {
      (window as unknown as { __last_subview_dismiss_time?: number }).__last_subview_dismiss_time = Date.now()
    }
    if (historyPushedRef.current) {
      historyPushedRef.current = false
      try {
        window.history.back()
      } catch {}
    }

    removePhotoIdFromUrl()
    onBackRef.current?.()
  }

  // Pull-to-dismiss touch handlers
  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (zoomLevel > 1 || isVideoScrubbing || isVideoFullscreen || infoOpen) return
    if (e.touches.length === 1) {
      pullStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
    }
  }

  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (!pullStartRef.current || zoomLevel > 1 || isVideoScrubbing || isVideoFullscreen || infoOpen) return
    if (e.touches.length !== 1) return

    const dy = e.touches[0].clientY - pullStartRef.current.y
    const dx = e.touches[0].clientX - pullStartRef.current.x

    if (!isPulling) {
      if (Math.abs(dy) > Math.abs(dx) * 1.5 && Math.abs(dy) > 12) {
        setIsPulling(true)
      } else if (Math.abs(dx) > 10) {
        pullStartRef.current = null
        return
      }
    }

    if (isPulling) {
      setPullY(dy * 0.75)
    }
  }

  const handleTouchEnd = () => {
    if (isPulling) {
      if (Math.abs(pullY) > 90) {
        closeViewer()
      } else {
        setPullY(0)
      }
      setIsPulling(false)
    }
    pullStartRef.current = null
  }

  if (!open) {
    return null
  }

  const backdropOpacity = pullY !== 0 ? Math.max(0.15, 1 - Math.abs(pullY) / 320) : 1

  return (
    <div
      className={cn(
        "fixed inset-0 z-[1000] bg-black select-none overflow-hidden touch-none photo-viewer",
        isAnySubModalOpen && "pointer-events-none select-none touch-none"
      )}
      style={{
        backgroundColor: `rgba(0, 0, 0, ${backdropOpacity})`,
      }}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Dynamic Cinema Ambient Glow */}
      <PhotoViewerAmbientGlow
        thumbHash={photos[viewIndex]?.thumbHash}
        visible={!fullscreenOpen}
      />

      {/* Mobile Instagram-Style Double-Tap Heart Burst Overlay */}
      <PhotoHeartBurst
        show={showViewerHeartBurst}
        coords={viewerBurstCoords}
        size={96}
        onComplete={() => setShowViewerHeartBurst(false)}
      />

      {/* Main interactive carousel viewport */}
      <div
        className={cn(
          "w-full h-full transition-[padding] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]",
          isSidebarOpen ? "md:pr-[336px]" : "md:pr-0"
        )}
        style={{
          transform: pullY !== 0 ? `translate3d(0, ${pullY}px, 0)` : undefined,
          transition: isPulling ? "none" : "transform 0.25s cubic-bezier(0.16, 1, 0.3, 1)",
        }}
      >
        <div className="overflow-hidden w-full h-full" ref={emblaRef}>
          <div className="flex h-full will-change-transform">
            {slides.map((slide, idx) => {
              const isCurrentSlide = idx === viewIndex
              const isNearSlide = Math.abs(idx - viewIndex) <= 2
              const isVideo = Boolean(slide.mediaType?.startsWith("video/"))

              if (!isNearSlide) {
                return (
                  <div
                    key={slide.photoId || idx}
                    className="flex-[0_0_100%] min-w-0 h-full relative"
                  />
                )
              }

              return (
                <div
                  key={slide.photoId || idx}
                  className="flex-[0_0_100%] min-w-0 h-full relative flex items-center justify-center"
                >
                  {isViewerObscured && (
                    <div
                      className="absolute inset-0 z-30 bg-black flex items-center justify-center pointer-events-none select-none transition-opacity duration-150"
                      aria-hidden="true"
                    >
                      <span className="text-xs text-neutral-500 font-medium tracking-widest uppercase">
                        NayPict Protected Preview
                      </span>
                    </div>
                  )}
                  {isVideo ? (
                    <div className="relative flex h-full w-full items-center justify-center overflow-hidden p-0 select-none">
                      <VideoPlayer
                        src={slide.src || toProxyMediaUrl(slide.key)}
                        poster={slide.preview || slide.thumbnail}
                        alt={slide.alt || "Video"}
                        isActive={isCurrentSlide}
                        autoPlay={isCurrentSlide}
                        photoId={slide.photoId}
                        exif={slide.exif}
                        isCinematicMode={isCinematicMode}
                        controlsVisible={isCurrentSlide ? actionsVisible : false}
                        onControlsVisibleChange={isCurrentSlide ? setShowActions : undefined}
                        onScrubbingChange={(isScrubbing) => {
                          isVideoScrubbingRef.current = isScrubbing
                          setIsVideoScrubbing(isScrubbing)
                        }}
                        onFullscreenChange={(isFullscreen) => {
                          isVideoFullscreenRef.current = isFullscreen
                          setIsVideoFullscreen(isFullscreen)
                        }}
                        onOpenComments={handleOpenComments}
                        onOpenInfo={handleOpenInfo}
                        className="w-full h-full"
                        hasThumbnails={actionsVisible && !isCinematicMode && !isVideoFullscreen}
                      />
                    </div>
                  ) : (
                    <div
                      className={cn(
                        "relative flex h-full w-full items-center justify-center overflow-hidden p-2 md:p-4 select-none",
                        actionsVisible && !isCinematicMode && !isVideoFullscreen ? "pb-14 md:pb-20" : ""
                      )}
                    >
                      <PhotoSlideImage
                        slide={slide}
                        originalPhoto={originalPhoto}
                        rotate={photoRotates[slide.photoId] ?? 0}
                        fullscreenOpen={fullscreenOpen || isCinematicMode}
                        isActive={isCurrentSlide}
                        onSingleTap={() => {
                          if (zoomLevel <= 1) {
                            setShowActions((prev) => !prev)
                          }
                        }}
                        onDoubleTapHeart={(coords) => {
                          setViewerBurstCoords(coords)
                          setShowViewerHeartBurst(true)
                          try {
                            if (typeof navigator !== "undefined" && navigator.vibrate) {
                              navigator.vibrate([15, 35, 15])
                            }
                          } catch {}

                          if (slide.photoId) {
                            const cached = reactionSync.getCached(slide.photoId)
                            if (!cached?.userReactions?.love && !isAdmin) {
                              reactionSync.toggleReaction(slide.photoId, "love")
                            }
                            trackVisitorMedia(slide.photoId, "reaction")
                          }
                        }}
                        onZoomChange={(isZoomed) => {
                          setZoomLevel(isZoomed ? 2.5 : 1)
                        }}
                      />
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Desktop Prev / Next Navigation chevrons */}
      <PrevButton
        showActions={actionsVisible}
        onClick={() => emblaApi?.scrollPrev()}
        disabled={!canScrollPrev}
      />
      <NextButton
        showActions={actionsVisible}
        onClick={() => emblaApi?.scrollNext()}
        disabled={!canScrollNext}
      />

      {/* Top Left Close Back Button */}
      <CloseButton showActions={actionsVisible} onClose={closeViewer} />

      {/* Top Right Actions Toolbar */}
      <div
        className={cn(
          "absolute top-2 md:top-3 z-40 flex items-center gap-1.5 max-w-[calc(100vw-3.75rem)] overflow-x-auto no-scrollbar transition-[right] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]",
          isSidebarOpen ? "right-2 md:right-[352px]" : "right-2 md:right-4",
          getActionVisibleClass(actionsVisible)
        )}
      >
        {!isCinematicMode && (
          <>
            {isAdmin && onPhotoDelete && (
              <DeleteButton
                showActions={actionsVisible}
                onDelete={() => {
                  const curr = photos[viewIndex]
                  if (curr) {
                    onPhotoDelete(curr.photoId)
                    closeViewer()
                  }
                }}
              />
            )}
            {isAdmin && onAlbumOpen && (
              <AddToAlbumButton
                showActions={actionsVisible}
                onAlbumOpen={onAlbumOpen}
                photoId={photos[viewIndex]?.photoId}
              />
            )}
            {!isCurrentVideo && (
              <>
                <RotateButton
                  showActions={actionsVisible}
                  onRotate={() => {
                    const curr = photos[viewIndex]
                    if (curr) rotatePhoto(curr.photoId)
                  }}
                />
                <StoryCardButton
                  showActions={actionsVisible}
                  onOpenStory={() => setStoryDialogOpen(true)}
                />
              </>
            )}
            <ShareButton
              showActions={actionsVisible}
              slide={slides[viewIndex]}
            />
            <InfoButton
              showActions={actionsVisible}
              open={infoOpen && infoTab === "info"}
              onToggle={() => {
                if (infoOpen && infoTab === "info") {
                  setInfoOpen(false)
                } else {
                  setInfoTab("info")
                  setInfoOpen(true)
                }
              }}
            />
          </>
        )}
        <CinematicButton
          showActions={actionsVisible}
          isCinematicMode={isCinematicMode}
          onToggle={toggleCinematicMode}
        />
      </div>

      {showOriginalProgress && !isCinematicMode && (
        <OriginalProgressButton progress={originalProgress} error={originalError} />
      )}

      <AlbumOverlayBadge
        albums={photos[viewIndex]?.albums}
        isCinematicMode={isCinematicMode}
      />

      {/* Floating Reaction & Comment Bar for Photos (Lowered position) */}
      {!isCurrentVideo && !infoOpen && (
        <LightboxInteractionBar
          photoId={photos[viewIndex]?.photoId}
          exif={photos[viewIndex]?.exif}
          showActions={actionsVisible}
          isCinematicMode={isCinematicMode}
          onOpenComments={() => {
            setInfoTab("comments")
            setInfoOpen(true)
          }}
          onOpenInfo={() => {
            setInfoTab("info")
            setInfoOpen(true)
          }}
        />
      )}

      {/* Bottom Thumbnail Strip */}
      <PhotoViewerThumbnails
        photos={photos}
        viewIndex={viewIndex}
        onSelect={(idx) => emblaApi?.scrollTo(idx)}
        isSidebarOpen={isSidebarOpen}
        visible={actionsVisible && !isCinematicMode && !isVideoFullscreen}
      />

      {/* Mobile Gesture Hint Floating Badge (Auto-dismisses in ~2s) */}
      {showGestureHint && !infoOpen && !isCinematicMode && (
        <div
          className={cn(
            "fixed bottom-36 sm:bottom-40 inset-x-0 z-50 flex justify-center px-4 pointer-events-none select-none md:hidden transition-all duration-500 ease-out",
            hintFading
              ? "opacity-0 translate-y-2 scale-95"
              : "opacity-100 translate-y-0 scale-100 animate-in fade-in zoom-in-95 duration-300"
          )}
        >
          <div className="flex items-center gap-2.5 px-3.5 py-1.5 rounded-full bg-black/80 dark:bg-neutral-900/85 backdrop-blur-xl border border-white/20 text-white shadow-2xl ring-1 ring-black/40">
            <div className="flex items-center text-emerald-400">
              <ChevronsUpDownIcon className="size-3.5 animate-pulse" />
            </div>
            <span className="text-[11px] sm:text-xs font-medium tracking-wide">
              Swipe ↑↓ to dismiss
            </span>
            <span className="text-white/30 text-[10px]">•</span>
            <span className="text-[11px] sm:text-xs text-white/80 font-medium tracking-wide">
              Swipe ‹ › to browse
            </span>
          </div>
        </div>
      )}

      {/* Right Sidebar and Blurred Backdrop */}
      <AnimatePresence>
        {infoOpen && !fullscreenOpen && !isCinematicMode && (
          <PhotoViewerBlurBackground
            key="viewer-blur-backdrop"
            thumbHash={photos[viewIndex]?.thumbHash}
          />
        )}
        {infoOpen && !fullscreenOpen && !isCinematicMode && (
          <PhotoInfoSidebar
            key="photo-info-sidebar"
            photo={photos[viewIndex] ?? null}
            activeTab={infoTab}
            onTabChange={setInfoTab}
            onClose={() => setInfoOpen(false)}
            onPhotoUpdate={onPhotoUpdate}
            onAlbumOpen={onAlbumOpen ? (photoId) => onAlbumOpen([photoId]) : undefined}
            onStoryOpen={() => setStoryDialogOpen(true)}
            onBatchEditOpen={isAdmin ? () => setBatchEditDialogOpen(true) : undefined}
            onInsightsOpen={isAdmin ? (photoId) => {
              setInsightsPhotoId(photoId)
              setInsightsDialogOpen(true)
            } : undefined}
          />
        )}
      </AnimatePresence>

      {/* Sub-modals */}
      {isAdmin && (
        <PhotoInsightsDialog
          open={insightsDialogOpen}
          onOpenChange={setInsightsDialogOpen}
          photoId={insightsPhotoId}
        />
      )}
      <PhotoStoryDialog
        open={storyDialogOpen}
        onOpenChange={setStoryDialogOpen}
        photo={photos[viewIndex] ?? null}
      />
      {isAdmin && (
        <PhotoBatchEditDialog
          open={batchEditDialogOpen}
          onOpenChange={setBatchEditDialogOpen}
          photoIds={photos[viewIndex] ? [photos[viewIndex].photoId] : []}
          initialName={photos[viewIndex]?.name}
          initialTakenTime={photos[viewIndex]?.takenTime}
          initialLatitude={photos[viewIndex]?.latitude != null ? Number(photos[viewIndex].latitude) : null}
          initialLongitude={photos[viewIndex]?.longitude != null ? Number(photos[viewIndex].longitude) : null}
          onSuccess={(_ids, changes) => {
            if (photos[viewIndex]) {
              onPhotoUpdate?.({
                ...photos[viewIndex],
                ...changes,
              })
            }
          }}
        />
      )}
    </div>
  )
}
