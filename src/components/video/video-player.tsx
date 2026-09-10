"use client"

import React, { memo, useCallback, useEffect, useRef, useState } from "react"
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize,
  Minimize,
  RotateCcw,
  MessageSquare,
  CircleAlertIcon,
  Loader2,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { formatVideoDuration } from "@/lib/video-compress"
import { toProxyMediaUrl } from "@/lib/url"
import { PhotoReactions } from "@/components/photo/photo-reactions"

// Module-level map to store the exact playback timestamp per media item across view toggles and re-renders
const globalVideoPositions = new Map<string, number>()

export interface VideoPlayerProps {
  src: string
  poster?: string
  alt?: string
  autoPlay?: boolean
  isActive?: boolean
  className?: string
  photoId?: string
  isCinematicMode?: boolean
  onScrubbingChange?: (isScrubbing: boolean) => void
  onOpenComments?: () => void
  onOpenInfo?: () => void
  onEnded?: () => void
  onFullscreenChange?: (isFullscreen: boolean) => void
}

export const VideoPlayer = memo(function VideoPlayer({
  src,
  poster,
  alt = "Video",
  autoPlay = false,
  isActive = true,
  className,
  photoId,
  isCinematicMode = false,
  onScrubbingChange,
  onOpenComments,
  onOpenInfo,
  onEnded,
  onFullscreenChange,
}: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const timelineTrackRef = useRef<HTMLDivElement>(null)
  const volumeInputRef = useRef<HTMLInputElement>(null)
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const previewVideoRef = useRef<HTMLVideoElement>(null)
  const previewSeekTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isScrubbingRef = useRef(false)
  const isSeekingRef = useRef(false)
  const scrubTimeRef = useRef(0)
  const wasPlayingRef = useRef(false)
  const seekDebounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const seekSafetyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [scrubTime, setScrubTime] = useState(0)
  const [hoverTime, setHoverTime] = useState<number | null>(null)
  const [isHoveringTimeline, setIsHoveringTimeline] = useState(false)
  const [previewX, setPreviewX] = useState<number | null>(null)
  const [duration, setDuration] = useState(0)
  const [bufferedPercent, setBufferedPercent] = useState(0)
  const [isMuted, setIsMuted] = useState(false)
  const [volume, setVolume] = useState(1)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [showControls, setShowControls] = useState(true)
  const [isScrubbing, setIsScrubbing] = useState(false)
  const [showCenterIcon, setShowCenterIcon] = useState(false)
  const [centerIconState, setCenterIconState] = useState<"play" | "pause">("play")
  const [isBuffering, setIsBuffering] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [hasFirstFrame, setHasFirstFrame] = useState(false)
  const [isVideoLandscape, setIsVideoLandscape] = useState(false)
  const [isScreenPortrait, setIsScreenPortrait] = useState(false)

  // Track mobile device viewport orientation dynamically
  useEffect(() => {
    const updateOrientation = () => {
      if (typeof window !== "undefined") {
        setIsScreenPortrait(window.innerHeight > window.innerWidth)
      }
    }
    updateOrientation()
    window.addEventListener("resize", updateOrientation)
    window.addEventListener("orientationchange", updateOrientation)
    return () => {
      window.removeEventListener("resize", updateOrientation)
      window.removeEventListener("orientationchange", updateOrientation)
    }
  }, [])

  const isMobileClient = typeof window !== "undefined" && (
    window.innerWidth < 768 ||
    /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)
  )
  const shouldRotateMobile = isFullscreen && !isCinematicMode && isMobileClient && isVideoLandscape && isScreenPortrait

  // Notify parent component of fullscreen state changes (e.g. to disable Lightbox swipe gestures while in video fullscreen)
  useEffect(() => {
    onFullscreenChange?.(isFullscreen)
  }, [isFullscreen, onFullscreenChange])

  // Reset video loading & buffering state when media source changes
  useEffect(() => {
    setIsLoading(true)
    setIsBuffering(false)
    setHasFirstFrame(false)
    setIsPlaying(false)
  }, [src])

  // Reset idle timer to hide controls after 2.5s of inactivity (applies to both playing and paused states)
  const pingActivity = useCallback(() => {
    setShowControls(true)
    if (idleTimerRef.current) {
      clearTimeout(idleTimerRef.current)
      idleTimerRef.current = null
    }
    if (!isScrubbingRef.current) {
      idleTimerRef.current = setTimeout(() => {
        if (!isScrubbingRef.current) {
          setShowControls(false)
        }
      }, 2500)
    }
  }, [])

  useEffect(() => {
    pingActivity()
    return () => {
      if (idleTimerRef.current) {
        clearTimeout(idleTimerRef.current)
        idleTimerRef.current = null
      }
    }
  }, [isPlaying, isScrubbing, pingActivity])

  // Instantly pause video & audio when slide becomes inactive (swiped away to left or right)
  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    if (!isActive) {
      video.pause()
      setIsPlaying(false)
      setIsBuffering(false)
    } else if (autoPlay) {
      setIsBuffering(true)
      void video.play().then(() => {
        setIsPlaying(true)
        setIsBuffering(false)
        setIsLoading(false)
      }).catch(() => {
        // Fallback to muted autoplay if browser autoplay policy blocks unmuted audio
        video.muted = true
        setIsMuted(true)
        void video.play().then(() => {
          setIsPlaying(true)
          setIsBuffering(false)
          setIsLoading(false)
        }).catch(() => {
          setIsBuffering(false)
        })
      })
    }
  }, [isActive, autoPlay])

  // Stop video and release media decoder on unmount
  useEffect(() => {
    return () => {
      const video = videoRef.current
      if (video) {
        video.pause()
        video.removeAttribute("src")
        video.load()
      }
      const previewVideo = previewVideoRef.current
      if (previewVideo) {
        previewVideo.pause()
        previewVideo.removeAttribute("src")
        previewVideo.load()
      }
      if (seekDebounceTimerRef.current) {
        clearTimeout(seekDebounceTimerRef.current)
        seekDebounceTimerRef.current = null
      }
      if (seekSafetyTimerRef.current) {
        clearTimeout(seekSafetyTimerRef.current)
        seekSafetyTimerRef.current = null
      }
      if (previewSeekTimerRef.current) {
        clearTimeout(previewSeekTimerRef.current)
        previewSeekTimerRef.current = null
      }
    }
  }, [])


  // Play / Pause toggle with immediate buffering indicator and center badge ripple
  const togglePlay = useCallback(() => {
    const video = videoRef.current
    if (!video) return

    if (video.paused || video.ended) {
      setIsBuffering(true)
      void video.play().then(() => {
        setIsPlaying(true)
        setIsBuffering(false)
        setIsLoading(false)
        setCenterIconState("play")
        setShowCenterIcon(true)
        setTimeout(() => setShowCenterIcon(false), 500)
      }).catch((err) => {
        setIsBuffering(false)
        console.warn("Video playback error:", err)
      })
    } else {
      video.pause()
      setIsPlaying(false)
      setIsBuffering(false)
      setCenterIconState("pause")
      setShowCenterIcon(true)
      setTimeout(() => setShowCenterIcon(false), 500)
    }
    pingActivity()
  }, [pingActivity])

  // Time update and buffer progress
  const handleTimeUpdate = useCallback(() => {
    const video = videoRef.current
    if (!video || isScrubbingRef.current || isSeekingRef.current || video.seeking) return
    setCurrentTime(video.currentTime)
    if (video.currentTime > 0) {
      setHasFirstFrame(true)
      setIsLoading(false)
      setIsBuffering(false)
      const mediaKey = photoId || src
      if (mediaKey) {
        globalVideoPositions.set(mediaKey, video.currentTime)
      }
    }

    if (video.buffered.length > 0 && video.duration > 0) {
      const bufferedEnd = video.buffered.end(video.buffered.length - 1)
      setBufferedPercent((bufferedEnd / video.duration) * 100)
    }
  }, [photoId, src])

  const handleLoadedMetadata = useCallback(() => {
    const video = videoRef.current
    if (!video) return
    setDuration(video.duration || 0)
    if (video.videoWidth && video.videoHeight) {
      setIsVideoLandscape(video.videoWidth > video.videoHeight)
    }
    setIsLoading(false)

    // Seamlessly restore playback timestamp across mode transitions (e.g. cinematic mode or remount)
    const mediaKey = photoId || src
    const savedTime = mediaKey ? globalVideoPositions.get(mediaKey) : undefined
    if (savedTime && savedTime > 0 && Math.abs(video.currentTime - savedTime) > 0.3) {
      video.currentTime = savedTime
      setCurrentTime(savedTime)
    }

    if (autoPlay) {
      setIsBuffering(true)
      void video.play().then(() => {
        setIsPlaying(true)
        setIsBuffering(false)
        setIsLoading(false)
      }).catch(() => {
        setIsBuffering(false)
      })
    }
  }, [autoPlay, photoId, src])

  // Mute / Unmute toggle
  const toggleMute = useCallback(() => {
    const video = videoRef.current
    if (!video) return
    video.muted = !video.muted
    setIsMuted(video.muted)
    if (!video.muted && volume === 0) {
      setVolume(0.8)
      video.volume = 0.8
    }
    pingActivity()
  }, [pingActivity, volume])

  // Volume slider change
  const handleVolumeChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    e.stopPropagation()
    const video = videoRef.current
    if (!video) return
    const newVol = parseFloat(e.target.value)
    video.volume = newVol
    setVolume(newVol)
    video.muted = newVol === 0
    setIsMuted(newVol === 0)
    pingActivity()
  }, [pingActivity])

  const handleVolumeStart = useCallback((e?: React.SyntheticEvent | Event) => {
    e?.stopPropagation()
    isScrubbingRef.current = true
    setIsScrubbing(true)
    if (idleTimerRef.current) {
      clearTimeout(idleTimerRef.current)
      idleTimerRef.current = null
    }
    setShowControls(true)
  }, [])

  const handleVolumeEnd = useCallback((e?: React.SyntheticEvent | Event) => {
    e?.stopPropagation()
    isScrubbingRef.current = false
    setIsScrubbing(false)
    pingActivity()
  }, [pingActivity])

  // Native & Adaptive Fullscreen toggle supporting mobile (iOS Safari, Android Chrome, Samsung) and PC/Desktop
  const toggleFullscreen = useCallback(async () => {
    const video = videoRef.current
    const container = containerRef.current
    if (!video || !container) return

    // 1. Check if browser supports Element Fullscreen API (Android Chrome, Samsung Internet, Firefox, Desktop browsers)
    const supportsElementFullscreen = Boolean(
      container.requestFullscreen ||
      (container as any).webkitRequestFullscreen
    )

    // 2. On iOS Safari / iPhone / WebKit mobile without Element Fullscreen support:
    // Launch Apple's native video fullscreen player directly.
    // This avoids WebKit's broken compositing bug (blank black screen caused by nested fixed/rotated containers in transformed slides)
    if (!supportsElementFullscreen && typeof (video as any).webkitEnterFullscreen === "function") {
      try {
        ;(video as any).webkitEnterFullscreen()
        pingActivity()
        return
      } catch (err) {
        console.warn("webkitEnterFullscreen error:", err)
      }
    }

    const isCurrentlyFullscreen = isFullscreen || Boolean(
      document.fullscreenElement ||
      (document as any).webkitFullscreenElement
    )

    if (isCurrentlyFullscreen) {
      try {
        if (document.exitFullscreen) {
          await document.exitFullscreen()
        } else if ((document as any).webkitExitFullscreen) {
          await (document as any).webkitExitFullscreen()
        }
      } catch {}
      try {
        const screenAny = typeof screen !== "undefined" ? (screen as any) : null
        if (screenAny?.orientation?.unlock) {
          screenAny.orientation.unlock()
        }
      } catch {}
      setIsFullscreen(false)
      pingActivity()
      return
    }

    // Entering Fullscreen mode on devices supporting container fullscreen (Android, PC, Mac)
    setIsFullscreen(true)

    // Request native container fullscreen (supported on Android Chrome, Samsung Internet, Firefox, desktop browsers)
    try {
      if (container.requestFullscreen) {
        await container.requestFullscreen()
      } else if ((container as any).webkitRequestFullscreen) {
        await (container as any).webkitRequestFullscreen()
      }
    } catch {}

    // On mobile devices with orientation lock support (e.g. Android Chrome, Samsung Internet):
    // If video is landscape, attempt physical orientation lock
    if (isMobileClient && isVideoLandscape) {
      try {
        const screenAny = typeof screen !== "undefined" ? (screen as any) : null
        if (screenAny?.orientation?.lock) {
          await screenAny.orientation.lock("landscape").catch(() => {
            return screenAny.orientation.lock("landscape-primary").catch(() => {})
          })
        }
      } catch {}
    }

    pingActivity()
  }, [isFullscreen, isMobileClient, isVideoLandscape, pingActivity])

  // Prevent background body scrolling while in fullscreen mode
  useEffect(() => {
    if (isFullscreen && typeof document !== "undefined") {
      const originalOverflow = document.body.style.overflow
      document.body.style.overflow = "hidden"
      return () => {
        document.body.style.overflow = originalOverflow
      }
    }
  }, [isFullscreen])

  // Handle escape key to exit fullscreen smoothly
  useEffect(() => {
    if (!isFullscreen) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        toggleFullscreen()
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => {
      window.removeEventListener("keydown", handleKeyDown)
    }
  }, [isFullscreen, toggleFullscreen])

  // Synchronize fullscreen state changes from native browser events
  // Strictly verifies document.fullscreenElement === containerRef.current so Lightbox Cinematic Mode (document.documentElement) is not confused with Video Fullscreen
  useEffect(() => {
    const handleFullscreenStateChange = () => {
      const isOurContainer = Boolean(
        (document.fullscreenElement && document.fullscreenElement === containerRef.current) ||
        ((document as any).webkitFullscreenElement && (document as any).webkitFullscreenElement === containerRef.current)
      )
      if (isOurContainer) {
        setIsFullscreen(true)
      } else {
        if (isFullscreen) {
          setIsFullscreen(false)
          try {
            const screenAny = typeof screen !== "undefined" ? (screen as any) : null
            if (screenAny?.orientation?.unlock) {
              screenAny.orientation.unlock()
            }
          } catch {}
        }
      }
    }

    const video = videoRef.current
    const handleWebkitVideoEndFullscreen = () => {
      setIsFullscreen(false)
    }

    document.addEventListener("fullscreenchange", handleFullscreenStateChange)
    document.addEventListener("webkitfullscreenchange", handleFullscreenStateChange)
    if (video) {
      video.addEventListener("webkitendfullscreen", handleWebkitVideoEndFullscreen)
    }

    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenStateChange)
      document.removeEventListener("webkitfullscreenchange", handleFullscreenStateChange)
      if (video) {
        video.removeEventListener("webkitendfullscreen", handleWebkitVideoEndFullscreen)
      }
    }
  }, [])

  // Dedicated helper to commit seeking on video element safely
  const seekVideo = useCallback((targetTime: number) => {
    const video = videoRef.current
    if (!video || isNaN(targetTime) || !isFinite(targetTime)) return

    const clampedTime = Math.max(0, Math.min(targetTime, duration > 0 ? duration : targetTime))

    isSeekingRef.current = true
    setIsBuffering(true)
    setCurrentTime(clampedTime)
    video.currentTime = clampedTime

    const mediaKey = photoId || src
    if (mediaKey) {
      globalVideoPositions.set(mediaKey, clampedTime)
    }

    if (seekSafetyTimerRef.current) {
      clearTimeout(seekSafetyTimerRef.current)
    }
    seekSafetyTimerRef.current = setTimeout(() => {
      isSeekingRef.current = false
      setIsBuffering(false)
    }, 2500)
  }, [duration, photoId, src])

  // Calculate video target time from pointer client coordinates (supports standard view and 90deg rotated mobile view)
  const calculateTimeFromPointer = useCallback((clientX: number, clientY: number): number | null => {
    const track = timelineTrackRef.current
    if (!track || !duration || duration <= 0) return null

    const rect = track.getBoundingClientRect()
    if (shouldRotateMobile) {
      if (rect.height <= 0) return null
      const offsetY = Math.max(0, Math.min(clientY - rect.top, rect.height))
      const percent = Math.max(0, Math.min(offsetY / rect.height, 1))
      return Math.max(0, Math.min(percent * duration, duration))
    } else {
      if (rect.width <= 0) return null
      const offsetX = Math.max(0, Math.min(clientX - rect.left, rect.width))
      const percent = Math.max(0, Math.min(offsetX / rect.width, 1))
      return Math.max(0, Math.min(percent * duration, duration))
    }
  }, [duration, shouldRotateMobile])

  const handleScrubberPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation()
    const video = videoRef.current
    if (!video || !duration || duration <= 0) return

    wasPlayingRef.current = !video.paused
    if (wasPlayingRef.current) {
      video.pause()
    }

    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {}

    isScrubbingRef.current = true
    setIsScrubbing(true)
    onScrubbingChange?.(true)

    if (idleTimerRef.current) {
      clearTimeout(idleTimerRef.current)
      idleTimerRef.current = null
    }
    setShowControls(true)

    const targetTime = calculateTimeFromPointer(e.clientX, e.clientY)
    if (targetTime !== null) {
      scrubTimeRef.current = targetTime
      setScrubTime(targetTime)
      seekVideo(targetTime)
    }

    const track = timelineTrackRef.current
    if (track) {
      const rect = track.getBoundingClientRect()
      const cardWidth = isVideoLandscape
        ? (typeof window !== "undefined" && window.innerWidth < 640 ? 144 : 176)
        : (typeof window !== "undefined" && window.innerWidth < 640 ? 88 : 110)
      if (shouldRotateMobile) {
        const clampedY = Math.max(cardWidth / 2 + 4, Math.min(e.clientY - rect.top, rect.height - cardWidth / 2 - 4))
        setPreviewX(clampedY)
      } else {
        const clampedX = Math.max(cardWidth / 2 + 4, Math.min(e.clientX - rect.left, rect.width - cardWidth / 2 - 4))
        setPreviewX(clampedX)
      }
    }
  }, [calculateTimeFromPointer, duration, isVideoLandscape, onScrubbingChange, seekVideo, shouldRotateMobile])

  const handleScrubberPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation()

    if (idleTimerRef.current) {
      clearTimeout(idleTimerRef.current)
      idleTimerRef.current = null
    }
    setShowControls(true)

    const targetTime = calculateTimeFromPointer(e.clientX, e.clientY)
    if (targetTime === null) return

    const track = timelineTrackRef.current
    if (track) {
      const rect = track.getBoundingClientRect()
      const cardWidth = isVideoLandscape
        ? (typeof window !== "undefined" && window.innerWidth < 640 ? 144 : 176)
        : (typeof window !== "undefined" && window.innerWidth < 640 ? 88 : 110)
      if (shouldRotateMobile) {
        const clampedY = Math.max(cardWidth / 2 + 4, Math.min(e.clientY - rect.top, rect.height - cardWidth / 2 - 4))
        setPreviewX(clampedY)
      } else {
        const clampedX = Math.max(cardWidth / 2 + 4, Math.min(e.clientX - rect.left, rect.width - cardWidth / 2 - 4))
        setPreviewX(clampedX)
      }
    }

    if (isScrubbingRef.current) {
      scrubTimeRef.current = targetTime
      setScrubTime(targetTime)

      if (seekDebounceTimerRef.current) {
        clearTimeout(seekDebounceTimerRef.current)
      }
      seekDebounceTimerRef.current = setTimeout(() => {
        if (isScrubbingRef.current) {
          seekVideo(scrubTimeRef.current)
        }
      }, 50)
    } else if (e.pointerType === "mouse") {
      setHoverTime(targetTime)
      setIsHoveringTimeline(true)
    }
  }, [calculateTimeFromPointer, isVideoLandscape, seekVideo, shouldRotateMobile])

  const handleScrubberPointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!isScrubbingRef.current) return
    e.stopPropagation()

    try {
      e.currentTarget.releasePointerCapture(e.pointerId)
    } catch {}

    if (seekDebounceTimerRef.current) {
      clearTimeout(seekDebounceTimerRef.current)
      seekDebounceTimerRef.current = null
    }

    let finalTime = scrubTimeRef.current
    if (typeof e.clientX === "number" && typeof e.clientY === "number") {
      const calculated = calculateTimeFromPointer(e.clientX, e.clientY)
      if (calculated !== null) {
        finalTime = calculated
      }
    }

    isScrubbingRef.current = false
    setIsScrubbing(false)
    setIsHoveringTimeline(false)
    setHoverTime(null)
    setPreviewX(null)
    onScrubbingChange?.(false)

    seekVideo(finalTime)

    const video = videoRef.current
    if (video && wasPlayingRef.current) {
      void video.play().catch(() => {})
    }

    pingActivity()
  }, [calculateTimeFromPointer, onScrubbingChange, pingActivity, seekVideo])

  const handleScrubberPointerEnter = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === "mouse" && duration > 0) {
      setIsHoveringTimeline(true)
      const targetTime = calculateTimeFromPointer(e.clientX, e.clientY)
      if (targetTime !== null) {
        setHoverTime(targetTime)
        const track = timelineTrackRef.current
        if (track) {
          const rect = track.getBoundingClientRect()
          const cardWidth = isVideoLandscape
            ? (typeof window !== "undefined" && window.innerWidth < 640 ? 144 : 176)
            : (typeof window !== "undefined" && window.innerWidth < 640 ? 88 : 110)
          if (shouldRotateMobile) {
            const clampedY = Math.max(cardWidth / 2 + 4, Math.min(e.clientY - rect.top, rect.height - cardWidth / 2 - 4))
            setPreviewX(clampedY)
          } else {
            const clampedX = Math.max(cardWidth / 2 + 4, Math.min(e.clientX - rect.left, rect.width - cardWidth / 2 - 4))
            setPreviewX(clampedX)
          }
        }
      }
    }
  }, [calculateTimeFromPointer, duration, isVideoLandscape, shouldRotateMobile])

  const handleScrubberPointerLeave = useCallback(() => {
    if (!isScrubbingRef.current) {
      setIsHoveringTimeline(false)
      setHoverTime(null)
      setPreviewX(null)
    }
  }, [])

  const previewTime = isScrubbing ? scrubTime : hoverTime
  const previewPercent = duration > 0 && previewTime !== null ? (previewTime / duration) * 100 : 0

  const handlePreviewLoadedMetadata = useCallback(() => {
    const pVid = previewVideoRef.current
    if (pVid && previewTime !== null && isFinite(previewTime)) {
      pVid.currentTime = Math.max(0, Math.min(previewTime, duration > 0 ? duration : previewTime))
    }
  }, [duration, previewTime])

  // Synchronize miniature preview video frame with scrub / hover timestamp
  useEffect(() => {
    if ((!isScrubbing && !isHoveringTimeline) || previewTime === null) return
    const pVid = previewVideoRef.current
    if (!pVid) return

    if (previewSeekTimerRef.current) {
      clearTimeout(previewSeekTimerRef.current)
    }
    previewSeekTimerRef.current = setTimeout(() => {
      if (pVid && isFinite(previewTime) && !isNaN(previewTime)) {
        pVid.currentTime = Math.max(0, Math.min(previewTime, duration > 0 ? duration : previewTime))
      }
    }, 35)

    return () => {
      if (previewSeekTimerRef.current) {
        clearTimeout(previewSeekTimerRef.current)
        previewSeekTimerRef.current = null
      }
    }
  }, [previewTime, isScrubbing, isHoveringTimeline, duration])

  // Keyboard controls (Space = play/pause, Left/Right = 5s skip, M = mute)
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return
      }

      if (e.key === " " || e.code === "Space") {
        e.preventDefault()
        togglePlay()
      } else if (e.key === "ArrowLeft") {
        e.preventDefault()
        const video = videoRef.current
        if (video) {
          seekVideo(Math.max(0, video.currentTime - 5))
        }
        pingActivity()
      } else if (e.key === "ArrowRight") {
        e.preventDefault()
        const video = videoRef.current
        if (video) {
          seekVideo(Math.min(duration, video.currentTime + 5))
        }
        pingActivity()
      } else if (e.key === "m" || e.key === "M") {
        e.preventDefault()
        toggleMute()
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [togglePlay, toggleMute, duration, pingActivity])

  // Keep controls alive on mouse move while controls are visible (both playing and paused)
  const handleMouseMove = useCallback(() => {
    if (showControls) {
      if (idleTimerRef.current) {
        clearTimeout(idleTimerRef.current)
        idleTimerRef.current = null
      }
      if (!isScrubbingRef.current) {
        idleTimerRef.current = setTimeout(() => {
          if (!isScrubbingRef.current) {
            setShowControls(false)
          }
        }, 2500)
      }
    }
  }, [showControls])

  // Toggle controls overlay visibility on screen click without toggling playback
  const handleScreenClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    setShowControls((prev) => {
      const next = !prev
      if (idleTimerRef.current) {
        clearTimeout(idleTimerRef.current)
        idleTimerRef.current = null
      }
      if (next && !isScrubbingRef.current) {
        // Reset 2.5s auto-hide timer when revealing controls
        idleTimerRef.current = setTimeout(() => {
          if (!isScrubbingRef.current) {
            setShowControls(false)
          }
        }, 2500)
      }
      return next
    })
  }, [])

  const displayTime = isScrubbing ? scrubTime : currentTime
  const progressPercent = duration > 0 ? (displayTime / duration) * 100 : 0

  return (
    <div
      ref={containerRef}
      className={cn(
        "group relative flex items-center justify-center w-full h-full select-none overflow-hidden bg-black transition-all duration-300",
        className
      )}
      style={
        isFullscreen && !isCinematicMode
          ? {
              position: "fixed",
              inset: 0,
              width: "100vw",
              height: "100vh",
              zIndex: 99999,
              background: "#000",
            }
          : undefined
      }
      onMouseMove={handleMouseMove}
    >
      {/* Inner Rotatable Player Surface */}
      <div
        className="relative flex items-center justify-center w-full h-full transition-all duration-300"
        style={
          shouldRotateMobile
            ? {
                position: "absolute",
                top: "50%",
                left: "50%",
                width: typeof window !== "undefined" ? `${window.innerHeight}px` : "100vh",
                height: typeof window !== "undefined" ? `${window.innerWidth}px` : "100vw",
                transform: "translate(-50%, -50%) rotate(90deg)",
                transformOrigin: "center center",
              }
            : undefined
        }
      >
      {/* Visual Poster Overlay: Stays visible until video decodes and renders first frame */}
      {poster && (
        <img
          src={poster}
          alt={alt}
          className={cn(
            "absolute inset-0 size-full object-contain pointer-events-none transition-opacity duration-500 z-5",
            hasFirstFrame ? "opacity-0 pointer-events-none" : "opacity-100"
          )}
          aria-hidden="true"
        />
      )}

      {/* Native HTML5 Video Element with Full Mobile Compatibility */}
      <video
        ref={videoRef}
        src={src}
        poster={poster}
        playsInline
        webkit-playsinline="true"
        preload="metadata"
        className="max-h-full max-w-full object-contain cursor-pointer"
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onLoadStart={() => setIsLoading(true)}
        onLoadedData={() => {
          setIsLoading(false)
          setHasFirstFrame(true)
        }}
        onWaiting={() => setIsBuffering(true)}
        onPlaying={() => {
          setIsPlaying(true)
          setIsBuffering(false)
          setIsLoading(false)
          setHasFirstFrame(true)
        }}
        onCanPlay={() => {
          setIsBuffering(false)
          setIsLoading(false)
          setHasFirstFrame(true)
        }}
        onSeeking={() => {
          isSeekingRef.current = true
          setIsBuffering(true)
        }}
        onSeeked={() => {
          if (seekSafetyTimerRef.current) {
            clearTimeout(seekSafetyTimerRef.current)
            seekSafetyTimerRef.current = null
          }
          isSeekingRef.current = false
          setIsBuffering(false)
          setHasFirstFrame(true)
          const video = videoRef.current
          if (video && !isScrubbingRef.current) {
            setCurrentTime(video.currentTime)
            const mediaKey = photoId || src
            if (mediaKey && video.currentTime > 0) {
              globalVideoPositions.set(mediaKey, video.currentTime)
            }
          }
        }}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onEnded={() => {
          const mediaKey = photoId || src
          if (mediaKey) {
            globalVideoPositions.delete(mediaKey)
          }
          setIsPlaying(false)
          setShowControls(true)
          onEnded?.()
        }}
        onError={() => {
          setIsLoading(false)
          setIsBuffering(false)
        }}
        aria-label={alt}
      />

      {/* Transparent Clickable Screen Backdrop for Toggling Overlay Controls */}
      <div
        className="absolute inset-0 z-10 cursor-pointer"
        onClick={handleScreenClick}
      />

      {/* Center Play/Pause & Buffering Indicator */}
      <div
        className={cn(
          "pointer-events-none absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 transition-all duration-300",
          isLoading || isBuffering
            ? "opacity-100 scale-100"
            : showCenterIcon
            ? "opacity-100 scale-100"
            : showControls
            ? "opacity-90 scale-100"
            : "opacity-0 scale-75 pointer-events-none"
        )}
      >
        {isLoading || isBuffering ? (
          <div className="flex flex-col items-center justify-center gap-2.5 pointer-events-auto">
            <div className="flex size-16 sm:size-20 items-center justify-center rounded-full bg-black/65 text-white backdrop-blur-xl border border-white/25 shadow-2xl shadow-black/80">
              <Loader2 className="size-8 sm:size-10 animate-spin text-emerald-400" />
            </div>
            <div className="flex items-center gap-2 px-3.5 py-1 rounded-full bg-black/80 backdrop-blur-md border border-white/15 text-white text-xs font-medium tracking-wide shadow-xl">
              <span className="size-1.5 rounded-full bg-emerald-400 animate-ping" />
              <span>{isLoading ? "Loading video..." : "Buffering..."}</span>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              togglePlay()
            }}
            className={cn(
              "flex size-16 sm:size-20 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur-xl border border-white/20 shadow-2xl transition-transform active:scale-90 hover:scale-105 hover:bg-black/75 cursor-pointer",
              showCenterIcon || showControls ? "pointer-events-auto" : "pointer-events-none"
            )}
            aria-label={isPlaying ? "Pause video" : "Play video"}
          >
            {isPlaying ? (
              <Pause className="size-8 sm:size-10 fill-current" />
            ) : (
              <Play className="size-8 sm:size-10 fill-current ml-1" />
            )}
          </button>
        )}
      </div>

      {/* Exit Fullscreen Floating Button (Visible in fullscreen mode) */}
      {isFullscreen && !isCinematicMode && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            toggleFullscreen()
          }}
          className={cn(
            "absolute top-2.5 left-2.5 md:top-3.5 md:left-3.5 z-30 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-black/75 backdrop-blur-md text-white border border-white/20 shadow-xl transition-all duration-300 cursor-pointer hover:bg-black/90 active:scale-95",
            showControls ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-2 pointer-events-none"
          )}
          aria-label="Exit Fullscreen"
        >
          <Minimize className="size-4 text-emerald-400" />
          <span className="text-xs font-semibold tracking-wide">Exit</span>
        </button>
      )}

      {/* Top Floating Glass Badge for Video Tag (Shifted right to avoid overlapping back/close button or exit button) */}
      <div
        className={cn(
          "absolute top-2.5 md:top-3.5 z-20 flex items-center gap-1.5 rounded-full bg-black/60 px-2.5 py-1 text-xs font-semibold text-white/90 backdrop-blur-md border border-white/10 transition-all duration-300",
          isFullscreen && !isCinematicMode ? "left-24 md:left-28" : "left-13 md:left-15",
          showControls ? "opacity-100" : "opacity-0 pointer-events-none"
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <span className="size-2 rounded-full bg-emerald-400 animate-pulse" />
        <span>720p HD</span>
      </div>

      {/* Bottom Floating Control Bar */}
      <div
        className={cn(
          "absolute inset-x-0 bottom-0 z-30 flex flex-col justify-end p-3 sm:p-5 bg-gradient-to-t from-black/85 via-black/40 to-transparent transition-all duration-300",
          showControls ? "opacity-100 translate-y-0" : "opacity-0 translate-y-3 pointer-events-none"
        )}
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => {
          e.stopPropagation()
          pingActivity()
        }}
        onMouseMove={pingActivity}
        onPointerMove={pingActivity}
      >
        {/* Quick Interaction Bar (Reactions, Comments, Info) - Stacked cleanly above Scrubber with zero overlap */}
        {photoId && !isCinematicMode && !isFullscreen && (
          <div
            className={cn(
              "flex items-center mb-2.5 sm:mb-3 pointer-events-auto max-w-full overflow-x-auto no-scrollbar touch-none transition-opacity duration-200",
              isScrubbing ? "opacity-0 pointer-events-none" : "opacity-100"
            )}
            onClick={(e) => {
              e.stopPropagation()
              pingActivity()
            }}
            onPointerDown={(e) => {
              e.stopPropagation()
              pingActivity()
            }}
          >
            <div className="flex items-center gap-1 sm:gap-1.5 p-1 rounded-full bg-neutral-950/85 backdrop-blur-xl border border-white/15 shadow-2xl shadow-black/60 shrink-0">
              <div className="flex items-center pl-0.5 sm:pl-1">
                <PhotoReactions photoId={photoId} compact />
              </div>

              {(onOpenComments || onOpenInfo) && (
                <div className="h-4 w-px bg-white/20 my-auto shrink-0" />
              )}

              {/* Comment Trigger Button */}
              {onOpenComments && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    pingActivity()
                    onOpenComments()
                  }}
                  className="group flex items-center gap-1.5 px-2.5 sm:px-3 py-1 rounded-full text-xs font-semibold text-white bg-white/10 hover:bg-white/20 active:scale-95 transition-all duration-200 border border-white/10 cursor-pointer shrink-0"
                  aria-label="Open Comments"
                >
                  <MessageSquare className="size-3.5 text-emerald-400 transition-transform group-hover:scale-110" />
                  <span className="tracking-wide text-[11px] sm:text-xs">Comment</span>
                </button>
              )}

              {/* Info Trigger Button */}
              {onOpenInfo && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    pingActivity()
                    onOpenInfo()
                  }}
                  className="flex items-center gap-1 px-2 sm:px-2.5 py-1 rounded-full text-xs font-medium text-white/75 hover:text-white hover:bg-white/15 active:scale-95 transition-all duration-200 cursor-pointer shrink-0"
                  aria-label="Video Details"
                >
                  <CircleAlertIcon className="size-3.5 text-white/80" />
                  <span className="text-[10px] sm:text-[11px] font-medium">Info</span>
                </button>
              )}
            </div>
          </div>
        )}

        {/* Timeline Scrubber with Floating Thumbnail Preview */}
        <div
          ref={timelineTrackRef}
          role="slider"
          aria-label="Video timeline scrubber"
          aria-valuemin={0}
          aria-valuemax={duration || 100}
          aria-valuenow={displayTime}
          className="relative flex items-center w-full h-8 mb-1 group/scrubber cursor-pointer touch-none select-none py-2"
          onPointerDown={handleScrubberPointerDown}
          onPointerMove={handleScrubberPointerMove}
          onPointerUp={handleScrubberPointerUp}
          onPointerCancel={handleScrubberPointerUp}
          onPointerEnter={handleScrubberPointerEnter}
          onPointerLeave={handleScrubberPointerLeave}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Floating Thumbnail Preview Tooltip (Shown on scrub or hover) */}
          {(isScrubbing || isHoveringTimeline) && previewTime !== null && duration > 0 && (
            <div
              className="absolute bottom-[calc(100%+8px)] -translate-x-1/2 pointer-events-none z-30 flex flex-col items-center transition-opacity duration-150 animate-in fade-in zoom-in-95"
              style={{
                left: previewX !== null ? `${previewX}px` : `${Math.min(Math.max(previewPercent, 0), 100)}%`,
              }}
            >
              <div
                className={cn(
                  "relative overflow-hidden rounded-lg border border-white/25 bg-black/90 shadow-2xl backdrop-blur-md flex items-center justify-center",
                  isVideoLandscape
                    ? "w-36 h-20 sm:w-44 sm:h-25"
                    : "w-20 h-36 sm:w-24 sm:h-42"
                )}
              >
                {/* Miniature Video Frame Preview */}
                <video
                  ref={previewVideoRef}
                  src={src}
                  muted
                  playsInline
                  webkit-playsinline="true"
                  preload="metadata"
                  onLoadedMetadata={handlePreviewLoadedMetadata}
                  className="size-full object-cover"
                />

                {/* Glass Time Badge */}
                <div className="absolute bottom-1 px-1.5 py-0.5 rounded bg-black/85 backdrop-blur-md text-[10px] sm:text-[11px] font-mono font-semibold text-white tracking-wider border border-white/15 shadow-md">
                  {formatVideoDuration(previewTime)}
                </div>
              </div>

              {/* Bottom Arrow Pointer */}
              <div className="size-2 -mt-1 rotate-45 bg-black/90 border-r border-b border-white/25 shadow-md" />
            </div>
          )}

          {/* Progress Bar Background */}
          <div className="relative w-full h-1.5 sm:h-2 rounded-full bg-white/20 overflow-hidden backdrop-blur-sm pointer-events-none group-hover/scrubber:h-2.5 transition-all">
            {/* Buffered Progress */}
            <div
              className="absolute left-0 top-0 h-full bg-white/30 transition-all duration-200"
              style={{ width: `${bufferedPercent}%` }}
            />
            {/* Played Progress */}
            <div
              className={cn("absolute left-0 top-0 h-full bg-white", isScrubbing ? "transition-none" : "transition-[width] duration-100")}
              style={{ width: `${Math.min(Math.max(progressPercent, 0), 100)}%` }}
            />
          </div>

          {/* Scrubber Thumb Knob */}
          <div
            className={cn(
              "absolute top-1/2 -translate-y-1/2 -translate-x-1/2 size-3.5 sm:size-4 rounded-full bg-white shadow-md border-2 border-emerald-500 pointer-events-none",
              isScrubbing ? "scale-125 opacity-100 transition-none" : "scale-100 opacity-90 transition-transform duration-75 group-hover/scrubber:scale-110 sm:scale-0 sm:group-hover/scrubber:scale-100"
            )}
            style={{ left: `${Math.min(Math.max(progressPercent, 0), 100)}%` }}
          />
        </div>

        {/* Action Buttons Row */}
        <div className="flex items-center justify-between gap-2 text-white">
          {/* Left Controls: Play/Pause, Volume, Timestamps */}
          <div className="flex items-center gap-2 sm:gap-3">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                togglePlay()
              }}
              className="p-1.5 rounded-lg text-white/90 hover:text-white hover:bg-white/15 transition-colors cursor-pointer"
              aria-label={isPlaying ? "Pause" : "Play"}
            >
              {isPlaying ? <Pause className="size-5" /> : <Play className="size-5 fill-current" />}
            </button>

            <div className="flex items-center gap-1.5 group/vol">
              <button
                type="button"
                onClick={toggleMute}
                className="p-1.5 rounded-lg text-white/90 hover:text-white hover:bg-white/15 transition-colors cursor-pointer"
                aria-label={isMuted ? "Unmute" : "Mute"}
              >
                {isMuted || volume === 0 ? (
                  <VolumeX className="size-5 text-red-400" />
                ) : (
                  <Volume2 className="size-5" />
                )}
              </button>
              {/* Desktop Volume Slider */}
              <input
                ref={volumeInputRef}
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={isMuted ? 0 : volume}
                onChange={handleVolumeChange}
                onPointerDown={handleVolumeStart}
                onPointerUp={handleVolumeEnd}
                className="hidden sm:block w-16 h-1 accent-white bg-white/30 rounded-lg cursor-pointer transition-all touch-none select-none"
                aria-label="Volume slider"
              />
            </div>

            {/* Time Display with Living Audio Waveform Equalizer */}
            <div className="text-[11px] sm:text-xs font-medium text-white/80 tabular-nums flex items-center gap-1.5">
              <span>{formatVideoDuration(displayTime)}</span>
              <span className="text-white/40">/</span>
              <span>{formatVideoDuration(duration)}</span>

              {/* Dynamic Audio Equalizer Bars (Active when playing) */}
              <div
                className="flex items-end gap-[2px] h-3.5 px-1 py-0.5 rounded-sm bg-white/5 border border-white/10 ml-0.5 select-none"
                title={isPlaying ? "Playing media audio" : "Paused"}
              >
                <span
                  className={cn(
                    "w-[2.5px] rounded-full bg-emerald-400 transition-all",
                    isPlaying ? "audio-bar-1" : "h-[3px] opacity-50"
                  )}
                />
                <span
                  className={cn(
                    "w-[2.5px] rounded-full bg-emerald-400 transition-all",
                    isPlaying ? "audio-bar-2" : "h-[5px] opacity-50"
                  )}
                />
                <span
                  className={cn(
                    "w-[2.5px] rounded-full bg-emerald-400 transition-all",
                    isPlaying ? "audio-bar-3" : "h-[2.5px] opacity-50"
                  )}
                />
              </div>
            </div>
          </div>

          {/* Right Controls: Replay, Fullscreen */}
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => {
                seekVideo(0)
                const video = videoRef.current
                if (video) {
                  void video.play().then(() => setIsPlaying(true)).catch(() => {})
                }
              }}
              className="p-1.5 rounded-lg text-white/80 hover:text-white hover:bg-white/15 transition-colors cursor-pointer"
              title="Replay from start"
              aria-label="Replay video"
            >
              <RotateCcw className="size-4.5" />
            </button>

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                toggleFullscreen()
              }}
              className="p-1.5 rounded-lg text-white/80 hover:text-white hover:bg-white/15 transition-colors cursor-pointer"
              title={isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
              aria-label="Toggle fullscreen"
            >
              {isFullscreen ? <Minimize className="size-5" /> : <Maximize className="size-5" />}
            </button>
          </div>
        </div>
      </div>
      </div>
    </div>
  )
})
