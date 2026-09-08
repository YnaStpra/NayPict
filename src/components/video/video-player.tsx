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
} from "lucide-react"
import { cn } from "@/lib/utils"
import { formatVideoDuration } from "@/lib/video-compress"
import { toProxyMediaUrl } from "@/lib/url"
import { PhotoReactions } from "@/components/photo/photo-reactions"

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
  const scrubberInputRef = useRef<HTMLInputElement>(null)
  const volumeInputRef = useRef<HTMLInputElement>(null)
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

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

  // Reset idle timer to hide controls after 2.5s of inactivity while playing
  const pingActivity = useCallback(() => {
    setShowControls(true)
    if (idleTimerRef.current) {
      clearTimeout(idleTimerRef.current)
    }
    if (isPlaying && !isScrubbing) {
      idleTimerRef.current = setTimeout(() => {
        setShowControls(false)
      }, 2500)
    }
  }, [isPlaying, isScrubbing])

  useEffect(() => {
    pingActivity()
    return () => {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current)
    }
  }, [isPlaying, isScrubbing, pingActivity])

  // Instantly pause video & audio when slide becomes inactive (swiped away to left or right)
  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    if (!isActive) {
      video.pause()
      setIsPlaying(false)
    } else if (autoPlay) {
      void video.play().then(() => setIsPlaying(true)).catch(() => {
        // Fallback to muted autoplay if browser autoplay policy blocks unmuted audio
        video.muted = true
        setIsMuted(true)
        void video.play().then(() => setIsPlaying(true)).catch(() => {})
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

  // Stop native gesture propagation on range inputs to prevent lightbox carousel swipe hijacking
  useEffect(() => {
    const scrubber = scrubberInputRef.current
    const volumeEl = volumeInputRef.current

    const stopNativeGesture = (e: Event) => {
      e.stopPropagation()
      if (typeof e.stopImmediatePropagation === "function") {
        e.stopImmediatePropagation()
      }
    }

    const elements = [scrubber, volumeEl].filter(Boolean) as HTMLInputElement[]
    const events = [
      "pointerdown",
      "pointermove",
      "pointerup",
      "pointercancel",
      "touchstart",
      "touchmove",
      "touchend",
      "touchcancel",
      "mousedown",
      "mousemove",
      "mouseup",
    ]

    elements.forEach((el) => {
      events.forEach((evt) => {
        el.addEventListener(evt, stopNativeGesture, { passive: false })
      })
    })

    return () => {
      elements.forEach((el) => {
        events.forEach((evt) => {
          el.removeEventListener(evt, stopNativeGesture)
        })
      })
    }
  }, [])

  // Play / Pause toggle with center badge ripple
  const togglePlay = useCallback(() => {
    const video = videoRef.current
    if (!video) return

    if (video.paused || video.ended) {
      void video.play().then(() => {
        setIsPlaying(true)
        setCenterIconState("play")
        setShowCenterIcon(true)
        setTimeout(() => setShowCenterIcon(false), 500)
      }).catch(() => {})
    } else {
      video.pause()
      setIsPlaying(false)
      setCenterIconState("pause")
      setShowCenterIcon(true)
      setTimeout(() => setShowCenterIcon(false), 500)
    }
    pingActivity()
  }, [pingActivity])

  // Time update and buffer progress
  const handleTimeUpdate = useCallback(() => {
    const video = videoRef.current
    if (!video || isScrubbing) return
    setCurrentTime(video.currentTime)

    if (video.buffered.length > 0 && video.duration > 0) {
      const bufferedEnd = video.buffered.end(video.buffered.length - 1)
      setBufferedPercent((bufferedEnd / video.duration) * 100)
    }
  }, [isScrubbing])

  const handleLoadedMetadata = useCallback(() => {
    const video = videoRef.current
    if (!video) return
    setDuration(video.duration || 0)
    if (autoPlay) {
      void video.play().then(() => setIsPlaying(true)).catch(() => {})
    }
  }, [autoPlay])

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
    if (e) {
      e.stopPropagation()
      if ("nativeEvent" in e && e.nativeEvent && typeof (e.nativeEvent as Event).stopImmediatePropagation === "function") {
        (e.nativeEvent as Event).stopImmediatePropagation()
      }
    }
    setIsScrubbing(true)
    onScrubbingChange?.(true)
    setShowControls(true)
  }, [onScrubbingChange])

  const handleVolumeEnd = useCallback((e?: React.SyntheticEvent | Event) => {
    if (e) {
      e.stopPropagation()
      if ("nativeEvent" in e && e.nativeEvent && typeof (e.nativeEvent as Event).stopImmediatePropagation === "function") {
        (e.nativeEvent as Event).stopImmediatePropagation()
      }
    }
    setIsScrubbing(false)
    onScrubbingChange?.(false)
    pingActivity()
  }, [onScrubbingChange, pingActivity])

  // Fullscreen toggle
  const toggleFullscreen = useCallback(async () => {
    const container = containerRef.current
    if (!container) return

    if (!document.fullscreenElement) {
      try {
        if (container.requestFullscreen) {
          await container.requestFullscreen()
        } else if ((container as any).webkitRequestFullscreen) {
          await (container as any).webkitRequestFullscreen()
        }
        setIsFullscreen(true)
      } catch {}
    } else {
      try {
        if (document.exitFullscreen) {
          await document.exitFullscreen()
        } else if ((document as any).webkitExitFullscreen) {
          await (document as any).webkitExitFullscreen()
        }
        setIsFullscreen(false)
      } catch {}
    }
    pingActivity()
  }, [pingActivity])

  // Scrubber seeking
  const handleSeekChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    e.stopPropagation()
    const newTime = parseFloat(e.target.value)
    setCurrentTime(newTime)
    const video = videoRef.current
    if (video) {
      video.currentTime = newTime
    }
  }, [])

  const handleSeekStart = useCallback((e?: React.SyntheticEvent | Event) => {
    if (e) {
      e.stopPropagation()
      if ("nativeEvent" in e && e.nativeEvent && typeof (e.nativeEvent as Event).stopImmediatePropagation === "function") {
        (e.nativeEvent as Event).stopImmediatePropagation()
      }
    }
    setIsScrubbing(true)
    onScrubbingChange?.(true)
    setShowControls(true)
  }, [onScrubbingChange])

  const handleSeekMove = useCallback((e: React.SyntheticEvent | Event) => {
    e.stopPropagation()
    if ("nativeEvent" in e && e.nativeEvent && typeof (e.nativeEvent as Event).stopImmediatePropagation === "function") {
      (e.nativeEvent as Event).stopImmediatePropagation()
    }
  }, [])

  const handleSeekEnd = useCallback((e?: React.SyntheticEvent | Event) => {
    if (e) {
      e.stopPropagation()
      if ("nativeEvent" in e && e.nativeEvent && typeof (e.nativeEvent as Event).stopImmediatePropagation === "function") {
        (e.nativeEvent as Event).stopImmediatePropagation()
      }
    }
    setIsScrubbing(false)
    onScrubbingChange?.(false)
    pingActivity()
  }, [onScrubbingChange, pingActivity])

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

  // Toggle controls overlay visibility on screen click without toggling playback
  const handleScreenClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    setShowControls((prev) => {
      const next = !prev
      if (next) {
        // Reset 2.5s auto-hide timer when showing controls
        if (idleTimerRef.current) clearTimeout(idleTimerRef.current)
        if (isPlaying && !isScrubbing) {
          idleTimerRef.current = setTimeout(() => {
            setShowControls(false)
          }, 2500)
        }
      } else {
        if (idleTimerRef.current) clearTimeout(idleTimerRef.current)
      }
      return next
    })
  }, [isPlaying, isScrubbing])

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0

  return (
    <div
      ref={containerRef}
      className={cn(
        "group relative flex items-center justify-center w-full h-full select-none overflow-hidden bg-black",
        className
      )}
      onMouseMove={pingActivity}
      onClick={handleScreenClick}
    >
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
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onEnded={() => {
          setIsPlaying(false)
          setShowControls(true)
          onEnded?.()
        }}
        onError={(e) => {
          const videoEl = e.currentTarget
          if (videoEl.src && !videoEl.src.includes('/media/')) {
            const proxy = toProxyMediaUrl(videoEl.src)
            if (proxy && proxy !== videoEl.src) {
              videoEl.src = proxy
              videoEl.load()
            }
          }
        }}
        aria-label={alt}
      />

      {/* Big Center Play/Pause Indicator (Pops and ripples on toggle) */}
      <div
        className={cn(
          "pointer-events-none absolute inset-0 flex items-center justify-center transition-all duration-300",
          showCenterIcon
            ? "opacity-100 scale-100"
            : !isPlaying
            ? "opacity-90 scale-100"
            : showControls
            ? "opacity-85 scale-100"
            : "opacity-0 scale-75"
        )}
      >
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
          "absolute inset-x-0 bottom-0 z-30 flex flex-col justify-end p-3 sm:p-5 bg-gradient-to-t from-black/85 via-black/40 to-transparent transition-all duration-300 touch-none",
          showControls ? "opacity-100 translate-y-0" : "opacity-0 translate-y-3 pointer-events-none"
        )}
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
        onPointerMove={(e) => e.stopPropagation()}
        onPointerUp={(e) => e.stopPropagation()}
        onTouchStart={(e) => e.stopPropagation()}
        onTouchMove={(e) => e.stopPropagation()}
        onTouchEnd={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        onMouseMove={(e) => e.stopPropagation()}
        onMouseUp={(e) => e.stopPropagation()}
      >
        {/* Quick Interaction Bar (Reactions, Comments, Info) - Stacked cleanly above Scrubber with zero overlap */}
        {photoId && !isCinematicMode && (
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
          className="relative flex items-center w-full mb-2 group/slider py-1 touch-none select-none"
          onPointerDown={(e) => e.stopPropagation()}
          onPointerMove={handleSeekMove}
          onPointerUp={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
          onTouchMove={handleSeekMove}
          onTouchEnd={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          onMouseMove={handleSeekMove}
          onMouseUp={(e) => e.stopPropagation()}
        >
          {/* Progress Bar Background */}
          <div className="relative w-full h-1.5 sm:h-2 rounded-full bg-white/20 overflow-hidden backdrop-blur-sm pointer-events-none">
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

          {/* Invisible Range Input on top for touch/mouse dragging */}
          <input
            ref={scrubberInputRef}
            type="range"
            min={0}
            max={duration || 100}
            step={0.1}
            value={currentTime}
            onChange={handleSeekChange}
            onPointerDown={handleSeekStart}
            onPointerMove={handleSeekMove}
            onPointerUp={handleSeekEnd}
            onPointerCancel={handleSeekEnd}
            onTouchStart={handleSeekStart}
            onTouchMove={handleSeekMove}
            onTouchEnd={handleSeekEnd}
            onTouchCancel={handleSeekEnd}
            onMouseDown={handleSeekStart}
            onMouseMove={handleSeekMove}
            onMouseUp={handleSeekEnd}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer touch-none select-none"
            aria-label="Seek video"
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
                onPointerMove={handleSeekMove}
                onPointerUp={handleVolumeEnd}
                onPointerCancel={handleVolumeEnd}
                onTouchStart={handleVolumeStart}
                onTouchMove={handleSeekMove}
                onTouchEnd={handleVolumeEnd}
                onTouchCancel={handleVolumeEnd}
                onMouseDown={handleVolumeStart}
                onMouseMove={handleSeekMove}
                onMouseUp={handleVolumeEnd}
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
              onClick={toggleFullscreen}
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
