"use client"

import { memo, useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from "react"
import { FolderIcon, MapPin, PinIcon, Play } from "lucide-react"
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
import { useUserLocation } from "@/hooks/use-user-location"
import { calculateDistance, formatDistance } from "@/lib/geo"
import { PhotoHeartBurst } from "@/components/photo/photo-heart-burst"
import { PhotoQuickPeek } from "@/components/photo/photo-quick-peek"
import { reactionSync } from "@/lib/reaction-sync"
import { trackVisitorMedia } from "@/hooks/use-visitor-tracker"
import { recordPhotoView } from "@/request/insights"

import { type HeroTransitionOrigin } from "@/components/photo/hero-photo-transition"
import { videoCoordinator } from "@/lib/video-autoplay-coordinator"
import { useAdaptivePerformance } from "@/hooks/use-adaptive-performance"
import { prebufferVideo } from "@/lib/video-prebuffer"

type TouchHoverCloseRef = {
  current: (() => void) | null
}

type PhotoCardProps = RenderComponentProps<PhotoVo> & {
  selected?: boolean
  selectionActive?: boolean
  onOpen?: (origin?: HeroTransitionOrigin) => void
  onSelectedChange?: (photoId: string, selected: boolean) => void
  onPhotoPin?: (photoId: string, isPinned: boolean) => void
  touchHoverCloseRef?: TouchHoverCloseRef
}

// Format video playback time (e.g. 0:03).
function formatVideoTime(totalSeconds: number): string {
  if (isNaN(totalSeconds) || totalSeconds < 0) return "0:00"
  const m = Math.floor(totalSeconds / 60)
  const s = Math.floor(totalSeconds % 60)
  return `${m}:${s < 10 ? "0" : ""}${s}`
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

// Global set of prefetched high-res preview URLs to prevent duplicate background downloads
const prefetchedPreviewUrls = new Set<string>()

// Session-level memory cache of successfully loaded and painted thumbnail URLs
export const loadedThumbnails = new Set<string>()

// Session-level set of photos that have already played their entrance reveal animation
const revealedPhotoIds = new Set<string>()


/**
 * Predictively prefetch a photo's high-resolution preview into browser cache.
 */
function prefetchPhotoHighRes(previewUrl?: string | null) {
  if (!previewUrl || typeof window === "undefined" || prefetchedPreviewUrls.has(previewUrl)) return
  prefetchedPreviewUrls.add(previewUrl)

  // Bound set size to prevent memory leaks during long browsing sessions
  if (prefetchedPreviewUrls.size > 1000) {
    const oldest = prefetchedPreviewUrls.values().next().value
    if (oldest) prefetchedPreviewUrls.delete(oldest)
  }

  const run = () => {
    const img = new Image()
    img.crossOrigin = "anonymous"
    img.decoding = "async"
    if ("fetchPriority" in img) {
      ;(img as any).fetchPriority = "high"
    }
    img.src = previewUrl
    // Also warm up PhotoViewer chunk
    import("@/components/photo/photo-viewer").catch(() => {})
  }

  if ("requestIdleCallback" in window) {
    window.requestIdleCallback(run, { timeout: 150 })
  } else {
    setTimeout(run, 0)
  }
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
  const { coords: userCoords } = useUserLocation()

  // Calculate real-time distance badge if user granted location and photo has GPS
  const distanceBadge = useMemo(() => {
    if (!userCoords || data.latitude == null || data.longitude == null || data.latitude === 999) return null
    const lat = Number(data.latitude)
    const lng = Number(data.longitude)
    if (isNaN(lat) || isNaN(lng)) return null
    const distKm = calculateDistance(userCoords.latitude, userCoords.longitude, lat, lng)
    return formatDistance(distKm)
  }, [userCoords, data.latitude, data.longitude])
  const locale = useLocale()
  const src = data.thumbnail || data.preview || data.key
  const ratio = data.width && data.height ? data.height / data.width : 1
  const isDummyThumbHash = !data.thumbHash || data.thumbHash.startsWith("00080204") || data.thumbHash.startsWith("00080205")
  const placeholder = useMemo(() => (isDummyThumbHash ? undefined : getThumbHashUrl(data.thumbHash)), [data.thumbHash, isDummyThumbHash])
  // showTouchHover Record whether floating information is displayed after long pressing on the mobile terminal.
  const [showTouchHover, setShowTouchHover] = useState(false)
  // holdHover Momentarily lock hover information when clicking to open viewer, Avoid instant retraction of zoom animation.
  const [holdHover, setHoldHover] = useState(false)
  const isVideo = Boolean(data.type?.startsWith("video/"))
  // Multi-tier fallback src state: thumbnail -> preview -> (photos only: original key)
  const [imageSrc, setImageSrc] = useState<string | null>(() => data.thumbnail || data.preview || (isVideo ? null : data.key) || null)
  // Clean sequential streaming URL for fast, instant autoplay without fragment seeking penalty
  const videoStreamUrl = useMemo(() => {
    if (!isVideo || !data.key) return undefined
    const base = data.key.startsWith('http') ? data.key : toProxyMediaUrl(data.key)
    if (!base) return undefined
    return base.split('#')[0]
  }, [isVideo, data.key])
  // imageError Record whether all photo URLs failed to load.
  const [imageError, setImageError] = useState(false)
  // isImageLoaded: Once the high-res image paints, clear the base64 placeholder from DOM styles to free memory
  const initialLoaded = Boolean(imageSrc && loadedThumbnails.has(imageSrc))
  const [isImageLoaded, setIsImageLoaded] = useState(initialLoaded)
  // isMobile Determine whether the current viewport is the mobile terminal.
  const isMobile = useIsMobile()
  const videoDuration = useMemo(() => {
    if (!isVideo || !data.exif) return null
    try {
      const parsed = JSON.parse(data.exif)
      return parsed.Duration || null
    } catch {
      return null
    }
  }, [isVideo, data.exif])
  const showHover = showTouchHover || holdHover
  // Predictive hover dwell timer (100ms intent window)
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const imgRef = useRef<HTMLImageElement | null>(null)
  const cardRef = useRef<HTMLDivElement | null>(null)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const [isVideoPlaying, setIsVideoPlaying] = useState(false)
  const [isVideoFrameReady, setIsVideoFrameReady] = useState(false)
  const [currentSeconds, setCurrentSeconds] = useState(0)
  // Adaptive above-the-fold LCP prioritization:
  // Mobile (2-column): first 6 photos load eager & high priority.
  // Desktop (multi-column): first 12 photos load eager.
  const priorityLimit = isMobile ? 6 : 12
  const isPriority = typeof index === "number" && index < priorityLimit

  // Unified adaptive performance: respects Data Saver, weak cellular (2G/3G), and low battery
  const { isEcoMode, canAutoplayVideo } = useAdaptivePerformance()
  const isConstrainedNetwork = isEcoMode

  // Start video autoplay with WebKit muted compliance
  const startAutoplay = useCallback(() => {
    setIsVideoPlaying(true)
    if (videoRef.current) {
      videoRef.current.muted = true
      // WebKit defaultMuted property ensures iOS permits autoplay
      videoRef.current.defaultMuted = true
      videoRef.current.play().catch(() => {})
    }
  }, [])

  // Stop video autoplay and reset playback time
  const stopAutoplay = useCallback(() => {
    setIsVideoPlaying(false)
    setIsVideoFrameReady(false)
    setCurrentSeconds(0)
    if (videoRef.current) {
      videoRef.current.pause()
      try {
        videoRef.current.currentTime = 0
      } catch {}
    }
  }, [])

  // Coordinated Autoplay: maximum 4 concurrent playing videos, batch rotation, and instant stop on scroll
  useEffect(() => {
    if (!isVideo || !cardRef.current || typeof window === "undefined" || !videoCoordinator || !canAutoplayVideo) {
      return
    }

    videoCoordinator.register(data.photoId, cardRef.current, {
      play: startAutoplay,
      pause: stopAutoplay,
    })

    return () => {
      videoCoordinator.unregister(data.photoId)
      if (videoRef.current) {
        videoRef.current.pause()
        videoRef.current.removeAttribute("src")
        videoRef.current.load()
      }
    }
  }, [isVideo, data.photoId, startAutoplay, stopAutoplay])

  // Synchronously reset image source and state during render when photo changes to avoid 1-frame visual glitch
  const prevPhotoIdRef = useRef(data.photoId)
  if (prevPhotoIdRef.current !== data.photoId) {
    prevPhotoIdRef.current = data.photoId
    const nextSrc = data.thumbnail || data.preview || (isVideo ? null : data.key) || null
    setImageSrc(nextSrc)
    setIsImageLoaded(Boolean(nextSrc && loadedThumbnails.has(nextSrc)))
    setImageError(false)
  }

  // Mark image as loaded and memoize in session loadedThumbnails set
  const handleImageLoad = useCallback(() => {
    if (imageSrc) {
      loadedThumbnails.add(imageSrc)
      if (loadedThumbnails.size > 1500) {
        const oldest = loadedThumbnails.values().next().value
        if (oldest) loadedThumbnails.delete(oldest)
      }
    }
    setIsImageLoaded(true)
  }, [imageSrc])

  // Synchronous image ref check for browser in-memory cache hits
  const setImgRef = useCallback((el: HTMLImageElement | null) => {
    imgRef.current = el
    if (el && el.complete && el.naturalWidth > 0) {
      if (imageSrc) {
        loadedThumbnails.add(imageSrc)
      }
      setIsImageLoaded(true)
    }
  }, [imageSrc])


  // Handle graceful image fallback across all media tiers
  function handleImageError() {
    if (data.preview && imageSrc !== data.preview) {
      setImageSrc(data.preview)
    } else if (data.thumbnail && imageSrc !== data.thumbnail) {
      setImageSrc(data.thumbnail)
    } else {
      setImageError(true)
    }
  }

  // Trigger open callback with origin rectangle for Hero expansion transition
  const triggerOpen = useCallback(() => {
    let origin: HeroTransitionOrigin | undefined = undefined
    const elem = imgRef.current || cardRef.current
    if (elem) {
      const rect = elem.getBoundingClientRect()
      if (rect.width > 0 && rect.height > 0) {
        origin = {
          rect: {
            top: Math.round(rect.top),
            left: Math.round(rect.left),
            width: Math.round(rect.width),
            height: Math.round(rect.height),
          },
          src: imageSrc || data.preview || data.thumbnail || (isVideo ? "" : data.key) || "",
          aspectRatio: data.width && data.height ? data.width / data.height : rect.width / rect.height,
        }
      }
    }
    onOpen?.(origin)
  }, [data.width, data.height, data.preview, data.thumbnail, data.key, imageSrc, isVideo, onOpen])

  // Predictive zero-delay hover prefetching for photos and videos
  function handleMouseEnter() {
    if (isMobile) return
    prefetchPhotoHighRes(data.preview || data.key)
    if (isVideo && videoStreamUrl) {
      prebufferVideo(videoStreamUrl)
    }
  }

  // Mobile-friendly gesture & quick peek states
  const [showHeartBurst, setShowHeartBurst] = useState(false)
  const [burstCoords, setBurstCoords] = useState<{ x: number; y: number } | null>(null)
  const [quickPeekOpen, setQuickPeekOpen] = useState(false)
  const lastTapTimeRef = useRef(0)
  const singleTapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const touchStartPosRef = useRef<{ x: number; y: number; time: number } | null>(null)
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isLongPressActiveRef = useRef(false)
  // Track last quick peek dismissal timestamp to completely suppress synthetic clicks
  const lastQuickPeekDismissTimeRef = useRef(0)

  // Clean up pending gesture timers on unmount
  useEffect(() => {
    return () => {
      if (singleTapTimerRef.current) clearTimeout(singleTapTimerRef.current)
      if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current)
    }
  }, [])

  // Predictive touch-start prefetching and gesture initiation
  function handleTouchStart(e: React.TouchEvent<HTMLDivElement>) {
    prefetchPhotoHighRes(data.preview || data.key)
    if (isVideo && videoStreamUrl) {
      prebufferVideo(videoStreamUrl)
    }

    if (selectionActive) return

    // Suppress new gesture if quick peek was just dismissed within 600ms
    if (Date.now() - lastQuickPeekDismissTimeRef.current < 600) return

    const touch = e.touches[0]
    if (!touch) return

    touchStartPosRef.current = {
      x: touch.clientX,
      y: touch.clientY,
      time: Date.now(),
    }
    isLongPressActiveRef.current = false

    // Start long-press timer for Quick Peek (280ms)
    if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current)
    longPressTimerRef.current = setTimeout(() => {
      isLongPressActiveRef.current = true
      try {
        if (typeof navigator !== "undefined" && navigator.vibrate) {
          navigator.vibrate(25)
        }
      } catch {}
      setQuickPeekOpen(true)
      if (!isAdmin) {
        recordPhotoView(data.photoId)
      }
      trackVisitorMedia(data.photoId, "view")
    }, 280)
  }

  // Cancel long-press immediately if finger moves (user is scrolling)
  function handleTouchMove(e: React.TouchEvent<HTMLDivElement>) {
    if (!touchStartPosRef.current) return
    const touch = e.touches[0]
    if (!touch) return

    const dx = touch.clientX - touchStartPosRef.current.x
    const dy = touch.clientY - touchStartPosRef.current.y

    if (Math.hypot(dx, dy) > 10) {
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current)
        longPressTimerRef.current = null
      }
    }
  }

  // Process tap, double-tap, or long-press release
  function handleTouchEnd(e: React.TouchEvent<HTMLDivElement>) {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current)
      longPressTimerRef.current = null
    }

    // Instagram style: When finger is lifted after long-press, immediately close Quick Peek!
    if (isLongPressActiveRef.current || quickPeekOpen) {
      e.preventDefault()
      e.stopPropagation()
      isLongPressActiveRef.current = false
      lastQuickPeekDismissTimeRef.current = Date.now()
      setQuickPeekOpen(false)
      if (singleTapTimerRef.current) {
        clearTimeout(singleTapTimerRef.current)
        singleTapTimerRef.current = null
      }
      return
    }

    // If recently dismissed Quick Peek (< 600ms), suppress any ghost tap or click
    if (Date.now() - lastQuickPeekDismissTimeRef.current < 600) {
      e.preventDefault()
      e.stopPropagation()
      return
    }

    if (selectionActive) return

    // If moved > 12px, it was a scroll gesture
    if (touchStartPosRef.current && e.changedTouches && e.changedTouches[0]) {
      const touch = e.changedTouches[0]
      const dx = touch.clientX - touchStartPosRef.current.x
      const dy = touch.clientY - touchStartPosRef.current.y
      if (Math.hypot(dx, dy) > 12) {
        return
      }
    }

    const now = Date.now()
    const timeSinceLastTap = now - lastTapTimeRef.current

    if (timeSinceLastTap < 260) {
      // Double tap detected!
      lastTapTimeRef.current = 0
      if (singleTapTimerRef.current) {
        clearTimeout(singleTapTimerRef.current)
        singleTapTimerRef.current = null
      }

      // Calculate relative coords for heart burst on card
      const rect = cardRef.current?.getBoundingClientRect()
      if (rect && e.changedTouches && e.changedTouches[0]) {
        setBurstCoords({
          x: e.changedTouches[0].clientX - rect.left,
          y: e.changedTouches[0].clientY - rect.top,
        })
      } else {
        setBurstCoords(null)
      }

      setShowHeartBurst(true)

      // Safe haptic feedback (Instagram double beat)
      try {
        if (typeof navigator !== "undefined" && navigator.vibrate) {
          navigator.vibrate([15, 35, 15])
        }
      } catch {}

      // Trigger reaction if not already loved (exclude Admin from reaction totals)
      const cached = reactionSync.getCached(data.photoId)
      if (!cached?.userReactions?.love && !isAdmin) {
        reactionSync.toggleReaction(data.photoId, "love")
      }
      trackVisitorMedia(data.photoId, "reaction")
      return
    }

    // First tap: debounce opening so double tap can cancel it
    lastTapTimeRef.current = now
    if (singleTapTimerRef.current) clearTimeout(singleTapTimerRef.current)
    singleTapTimerRef.current = setTimeout(() => {
      singleTapTimerRef.current = null
      if (Date.now() - lastQuickPeekDismissTimeRef.current < 600) {
        return
      }
      triggerOpen()
    }, 220)
  }

  // Handle touch cancellation (e.g. system alert or interruption)
  function handleTouchCancel() {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current)
      longPressTimerRef.current = null
    }
    if (isLongPressActiveRef.current || quickPeekOpen) {
      lastQuickPeekDismissTimeRef.current = Date.now()
      setQuickPeekOpen(false)
    }
    isLongPressActiveRef.current = false
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
    // If long-press quick peek was recently active, NEVER open photo viewer
    if (Date.now() - lastQuickPeekDismissTimeRef.current < 600) {
      event.preventDefault()
      event.stopPropagation()
      return
    }

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

    // On touch mobile devices, handleTouchEnd processes taps
    if (isMobile) {
      return
    }

    setHoldHover(true)
    setTimeout(() => setHoldHover(false), 200)
    triggerOpen()
  }

  // Desktop double-click to like
  function handleDoubleClick(event: MouseEvent<HTMLDivElement>) {
    if (selectionActive) return
    event.stopPropagation()

    const rect = cardRef.current?.getBoundingClientRect()
    if (rect) {
      setBurstCoords({
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      })
    } else {
      setBurstCoords(null)
    }

    setShowHeartBurst(true)
    const cached = reactionSync.getCached(data.photoId)
    if (!cached?.userReactions?.love && !isAdmin) {
      reactionSync.toggleReaction(data.photoId, "love")
    }
    trackVisitorMedia(data.photoId, "reaction")
  }

  // Block system menu when long pressing photo to prevent default iOS / Android context menu.
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

  // Reveal animation should only play once per photo during a user's session
  const isAlreadyRevealed = revealedPhotoIds.has(data.photoId)
  if (!isAlreadyRevealed && data.photoId) {
    revealedPhotoIds.add(data.photoId)
    // Keep memory bounded during large browsing sessions
    if (revealedPhotoIds.size > 2000) {
      const oldest = revealedPhotoIds.values().next().value
      if (oldest) revealedPhotoIds.delete(oldest)
    }
  }

  const shouldAnimateReveal = !isAlreadyRevealed
  const cardHeight = Math.max(1, Math.round(width * ratio))
  const staggerDelay = shouldAnimateReveal ? Math.min(240, ((index ?? 0) % 12) * 20) : 0

  return (
    <div
      ref={cardRef}
      className={[
        "group relative overflow-hidden houdini-smooth-card touch-press-feedback touch-manipulation",
        shouldAnimateReveal ? "cascade-wave-card" : "",
      ].join(" ")}
      onClick={handlePhotoClick}
      onContextMenu={handlePhotoContextMenu}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchCancel}
      onDoubleClick={handleDoubleClick}
      style={{
        width,
        height: cardHeight,
        contain: "paint layout",
        ["containIntrinsicSize" as string]: `auto ${width}px ${cardHeight}px`,
        transform: "translateZ(0)",
        willChange: "auto",
        ["--card-stagger" as string]: shouldAnimateReveal ? `${staggerDelay}ms` : undefined,
        backgroundColor: placeholder ? undefined : "rgba(128,128,128,0.08)",
        backgroundImage: isImageLoaded ? undefined : (placeholder ? `url("${placeholder}")` : undefined),
        backgroundSize: "cover",
        backgroundPosition: "center",
        // Dynamic Layout Stability CSS Custom Properties (CLS = 0.000)
        ["--aspect-ratio" as string]: `${ratio}`,
        ["--intrinsic-width" as string]: `${width}px`,
        ["--intrinsic-height" as string]: `${cardHeight}px`,
      }}
    >
      {isVideo ? (
        <div className="absolute inset-0 bg-neutral-950 flex items-center justify-center overflow-hidden">
          <video
            ref={videoRef}
            src={isEcoMode && !isVideoPlaying ? undefined : videoStreamUrl}
            muted
            playsInline
            loop
            crossOrigin="anonymous"
            preload={isConstrainedNetwork ? "none" : "auto"}
            onPlaying={() => setIsVideoFrameReady(true)}
            onWaiting={() => setIsVideoFrameReady(false)}
            onTimeUpdate={(e) => {
              const video = e.currentTarget
              const cur = video.currentTime
              // Max preview limit: 10s. Rewind and loop back to 0s to conserve user bandwidth
              if (cur >= 10) {
                video.currentTime = 0
                setCurrentSeconds(0)
                video.play().catch(() => {})
                return
              }
              const sec = Math.floor(cur)
              setCurrentSeconds((prev) => (prev !== sec ? sec : prev))
            }}
            className="absolute inset-0 h-full w-full object-cover pointer-events-none bg-neutral-950"
          />
          {/* Static thumbnail overlay - persists until video frames are actually rendering to prevent black screens */}
          {imageSrc && !imageError && (
            <img
              ref={setImgRef}
              src={imageSrc}
              crossOrigin="anonymous"
              loading="eager"
              fetchPriority={isPriority ? "high" : "auto"}
              decoding={isImageLoaded ? "sync" : "async"}
              alt={data.name}
              draggable={false}
              className={[
                "absolute inset-0 h-full w-full object-cover transition-opacity duration-300 pointer-events-none",
                isVideoPlaying && isVideoFrameReady ? "opacity-0" : "opacity-100",
                selectionActive ? "" : "group-hover:scale-[1.035]",
                showHover && !selectionActive ? "scale-[1.035]" : "",
              ].join(" ")}
              onError={handleImageError}
              onLoad={handleImageLoad}
            />
          )}
          <div className="absolute inset-0 bg-black/15 pointer-events-none" />
        </div>
      ) : imageError ? (
        <div className="absolute inset-0 flex items-center justify-center px-3 text-center text-sm text-muted-foreground bg-muted/60">
          {t("imageLoadFailed")}
        </div>
      ) : (
        <img
          ref={setImgRef}
          src={imageSrc ?? undefined}
          crossOrigin="anonymous"
          loading="eager"
          fetchPriority={isPriority ? "high" : "auto"}
          decoding={isImageLoaded ? "sync" : "async"}
          alt={data.name}
          draggable={false}
          className={[
            "absolute inset-0 h-full w-full object-cover spring-zoom-img",
            selectionActive ? "" : "group-hover:scale-[1.035]",
            showHover && !selectionActive ? "scale-[1.035]" : "",
          ].join(" ")}
          onError={handleImageError}
          onLoad={handleImageLoad}
        />
      )}
      {selected && (
        <div className="pointer-events-none absolute inset-0 bg-black/60" />
      )}
      {/* Pinned Photo Badge (Visible to all in album view) */}
      {data.isPinned && (
        <div
          className="absolute top-2 left-2 z-10 flex items-center gap-1 rounded-full bg-primary/90 text-primary-foreground backdrop-blur-md px-2 py-0.5 text-[11px] font-semibold shadow-md border border-primary/20 elastic-pop-badge"
          title="Pinned in album (Top priority)"
        >
          <PinIcon className="size-3 fill-current rotate-45" />
          <span>Pinned</span>
        </div>
      )}
      {/* Real-time Distance Badge from Current User Location */}
      {distanceBadge && (
        <div
          className="absolute z-10 flex items-center gap-1 rounded-full bg-black/75 text-emerald-400 backdrop-blur-md px-2 py-0.5 text-[10px] font-semibold border border-emerald-500/30 shadow-xs pointer-events-none transition-all"
          style={{
            top: data.isPinned ? "2.2rem" : "0.5rem",
            left: "0.5rem",
          }}
          title={`Distance: ${distanceBadge} away from you`}
        >
          <MapPin className="size-2.5 text-emerald-400 shrink-0" />
          <span>{distanceBadge}</span>
        </div>
      )}
      {/* Video Duration / Autoplay Living Badge */}
      {isVideo && (
        <div
          className={`absolute top-2 right-2 z-10 flex items-center gap-1 rounded-full backdrop-blur-md px-2 py-0.5 text-[11px] font-bold shadow-md border transition-all ${
            isVideoPlaying && isVideoFrameReady
              ? "bg-emerald-950/85 text-emerald-300 border-emerald-500/50 shadow-[0_0_12px_rgba(16,185,129,0.35)]"
              : "bg-black/75 text-white border-white/20 video-living-badge"
          }`}
          title={`Video ${videoDuration ? `(${videoDuration})` : ""}`}
        >
          <Play className={`size-2.5 fill-current ${isVideoPlaying && isVideoFrameReady ? "text-emerald-400 animate-pulse" : "text-emerald-400"}`} />
          <span className="tabular-nums">
            {isVideoPlaying && isVideoFrameReady
              ? `${formatVideoTime(currentSeconds)} / ${videoDuration || formatVideoTime(videoRef.current?.duration || 0)}`
              : videoDuration || "Video"}
          </span>
        </div>
      )}
      {/* Center Play Overlay on Hover / Active */}
      {isVideo && !selectionActive && (
        <div
          className={[
            "pointer-events-none absolute inset-0 flex items-center justify-center transition-all duration-300 z-10",
            showHover ? "opacity-100 scale-100" : "opacity-0 scale-90",
          ].join(" ")}
        >
          <div className="flex size-11 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-md border border-white/25 shadow-xl">
            <Play className="size-5 fill-current ml-0.5 text-emerald-400" />
          </div>
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
            aria-label={`Select ${isVideo ? "video" : "photo"} ${data.name}`}
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
          title={data.isPinned ? "Unpin from album" : "Pin to the top of album (Maximum 3 items)"}
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
                {isVideo ? "720p HD" : `${data.width} × ${data.height}`}
              </span>
              {
                isMobile ? (
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
      {/* Mobile Instagram-Style Double-Tap Heart Burst */}
      <PhotoHeartBurst
        show={showHeartBurst}
        coords={burstCoords}
        size={72}
        onComplete={() => setShowHeartBurst(false)}
      />

      {/* iOS / Instagram Style Haptic Long-Press Quick Peek */}
      <PhotoQuickPeek
        photo={quickPeekOpen ? data : null}
        open={quickPeekOpen}
        onClose={() => {
          lastQuickPeekDismissTimeRef.current = Date.now()
          setQuickPeekOpen(false)
        }}
        distanceBadge={distanceBadge}
      />
    </div>
  )
})
