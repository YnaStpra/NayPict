"use client"

import { useEffect, useState, useRef, useMemo, useCallback } from "react"
import { createPortal } from "react-dom"
import { motion, AnimatePresence } from "framer-motion"
import { Heart, Maximize2, Share2, X, MapPin, Play } from "lucide-react"
import { toast } from "sonner"
import { useLocale } from "next-intl"

import { type PhotoVo } from "@/server/entity/vo/photo"
import { formatPhotoTakenDate } from "@/lib/date"
import { getThumbHashUrl } from "@/lib/thumb-hash"
import { toProxyMediaUrl } from "@/lib/url"
import { reactionSync } from "@/lib/reaction-sync"
import { trackVisitorMedia } from "@/hooks/use-visitor-tracker"
import { PhotoHeartBurst } from "@/components/photo/photo-heart-burst"

interface PhotoQuickPeekProps {
  // Photo data to display in quick peek.
  photo: PhotoVo | null
  // Whether quick peek is currently open.
  open: boolean
  // Handler to close quick peek.
  onClose: () => void
  // Handler to transition to full viewer.
  onOpenFull?: (photoId: string) => void
  // Distance badge string if GPS is active.
  distanceBadge?: string | null
}

// Clean photo display name without file extension.
function formatPhotoName(name: string) {
  const index = name.lastIndexOf(".")
  return index > 0 ? name.slice(0, index) : name
}

// Modal portal providing iOS / Instagram style Haptic Quick Peek preview on mobile devices.
export function PhotoQuickPeek({
  photo,
  open,
  onClose,
  onOpenFull,
  distanceBadge,
}: PhotoQuickPeekProps) {
  const locale = useLocale()
  const [mounted, setMounted] = useState(false)
  const [showHeartBurst, setShowHeartBurst] = useState(false)
  const [burstCoords, setBurstCoords] = useState<{ x: number; y: number } | null>(null)
  const [isLoved, setIsLoved] = useState(false)
  const [loveCount, setLoveCount] = useState(0)
  const lastTapRef = useRef<number>(0)

  // Wait until mounted on client for createPortal
  useEffect(() => {
    setMounted(true)
  }, [])

  // Lock body scroll while Quick Peek is active
  useEffect(() => {
    if (!open) return
    const originalOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = originalOverflow
    }
  }, [open])

  // Subscribe to real-time reaction state for this photo
  useEffect(() => {
    if (!photo?.photoId || !open) return

    const cached = reactionSync.getCached(photo.photoId)
    if (cached) {
      setIsLoved(Boolean(cached.userReactions?.love))
      setLoveCount(cached.totals?.love || 0)
    }

    const unsubscribe = reactionSync.subscribe(photo.photoId, (data) => {
      setIsLoved(Boolean(data.userReactions?.love))
      setLoveCount(data.totals?.love || 0)
    })

    return () => {
      unsubscribe()
    }
  }, [photo?.photoId, open])

  // Toggle or confirm love reaction with haptic vibration
  const handleLoveClick = useCallback(async (e?: React.MouseEvent) => {
    e?.stopPropagation()
    if (!photo?.photoId) return

    try {
      if (typeof navigator !== "undefined" && navigator.vibrate) {
        navigator.vibrate(15)
      }
    } catch {}

    setShowHeartBurst(true)
    trackVisitorMedia(photo.photoId, "reaction")
    await reactionSync.toggleReaction(photo.photoId, "love")
  }, [photo?.photoId])

  // Handle double-tap on preview image to react
  const handlePreviewTap = useCallback((e: React.TouchEvent | React.MouseEvent) => {
    const now = Date.now()
    if (now - lastTapRef.current < 280) {
      // Double tap detected
      e.stopPropagation()
      const rect = e.currentTarget.getBoundingClientRect()
      let clientX = rect.width / 2
      let clientY = rect.height / 2

      if ("touches" in e && e.touches.length > 0) {
        clientX = e.touches[0].clientX - rect.left
        clientY = e.touches[0].clientY - rect.top
      } else if ("clientX" in e) {
        clientX = e.clientX - rect.left
        clientY = e.clientY - rect.top
      }

      setBurstCoords({ x: clientX, y: clientY })
      setShowHeartBurst(true)

      try {
        if (typeof navigator !== "undefined" && navigator.vibrate) {
          navigator.vibrate([15, 30, 15])
        }
      } catch {}

      if (!isLoved && photo?.photoId) {
        reactionSync.toggleReaction(photo.photoId, "love")
        trackVisitorMedia(photo.photoId, "reaction")
      }
      lastTapRef.current = 0
    } else {
      lastTapRef.current = now
    }
  }, [isLoved, photo?.photoId])

  // Trigger web share API or copy URL fallback
  const handleShareClick = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!photo) return

    try {
      if (typeof navigator !== "undefined" && navigator.vibrate) {
        navigator.vibrate(10)
      }
    } catch {}

    const shareUrl = `${window.location.origin}/photo/${photo.photoId}`
    if (navigator.share) {
      try {
        await navigator.share({
          title: photo.name,
          url: shareUrl,
        })
        return
      } catch (err) {
        if ((err as Error).name === "AbortError") return
      }
    }

    try {
      await navigator.clipboard.writeText(shareUrl)
      toast.success("Photo link copied to clipboard")
    } catch {
      toast.error("Failed to copy photo link")
    }
  }, [photo])

  // Open full lightbox viewer
  const handleOpenFull = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    if (!photo?.photoId) return
    onClose()
    onOpenFull?.(photo.photoId)
  }, [photo?.photoId, onClose, onOpenFull])

  const isVideo = Boolean(photo?.type?.startsWith("video/"))
  const videoSrc = useMemo(() => {
    if (!isVideo || !photo?.key) return undefined
    const base = photo.key.startsWith("http") ? photo.key : toProxyMediaUrl(photo.key)
    return base ? `${base}#t=0.5` : undefined
  }, [isVideo, photo?.key])

  const placeholder = useMemo(() => {
    if (!photo?.thumbHash || photo.thumbHash.startsWith("00080204")) return undefined
    return getThumbHashUrl(photo.thumbHash)
  }, [photo?.thumbHash])

  const displayImageSrc = photo?.preview || photo?.thumbnail || (isVideo ? null : photo?.key)

  if (!mounted) return null

  return createPortal(
    <AnimatePresence>
      {open && photo && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 select-none touch-manipulation">
          {/* Frosted Glass Dark Backdrop */}
          <motion.div
            key="quick-peek-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.22 }}
            className="absolute inset-0 bg-black/75 backdrop-blur-xl"
            onClick={onClose}
          />

          {/* Floating Preview Card */}
          <motion.div
            key="quick-peek-card"
            initial={{ scale: 0.82, opacity: 0, y: 15 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.88, opacity: 0, y: 10 }}
            transition={{ type: "spring", stiffness: 420, damping: 28 }}
            className="relative z-10 w-full max-w-[360px] sm:max-w-[420px] rounded-3xl overflow-hidden bg-neutral-900/90 border border-white/15 shadow-[0_25px_60px_-15px_rgba(0,0,0,0.9)] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Top Bar with Title & Close Button */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 bg-black/40 backdrop-blur-md">
              <div className="min-w-0 pr-2">
                <h3 className="text-sm font-semibold text-white truncate">
                  {formatPhotoName(photo.name)}
                </h3>
                <div className="flex items-center gap-2 text-[11px] text-white/60">
                  <span>{formatPhotoTakenDate(photo.takenTime, locale) || "Unknown Date"}</span>
                  {distanceBadge && (
                    <span className="flex items-center gap-0.5 text-emerald-400 font-medium">
                      <MapPin className="size-2.5" />
                      {distanceBadge}
                    </span>
                  )}
                </div>
              </div>

              <button
                type="button"
                onClick={onClose}
                aria-label="Close Quick Peek"
                className="size-7 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 active:scale-95 text-white/80 transition-all cursor-pointer"
              >
                <X className="size-4" />
              </button>
            </div>

            {/* Media Content Preview with Double-Tap Heart Burst */}
            <div
              className="relative w-full aspect-[4/5] bg-black overflow-hidden flex items-center justify-center cursor-pointer"
              onClick={handlePreviewTap}
              onTouchStart={handlePreviewTap}
            >
              {/* Double-Tap Heart Burst Overlay */}
              <PhotoHeartBurst
                show={showHeartBurst}
                coords={burstCoords}
                size={84}
                onComplete={() => setShowHeartBurst(false)}
              />

              {isVideo ? (
                <div className="relative size-full">
                  <video
                    src={videoSrc}
                    autoPlay
                    loop
                    muted
                    playsInline
                    className="size-full object-cover pointer-events-none"
                  />
                  <div className="absolute top-3 right-3 flex items-center gap-1 rounded-full bg-black/60 backdrop-blur-md px-2 py-0.5 text-[10px] font-bold text-emerald-400 border border-emerald-500/30">
                    <Play className="size-2.5 fill-current animate-pulse" />
                    <span>PREVIEW</span>
                  </div>
                </div>
              ) : (
                <div
                  className="size-full bg-cover bg-center"
                  style={{
                    backgroundImage: placeholder ? `url("${placeholder}")` : undefined,
                  }}
                >
                  {displayImageSrc && (
                    <img
                      src={displayImageSrc}
                      alt={photo.name}
                      className="size-full object-cover pointer-events-none select-none"
                      draggable={false}
                    />
                  )}
                </div>
              )}

              {/* Double-tap Hint Overlay Badge */}
              <div className="pointer-events-none absolute bottom-3 inset-x-0 flex justify-center">
                <span className="rounded-full bg-black/55 backdrop-blur-md px-3 py-1 text-[10px] text-white/75 border border-white/10 font-medium">
                  Double-tap to like ❤️
                </span>
              </div>
            </div>

            {/* Action Bar Island */}
            <div className="flex items-center justify-around px-3 py-2.5 border-t border-white/10 bg-black/50 backdrop-blur-md">
              {/* Love / React Action Button */}
              <button
                type="button"
                onClick={handleLoveClick}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all active:scale-90 cursor-pointer ${
                  isLoved
                    ? "bg-rose-500/25 text-rose-300 border border-rose-500/40 shadow-[0_0_12px_rgba(244,63,94,0.35)]"
                    : "bg-white/10 text-white/80 hover:bg-white/15 border border-white/10"
                }`}
              >
                <Heart className={`size-3.5 ${isLoved ? "fill-rose-500 text-rose-400" : ""}`} />
                <span>{loveCount > 0 ? loveCount : "Love"}</span>
              </button>

              {/* Share Action Button */}
              <button
                type="button"
                onClick={handleShareClick}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-white/10 text-white/80 hover:bg-white/15 border border-white/10 transition-all active:scale-90 cursor-pointer"
              >
                <Share2 className="size-3.5" />
                <span>Share</span>
              </button>

              {/* Open Full View Action Button */}
              <button
                type="button"
                onClick={handleOpenFull}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90 transition-all active:scale-90 cursor-pointer"
              >
                <Maximize2 className="size-3.5" />
                <span>Full View</span>
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  )
}
