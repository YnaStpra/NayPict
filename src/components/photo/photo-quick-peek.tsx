"use client"

import { useEffect, useState, useMemo } from "react"
import { createPortal } from "react-dom"
import { motion, AnimatePresence } from "framer-motion"
import { MapPin, Play } from "lucide-react"
import { useLocale } from "next-intl"

import { type PhotoVo } from "@/server/entity/vo/photo"
import { formatPhotoTakenDate } from "@/lib/date"
import { getThumbHashUrl } from "@/lib/thumb-hash"
import { toProxyMediaUrl } from "@/lib/url"

interface PhotoQuickPeekProps {
  // Photo data to display in quick peek.
  photo: PhotoVo | null
  // Whether quick peek is currently open.
  open: boolean
  // Handler to close quick peek.
  onClose: () => void
  // Distance badge string if GPS is active.
  distanceBadge?: string | null
}

// Clean photo display name without file extension.
function formatPhotoName(name: string) {
  const index = name.lastIndexOf(".")
  return index > 0 ? name.slice(0, index) : name
}

// Modal portal providing pure Instagram / iOS style Quick Peek preview while holding touch.
export function PhotoQuickPeek({
  photo,
  open,
  onClose,
  distanceBadge,
}: PhotoQuickPeekProps) {
  const locale = useLocale()
  // Ensure portal only mounts on the client
  const [mounted, setMounted] = useState(false)

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

  // Instagram-style auto-dismiss on finger release
  useEffect(() => {
    if (!open) return

    const handleWindowRelease = () => {
      onClose()
    }

    // Attach release listeners to window with a slight deferral so the triggering touch doesn't immediately close it
    const timer = setTimeout(() => {
      window.addEventListener("touchend", handleWindowRelease, { passive: true })
      window.addEventListener("pointerup", handleWindowRelease, { passive: true })
      window.addEventListener("touchcancel", handleWindowRelease, { passive: true })
    }, 60)

    return () => {
      clearTimeout(timer)
      window.removeEventListener("touchend", handleWindowRelease)
      window.removeEventListener("pointerup", handleWindowRelease)
      window.removeEventListener("touchcancel", handleWindowRelease)
    }
  }, [open, onClose])

  // Detect video content
  const isVideo = Boolean(photo?.type?.startsWith("video/"))
  const videoSrc = useMemo(() => {
    if (!isVideo || !photo?.key) return undefined
    const base = photo.key.startsWith("http") ? photo.key : toProxyMediaUrl(photo.key)
    return base ? `${base}#t=0.5` : undefined
  }, [isVideo, photo?.key])

  // Compute ThumbHash placeholder URL
  const placeholder = useMemo(() => {
    if (!photo?.thumbHash || photo.thumbHash.startsWith("00080204")) return undefined
    return getThumbHashUrl(photo.thumbHash)
  }, [photo?.thumbHash])

  const displayImageSrc = photo?.preview || photo?.thumbnail || (isVideo ? null : photo?.key)

  if (!mounted) return null

  return createPortal(
    <AnimatePresence>
      {open && photo && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 select-none touch-manipulation pointer-events-none">
          {/* Frosted Glass Dark Backdrop */}
          <motion.div
            key="quick-peek-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="absolute inset-0 bg-black/80 backdrop-blur-xl"
          />

          {/* Floating Pure Preview Card */}
          <motion.div
            key="quick-peek-card"
            initial={{ scale: 0.85, opacity: 0, y: 12 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.88, opacity: 0, y: 8 }}
            transition={{ type: "spring", stiffness: 440, damping: 28 }}
            className="relative z-10 w-full max-w-[340px] sm:max-w-[400px] rounded-3xl overflow-hidden bg-neutral-900/90 border border-white/15 shadow-[0_25px_60px_-15px_rgba(0,0,0,0.9)] flex flex-col"
          >
            {/* Header with Title, Date, and Location Badge */}
            <div className="px-4 py-3 border-b border-white/10 bg-black/40 backdrop-blur-md">
              <h3 className="text-sm font-semibold text-white truncate">
                {formatPhotoName(photo.name)}
              </h3>
              <div className="flex items-center gap-2 text-[11px] text-white/60 mt-0.5">
                <span>{formatPhotoTakenDate(photo.takenTime, locale) || "Unknown Date"}</span>
                {distanceBadge && (
                  <span className="flex items-center gap-0.5 text-emerald-400 font-medium">
                    <MapPin className="size-2.5" />
                    {distanceBadge}
                  </span>
                )}
              </div>
            </div>

            {/* Media Content Preview */}
            <div className="relative w-full aspect-[4/5] bg-black overflow-hidden flex items-center justify-center">
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
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  )
}
