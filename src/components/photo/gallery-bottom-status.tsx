"use client"

import { useEffect, useRef } from "react"
import { ArrowUp, CheckCircle2, RefreshCw, WifiOff } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useTranslations } from "next-intl"

export interface GalleryBottomStatusProps {
  type?: "gallery" | "album" | "trash" | "archive"
  totalCount: number
  loadedCount: number
  hasMore: boolean
  loadingMore: boolean
  loadMoreError?: boolean
  isOffline?: boolean
  onReachBottom?: () => void
  onRetry?: () => void
  className?: string
}

export function GalleryBottomStatus({
  type = "gallery",
  totalCount,
  loadedCount,
  hasMore,
  loadingMore,
  loadMoreError = false,
  isOffline = false,
  onReachBottom,
  onRetry,
  className = "",
}: GalleryBottomStatusProps) {
  const t = useTranslations("photos")
  const sentinelRef = useRef<HTMLDivElement | null>(null)
  const onReachBottomRef = useRef(onReachBottom)
  onReachBottomRef.current = onReachBottom

  // Trigger loading when sentinel approaches the viewport
  useEffect(() => {
    if (!hasMore || loadingMore || loadMoreError) return

    const el = sentinelRef.current
    if (!el || typeof window === "undefined" || !("IntersectionObserver" in window)) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          onReachBottomRef.current?.()
        }
      },
      { rootMargin: "450px 0px" }
    )

    observer.observe(el)
    return () => observer.disconnect()
  }, [hasMore, loadingMore, loadMoreError])

  // Don't render anything if the collection is completely empty
  if (loadedCount === 0 && !loadingMore && !hasMore) {
    return null
  }

  const handleScrollTop = () => {
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" })
    }
  }

  const getSubtitle = () => {
    try {
      if (type === "album") return t("bottom.endOfAlbum") || "You've reached the end of this album"
      if (type === "trash") return t("bottom.endOfTrash") || "You've reached the end of trash items"
      if (type === "archive") return t("bottom.endOfArchive") || "You've reached the end of archived items"
      return t("bottom.endOfGallery") || "You've reached the end • Stay tuned for new memories!"
    } catch {
      if (type === "album") return "You've reached the end of this album"
      if (type === "trash") return "You've reached the end of trash items"
      if (type === "archive") return "You've reached the end of archived items"
      return "You've reached the end • Stay tuned for new memories!"
    }
  }

  const getLoadingText = () => {
    try {
      return t("bottom.loadingMore") || "Loading more media..."
    } catch {
      return "Loading more media..."
    }
  }

  const getAllLoadedText = (count: number) => {
    try {
      return t("bottom.allLoaded", { count }) || `All ${count} media loaded`
    } catch {
      return `All ${count} media loaded`
    }
  }

  const getLoadFailedText = () => {
    try {
      return t("bottom.loadFailed") || "Failed to load more media"
    } catch {
      return "Failed to load more media"
    }
  }

  const getRetryText = () => {
    try {
      return t("bottom.retry") || "Tap to retry"
    } catch {
      return "Tap to retry"
    }
  }

  const getBackToTopText = () => {
    try {
      return t("bottom.backToTop") || "Back to top"
    } catch {
      return "Back to top"
    }
  }

  return (
    <div className={`relative w-full select-none ${className}`}>
      {/* Invisible sentinel anchor to proactively trigger next page when user scrolls near */}
      {hasMore && !loadMoreError && (
        <div ref={sentinelRef} className="h-6 w-full pointer-events-none" aria-hidden="true" />
      )}

      {/* State 1: Active Loading Animation (While fetching more thumbnails/media) */}
      {loadingMore && (
        <div className="flex flex-col items-center justify-center gap-4 py-8 pb-16 px-3 animate-in fade-in-50 duration-300">
          {/* Shimmering thumbnail preview placeholders previewing incoming media cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 w-full max-w-xl mx-auto opacity-75">
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className="relative h-20 sm:h-24 rounded-xl overflow-hidden bg-muted/40 border border-border/30 shadow-sm"
              >
                <div
                  className="absolute inset-0 bg-gradient-to-r from-transparent via-foreground/5 to-transparent animate-pulse"
                  style={{ animationDelay: `${i * 150}ms` }}
                />
              </div>
            ))}
          </div>

          {/* Floating Glassmorphic Pill with Spinner & Waves */}
          <div className="inline-flex items-center gap-3 px-4 py-2 rounded-full border border-border/70 bg-background/90 backdrop-blur-md shadow-lg shadow-black/5 dark:shadow-black/25">
            {/* Animated Conic Loader */}
            <div className="relative size-4 flex items-center justify-center shrink-0">
              <div className="absolute inset-0 rounded-full border-2 border-primary/20 border-t-primary animate-spin" />
            </div>

            <span className="text-xs font-medium text-foreground tracking-wide">
              {getLoadingText()}
            </span>

            {/* Micro Bouncing Dots */}
            <span className="flex items-center gap-1 shrink-0">
              <span className="size-1.5 rounded-full bg-primary animate-bounce [animation-delay:-0.3s]" />
              <span className="size-1.5 rounded-full bg-primary animate-bounce [animation-delay:-0.15s]" />
              <span className="size-1.5 rounded-full bg-primary animate-bounce" />
            </span>

            {/* Progress counter badge */}
            {totalCount > 0 && (
              <span className="text-[11px] font-mono font-medium text-muted-foreground bg-muted/80 px-2 py-0.5 rounded-full border border-border/40 shrink-0">
                {loadedCount} / {totalCount}
              </span>
            )}
          </div>
        </div>
      )}

      {/* State 2: Load Error / Retry */}
      {!loadingMore && loadMoreError && (
        <div className="flex flex-col items-center justify-center gap-3 py-10 pb-16 px-4 animate-in fade-in-50 duration-300">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400 text-xs font-medium">
            <RefreshCw className="size-3.5" />
            <span>{getLoadFailedText()}</span>
          </div>
          {onRetry && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onRetry}
              className="h-8 text-xs gap-1.5 rounded-full px-4 border-border/70 hover:bg-muted"
            >
              <RefreshCw className="size-3.5" />
              <span>{getRetryText()}</span>
            </Button>
          )}
        </div>
      )}

      {/* State 3: End of Feed / All Media Loaded */}
      {!loadingMore && !hasMore && loadedCount > 0 && !loadMoreError && (
        <div className="relative py-12 pb-20 text-center select-none animate-in fade-in-50 duration-500">
          {/* Subtle Ambient Glow */}
          <div className="absolute inset-0 flex items-center justify-center -z-10 pointer-events-none">
            <div className="w-72 h-20 bg-primary/5 rounded-full blur-2xl" />
          </div>

          {/* Centered Pill with Clean Border Lines */}
          <div className="relative flex items-center justify-center max-w-md mx-auto mb-3">
            <div className="w-full border-t border-border/40" />
            <div className="absolute px-3 bg-background">
              <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-border/60 bg-muted/30 backdrop-blur-sm text-xs font-semibold text-foreground/90 shadow-sm">
                <CheckCircle2 className="size-4 text-emerald-500 dark:text-emerald-400 shrink-0 animate-in zoom-in-75 duration-300" />
                <span>{getAllLoadedText(totalCount > 0 ? totalCount : loadedCount)}</span>
              </div>
            </div>
          </div>

          {/* Subtitle Message */}
          <p className="text-xs font-normal text-muted-foreground/75 tracking-wide mt-4">
            {getSubtitle()}
          </p>

          {/* Quick Back-to-Top Helper Link */}
          <div className="mt-3 flex justify-center">
            <button
              type="button"
              onClick={handleScrollTop}
              className="inline-flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground/70 hover:text-foreground transition-colors px-2.5 py-1 rounded-md hover:bg-muted/50 cursor-pointer"
            >
              <ArrowUp className="size-3" />
              <span>{getBackToTopText()}</span>
            </button>
          </div>
        </div>
      )}

      {/* State 4: Offline Status Pill */}
      {isOffline && (
        <div className="flex justify-center pb-8">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400 text-xs font-medium">
            <WifiOff className="size-3.5 shrink-0" />
            <span>Viewing offline cached media</span>
          </div>
        </div>
      )}
    </div>
  )
}
