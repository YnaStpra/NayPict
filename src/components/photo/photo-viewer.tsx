"use client"

import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { AnimatePresence } from "framer-motion"
import PhotoSwipe from "photoswipe"
import {
  ArrowLeftIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronsUpDownIcon,
  CircleAlertIcon,
  FolderIcon,
  FolderPlusIcon,
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
  Trash2Icon,
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

// Dynamic code-splitting: Lazy-load heavy dialog bundles on demand
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

interface PhotoViewerProps {
  open: boolean
  index: number
  photos: PhotoVo[]
  onBack?: () => void
  onBrowserBack?: () => void
  onPhotoDelete?: (photoId: string) => void
  onPhotoUpdate?: (photo: PhotoVo) => void
  onAlbumOpen?: (photoIds: string[]) => void
}

type PhotoSlide = {
  photoId: string
  key: string | null
  originalSize: number
  preview: string
  thumbnail: string
  thumbHashUrl?: string
  albums?: { albumId: string; name: string }[]
  mediaType?: string
  exif?: string | null
  src: string
  width?: number
  height?: number
  alt?: string
}

type OriginalProgress = {
  loaded: number
  total: number
}

type PreviewRequestMap = Map<string, () => void>

interface PhotoViewerContextType {
  prev: () => void
  next: () => void
  close: () => void
  currentSlide: PhotoSlide | null
}

const PhotoViewerContext = React.createContext<PhotoViewerContextType | null>(null)

function useViewerController() {
  const ctx = React.useContext(PhotoViewerContext)
  return ctx || { prev: () => {}, next: () => {}, close: () => {}, currentSlide: null }
}

function getActionVisibleClass(showActions: boolean) {
  return showActions ? "opacity-100 translate-y-0" : "pointer-events-none opacity-0 -translate-y-2"
}

function formatMB(size: number) {
  return `${(size / 1024 / 1024).toFixed(1)}MB`
}

function closePreviewRequests(requests: PreviewRequestMap) {
  const aborts = Array.from(requests.values())
  requests.clear()
  aborts.forEach((abort) => abort())
}

function loadPreviewImage(
  src: string,
  photoId: string,
  currentPhotoIdRef: { current: string | null },
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
    ;(img as unknown as { fetchPriority: string }).fetchPriority = "high"
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
      className="fixed right-3 md:right-4 bottom-3 md:bottom-4 z-55 h-auto gap-3 rounded-xl bg-black/80 px-3 py-2 text-white transition-opacity duration-200 hover:bg-black/80 pointer-events-auto"
    >
      {error ? (
        <CircleAlertIcon className="size-4 text-red-500" />
      ) : (
        <LoaderCircleIcon className="size-4 animate-spin text-white" />
      )}
      <span className="flex flex-col items-start leading-none">
        <span className={cn("text-xs font-medium", error ? "text-red-500" : "text-white")}>
          <span className="text-xs mr-[1px]">{error ? t("loadFailed") : t("loading")}</span>
          {!error && <span className="text-white/70"> {percent}%</span>}
        </span>
        <span className="text-xs text-white/70">
          {formatMB(progress.loaded)} / {formatMB(progress.total)}
        </span>
      </span>
    </Button>
  )
}

function PrevButton({ showActions }: { showActions: boolean }) {
  const { prev } = useViewerController()
  const tap = useTapAction(prev)

  return (
    <Button
      type="button"
      size="icon"
      variant="secondary"
      className={cn(
        "hidden md:flex fixed top-1/2 left-3 md:left-5 z-55 -translate-y-1/2 rounded-full bg-black/50 hover:bg-black/75 text-white backdrop-blur-md border border-white/10 shadow-2xl transition-all duration-200 pointer-events-auto cursor-pointer",
        getActionVisibleClass(showActions)
      )}
      {...tap}
    >
      <ChevronLeftIcon className="size-6 text-white" />
      <span className="sr-only">Previous</span>
    </Button>
  )
}

function NextButton({ showActions }: { showActions: boolean }) {
  const { next } = useViewerController()
  const tap = useTapAction(next)

  return (
    <Button
      type="button"
      size="icon"
      variant="secondary"
      className={cn(
        "hidden md:flex fixed top-1/2 right-3 md:right-5 z-55 -translate-y-1/2 rounded-full bg-black/50 hover:bg-black/75 text-white backdrop-blur-md border border-white/10 shadow-2xl transition-all duration-200 pointer-events-auto cursor-pointer",
        getActionVisibleClass(showActions)
      )}
      {...tap}
    >
      <ChevronRightIcon className="size-6 text-white" />
      <span className="sr-only">Next</span>
    </Button>
  )
}

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
            className={cn(
              "rounded-full text-white transition-opacity duration-200 pointer-events-auto cursor-pointer",
              isCinematicMode ? "bg-black/70 hover:bg-black/80 border border-white/30" : "bg-black/40 hover:bg-black/60",
              getActionVisibleClass(showActions)
            )}
            aria-label={isCinematicMode ? "Exit cinematic mode" : "Enter cinematic mode"}
            {...tap}
          >
            {isCinematicMode ? <MinimizeIcon className="size-4" /> : <MaximizeIcon className="size-4" />}
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

function InfoButton({
  open,
  onToggle,
  showActions,
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
            className={cn(
              "relative rounded-full text-white transition-opacity duration-200 pointer-events-auto cursor-pointer",
              open ? "bg-black/70 hover:bg-black/80 border border-white/30" : "bg-black/40 hover:bg-black/60",
              getActionVisibleClass(showActions)
            )}
            {...tap}
          >
            <Menu className="size-4 md:hidden" />
            {open ? (
              <PanelRightClose className="hidden size-4 md:block" />
            ) : (
              <PanelRightOpen className="hidden size-4 md:block" />
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

function RotateButton({ showActions, onRotate }: { showActions: boolean; onRotate: (photoId: string) => void }) {
  const { currentSlide } = useViewerController()

  function rotatePhoto() {
    if (currentSlide?.photoId) {
      onRotate(currentSlide.photoId)
    }
  }

  const tap = useTapAction(rotatePhoto)

  return (
    <Button
      type="button"
      size="icon"
      variant="secondary"
      className={cn("rounded-full bg-black/40 text-white transition-opacity duration-200 hover:bg-black/60 pointer-events-auto cursor-pointer", getActionVisibleClass(showActions))}
      {...tap}
    >
      <RotateCcwSquare className="size-4" />
      <span className="sr-only">Rotate photo</span>
    </Button>
  )
}

function ShareButton({ showActions }: { showActions: boolean }) {
  const t = useTranslations("photos.viewer")
  const { userInfo } = useApp()
  const isAdmin = userInfo?.type === UserTypeEnum.ADMIN
  const { currentSlide } = useViewerController()

  const handleShare = async () => {
    if (!currentSlide?.photoId || typeof window === "undefined") return

    if (!isAdmin) {
      recordPhotoShare(currentSlide.photoId)
    }
    trackVisitorMedia(currentSlide.photoId, "share")

    const url = new URL(window.location.href)
    url.searchParams.set("photoId", currentSlide.photoId)
    const shareUrl = url.toString()

    const isVideo = Boolean(currentSlide.mediaType?.startsWith("video/"))
    const defaultTitle = isVideo ? "Video" : "Photo"

    if (navigator.share) {
      try {
        await navigator.share({
          title: currentSlide.alt || defaultTitle,
          text: `Check out "${currentSlide.alt || defaultTitle}" on NayPict`,
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
      className={cn("rounded-full bg-black/40 text-white transition-opacity duration-200 hover:bg-black/60 pointer-events-auto cursor-pointer", getActionVisibleClass(showActions))}
      title={t("share")}
      {...tap}
    >
      <Share2Icon className="size-4" />
      <span className="sr-only">{t("share")}</span>
    </Button>
  )
}

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
      className={cn(
        "rounded-full bg-gradient-to-tr from-pink-600 via-rose-500 to-amber-500 text-white transition-all duration-200 hover:scale-110 hover:opacity-100 shadow-md shadow-pink-500/30 border border-white/20 cursor-pointer pointer-events-auto",
        getActionVisibleClass(showActions)
      )}
      title={t("createStory")}
      {...tap}
    >
      <InstagramIcon className="size-4" />
      <span className="sr-only">{t("storyCard")}</span>
    </Button>
  )
}

function AddToAlbumButton({
  showActions,
  onAlbumOpen,
}: {
  showActions: boolean
  onAlbumOpen?: (photoIds: string[]) => void
}) {
  const { currentSlide } = useViewerController()

  function handleAddToAlbum(e: React.MouseEvent) {
    e.stopPropagation()
    e.preventDefault()
    if (!currentSlide) return
    onAlbumOpen?.([currentSlide.photoId])
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
            className={cn("rounded-full bg-black/40 text-white transition-opacity duration-200 hover:bg-black/60 cursor-pointer pointer-events-auto", getActionVisibleClass(showActions))}
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

function DeleteButton({
  showActions,
  onDelete,
}: {
  showActions: boolean
  onDelete?: (photoId: string) => void
}) {
  const { currentSlide, close } = useViewerController()

  function handleDelete() {
    if (!currentSlide) return
    onDelete?.(currentSlide.photoId)
    close()
  }

  const tap = useTapAction(handleDelete)

  if (!onDelete) return null

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            size="icon"
            variant="secondary"
            className={cn("rounded-full bg-black/40 text-white transition-opacity duration-200 hover:bg-red-600/80 pointer-events-auto cursor-pointer", getActionVisibleClass(showActions))}
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

function AlbumOverlayBadge({ isCinematicMode }: { isCinematicMode: boolean }) {
  const { currentSlide } = useViewerController()

  if (!currentSlide?.albums || currentSlide.albums.length === 0 || isCinematicMode) {
    return null
  }

  const albumText = formatAlbumList(currentSlide.albums)

  return (
    <div className="fixed top-14 left-3 md:top-16 md:left-4 z-55 flex items-center gap-1.5 rounded-full bg-black/75 px-3 py-1 text-xs text-white backdrop-blur-md border border-white/15 shadow-lg select-none max-w-[85vw] md:max-w-md truncate pointer-events-auto">
      <FolderIcon className="size-3.5 text-primary shrink-0" />
      <span className="font-medium text-white/70 shrink-0">In Albums:</span>
      <span className="font-semibold text-white truncate" title={albumText}>
        {albumText}
      </span>
    </div>
  )
}

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
      className={cn(
        "fixed left-3 bottom-16 sm:bottom-18 md:bottom-20 z-55 flex flex-col items-start gap-2 transition-all duration-300 pointer-events-auto select-none max-w-[calc(100vw-1.5rem)]",
        getActionVisibleClass(showActions)
      )}
    >
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

        <button
          type="button"
          onClick={onOpenComments}
          className="group flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold text-white bg-white/10 hover:bg-white/20 active:scale-95 transition-all duration-200 border border-white/10 cursor-pointer shrink-0"
          aria-label="Open Comments"
        >
          <MessageSquare className="size-3.5 text-emerald-400 transition-transform group-hover:scale-110" />
          <span className="tracking-wide text-[11px] sm:text-xs">Comment</span>
        </button>

        <button
          type="button"
          onClick={onOpenInfo}
          className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium text-white/75 hover:text-white hover:bg-white/15 active:scale-95 transition-all duration-200 cursor-pointer shrink-0"
          aria-label="Media Details"
        >
          <span>EXIF</span>
        </button>
      </div>
    </div>
  )
}

function CloseButton({ showActions }: { showActions: boolean }) {
  const { close } = useViewerController()
  const tap = useTapAction(close)

  return (
    <Button
      type="button"
      size="icon"
      variant="secondary"
      className={cn(
        "fixed top-2 left-2 md:top-3 md:left-4 z-55 rounded-full bg-black/40 text-white transition-opacity duration-200 hover:bg-black/60 pointer-events-auto cursor-pointer",
        getActionVisibleClass(showActions)
      )}
      {...tap}
    >
      <ArrowLeftIcon className="size-5" />
      <span className="sr-only">Back</span>
    </Button>
  )
}

function PhotoViewerThumbnails({
  photos,
  currentIndex,
  onSelect,
  visible,
}: {
  photos: PhotoVo[]
  currentIndex: number
  onSelect: (index: number) => void
  visible: boolean
}) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const activeItemRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    if (activeItemRef.current) {
      activeItemRef.current.scrollIntoView({
        behavior: "smooth",
        inline: "center",
        block: "nearest",
      })
    }
  }, [currentIndex])

  if (!visible || photos.length <= 1) return null

  return (
    <div
      ref={containerRef}
      className="fixed bottom-2 sm:bottom-3 inset-x-0 z-45 flex items-center justify-start md:justify-center gap-1.5 px-4 py-1.5 overflow-x-auto no-scrollbar pointer-events-auto select-none transition-all duration-300"
      style={{
        maskImage: "linear-gradient(to right, transparent, black 10%, black 90%, transparent)",
        WebkitMaskImage: "linear-gradient(to right, transparent, black 10%, black 90%, transparent)",
      }}
    >
      <div className="flex items-center gap-1.5 mx-auto">
        {photos.map((photo, i) => {
          const isActive = i === currentIndex
          return (
            <button
              key={photo.photoId || i}
              ref={isActive ? activeItemRef : null}
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                onSelect(i)
              }}
              className={cn(
                "relative shrink-0 rounded-md overflow-hidden transition-all duration-200 cursor-pointer border",
                isActive
                  ? "border-emerald-400 ring-2 ring-emerald-500/50 scale-105 opacity-100 shadow-lg shadow-black/80"
                  : "border-white/10 opacity-40 hover:opacity-80 hover:scale-100"
              )}
              style={{
                width: 44,
                height: 44,
              }}
              aria-label={photo.name || `Photo ${i + 1}`}
            >
              <img
                src={toProxyMediaUrl(photo.thumbnail || photo.preview || "")}
                alt=""
                className="w-full h-full object-cover pointer-events-none"
                loading="lazy"
                decoding="async"
              />
              {photo.type?.startsWith("video/") && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                  <Play className="size-2.5 text-white fill-white" />
                </div>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

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

  const prevOpenRef = useRef(open)
  const prevIndexRef = useRef(index)
  useEffect(() => {
    if (open && (!prevOpenRef.current || prevIndexRef.current !== index)) {
      setViewIndex(index)
    }
    prevOpenRef.current = open
    prevIndexRef.current = index
  }, [open, index])

  const infoOpen = usePhotoStore((state) => state.infoOpen)
  const setInfoOpen = usePhotoStore((state) => state.setInfoOpen)
  const [infoTab, setInfoTab] = useState<"info" | "comments">("info")
  const [originalProgress, setOriginalProgress] = useState<OriginalProgress | null>(null)
  const [showOriginalProgress, setShowOriginalProgress] = useState(false)
  const [originalError, setOriginalError] = useState(false)
  const [showActions, setShowActions] = useState(true)
  const [zoomLevel, setZoomLevel] = useState(1)
  const [fullscreenOpen, setFullscreenOpen] = useState(false)
  const [isCinematicMode, setIsCinematicMode] = useState(false)
  const [showViewerHeartBurst, setShowViewerHeartBurst] = useState(false)
  const [viewerBurstCoords, setViewerBurstCoords] = useState<{ x: number; y: number } | null>(null)
  const [, setIsVideoScrubbing] = useState(false)

  const [videoMounts, setVideoMounts] = useState<Map<number, HTMLDivElement>>(new Map())
  const pswpRef = useRef<PhotoSwipe | null>(null)
  const isClosingRef = useRef(false)

  const handleOpenComments = useCallback(() => {
    setInfoTab("comments")
    setInfoOpen(true)
  }, [setInfoOpen])

  const handleOpenInfo = useCallback(() => {
    setInfoTab("info")
    setInfoOpen(true)
  }, [setInfoOpen])

  const [isIdleHidden, setIsIdleHidden] = useState(false)
  const controlsVisible = !isCinematicMode || !isIdleHidden
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [photoRotates, setPhotoRotates] = useState<Record<string, number>>({})
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

  const [insightsDialogOpen, setInsightsDialogOpen] = useState(false)
  const [insightsPhotoId, setInsightsPhotoId] = useState<string | null>(null)
  const [storyDialogOpen, setStoryDialogOpen] = useState(false)
  const [batchEditDialogOpen, setBatchEditDialogOpen] = useState(false)

  const isAnySubModalOpen = storyDialogOpen || insightsDialogOpen || batchEditDialogOpen

  const storyDialogOpenRef = useRef(storyDialogOpen)
  const insightsDialogOpenRef = useRef(insightsDialogOpen)
  const batchEditDialogOpenRef = useRef(batchEditDialogOpen)
  const infoOpenRef = useRef(infoOpen)
  const isCinematicModeRef = useRef(isCinematicMode)

  useEffect(() => {
    storyDialogOpenRef.current = storyDialogOpen
    insightsDialogOpenRef.current = insightsDialogOpen
    batchEditDialogOpenRef.current = batchEditDialogOpen
    infoOpenRef.current = infoOpen
    isCinematicModeRef.current = isCinematicMode
  })

  useModalBackHandler(open && infoOpen && typeof window !== "undefined" && window.innerWidth < 768, (val) => setInfoOpen(val))

  const [showGestureHint, setShowGestureHint] = useState(false)
  const [hintFading, setHintFading] = useState(false)

  useEffect(() => {
    if (!open || typeof window === "undefined" || window.innerWidth >= 768) {
      return
    }

    const STORAGE_KEY = "naypict_gesture_hint_count"
    try {
      const shownCount = parseInt(localStorage.getItem(STORAGE_KEY) || "0", 10)
      if (shownCount >= 3) return

      localStorage.setItem(STORAGE_KEY, String(shownCount + 1))
      const showTimer = setTimeout(() => {
        setShowGestureHint(true)
        setHintFading(false)
      }, 0)

      const fadeTimer = setTimeout(() => {
        setHintFading(true)
      }, 1800)

      const hideTimer = setTimeout(() => {
        setShowGestureHint(false)
      }, 2300)

      return () => {
        clearTimeout(showTimer)
        clearTimeout(fadeTimer)
        clearTimeout(hideTimer)
      }
    } catch {}
  }, [open])

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
        setFullscreenOpen(false)
      } else {
        setFullscreenOpen(true)
      }
    }

    document.addEventListener("fullscreenchange", handleFullscreenChange)
    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange)
    }
  }, [])

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

      if (event.key === "f" || event.key === "F") {
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
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown, true)
    return () => {
      window.removeEventListener("keydown", handleKeyDown, true)
    }
  }, [open, isCinematicMode, toggleCinematicMode, infoOpen, isAnySubModalOpen, setInfoOpen])

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

  const slides = useMemo<PhotoSlide[]>(() => (
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

  const onBackRef = useRef(onBack)
  const photosRef = useRef(photos)
  const indexRef = useRef(index)

  useEffect(() => {
    onBackRef.current = onBack
    photosRef.current = photos
    indexRef.current = index
    onBrowserBackRef.current = onBrowserBack
  }, [onBack, photos, index, onBrowserBack])

  function restoreListScroll() {
    window.scrollTo(0, openScrollYRef.current)
  }

  function closeViewer() {
    if (isClosingRef.current) return
    isClosingRef.current = true

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
    setZoomLevel(1)

    if (pswpRef.current) {
      try {
        pswpRef.current.destroy()
      } catch {}
      pswpRef.current = null
    }

    setTimeout(() => {
      isClosingRef.current = false
    }, 300)
  }

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

      closeViewer()
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

  function handleView(nextIndex: number) {
    setIsVideoScrubbing(false)
    setViewIndex(nextIndex)
    setShowActions(true)

    const photo = photosRef.current[nextIndex]
    if (!photo) return
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

    // Speculative lookahead pre-warm debounced to idle frame
    const warmSurrounding = () => {
      const warmIndices = [
        nextIndex + 1,
        nextIndex - 1,
        nextIndex + 2,
        nextIndex - 2,
      ]
      for (const idx of warmIndices) {
        if (idx < 0 || idx >= photosRef.current.length) continue
        const target = photosRef.current[idx]
        if (!target) continue
        if (target.type?.startsWith("video/")) {
          const videoUrl = target.key || target.preview
          if (videoUrl) {
            prebufferVideo(videoUrl)
          }
        } else if (target.preview) {
          loadPreviewImage(target.preview, target.photoId, currentPhotoIdRef, previewRequestsRef, getPhotoCache, setPhotoCache)
        }
      }
    }

    if (typeof window !== "undefined" && "requestIdleCallback" in window) {
      window.requestIdleCallback(warmSurrounding, { timeout: 200 })
    } else {
      setTimeout(warmSurrounding, 80)
    }
  }

  function rotatePhoto(photoId: string) {
    setPhotoRotates((prev) => {
      const nextDeg = (prev[photoId] ?? 0) + 90
      if (pswpRef.current?.currSlide?.content?.element) {
        const elem = pswpRef.current.currSlide.content.element
        const img = elem.querySelector("img") || elem
        if (img instanceof HTMLElement) {
          img.style.transition = "transform 0.3s cubic-bezier(0.16, 1, 0.3, 1)"
          img.style.transform = `rotate(${nextDeg}deg)`
        }
      }
      return {
        ...prev,
        [photoId]: nextDeg,
      }
    })
  }

  // Initialize PhotoSwipe v5 with 120 FPS hardware touch gestures & native pull-to-dismiss
  useEffect(() => {
    if (!open || typeof window === "undefined" || photos.length === 0) {
      if (pswpRef.current) {
        try {
          pswpRef.current.close()
        } catch {}
        pswpRef.current = null
      }
      return
    }

    const dataSource = photos.map((photo) => {
      const isVideo = Boolean(photo.type?.startsWith("video/"))
      const isDummyThumbHash =
        !photo.thumbHash ||
        photo.thumbHash.startsWith("00080204") ||
        photo.thumbHash.startsWith("00080205")
      const thumbHashUrl = isDummyThumbHash ? undefined : getThumbHashUrl(photo.thumbHash)

      if (isVideo) {
        return {
          type: "video",
          photo,
          width: photo.width || window.innerWidth,
          height: photo.height || window.innerHeight,
        }
      }

      return {
        src: photo.preview || photo.thumbnail || "",
        msrc: thumbHashUrl || photo.thumbnail || photo.preview || "",
        width: photo.width || window.innerWidth,
        height: photo.height || window.innerHeight,
        alt: photo.name || "",
        photo,
      }
    })

    const isDesktop = window.innerWidth >= 768
    const rightPad = infoOpen && !fullscreenOpen && !isCinematicMode && isDesktop ? 336 : 0

    const pswp = new PhotoSwipe({
      dataSource,
      index: index,
      closeOnVerticalDrag: true, // SWIPE UP OR DOWN TO CLOSE! (Pull-to-dismiss preserved)
      pinchToClose: true,        // Pinch inward gesture to close
      spacing: 0.1,             // 10% viewport slide spacing (natural modern gutter)
      bgOpacity: 0.94,          // Cinema ambient backdrop
      wheelToZoom: true,        // Trackpad / mouse wheel zoom
      allowPanToNext: true,     // Pan seamlessly into next slide when zoomed
      arrowKeys: true,          // Desktop keyboard navigation
      escKey: true,             // ESC to close
      mainClass: "pswp--naypict",
      showHideAnimationType: "zoom",
      returnFocus: false,
      padding: {
        right: rightPad,
        left: 0,
        top: 0,
        bottom: 0,
      },
      tapAction: () => {
        setShowActions((prev) => !prev)
      },
      doubleTapAction: (point) => {
        setViewerBurstCoords({ x: point.x, y: point.y })
        setShowViewerHeartBurst(true)
        try {
          if (typeof navigator !== "undefined" && navigator.vibrate) {
            navigator.vibrate([15, 35, 15])
          }
        } catch {}

        const activeIdx = pswpRef.current?.currIndex ?? viewIndex
        const activePhoto = photosRef.current[activeIdx]
        if (activePhoto?.photoId) {
          const cached = reactionSync.getCached(activePhoto.photoId)
          if (!cached?.userReactions?.love && !isAdmin) {
            reactionSync.toggleReaction(activePhoto.photoId, "love")
          }
          trackVisitorMedia(activePhoto.photoId, "reaction")
        }

        if (pswpRef.current?.currSlide) {
          pswpRef.current.currSlide.toggleZoom({ x: point.x, y: point.y })
        }
      },
      bgClickAction: () => {
        closeViewer()
      },
    })

    // Video custom content handling
    pswp.on("contentAppend", (e) => {
      const { content } = e
      if (content.data.type === "video") {
        const container = document.createElement("div")
        container.className = "pswp__video-slide-container"
        content.element = container
        setVideoMounts((prev) => {
          const next = new Map(prev)
          next.set(content.index, container)
          return next
        })
      }
    })

    pswp.on("contentDestroy", (e) => {
      const { content } = e
      if (content.data.type === "video") {
        setVideoMounts((prev) => {
          const next = new Map(prev)
          next.delete(content.index)
          return next
        })
      }
    })

    pswp.on("change", () => {
      const nextIdx = pswp.currIndex
      setViewIndex(nextIdx)
      handleView(nextIdx)
    })

    pswp.on("close", () => {
      closeViewer()
    })

    pswp.on("destroy", () => {
      pswpRef.current = null
      setVideoMounts(new Map())
    })

    pswp.on("contentActivate", (e) => {
      const { content } = e
      const p = content.data.photo as PhotoVo | undefined
      if (p?.photoId && photoRotates[p.photoId] && content.element) {
        const img = content.element.querySelector("img") || content.element
        if (img instanceof HTMLElement) {
          img.style.transform = `rotate(${photoRotates[p.photoId]}deg)`
        }
      }
    })

    pswpRef.current = pswp
    pswp.init()

    return () => {
      if (pswpRef.current) {
        try {
          pswpRef.current.destroy()
        } catch {}
        pswpRef.current = null
      }
    }
  }, [open])

  // Sync index navigation when parent index changes
  useEffect(() => {
    if (open && pswpRef.current && pswpRef.current.currIndex !== index) {
      pswpRef.current.goTo(index)
    }
  }, [index, open])

  // Dynamic layout adjustment when sidebar or cinematic mode toggles
  useEffect(() => {
    if (!pswpRef.current || typeof window === "undefined") return
    const isDesktop = window.innerWidth >= 768
    const rightPad = infoOpen && !fullscreenOpen && !isCinematicMode && isDesktop ? 336 : 0
    pswpRef.current.options.padding = {
      right: rightPad,
      left: 0,
      top: 0,
      bottom: 0,
    }
    pswpRef.current.updateSize(true)
  }, [infoOpen, fullscreenOpen, isCinematicMode])

  // Disable pointer interactions on PhotoSwipe during open dialog modals
  useEffect(() => {
    if (!pswpRef.current?.element) return
    pswpRef.current.element.classList.toggle("pswp-modal-active", isAnySubModalOpen)
  }, [isAnySubModalOpen])

  const contextValue = useMemo<PhotoViewerContextType>(() => ({
    prev: () => pswpRef.current?.prev(),
    next: () => pswpRef.current?.next(),
    close: () => {
      if (pswpRef.current) {
        pswpRef.current.close()
      } else {
        closeViewer()
      }
    },
    currentSlide: slides[viewIndex] ?? null,
  }), [slides, viewIndex])

  if (!open) return null

  return (
    <PhotoViewerContext.Provider value={contextValue}>
      {/* Video Player Portals mounted directly into PhotoSwipe slide containers */}
      {Array.from(videoMounts.entries()).map(([slideIdx, container]) => {
        const photo = photos[slideIdx]
        if (!photo || !container) return null
        return createPortal(
          <VideoPlayer
            key={photo.photoId || slideIdx}
            src={toProxyMediaUrl(photo.key || photo.preview)}
            poster={photo.thumbnail}
            alt={photo.name || "Video"}
            isActive={slideIdx === viewIndex}
            autoPlay={slideIdx === viewIndex}
            photoId={photo.photoId}
            exif={photo.exif}
            isCinematicMode={isCinematicMode}
            onScrubbingChange={(isScrubbing) => {
              setIsVideoScrubbing(isScrubbing)
              if (pswpRef.current) {
                pswpRef.current.options.allowPanToNext = !isScrubbing
              }
            }}
            onFullscreenChange={setFullscreenOpen}
            onOpenComments={handleOpenComments}
            onOpenInfo={handleOpenInfo}
            controlsVisible={actionsVisible}
            onControlsVisibleChange={setShowActions}
            className="w-full h-full"
          />,
          container
        )
      })}

      {/* React UI Overlay Layer on top of PhotoSwipe canvas */}
      <div className="fixed inset-0 z-50 pointer-events-none select-none">
        {/* Dynamic Cinema Ambient Glow */}
        <PhotoViewerAmbientGlow
          thumbHash={photos[viewIndex]?.thumbHash}
          visible={!fullscreenOpen && !isCinematicMode}
          className="z-[-1]"
        />

        {/* Mobile Instagram-Style Double-Tap Heart Burst */}
        <PhotoHeartBurst
          show={showViewerHeartBurst}
          coords={viewerBurstCoords}
          size={96}
          onComplete={() => setShowViewerHeartBurst(false)}
        />

        {/* Desktop Prev/Next Buttons */}
        <PrevButton showActions={actionsVisible} />
        <NextButton showActions={actionsVisible} />

        {/* Top-Left Close Button */}
        <CloseButton showActions={actionsVisible} />

        {/* Top-Right Action Toolbar */}
        <div
          className={cn(
            "fixed top-2 right-2 md:top-3 md:right-4 z-55 flex items-center gap-1.5 max-w-[calc(100vw-3.75rem)] overflow-x-auto no-scrollbar pointer-events-auto",
            getActionVisibleClass(actionsVisible)
          )}
        >
          {!isCinematicMode && (
            <>
              {isAdmin && onPhotoDelete && (
                <DeleteButton showActions={actionsVisible} onDelete={onPhotoDelete} />
              )}
              {isAdmin && onAlbumOpen && (
                <AddToAlbumButton showActions={actionsVisible} onAlbumOpen={onAlbumOpen} />
              )}
              {!isCurrentVideo && (
                <>
                  <RotateButton showActions={actionsVisible} onRotate={rotatePhoto} />
                  <StoryCardButton showActions={actionsVisible} onOpenStory={() => setStoryDialogOpen(true)} />
                </>
              )}
              <ShareButton showActions={actionsVisible} />
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

        {/* Original HD Download Progress Pill */}
        {showOriginalProgress && !isCinematicMode && (
          <OriginalProgressButton progress={originalProgress} error={originalError} />
        )}

        {/* Album Indicator Badge */}
        <AlbumOverlayBadge isCinematicMode={isCinematicMode} />

        {/* Bottom Interaction Bar (Reactions & Filmstrip) */}
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

        {/* Bottom Thumbnail Strip Carousel */}
        <PhotoViewerThumbnails
          photos={photos}
          currentIndex={viewIndex}
          onSelect={(i) => pswpRef.current?.goTo(i)}
          visible={actionsVisible && !infoOpen && !isCinematicMode && !fullscreenOpen}
        />

        {/* Mobile Swipe Hint Badge */}
        {showGestureHint && !infoOpen && !isCinematicMode && (
          <div
            className={cn(
              "fixed bottom-36 sm:bottom-40 inset-x-0 z-55 flex justify-center px-4 pointer-events-none select-none md:hidden transition-all duration-500 ease-out",
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

        {/* Photo Info & Comments Sidebar */}
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
      </div>

      {/* Lazy-Loaded Dialogs */}
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
    </PhotoViewerContext.Provider>
  )
}
