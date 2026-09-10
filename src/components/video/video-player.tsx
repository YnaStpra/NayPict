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
}: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const timelineTrackRef = useRef<HTMLDivElement>(null)
  const volumeInputRef = useRef<HTMLInputElement>(null)
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isScrubbingRef = useRef(false)

  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
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

  // Reset video loading & buffering state when media source changes
  useEffect(() => {
    setIsLoading(true)
    setIsBuffering(false)
    setHasFirstFrame(false)
    setIsPlaying(false)
  }, [src])

  // Reset idle timer to hide controls after 2.5s of inactivity while playing
  const pingActivity = useCallback(() => {
    setShowControls(true)
    if (idleTimerRef.current) {
      clearTimeout(idleTimerRef.current)
      idleTimerRef.current = null
    }
    if (isPlaying && !isScrubbingRef.current) {
      idleTimerRef.current = setTimeout(() => {
        if (!isScrubbingRef.current) {
          setShowControls(false)
        }
      }, 2500)
    }
  }, [isPlaying])

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
    if (!video || isScrubbingRef.current) return
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

  // Native Fullscreen toggle supporting mobile (iOS Safari, Android Chrome) and PC/Desktop
  const toggleFullscreen = useCallback(async () => {
    const video = videoRef.current
    const container = containerRef.current
    if (!video || !container) return

    const isCurrentlyFullscreen = Boolean(
      document.fullscreenElement ||
      (document as any).webkitFullscreenElement ||
      (video as any).webkitDisplayingFullscreen
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

    // iOS Safari: Enter native fullscreen on video element
    if (typeof (video as any).webkitEnterFullscreen === "function") {
      try {
        (video as any).webkitEnterFullscreen()
        setIsFullscreen(true)
        pingActivity()
        return
      } catch {}
    }

    // Android & Desktop: Request native fullscreen on container
    try {
      if (container.requestFullscreen) {
        await container.requestFullscreen()
      } else if ((container as any).webkitRequestFullscreen) {
        await (container as any).webkitRequestFullscreen()
      } else if (video.requestFullscreen) {
        await video.requestFullscreen()
      }
      setIsFullscreen(true)

      // On mobile devices with orientation lock support (e.g. Android Chrome):
      // If video is landscape, orient to landscape
      const isMobile = window.innerWidth < 768 || /Android|Mobile/i.test(navigator.userAgent)
      const isLandscape = (video.videoWidth || 0) > (video.videoHeight || 0)
      if (isMobile && isLandscape) {
        try {
          const screenAny = typeof screen !== "undefined" ? (screen as any) : null
          if (screenAny?.orientation?.lock) {
            void screenAny.orientation.lock("landscape").catch(() => {})
          }
        } catch {}
      }
    } catch (err) {
      console.warn("Fullscreen request failed:", err)
    }
    pingActivity()
  }, [pingActivity])

  // Synchronize fullscreen state changes from native browser events
  useEffect(() => {
    const handleFullscreenStateChange = () => {
      const isFs = Boolean(
        document.fullscreenElement ||
        (document as any).webkitFullscreenElement
      )
      setIsFullscreen(isFs)
      if (!isFs) {
        try {
          const screenAny = typeof screen !== "undefined" ? (screen as any) : null
          if (screenAny?.orientation?.unlock) {
            screenAny.orientation.unlock()
          }
        } catch {}
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

  // High-precision scrubber seeking supporting both direct taps & fluid touch/pointer dragging
  const updateScrubberTime = useCallback((clientX: number) => {
    const track = timelineTrackRef.current
    const video = videoRef.current
    if (!track || !video || !duration || duration <= 0) return

    const rect = track.getBoundingClientRect()
    if (rect.width <= 0) return

    const offsetX = Math.max(0, Math.min(clientX - rect.left, rect.width))
    const percent = offsetX / rect.width
    const targetTime = Math.max(0, Math.min(percent * duration, duration))

    setCurrentTime(targetTime)
    video.currentTime = targetTime

    const mediaKey = photoId || src
    if (mediaKey) {
      globalVideoPositions.set(mediaKey, targetTime)
    }
  }, [duration, photoId, src])

  const handleScrubberPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation()
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

    updateScrubberTime(e.clientX)

    const handleWindowPointerMove = (moveEvent: PointerEvent) => {
      if (!isScrubbingRef.current) return
      updateScrubberTime(moveEvent.clientX)
    }

    const handleWindowPointerUp = (upEvent: PointerEvent) => {
      window.removeEventListener("pointermove", handleWindowPointerMove)
      window.removeEventListener("pointerup", handleWindowPointerUp)
      window.removeEventListener("pointercancel", handleWindowPointerUp)

      isScrubbingRef.current = false
      setIsScrubbing(false)
      onScrubbingChange?.(false)

      updateScrubberTime(upEvent.clientX)
      pingActivity()
    }

    window.addEventListener("pointermove", handleWindowPointerMove)
    window.addEventListener("pointerup", handleWindowPointerUp)
    window.addEventListener("pointercancel", handleWindowPointerUp)
  }, [onScrubbingChange, pingActivity, updateScrubberTime])

  const handleScrubberPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!isScrubbingRef.current) return
    e.stopPropagation()

    if (idleTimerRef.current) {
      clearTimeout(idleTimerRef.current)
      idleTimerRef.current = null
    }
    setShowControls(true)

    updateScrubberTime(e.clientX)
  }, [updateScrubberTime])

  const handleScrubberPointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!isScrubbingRef.current) return
    e.stopPropagation()

    try {
      e.currentTarget.releasePointerCapture(e.pointerId)
    } catch {}

    isScrubbingRef.current = false
    setIsScrubbing(false)
    onScrubbingChange?.(false)

    updateScrubberTime(e.clientX)
    pingActivity()
  }, [onScrubbingChange, pingActivity, updateScrubberTime])

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
          video.currentTime = Math.max(0, video.currentTime - 5)
          setCurrentTime(video.currentTime)
        }
        pingActivity()
      } else if (e.key === "ArrowRight") {
        e.preventDefault()
        const video = videoRef.current
        if (video) {
          video.currentTime = Math.min(duration, video.currentTime + 5)
          setCurrentTime(video.currentTime)
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

  // Keep controls alive on mouse move while controls are visible
  const handleMouseMove = useCallback(() => {
    if (showControls) {
      if (idleTimerRef.current) {
        clearTimeout(idleTimerRef.current)
        idleTimerRef.current = null
      }
      if (isPlaying && !isScrubbingRef.current) {
        idleTimerRef.current = setTimeout(() => {
          if (!isScrubbingRef.current) {
            setShowControls(false)
          }
        }, 2500)
      }
    }
  }, [showControls, isPlaying])

  // Toggle controls overlay visibility on screen click without toggling playback
  const handleScreenClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    setShowControls((prev) => {
      const next = !prev
      if (idleTimerRef.current) {
        clearTimeout(idleTimerRef.current)
        idleTimerRef.current = null
      }
      if (next) {
        // Reset 2.5s auto-hide timer when revealing controls
        if (isPlaying && !isScrubbingRef.current) {
          idleTimerRef.current = setTimeout(() => {
            if (!isScrubbingRef.current) {
              setShowControls(false)
            }
          }, 2500)
        }
      }
      return next
    })
  }, [isPlaying])

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0

  return (
    <div
      ref={containerRef}
      className={cn(
        "group relative flex items-center justify-center w-full h-full select-none overflow-hidden bg-black",
        className
      )}
      onMouseMove={handleMouseMove}
    >
      {/* Visual Poster Overlay: Stays visible until video decodes and renders first playing frame */}
      {poster && (
        <img
          src={poster}
          alt={alt}
          className={cn(
            "absolute inset-0 size-full object-contain pointer-events-none transition-opacity duration-500 z-5",
            hasFirstFrame && isPlaying ? "opacity-0" : "opacity-100"
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
        }}
        onSeeking={() => setIsBuffering(true)}
        onSeeked={() => {
          setIsBuffering(false)
          setHasFirstFrame(true)
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
            : !isPlaying
            ? "opacity-90 scale-100"
            : showControls
            ? "opacity-85 scale-100"
            : "opacity-0 scale-75"
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
              showCenterIcon || !isPlaying || showControls ? "pointer-events-auto" : "pointer-events-none"
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

      {/* Top Floating Glass Badge for Video Tag (Shifted right to avoid overlapping back/close button) */}
      <div
        className={cn(
          "absolute top-2.5 left-13 md:top-3.5 md:left-15 z-20 flex items-center gap-1.5 rounded-full bg-black/60 px-2.5 py-1 text-xs font-semibold text-white/90 backdrop-blur-md border border-white/10 transition-opacity duration-300",
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
            className="flex items-center mb-2.5 sm:mb-3 pointer-events-auto max-w-full overflow-x-auto no-scrollbar touch-none"
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

        {/* Timeline Scrubber */}
        <div
          ref={timelineTrackRef}
          role="slider"
          aria-label="Video timeline scrubber"
          aria-valuemin={0}
          aria-valuemax={duration || 100}
          aria-valuenow={currentTime}
          className="relative flex items-center w-full h-8 mb-1 group/scrubber cursor-pointer touch-none select-none py-2"
          onPointerDown={handleScrubberPointerDown}
          onPointerMove={handleScrubberPointerMove}
          onPointerUp={handleScrubberPointerUp}
          onPointerCancel={handleScrubberPointerUp}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Progress Bar Background */}
          <div className="relative w-full h-1.5 sm:h-2 rounded-full bg-white/20 overflow-hidden backdrop-blur-sm pointer-events-none group-hover/scrubber:h-2.5 transition-all">
            {/* Buffered Progress */}
            <div
              className="absolute left-0 top-0 h-full bg-white/30 transition-all duration-200"
              style={{ width: `${bufferedPercent}%` }}
            />
            {/* Played Progress */}
            <div
              className="absolute left-0 top-0 h-full bg-white transition-all"
              style={{ width: `${progressPercent}%` }}
            />
          </div>

          {/* Scrubber Thumb Knob */}
          <div
            className={cn(
              "absolute top-1/2 -translate-y-1/2 -translate-x-1/2 size-3.5 sm:size-4 rounded-full bg-white shadow-md border-2 border-emerald-500 pointer-events-none transition-transform duration-75",
              isScrubbing ? "scale-125 opacity-100" : "scale-100 opacity-90 group-hover/scrubber:scale-110 sm:scale-0 sm:group-hover/scrubber:scale-100"
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

            {/* Time Display */}
            <div className="text-[11px] sm:text-xs font-medium text-white/80 tabular-nums">
              <span>{formatVideoDuration(currentTime)}</span>
              <span className="mx-1 text-white/40">/</span>
              <span>{formatVideoDuration(duration)}</span>
            </div>
          </div>

          {/* Right Controls: Replay, Fullscreen */}
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => {
                const video = videoRef.current
                if (video) {
                  video.currentTime = 0
                  setCurrentTime(0)
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
  )
})
