"use client"

import { type CSSProperties, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import Lightbox from "yet-another-react-lightbox"
import { isImageSlide, type SlideImage, useController, useLightboxState } from "yet-another-react-lightbox"
import Fullscreen from "yet-another-react-lightbox/plugins/fullscreen"
import Thumbnails from "yet-another-react-lightbox/plugins/thumbnails"
import Zoom from "yet-another-react-lightbox/plugins/zoom"
import { ArrowLeftIcon, ChevronLeftIcon, ChevronRightIcon, CircleAlertIcon, CircleIcon, FolderIcon, FolderPlusIcon, LockIcon, Menu, LoaderCircleIcon, MaximizeIcon, MessageSquare, MinimizeIcon, PanelRightClose, PanelRightOpen, RotateCcwSquare, Share2Icon, Sparkles, Trash2Icon } from "lucide-react"
import { toast } from "sonner"

import { PhotoInfoSidebar, PhotoViewerBlurBackground, formatAlbumList } from "@/components/photo/photo-info-sidebar"
import { PhotoInsightsDialog } from "@/components/photo/photo-insights-dialog"
import { PhotoStoryDialog } from "@/components/photo/photo-story-dialog"
import { PhotoBatchEditDialog } from "@/components/photo/photo-batch-edit-dialog"
import { cn } from "@/lib/utils"
import { InstagramIcon } from "@/components/icons/instagram"
import { useTapAction } from "@/hooks/use-tap-action"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { getThumbHashUrl } from "@/lib/thumb-hash"
import { removePhotoIdFromUrl, setPhotoIdInUrl, toProxyMediaUrl } from "@/lib/url"
import { recordPhotoShare, recordPhotoView } from "@/request/insights"
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
  // Current photo id.
  photoId: string
  // Original image request address.
  src: string
  // Original image file size, for no return total Show progress at the bottom of the pocket.
  totalSize: number
  // Save the original image that has been loaded.
  setOriginalPhoto: (photo: OriginalPhoto | null) => void
  // Save original image loading progress.
  setOriginalProgress: (progress: OriginalProgress | null) => void
  // Control whether the original image loading progress is displayed.
  setShowOriginalProgress: (show: boolean) => void
  // Save the current original image to check whether the loading is abnormal..
  setOriginalError: (error: boolean) => void
  // Cancel method of saving current original image request.
  abortOriginalRef: { current: (() => void) | null }
  // Original image loading progress delay hidden timer.
  hideTimerRef: { current: ReturnType<typeof setTimeout> | null }
  // Save the loaded photo cache.
  setPhotoCache: (photoId: string, src: string) => void
}

const photoViewerPortalStyle: CSSProperties & { "--yarl__portal_zindex": number } = {
  "--yarl__portal_zindex": 1000,
  zIndex: 1000,
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

  // Clean up the current request reference after the request ends, Avoid subsequent switching from accidentally canceling completed requests.
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

  // After the request is completed, only clean up your own records, Prevent old requests from deleting new requests.
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

// Render the previous button.
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

// Render next button.
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

// Render full screen button.
function FullscreenButton({
  fullscreen,
  enter,
  showActions,
  onHideActions,
}: FullscreenButtonProps & {
  showActions: boolean
  onHideActions: () => void
}) {
  // Hide viewer action buttons after entering full screen state.
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
              "relative rounded-full text-white transition-opacity duration-200",
              open ? "bg-black/70 hover:bg-black/70 border border-white/30" : "bg-black/40 hover:bg-black/50",
            ].join(" ")}
            {...tap}
          >
            <Menu className="md:hidden" />
            {open
              ? <PanelRightClose className="hidden md:block" />
              : <PanelRightOpen className="hidden md:block" />}
            <span className="sr-only">Photo information & comments</span>
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          <p>Information & Comments</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

// Render dynamic dominant-color ambient glow mode toggle button in toolbar (unused).
function AmbientGlowButton({
  showActions,
  active,
  onToggle,
}: {
  showActions: boolean
  active: boolean
  onToggle: () => void
}) {
  const tap = useTapAction(onToggle)

  return null
}

// Render full-screen dynamic dominant-color ambient backlight glow.
function PhotoViewerAmbientGlow({
  thumbHash,
  visible = true,
  dragOpacity = 1,
}: {
  thumbHash?: string | null
  visible?: boolean
  dragOpacity?: number
}) {
  const thumbHashUrl = useMemo(() => getThumbHashUrl(thumbHash), [thumbHash])

  if (!thumbHashUrl || !visible) return null

  return (
    <div
      className="fixed inset-0 z-[-5] pointer-events-none select-none flex items-center justify-center overflow-hidden transition-opacity duration-300"
      style={{ opacity: dragOpacity }}
    >
      <img
        src={thumbHashUrl}
        alt=""
        className="w-[85vw] h-[85vh] max-w-[1400px] max-h-[1000px] rounded-full blur-[80px] md:blur-[140px] opacity-65 dark:opacity-75 scale-125 object-cover pointer-events-none transition-all duration-700 ease-out"
        aria-hidden
      />
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: "radial-gradient(circle at 50% 50%, transparent 25%, rgba(0,0,0,0.85) 85%)",
        }}
      />
    </div>
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
      className="rounded-full bg-gradient-to-tr from-pink-600 via-rose-500 to-amber-500 text-white transition-all duration-200 hover:scale-110 hover:opacity-100 shadow-md shadow-pink-500/30 border border-white/20 cursor-pointer"
      title={t("createStory")}
      {...tap}
    >
      <InstagramIcon className="size-4" />
      <span className="sr-only">{t("storyCard")}</span>
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
    <div className="absolute top-14 left-2 md:top-16 md:left-3 z-40 flex items-center gap-1.5 rounded-full bg-black/75 px-3 py-1 text-xs text-white backdrop-blur-md border border-white/15 shadow-lg select-none max-w-[85vw] md:max-w-md truncate">
      <FolderIcon className="size-3.5 text-primary shrink-0" />
      <span className="font-medium text-white/70 shrink-0">In Albums:</span>
      <span className="font-semibold text-white truncate" title={albumText}>
        {albumText}
      </span>
    </div>
  )
}

// Floating iOS Liquid Glass Quick Comment & Info Pill (Mobile-only)
function MobileQuickCommentPill({
  showActions,
  isCinematicMode,
  onOpenComments,
  onOpenInfo,
}: {
  showActions: boolean
  isCinematicMode: boolean
  onOpenComments: () => void
  onOpenInfo: () => void
}) {
  if (isCinematicMode) return null

  return (
    <div
      className={[
        "fixed left-3 bottom-14 sm:bottom-16 z-40 md:hidden flex items-center transition-all duration-300 pointer-events-auto select-none",
        getActionVisibleClass(showActions),
      ].join(" ")}
    >
      <div className="flex items-center gap-1 p-1 rounded-full bg-black/65 dark:bg-zinc-950/80 backdrop-blur-2xl border border-white/20 shadow-[0_8px_32px_rgba(0,0,0,0.65),0_0_0_1px_rgba(255,255,255,0.1)_inset] ring-1 ring-black/40">
        {/* Comment Trigger Button */}
        <button
          type="button"
          onClick={onOpenComments}
          className="group flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold text-white bg-white/10 hover:bg-white/20 active:scale-95 transition-all duration-200 border border-white/10"
          aria-label="Open Comments"
        >
          <MessageSquare className="size-3.5 text-white/90 transition-transform group-hover:scale-110" />
          <span className="tracking-wide">Comment</span>
        </button>

        {/* Info Trigger Button */}
        <button
          type="button"
          onClick={onOpenInfo}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-full text-xs font-medium text-white/75 hover:text-white hover:bg-white/15 active:scale-95 transition-all duration-200"
          aria-label="Photo Details"
        >
          <CircleAlertIcon className="size-3.5 text-white/80" />
          <span className="text-[11px] font-medium">Info</span>
        </button>
      </div>
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

// Render a single photo with progressive high-res loading, progress feedback, and fallback
function PhotoSlideImage({
  slide,
  originalPhoto,
  rotate,
  fullscreenOpen,
}: {
  // Current photo slide.
  slide: PhotoSlide
  // The currently loaded original image.
  originalPhoto: OriginalPhoto | null
  // Current photo CSS rotation angle.
  rotate: number
  // Whether it is currently in full screen state.
  fullscreenOpen: boolean
}) {
  const initialSrc = originalPhoto?.key === slide.preview || originalPhoto?.key === slide.key
    ? originalPhoto.key
    : slide.src || slide.preview || slide.thumbnail || ""
  const [currentSrc, setCurrentSrc] = useState<string>(initialSrc)
  const [loaded, setLoaded] = useState(false)
  const [showHdBadge, setShowHdBadge] = useState(false)

  useEffect(() => {
    const targetSrc = originalPhoto?.key === slide.preview || originalPhoto?.key === slide.key
      ? originalPhoto.key
      : slide.src || slide.preview || slide.thumbnail || ""
    setCurrentSrc(targetSrc)
    setLoaded(false)
    setShowHdBadge(false)
  }, [slide.src, slide.preview, slide.thumbnail, originalPhoto?.key])

  const handleImageLoaded = () => {
    setLoaded(true)
    setShowHdBadge(true)
    setTimeout(() => {
      setShowHdBadge(false)
    }, 1400)
  }

  const normalizedRotate = rotate % 360
  const sideways = normalizedRotate === 90 || normalizedRotate === 270
  const thumbnailHeight = typeof window !== "undefined" && window.innerWidth < 768 ? 46 : 75
  const rotateWidthOffset = fullscreenOpen ? 0 : thumbnailHeight

  return (
    <div className="relative flex h-full w-full items-center justify-center overflow-hidden">
      {/* Top Streaming Indeterminate Progress Line */}
      {!loaded && (
        <div className="pointer-events-none absolute top-0 left-0 right-0 h-1 z-30 overflow-hidden bg-white/10">
          <div className="h-full w-1/3 bg-gradient-to-r from-emerald-500 via-teal-300 to-emerald-500 rounded-full hd-progress-indeterminate shadow-[0_0_8px_rgba(16,185,129,0.8)]" />
        </div>
      )}

      {/* Floating Glassmorphic Progress Badge (Active while HD streaming) */}
      {!loaded && (
        <div className="pointer-events-none absolute bottom-14 sm:bottom-20 z-30 flex flex-col items-center gap-1.5 rounded-2xl bg-black/80 px-4 py-2 text-xs font-medium text-white shadow-2xl backdrop-blur-xl border border-white/20 animate-in fade-in zoom-in-95 duration-200">
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
      {loaded && showHdBadge && (
        <div className="pointer-events-none absolute bottom-14 sm:bottom-20 z-30 flex items-center gap-1.5 rounded-full bg-emerald-950/85 px-3.5 py-1 text-xs font-medium text-emerald-300 shadow-xl backdrop-blur-xl border border-emerald-500/30 animate-in fade-in zoom-in-95 duration-200">
          <Sparkles className="size-3 text-emerald-400 shrink-0" />
          <span className="font-semibold text-[11px] sm:text-xs">HD Quality Ready</span>
        </div>
      )}

      {/* Instant placeholder while HD image streams in */}
      {slide.thumbHashUrl && !loaded && (
        <img
          src={slide.thumbHashUrl}
          alt=""
          aria-hidden
          className="absolute select-none max-w-none object-contain pointer-events-none transition-opacity duration-300"
          style={{
            width: sideways ? `calc(100cqh - ${rotateWidthOffset}px)` : "100%",
            height: sideways ? "100vw" : "100%",
            transform: `rotate(${rotate}deg) translateZ(0)`,
          }}
        />
      )}
      <img
        src={currentSrc}
        alt={slide.alt}
        draggable={false}
        decoding="async"
        className="lightbox-zoom-matrix select-none max-w-none object-contain transition-opacity duration-200"
        onLoad={handleImageLoaded}
        onError={() => {
          if (currentSrc && !currentSrc.startsWith('/media/')) {
            setCurrentSrc(toProxyMediaUrl(currentSrc))
          } else if (slide.thumbnail && currentSrc !== slide.thumbnail) {
            setCurrentSrc(slide.thumbnail)
          }
        }}
        style={{
          width: sideways ? `calc(100cqh - ${rotateWidthOffset}px)` : "100%",
          height: sideways ? "100vw" : "100%",
          transform: `rotate(${rotate}deg) translateZ(0)`,
          transformStyle: "preserve-3d",
          backfaceVisibility: "hidden",
          imageRendering: "-webkit-optimize-contrast",
          willChange: "transform",
          opacity: loaded ? 1 : 0,
        }}
      />
    </div>
  )
}

// Render photo detail viewer, The parent component is responsible for passing in the current photo and list data.
export function PhotoViewer({ open, index, photos, onBack, onBrowserBack, onPhotoDelete, onPhotoUpdate, onAlbumOpen }: PhotoViewerProps) {
  const { userInfo } = useApp()
  const isAdmin = userInfo?.type === UserTypeEnum.ADMIN
  // current lightbox Viewed photo index.
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

  // Speculative Adjacent Photo HD Prefetcher via requestIdleCallback
  useEffect(() => {
    if (!open || typeof window === "undefined") return

    const prefetchAdjacent = () => {
      const nextPhoto = photos[viewIndex + 1]
      const prevPhoto = photos[viewIndex - 1]

      if (nextPhoto?.preview) {
        const nextImg = new Image()
        nextImg.decoding = "async"
        nextImg.src = nextPhoto.preview
      }
      if (prevPhoto?.preview) {
        const prevImg = new Image()
        prevImg.decoding = "async"
        prevImg.src = prevPhoto.preview
      }
    }

    if ("requestIdleCallback" in window) {
      const handle = window.requestIdleCallback(prefetchAdjacent, { timeout: 300 })
      return () => window.cancelIdleCallback(handle)
    } else {
      const timer = setTimeout(prefetchAdjacent, 100)
      return () => clearTimeout(timer)
    }
  }, [open, viewIndex, photos])
  // infoOpen Control whether the photo information sidebar on the right is expanded.
  const infoOpen = usePhotoStore((state) => state.infoOpen)
  // setInfoOpen Update information sidebar expansion status.
  const setInfoOpen = usePhotoStore((state) => state.setInfoOpen)
  // Current sidebar tab ("info" | "comments")
  const [infoTab, setInfoTab] = useState<"info" | "comments">("info")
  // The original image that has been loaded currently.
  const [originalPhoto, setOriginalPhoto] = useState<OriginalPhoto | null>(null)
  // Current original image loading progress.
  const [originalProgress, setOriginalProgress] = useState<OriginalProgress | null>(null)
  // showOriginalProgress Control whether the original image loading progress is displayed.
  const [showOriginalProgress, setShowOriginalProgress] = useState(false)
  // originalError Record whether the current original image loading is abnormal.
  const [originalError, setOriginalError] = useState(false)
  // Whether the viewer action buttons are currently displayed, Click the picture area to switch, Still forced to hide when zooming in.
  const [showActions, setShowActions] = useState(true)
  // Current photo zoom factor.
  const [zoomLevel, setZoomLevel] = useState(1)
  // Whether it is currently in full screen state.
  const [fullscreenOpen, setFullscreenOpen] = useState(false)
  // Whether cinematic presentation mode is currently active.
  const [isCinematicMode, setIsCinematicMode] = useState(false)
  // Dynamic Cinema Ambient Glow mode state (default true).
  const [ambientGlow, setAmbientGlow] = useState(true)
  // Drag-to-dismiss gesture state (supports bidirectional vertical dismiss: swipe up or swipe down)
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number } | null>(null)
  const [isDismissing, setIsDismissing] = useState(false)
  const [dismissDirection, setDismissDirection] = useState<"up" | "down">("down")
  const dragPointerStartRef = useRef<{ x: number; y: number; time: number } | null>(null)
  const isDraggingRef = useRef(false)
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
  // State for Instagram Story Card generator dialog
  const [storyDialogOpen, setStoryDialogOpen] = useState(false)
  // State for batch edit metadata dialog (Admin only)
  const [batchEditDialogOpen, setBatchEditDialogOpen] = useState(false)

  // Track if any overlay modal dialog is open on top of the lightbox
  const isAnySubModalOpen = storyDialogOpen || insightsDialogOpen || batchEditDialogOpen

  // References to track open state of sub-modals for mobile back gestures
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

  // Hook mobile back gesture for photo info sidebar / comments drawer on mobile (<768px)
  useModalBackHandler(open && infoOpen && typeof window !== "undefined" && window.innerWidth < 768, (val) => setInfoOpen(val))

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

  // Bind keyboard shortcut F (cinematic), G (ambient glow), and Esc (exit cinematic mode).
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
      } else if (event.key === "g" || event.key === "G") {
        event.preventDefault()
        setAmbientGlow((prev) => !prev)
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

  // lightbox Required picture list - uses HD preview as primary source
  const slides = useMemo<PhotoSlide[]>(() => (
    photos.map((photo) => ({
      photoId: photo.photoId,
      key: photo.key,
      originalSize: photo.size,
      preview: photo.preview || photo.key || photo.thumbnail || "",
      src: photo.preview || photo.key || photo.thumbnail || "",
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
    // Keep the browser's return callback as the latest method passed in by the parent component.
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

    // Push a history when opening the viewer, close sub-modals/viewer when browser returns.
    function handlePopState() {
      // If a sub-modal/sheet (Story Card, Insights, or Mobile Info Sidebar) was open,
      // its own dedicated back handler hook manages closing it. PhotoViewer ignores that pop.
      if (
        storyDialogOpenRef.current ||
        insightsDialogOpenRef.current ||
        batchEditDialogOpenRef.current ||
        (infoOpenRef.current && typeof window !== "undefined" && window.innerWidth < 768) ||
        isCinematicModeRef.current
      ) {
        return
      }

      // Otherwise close PhotoViewer back to previous page / masonry grid
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

    // Pre-warm adjacent slides immediately on open for instant 0ms slide transitions
    const currIdx = indexRef.current
    const prevPhoto = photosRef.current[currIdx > 0 ? currIdx - 1 : photosRef.current.length - 1]
    const nextPhoto = photosRef.current[currIdx < photosRef.current.length - 1 ? currIdx + 1 : 0]
    if (prevPhoto?.preview) {
      loadPreviewImage(prevPhoto.preview, prevPhoto.photoId, currentPhotoIdRef, setOriginalPhoto, previewRequestsRef, getPhotoCache, setPhotoCache)
    }
    if (nextPhoto?.preview) {
      loadPreviewImage(nextPhoto.preview, nextPhoto.photoId, currentPhotoIdRef, setOriginalPhoto, previewRequestsRef, getPhotoCache, setPhotoCache)
    }

    return () => {
      window.removeEventListener("popstate", handlePopState)
      removePhotoIdFromUrl()
    }
  }, [open, setInfoOpen])

  useEffect(() => {
    if (!open) {
      return
    }

    // Interrupt outstanding original image requests when closing the viewer, And restore the list scroll position to before opening.
    return () => {
      if (originalProgressHideTimerRef.current) {
        clearTimeout(originalProgressHideTimerRef.current)
      }
      abortOriginalRef.current?.()
      closePreviewRequests(previewRequestsRef.current)
      requestAnimationFrame(restoreListScroll)
    }
  }, [open])

  // Process the original image loading after photo switching.
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

    // After the current photo is loaded, Then silently warm up the two pictures before and after.
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

  // Manually load the current photo original image.
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

  // Hide viewer action buttons.
  function hideActions() {
    setShowActions(false)
  }

  // Show viewer action buttons.
  function showActionButtons() {
    setShowActions(true)
  }

  // Double-tap & single-tap resolution refs
  const lastTapTimeRef = useRef<number>(0)
  const singleTapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Record slide coordinates and begin tracking fluid bidirectional drag-to-dismiss gesture.
  function handleSlidePointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (zoomLevel > 1 || infoOpen) return
    dragPointerStartRef.current = { x: event.clientX, y: event.clientY, time: Date.now() }
    isDraggingRef.current = false
  }

  // Track pointer movement and calculate fluid scaled drag-to-dismiss displacement (both UP and DOWN).
  function handleSlidePointerMove(event: React.PointerEvent<HTMLDivElement>) {
    if (!dragPointerStartRef.current || zoomLevel > 1 || isDismissing || infoOpen) return

    const dx = event.clientX - dragPointerStartRef.current.x
    const dy = event.clientY - dragPointerStartRef.current.y
    const absDx = Math.abs(dx)
    const absDy = Math.abs(dy)

    // Trigger vertical drag-to-dismiss on deliberate vertical gesture (both upward and downward)
    if (!isDraggingRef.current) {
      if (absDy > 6 && absDy > absDx * 1.05) {
        isDraggingRef.current = true
      } else {
        return
      }
    }

    if (isDraggingRef.current) {
      setDragOffset({ x: dx * 0.35, y: dy })
    }
  }

  // Handle pointer release: Dismiss with fluid spring momentum (up or down) or snap back to center.
  function handleSlidePointerUp(event: React.PointerEvent<HTMLDivElement>) {
    const start = dragPointerStartRef.current
    dragPointerStartRef.current = null

    if (!start) return

    const dx = event.clientX - start.x
    const dy = event.clientY - start.y
    const dt = Math.max(1, Date.now() - start.time)
    const absDy = Math.abs(dy)
    const velocity = absDy / dt
    const isUp = dy < 0

    if (isDraggingRef.current && (absDy > 95 || (absDy > 40 && velocity > 0.42))) {
      // Dismiss photo with fluid spring exit animation in the swipe direction (up or down)
      setDismissDirection(isUp ? "up" : "down")
      setIsDismissing(true)
      setTimeout(() => {
        setIsDismissing(false)
        setDragOffset(null)
        isDraggingRef.current = false
        closeViewer()
      }, 220)
    } else {
      // Snap back to center with spring curve
      setDragOffset(null)
      isDraggingRef.current = false

      // Distinguish Single Tap (toggle UI) vs Double Tap (Smart Zoom):
      if (Math.abs(dx) < 10 && Math.abs(dy) < 10) {
        const now = Date.now()
        const timeSinceLastTap = now - lastTapTimeRef.current

        if (timeSinceLastTap < 300) {
          // Double Tap: Cancel single-tap timer so Lightbox Zoom plugin can handle zoom cleanly
          if (singleTapTimerRef.current) {
            clearTimeout(singleTapTimerRef.current)
            singleTapTimerRef.current = null
          }
          lastTapTimeRef.current = 0
        } else {
          lastTapTimeRef.current = now
          if (singleTapTimerRef.current) {
            clearTimeout(singleTapTimerRef.current)
          }
          singleTapTimerRef.current = setTimeout(() => {
            if (zoomLevel <= 1) {
              setShowActions((prev) => !prev)
            }
            singleTapTimerRef.current = null
          }, 280)
        }
      }
    }
  }

  // Cancel pointer: smoothly restore center position.
  function handleSlidePointerCancel() {
    dragPointerStartRef.current = null
    isDraggingRef.current = false
    setDragOffset(null)
  }

  // based on photos id Rotate the corresponding photo clockwise 90 Spend.
  function rotatePhoto(photoId: string) {
    setPhotoRotates((prev) => ({
      ...prev,
      [photoId]: (prev[photoId] ?? 0) + 90,
    }))
  }

  // Restore the page scroll position to before opening the viewer, offset lightbox Focus scrolling when closed.
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
        className={cn(
          lightboxClassName,
          isAnySubModalOpen && "pointer-events-none select-none touch-none yarl-modal-active"
        )}
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
          scrollToZoom: !isAnySubModalOpen,
          wheelZoomDistanceFactor: isAnySubModalOpen ? 0 : 100,
          maxZoomPixelRatio: 3,
          doubleClickMaxStops: 2,
          doubleClickDelay: 300,
          doubleTapDelay: 300,
        }}
        toolbar={{
          buttons: [],
        }}
        carousel={{
          spacing: 0,
          preload: isAnySubModalOpen ? 0 : (innerWidth < 768 ? 10 : 22),
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
          controls: () => {
            const currentDragAbsY = Math.abs(dragOffset?.y ?? 0)
            const dragBackdropOpacity = dragOffset
              ? Math.max(0.2, 1 - currentDragAbsY / 450)
              : isDismissing
              ? 0
              : 1

            return (
              <>
                {/* Dynamic Cinema Ambient Glow (Apple Music / YouTube Ambient Mode) */}
                <PhotoViewerAmbientGlow
                  thumbHash={photos[viewIndex]?.thumbHash}
                  visible={ambientGlow && !fullscreenOpen}
                  dragOpacity={dragBackdropOpacity}
                />
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
                    onStoryOpen={() => setStoryDialogOpen(true)}
                    onBatchEditOpen={isAdmin ? () => setBatchEditDialogOpen(true) : undefined}
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
                      <StoryCardButton showActions={actionsVisible} onOpenStory={() => setStoryDialogOpen(true)} />
                      <ShareButton showActions={actionsVisible} />
                      <InfoButton
                        showActions={actionsVisible}
                        open={infoOpen}
                        onToggle={() => {
                          if (infoOpen) {
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
                <MobileQuickCommentPill
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
              </>
            )
          },
          buttonFullscreen: () => null,
          buttonZoom: () => null,
          slide: ({ slide }) => {
            if (!isImageSlide(slide)) {
              return null
            }

            const photoSlide = slide as PhotoSlide
            const currentDragY = dragOffset?.y ?? 0
            const currentDragX = dragOffset?.x ?? 0
            const currentDragAbsY = Math.abs(currentDragY)
            const dragScale = dragOffset ? Math.max(0.72, 1 - currentDragAbsY / 1000) : 1
            const dragRotate = dragOffset ? currentDragX * 0.02 : 0

            const slideTransformStyle: CSSProperties = isDismissing
              ? {
                  transform: dismissDirection === "up"
                    ? "translate3d(0, -110vh, 0) scale(0.75)"
                    : "translate3d(0, 110vh, 0) scale(0.75)",
                  opacity: 0,
                  transition: "transform 0.24s cubic-bezier(0.32, 0, 0.67, 0), opacity 0.24s ease-in",
                }
              : dragOffset
              ? {
                  transform: `translate3d(${currentDragX * 0.35}px, ${currentDragY}px, 0) scale(${dragScale}) rotate(${dragRotate}deg)`,
                  transition: "none",
                }
              : {
                  transform: "translate3d(0, 0, 0) scale(1) rotate(0deg)",
                  transition: "transform 0.35s cubic-bezier(0.34, 1.56, 0.64, 1)",
                }

            return (
              <div
                className="relative flex h-full w-full items-center justify-center overflow-hidden p-2 md:p-4 pt-[env(safe-area-inset-top,8px)] pb-[env(safe-area-inset-bottom,8px)] touch-none select-none"
                onPointerDown={handleSlidePointerDown}
                onPointerMove={handleSlidePointerMove}
                onPointerUp={handleSlidePointerUp}
                onPointerCancel={handleSlidePointerCancel}
                style={slideTransformStyle}
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
                  onError={(event) => {
                    const el = event.currentTarget
                    if (el.src && !el.src.includes('/media/')) {
                      el.src = toProxyMediaUrl(photoSlide.thumbnail)
                    } else {
                      el.style.display = "none"
                    }
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
    </>
  )
}
