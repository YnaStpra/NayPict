"use client"

import { type CSSProperties, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import Lightbox from "yet-another-react-lightbox"
import { isImageSlide, type SlideImage, useController, useLightboxState } from "yet-another-react-lightbox"
import Fullscreen from "yet-another-react-lightbox/plugins/fullscreen"
import Thumbnails from "yet-another-react-lightbox/plugins/thumbnails"
import Zoom from "yet-another-react-lightbox/plugins/zoom"
import { ArrowLeftIcon, ChevronLeftIcon, ChevronRightIcon, CircleAlertIcon, CircleIcon, FolderIcon, FolderPlusIcon, LockIcon, Menu, LoaderCircleIcon, MaximizeIcon, MessageSquare, MinimizeIcon, PanelRightClose, PanelRightOpen, RotateCcwSquare, Share2Icon, Trash2Icon } from "lucide-react"
import { toast } from "sonner"

import { PhotoInfoSidebar, PhotoViewerBlurBackground, formatAlbumList } from "@/components/photo/photo-info-sidebar"
import { PhotoInsightsDialog } from "@/components/photo/photo-insights-dialog"
import { useTapAction } from "@/hooks/use-tap-action"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { getThumbHashUrl } from "@/lib/thumb-hash"
import { removePhotoIdFromUrl, setPhotoIdInUrl } from "@/lib/url"
import { recordPhotoShare, recordPhotoView } from "@/request/insights"
import { type PhotoVo } from "@/server/entity/vo/photo"
import { usePhotoStore } from "@/store/photo-store"
import { useApp } from "@/app/provider"
import { UserTypeEnum } from "@/server/enums/user-enum"
import { useTranslations } from "next-intl"

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

type PhotoSlide = SlideImage & {
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
}

type FullscreenButtonProps = {
  // Whether currently in fullscreen mode.
  fullscreen: boolean
  // Enter fullscreen.
  enter: () => void
}

type OriginalPhoto = {
  // The original image that has been loaded currently key。
  key: string
}

type OriginalProgress = {
  // Number of bytes currently loaded。
  loaded: number
  // The total number of bytes of the current original image。
  total: number
}

type PreviewRequestMap = Map<string, () => void>

type LoadOriginalImageParams = {
  // Current photo id。
  photoId: string
  // Original image request address。
  src: string
  // Original image file size，for no return total Show progress at the bottom of the pocket。
  totalSize: number
  // Save the original image that has been loaded。
  setOriginalPhoto: (photo: OriginalPhoto | null) => void
  // Save original image loading progress。
  setOriginalProgress: (progress: OriginalProgress | null) => void
  // Control whether the original image loading progress is displayed。
  setShowOriginalProgress: (show: boolean) => void
  // Save the current original image to check whether the loading is abnormal.。
  setOriginalError: (error: boolean) => void
  // Cancel method of saving current original image request。
  abortOriginalRef: { current: (() => void) | null }
  // Original image loading progress delay hidden timer。
  hideTimerRef: { current: ReturnType<typeof setTimeout> | null }
  // Save the loaded photo cache。
  setPhotoCache: (photoId: string, src: string) => void
}

const photoViewerPortalStyle: CSSProperties & { "--yarl__portal_zindex": number } = {
  "--yarl__portal_zindex": 1000,
  zIndex: 1000,
}

// Generate fade-in and fade-out styles based on the display state of the action button。
function getActionVisibleClass(showActions: boolean) {
  return showActions ? "opacity-100" : "pointer-events-none opacity-0"
}

// Format the number of bytes into MB。
function formatMB(size: number) {
  return `${(size / 1024 / 1024).toFixed(1)}MB`
}

// Close all preview image requests，and clear the current request Map。
function closePreviewRequests(requests: PreviewRequestMap) {
  const aborts = Array.from(requests.values())

  requests.clear()
  aborts.forEach((abort) => {
    abort()
  })
}

// Load the original image and directly update the status related to the original image in the viewer。
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

  // Clean up the current request reference after the request ends，Avoid subsequent switching from accidentally canceling completed requests。
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

// Silently load preview，Replace the current display image after the request is completed。
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
  const cachedSrc = getPhotoCache(photoId)

  if (cachedSrc) {
    requestAnimationFrame(() => {
      if (currentPhotoIdRef.current === photoId) {
        setOriginalPhoto({
          key: cachedSrc,
        })
        onLoaded?.()
      }
    })
    return
  }

  const xhr = new XMLHttpRequest()
  const abortPreview = () => {
    xhr.abort()
  }

  previewRequestsRef.current.set(photoId, abortPreview)

  // After the request is completed, only clean up your own records，Prevent old requests from deleting new requests。
  function clearCurrentRequest() {
    if (previewRequestsRef.current.get(photoId) === abortPreview) {
      previewRequestsRef.current.delete(photoId)
    }
  }

  xhr.open("GET", src)
  xhr.responseType = "arraybuffer"
  xhr.onload = () => {
    if (xhr.status >= 200 && xhr.status < 300) {
      setPhotoCache(photoId, src)

      if (currentPhotoIdRef.current === photoId) {
        setOriginalPhoto({
          key: src,
        })
        onLoaded?.()
      }
    }
    clearCurrentRequest()
  }
  xhr.onerror = () => {
    clearCurrentRequest()
  }
  xhr.onabort = () => {
    clearCurrentRequest()
  }
  xhr.send()
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
      className={[
        "absolute right-3 md:right-4 bottom-3 md:bottom-4 z-[450] h-auto gap-3 rounded-xl bg-black/80 px-3 py-2 text-white transition-opacity duration-200 hover:bg-black/80",
      ].join(" ")}
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

// Render the previous button。
function PrevButton({ showActions }: { showActions: boolean }) {
  const { prev } = useController()

  return (
    <Button
      type="button"
      size="icon"
      variant="secondary"
      className={[
        "absolute top-1/2 left-3 z-40 hidden rounded-full bg-black/40 text-white transition-opacity duration-200 hover:bg-black/50 md:inline-flex",
        getActionVisibleClass(showActions),
      ].join(" ")}
      style={{ transform: "translateY(-50%)" }}
      onClick={() => prev()}
    >
      <ChevronLeftIcon />
      <span className="sr-only">Previous photo</span>
    </Button>
  )
}

// Render next button。
function NextButton({ showActions }: { showActions: boolean }) {
  const { next } = useController()

  return (
    <Button
      type="button"
      size="icon"
      variant="secondary"
      className={[
        "absolute top-1/2 right-3 md:right-4 z-40 hidden rounded-full bg-black/40 text-white transition-opacity duration-200 hover:bg-black/50 md:inline-flex",
        getActionVisibleClass(showActions),
      ].join(" ")}
      style={{ transform: "translateY(-50%)" }}
      onClick={() => next()}
    >
      <ChevronRightIcon />
      <span className="sr-only">Next photo</span>
    </Button>
  )
}

// Render full screen button。
function FullscreenButton({
  fullscreen,
  enter,
  showActions,
  onHideActions,
}: FullscreenButtonProps & {
  showActions: boolean
  onHideActions: () => void
}) {
  // Hide viewer action buttons after entering full screen state。
  function openFullscreen() {
    enter()
    onHideActions()
  }

  const tap = useTapAction(openFullscreen)

  if (fullscreen) {
    return null
  }

  return (
    <Button
      type="button"
      size="icon"
      variant="secondary"
      className="rounded-full bg-black/40 text-white transition-opacity duration-200 hover:bg-black/50"
      {...tap}
    >
      <MaximizeIcon />
      <span className="sr-only">Enter fullscreen</span>
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
              "rounded-full text-white transition-opacity duration-200",
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
              "rounded-full text-white transition-opacity duration-200",
              open ? "bg-black/70 hover:bg-black/70 border border-white/30" : "bg-black/40 hover:bg-black/50",
            ].join(" ")}
            {...tap}
          >
            <MessageSquare className="size-4" />
            <span className="sr-only">Photo comments</span>
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          <p>Comments</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

// Render photo information button, Click to switch the information sidebar on the right.
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
              "rounded-full text-white transition-opacity duration-200",
              open ? "bg-black/70 hover:bg-black/70 border border-white/30" : "bg-black/40 hover:bg-black/50",
            ].join(" ")}
            {...tap}
          >
            <Menu className="md:hidden" />
            {open
              ? <PanelRightClose className="hidden md:block" />
              : <PanelRightOpen className="hidden md:block" />}
            <span className="sr-only">Photo information</span>
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          <p>Information</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

// Render spin button.
function RotateButton({ showActions, onRotate }: { showActions: boolean, onRotate: (photoId: string) => void }) {
  const { currentSlide } = useLightboxState()
  const photoSlide = currentSlide && isImageSlide(currentSlide) ? currentSlide as PhotoSlide : null

  // put current photo id Leave it to the parent component to update the rotation angle.
  function rotatePhoto() {
    if (!photoSlide) {
      return
    }

    onRotate(photoSlide.photoId)
  }

  const tap = useTapAction(rotatePhoto)

  return (
    <Button
      type="button"
      size="icon"
      variant="secondary"
      className="rounded-full bg-black/40 text-white transition-opacity duration-200 hover:bg-black/50"
      {...tap}
    >
      <RotateCcwSquare />
      <span className="sr-only">Rotate photo</span>
    </Button>
  )
}

// Render share button.
function ShareButton({ showActions }: { showActions: boolean }) {
  const t = useTranslations("photos.viewer")
  const { currentSlide } = useLightboxState()
  const photoSlide = currentSlide && isImageSlide(currentSlide) ? (currentSlide as PhotoSlide) : null

  const handleShare = async () => {
    if (!photoSlide?.photoId || typeof window === "undefined") return

    // Track public share event
    recordPhotoShare(photoSlide.photoId)

    const url = new URL(window.location.href)
    url.searchParams.set("photoId", photoSlide.photoId)
    const shareUrl = url.toString()

    if (navigator.share) {
      try {
        await navigator.share({
          title: photoSlide.alt || "Photo",
          text: `Check out "${photoSlide.alt || "Photo"}" on NayPict`,
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
      className="rounded-full bg-black/40 text-white transition-opacity duration-200 hover:bg-black/50"
      title={t("share")}
      {...tap}
    >
      <Share2Icon className="size-4" />
      <span className="sr-only">{t("share")}</span>
    </Button>
  )
}

// Render original image load button.
function LoadOriginalButton({
  showActions,
  originalPhoto,
  getPhotoCache,
  onLoadOriginal,
}: {
  showActions: boolean
  originalPhoto: OriginalPhoto | null
  getPhotoCache: (photoId: string) => string | undefined
  onLoadOriginal: (slide: PhotoSlide) => void
}) {
  const { currentSlide } = useLightboxState()
  const photoSlide = currentSlide && isImageSlide(currentSlide) ? currentSlide as PhotoSlide : null
  const cacheSrc = photoSlide ? getPhotoCache(photoSlide.photoId) : undefined
  const originalLoaded = Boolean(photoSlide && (originalPhoto?.key === photoSlide.key || cacheSrc?.includes("photo/")))

  // put the current slide Leave it to the parent component to load the original image.
  function loadOriginal() {

    //Picture does not exist, Or terminate after loading is complete
    if (!photoSlide || originalLoaded) {
      return
    }

    onLoadOriginal(photoSlide)
  }

  const tap = useTapAction(loadOriginal)

  if (photoSlide && !photoSlide.key) {
    return (
      <div
        className="flex cursor-pointer items-center gap-1.5 rounded-full bg-black/60 px-3 py-1 text-xs text-white/90 transition-opacity duration-200 hover:bg-black/80"
        onClick={() => toast.info("Download is disabled for this photo.")}
      >
        <LockIcon className="size-3.5 text-white/80" />
        <span className="font-medium text-xs">Protected</span>
      </div>
    )
  }

  return (
    <Button
      type="button"
      size="icon"
      variant="secondary"
      className="rounded-full bg-black/40 text-white transition-opacity duration-200 hover:bg-black/50"
      {...tap}
    >
      {originalLoaded ? <CircleIcon /> : <LoaderCircleIcon />}
      <span className="sr-only">Load original photo</span>
    </Button>
  )
}

// Render add to album button in Lightbox toolbar (Admin only).
function AddToAlbumButton({
  showActions,
  onAlbumOpen,
}: {
  showActions: boolean
  onAlbumOpen?: (photoIds: string[]) => void
}) {
  const { currentSlide } = useLightboxState()
  const photoSlide = currentSlide && isImageSlide(currentSlide) ? (currentSlide as PhotoSlide) : null

  function handleAddToAlbum(e: React.MouseEvent) {
    e.stopPropagation()
    e.preventDefault()
    if (!photoSlide) return
    onAlbumOpen?.([photoSlide.photoId])
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

// Render delete photo button in Lightbox toolbar.
function DeleteButton({
  showActions,
  onDelete,
}: {
  showActions: boolean
  onDelete?: (photoId: string) => void
}) {
  const { currentSlide } = useLightboxState()
  const { close } = useController()
  const photoSlide = currentSlide && isImageSlide(currentSlide) ? (currentSlide as PhotoSlide) : null

  function handleDelete() {
    if (!photoSlide) return
    onDelete?.(photoSlide.photoId)
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
            className="rounded-full bg-black/40 text-white transition-opacity duration-200 hover:bg-red-600/80"
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
function AlbumOverlayBadge({ isCinematicMode }: { isCinematicMode: boolean }) {
  const { currentSlide } = useLightboxState()
  const photoSlide = currentSlide && isImageSlide(currentSlide) ? (currentSlide as PhotoSlide) : null

  if (!photoSlide?.albums || photoSlide.albums.length === 0 || isCinematicMode) {
    return null
  }

  const albumText = formatAlbumList(photoSlide.albums)

  return (
    <div className="absolute bottom-3 left-3 md:bottom-4 md:left-4 z-40 flex items-center gap-1.5 rounded-full bg-black/75 px-3.5 py-1.5 text-xs text-white backdrop-blur-md border border-white/15 shadow-lg select-none max-w-[85vw] md:max-w-md truncate">
      <FolderIcon className="size-3.5 text-primary shrink-0" />
      <span className="font-medium text-white/70 shrink-0">In Albums:</span>
      <span className="font-semibold text-white truncate" title={albumText}>
        {albumText}
      </span>
    </div>
  )
}

// Render close button.
function CloseButton({ showActions }: { showActions: boolean }) {
  const { close } = useController()
  const tap = useTapAction(() => close())

  return (
    <Button
      type="button"
      size="icon"
      variant="secondary"
      className={[
        "absolute top-2 left-2 md:top-3 md:left-3 z-40 rounded-full bg-black/40 text-white transition-opacity duration-200 hover:bg-black/50",
        getActionVisibleClass(showActions),
      ].join(" ")}
      {...tap}
    >
      <ArrowLeftIcon />
      <span className="sr-only">Back</span>
    </Button>
  )
}

// Render a single photo，via original image key ref Determine whether to display the cover or the original image。
function PhotoSlideImage({
  slide,
  originalPhoto,
  rotate,
  fullscreenOpen,
}: {
  // Current photo slide。
  slide: PhotoSlide
  // The currently loaded original image。
  originalPhoto: OriginalPhoto | null
  // Current photo CSS rotation angle。
  rotate: number
  // Whether it is currently in full screen state。
  fullscreenOpen: boolean
}) {
  const normalizedRotate = rotate % 360
  const sideways = normalizedRotate === 90 || normalizedRotate === 270
  const thumbnailHeight = innerWidth < 768 ? 46 : 75
  const rotateWidthOffset = fullscreenOpen ? 0 : thumbnailHeight

  return (
    <img
      src={originalPhoto?.key === slide.preview || originalPhoto?.key === slide.key ? originalPhoto.key : slide.src}
      alt={slide.alt}
      draggable={false}
      crossOrigin="anonymous"
      className="select-none max-w-none object-contain transition-transform duration-200"
      onError={(event) => {
        event.currentTarget.style.display = "none"
      }}
      style={{
        width: sideways ? `calc(100cqh - ${rotateWidthOffset}px)` : "100%",
        height: sideways ? "100vw" : "100%",
        transform: `rotate(${rotate}deg)`,
      }}
    />
  )
}

// Render photo detail viewer，The parent component is responsible for passing in the current photo and list data。
export function PhotoViewer({ open, index, photos, onBack, onBrowserBack, onPhotoDelete, onPhotoUpdate, onAlbumOpen }: PhotoViewerProps) {
  const { userInfo } = useApp()
  const isAdmin = userInfo?.type === UserTypeEnum.ADMIN
  // current lightbox Viewed photo index。
  const [viewIndex, setViewIndex] = useState(index)

  // Sync viewIndex whenever the viewer is opened with a new index from the gallery
  const prevOpenRef = useRef(open)
  const prevIndexRef = useRef(index)
  useEffect(() => {
    if (open && (!prevOpenRef.current || prevIndexRef.current !== index)) {
      setViewIndex(index)
    }
    prevOpenRef.current = open
    prevIndexRef.current = index
  }, [open, index])
  // infoOpen Control whether the photo information sidebar on the right is expanded。
  const infoOpen = usePhotoStore((state) => state.infoOpen)
  // setInfoOpen Update information sidebar expansion status。
  const setInfoOpen = usePhotoStore((state) => state.setInfoOpen)
  // Current sidebar tab ("info" | "comments")
  const [infoTab, setInfoTab] = useState<"info" | "comments">("info")
  // The original image that has been loaded currently。
  const [originalPhoto, setOriginalPhoto] = useState<OriginalPhoto | null>(null)
  // Current original image loading progress。
  const [originalProgress, setOriginalProgress] = useState<OriginalProgress | null>(null)
  // showOriginalProgress Control whether the original image loading progress is displayed。
  const [showOriginalProgress, setShowOriginalProgress] = useState(false)
  // originalError Record whether the current original image loading is abnormal。
  const [originalError, setOriginalError] = useState(false)
  // Whether the viewer action buttons are currently displayed，Click the picture area to switch，Still forced to hide when zooming in。
  const [showActions, setShowActions] = useState(true)
  // Current photo zoom factor。
  const [zoomLevel, setZoomLevel] = useState(1)
  // Whether it is currently in full screen state.
  const [fullscreenOpen, setFullscreenOpen] = useState(false)
  // Whether cinematic presentation mode is currently active.
  const [isCinematicMode, setIsCinematicMode] = useState(false)
  // Controls UI idle visibility in cinematic mode.
  const [isIdleHidden, setIsIdleHidden] = useState(false)
  const controlsVisible = !isCinematicMode || !isIdleHidden
  // Idle timer reference for auto-hiding controls after inactivity.
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // The current rotation angle of each photo.
  const [photoRotates, setPhotoRotates] = useState<Record<string, number>>({})
  // getPhotoCache Read loaded photos from global photo cache.
  const getPhotoCache = usePhotoStore((state) => state.getPhotoCache)
  // setPhotoCache Write the loaded photos into the global photo cache.
  const setPhotoCache = usePhotoStore((state) => state.setPhotoCache)
  // Cancellation method of current original image request.
  const abortOriginalRef = useRef<(() => void) | null>(null)
  // previewRequestsRef Save the requested preview id and cancellation method.
  const previewRequestsRef = useRef<PreviewRequestMap>(new Map())
  // currentPhotoIdRef Save currently viewed photo id, Used for silent preview request to prevent disorder.
  const currentPhotoIdRef = useRef<string | null>(photos[index]?.photoId ?? null)
  // openScrollYRef Save the page scroll position before opening the viewer, Restore photo list after closing.
  const openScrollYRef = useRef(typeof window === "undefined" ? 0 : window.scrollY)
  // historyPushedRef Records whether the viewer has been written to the browser history.
  const historyPushedRef = useRef(false)
  // onBrowserBackRef Save the latest browser return callback.
  const onBrowserBackRef = useRef(onBrowserBack)
  // originalProgressHideTimerRef Save the timer that delays and hides the original image loading progress.
  const originalProgressHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // slidePointerStartRef Record slide superior pointerdown coordinate, Used to distinguish click and drag switching.
  const slidePointerStartRef = useRef<{ x: number; y: number } | null>(null)
  // viewedInSessionRef Tracks photos viewed in current browser session to prevent duplicate network calls.
  const viewedInSessionRef = useRef<Set<string>>(new Set())
  // State for single-photo insights modal (Admin only)
  const [insightsDialogOpen, setInsightsDialogOpen] = useState(false)
  const [insightsPhotoId, setInsightsPhotoId] = useState<string | null>(null)

  // Toggle cinematic mode with Browser Fullscreen API and graceful fallback.
  const toggleCinematicMode = useCallback(() => {
    setIsCinematicMode((prev) => {
      const next = !prev
      if (next) {
        try {
          if (typeof document !== "undefined" && document.fullscreenEnabled && document.documentElement.requestFullscreen) {
            document.documentElement.requestFullscreen().catch(() => {})
          }
        } catch {
          // Browser Fullscreen API denied or unsupported; fallback overlay handles view via isCinematicMode
        }
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

  // Sync state if user exits browser fullscreen via native controls.
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

  // Bind keyboard shortcut F (toggle cinematic) and Esc (exit cinematic mode first).
  useEffect(() => {
    if (!open) return

    function handleKeyDown(event: KeyboardEvent) {
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
      } else if (event.key === "Escape" && isCinematicMode) {
        event.preventDefault()
        event.stopPropagation()
        toggleCinematicMode()
      }
    }

    window.addEventListener("keydown", handleKeyDown, true)
    return () => {
      window.removeEventListener("keydown", handleKeyDown, true)
    }
  }, [open, isCinematicMode, toggleCinematicMode])

  // Auto-hide UI controls after 2.5s idle when in Cinematic Mode.
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

  // lightbox Required picture list.
  const slides = useMemo<PhotoSlide[]>(() => (
    photos.map((photo) => ({
      photoId: photo.photoId,
      key: photo.key,
      originalSize: photo.size,
      preview: photo.preview || "",
      src: photo.thumbnail || photo.preview || "",
      thumbnail: photo.thumbnail || photo.preview || "",
      thumbHashUrl: getThumbHashUrl(photo.thumbHash),
      albums: photo.albums,
      width: photo.width ?? undefined,
      height: photo.height ?? undefined,
      alt: photo.name,
    }))
  ), [photos])
  const actionsVisible = showActions && zoomLevel <= 1 && controlsVisible

  const onBackRef = useRef(onBack)
  onBackRef.current = onBack

  useEffect(() => {
    // Keep the browser's return callback as the latest method passed in by the parent component。
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

    // Push a history when opening the viewer, close viewer when browser returns.
    function handlePopState() {
      if (typeof window !== "undefined" && window.innerWidth < 768) {
        setInfoOpen(false)
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
  }, [open, setInfoOpen])

  useEffect(() => {
    if (!open) {
      return
    }

    // Interrupt outstanding original image requests when closing the viewer，And restore the list scroll position to before opening。
    return () => {
      if (originalProgressHideTimerRef.current) {
        clearTimeout(originalProgressHideTimerRef.current)
      }
      abortOriginalRef.current?.()
      closePreviewRequests(previewRequestsRef.current)
      requestAnimationFrame(restoreListScroll)
    }
  }, [open])

  // Process the original image loading after photo switching。
  function handleView(nextIndex: number) {
    setViewIndex(nextIndex)

    const photo = photos[nextIndex]
    if (!photo) return
    const preview = photo.preview
    currentPhotoIdRef.current = photo.photoId

    // Sync URL query param ?photoId=... smoothly
    setPhotoIdInUrl(photo.photoId)

    // Track public visitor views (strictly excluded for Admin)
    if (userInfo?.type !== UserTypeEnum.ADMIN && !viewedInSessionRef.current.has(photo.photoId)) {
      viewedInSessionRef.current.add(photo.photoId)
      recordPhotoView(photo.photoId)
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

    if (!preview) {
      return
    }

    // After the current photo is loaded，Then silently warm up the two pictures before and after。
    loadPreviewImage(preview, photo.photoId, currentPhotoIdRef, setOriginalPhoto, previewRequestsRef, getPhotoCache, setPhotoCache, () => {
      if (photos.length < 2) {
        return
      }

      const prevIndex = nextIndex > 0 ? nextIndex - 1 : photos.length - 1
      const nextPhotoIndex = nextIndex < photos.length - 1 ? nextIndex + 1 : 0
      const targets = new Map<string, PhotoVo>()

      if (photos[prevIndex]?.preview) {
        targets.set(photos[prevIndex].photoId, photos[prevIndex])
      }
      if (photos[nextPhotoIndex]?.preview) {
        targets.set(photos[nextPhotoIndex].photoId, photos[nextPhotoIndex])
      }

      targets.forEach((target) => {
        loadPreviewImage(target.preview!, target.photoId, currentPhotoIdRef, setOriginalPhoto, previewRequestsRef, getPhotoCache, setPhotoCache)
      })
    })
  }

  // Manually load the current photo original image。
  function loadOriginalPhoto(slide: PhotoSlide) {
    if (!slide.key) {
      return
    }

    abortOriginalRef.current?.()
    abortOriginalRef.current = loadOriginalImage({
      photoId: slide.photoId,
      src: slide.key,
      totalSize: slide.originalSize,
      setOriginalPhoto,
      setOriginalProgress,
      setShowOriginalProgress,
      setOriginalError,
      abortOriginalRef,
      hideTimerRef: originalProgressHideTimerRef,
      setPhotoCache,
    })
  }

  // Hide viewer action buttons。
  function hideActions() {
    setShowActions(false)
  }

  // Show viewer action buttons。
  function showActionButtons() {
    setShowActions(true)
  }

  // Record slide Coordinates when pressed。
  function handleSlidePointerDown(event: React.PointerEvent<HTMLDivElement>) {
    slidePointerStartRef.current = { x: event.clientX, y: event.clientY }
  }

  // If the displacement is very small when lifting, it will be regarded as a click.，Toggle action button；Not processed when dragging to switch photos。
  function handleSlidePointerUp(event: React.PointerEvent<HTMLDivElement>) {
    if (zoomLevel > 1) {
      slidePointerStartRef.current = null
      return
    }

    const start = slidePointerStartRef.current
    slidePointerStartRef.current = null
    if (!start) {
      return
    }

    const dx = Math.abs(event.clientX - start.x)
    const dy = Math.abs(event.clientY - start.y)
    if (dx > 10 || dy > 10) {
      return
    }

    setShowActions((prev) => !prev)
  }

  // Cancel pointer clear the starting coordinates。
  function handleSlidePointerCancel() {
    slidePointerStartRef.current = null
  }

  // based on photos id Rotate the corresponding photo clockwise 90 Spend。
  function rotatePhoto(photoId: string) {
    setPhotoRotates((prev) => ({
      ...prev,
      [photoId]: (prev[photoId] ?? 0) + 90,
    }))
  }

  // Restore the page scroll position to before opening the viewer，offset lightbox Focus scrolling when closed。
  function restoreListScroll() {
    window.scrollTo(0, openScrollYRef.current)
  }

  // Close the viewer and sync clear the browser history written by the viewer.
  function closeViewer() {
    if (historyPushedRef.current) {
      historyPushedRef.current = false
      try {
        window.history.back()
      } catch {}
    }

    removePhotoIdFromUrl()
    onBackRef.current?.()
  }

  // Sidebar narrows when expanded lightbox width, Leave space for the information panel on the right.
  const lightboxClassName = isCinematicMode
    ? "w-full fixed inset-0 z-50 bg-black transition-colors duration-300"
    : infoOpen && !fullscreenOpen
    ? "w-0 md:w-[calc(100%-(0.25rem*84))]"
    : "w-full"

  // rendering yet-another-react-lightbox Minimal preview.
  return (
    <>
      <Lightbox
        className={lightboxClassName}
        open={open}
        close={() => {
          if (isCinematicMode) {
            toggleCinematicMode()
          }
          closeViewer()
          // Reset zoom on close
          setZoomLevel(1)
        }}
        index={viewIndex}
        slides={slides}
        portal={{
          container: {
            style: photoViewerPortalStyle,
          },
        }}
        plugins={fullscreenOpen || isCinematicMode ? [Fullscreen, Zoom] : [Thumbnails, Fullscreen, Zoom]}
        zoom={{
          scrollToZoom: true,
          wheelZoomDistanceFactor: 100,
          maxZoomPixelRatio: 1.2,
          doubleClickMaxStops: 2,
        }}
        toolbar={{
          buttons: [],
        }}
        carousel={{
          spacing: 0,
          preload: innerWidth < 768 ? 10 : 22,
        }}
        animation={{
          fade: 250,
          easing: {
            fade: "ease-out",
            navigation: "cubic-bezier(0.22, 1, 0.36, 1)",
          },
        }}
        thumbnails={{
          width: innerWidth < 768 ? 46 : 75,
          height: innerWidth < 768 ? 46 : 75,
          gap: 0,
          padding: 0,
          border: 0,
          borderRadius: 0,
          imageFit: "cover",
          vignette: false,
        }}
        on={{
          exiting: () => {
            restoreListScroll()
          },
          view: ({ index }) => {
            handleView(index)
          },
          zoom: ({ zoom }) => {
            setZoomLevel(zoom)
          },
          enterFullscreen: () => {
            setFullscreenOpen(true)
            hideActions()
          },
          exitFullscreen: () => {
            setFullscreenOpen(false)
            showActionButtons()
          },
        }}
        render={{
          buttonPrev: () => <PrevButton key="prev" showActions={actionsVisible} />,
          buttonNext: () => <NextButton key="next" showActions={actionsVisible} />,
          controls: () => (
            <>
              {infoOpen && !fullscreenOpen && !isCinematicMode && (
                <PhotoViewerBlurBackground thumbHash={photos[viewIndex]?.thumbHash} />
              )}
              {infoOpen && !fullscreenOpen && !isCinematicMode && (
                <PhotoInfoSidebar
                  photo={photos[viewIndex] ?? null}
                  activeTab={infoTab}
                  onTabChange={setInfoTab}
                  onClose={() => setInfoOpen(false)}
                  onPhotoUpdate={onPhotoUpdate}
                  onAlbumOpen={onAlbumOpen ? (photoId) => onAlbumOpen([photoId]) : undefined}
                  onInsightsOpen={isAdmin ? (photoId) => {
                    setInsightsPhotoId(photoId)
                    setInsightsDialogOpen(true)
                  } : undefined}
                />
              )}
              <CloseButton showActions={actionsVisible} />
              {/* Right-side toolbar */}
              <div
                className={[
                  "absolute top-2 right-2 md:top-3 md:right-4 z-40 flex items-center gap-1.5",
                  getActionVisibleClass(actionsVisible),
                ].join(" ")}
              >
                {!isCinematicMode && (
                  <>
                    {isAdmin && onPhotoDelete && (
                      <DeleteButton showActions={actionsVisible} onDelete={onPhotoDelete} />
                    )}
                    {isAdmin && onAlbumOpen && (
                      <AddToAlbumButton showActions={actionsVisible} onAlbumOpen={onAlbumOpen} />
                    )}
                    <LoadOriginalButton
                      showActions={actionsVisible}
                      originalPhoto={originalPhoto}
                      getPhotoCache={getPhotoCache}
                      onLoadOriginal={loadOriginalPhoto}
                    />
                    <RotateButton showActions={actionsVisible} onRotate={rotatePhoto} />
                    <ShareButton showActions={actionsVisible} />
                    <CommentsButton
                      showActions={actionsVisible}
                      open={infoOpen && infoTab === "comments"}
                      onToggle={() => {
                        if (infoOpen && infoTab === "comments") {
                          setInfoOpen(false)
                        } else {
                          setInfoTab("comments")
                          setInfoOpen(true)
                        }
                      }}
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
              <AlbumOverlayBadge isCinematicMode={isCinematicMode} />
            </>
          ),
          buttonFullscreen: () => null,
          buttonZoom: () => null,
          slide: ({ slide }) => {
            if (!isImageSlide(slide)) {
              return null
            }

            const photoSlide = slide as PhotoSlide

            return (
              <div
                className="relative flex h-full w-full items-center justify-center overflow-hidden p-2 md:p-4 pt-[env(safe-area-inset-top,8px)] pb-[env(safe-area-inset-bottom,8px)]"
                onPointerDown={handleSlidePointerDown}
                onPointerUp={handleSlidePointerUp}
                onPointerCancel={handleSlidePointerCancel}
              >
                {photoSlide.thumbHashUrl && (
                  <img
                    src={photoSlide.thumbHashUrl}
                    alt=""
                    className="absolute inset-0 h-full w-full scale-110 blur-sm"
                    aria-hidden
                  />
                )}
                <PhotoSlideImage
                  slide={photoSlide}
                  originalPhoto={originalPhoto}
                  rotate={photoRotates[photoSlide.photoId] ?? 0}
                  fullscreenOpen={fullscreenOpen || isCinematicMode}
                />
              </div>
            )
          },
          thumbnail: ({ slide, rect }) => {
            if (!isImageSlide(slide)) {
              return null
            }

            const photoSlide = slide as PhotoSlide

            return (
              <div
                className="relative overflow-hidden thumbnail-bg"
                style={{
                  width: rect.width,
                  height: rect.height,
                }}
              >
                {photoSlide.thumbHashUrl && (
                  <img
                    src={photoSlide.thumbHashUrl}
                    alt=""
                    className="absolute inset-0 h-full w-full scale-110 blur-sm object-cover"
                    aria-hidden
                  />
                )}
                <img
                  src={photoSlide.thumbnail}
                  alt={photoSlide.alt}
                  width={photoSlide.width}
                  height={photoSlide.height}
                  draggable={false}
                  className="h-full w-full select-none object-cover"
                  crossOrigin="anonymous"
                  onError={(event) => {
                    event.currentTarget.style.display = "none"
                  }}
                />
              </div>
            )
          }
        }}
      />
      {isAdmin && (
        <PhotoInsightsDialog
          open={insightsDialogOpen}
          onOpenChange={setInsightsDialogOpen}
          photoId={insightsPhotoId}
        />
      )}
    </>
  )
}
