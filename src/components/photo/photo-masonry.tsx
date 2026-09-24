"use client"

import { memo, useEffect, useMemo, useRef, useState, useLayoutEffect, createContext, useContext, useCallback } from "react"
import { flushSync } from "react-dom"
import {
  MasonryScroller,
  type Positioner,
  type RenderComponentProps,
  usePositioner,
} from "masonic"


import dynamic from "next/dynamic"
import { usePinch } from "@use-gesture/react"
import { LayoutGrid } from "lucide-react"
import { useApp } from "@/app/provider"
import { useIsMobile } from "@/hooks/use-mobile"
import { PhotoCard, loadedThumbnails } from "@/components/photo/photo-card"
import { PhotoSelectionDrawer } from "@/components/photo/photo-selection-drawer"
import { PhotoTimelineScrubber } from "@/components/photo/photo-timeline-scrubber"
import { type PhotoVo } from "@/server/entity/vo/photo"
import { parseTime } from "@/lib/date"
import { type HeroTransitionOrigin } from "@/components/photo/hero-photo-transition"
import { prebufferVideo } from "@/lib/video-prebuffer"

const PhotoBatchEditDialog = dynamic(
  () => import("@/components/photo/photo-batch-edit-dialog").then((mod) => mod.PhotoBatchEditDialog),
  { ssr: false }
)

interface PhotoMasonryProps {
  photos: PhotoVo[]
  resetKey?: number
  groupByDate?: boolean
  groupByType?: boolean
  enableTimelineScrubber?: boolean
  onReachBottom: () => void
  onPhotoOpen?: (index: number, origin?: HeroTransitionOrigin) => void
  onPhotoDelete?: (photoIds: string[]) => void
  onPhotoRestore?: (photoIds: string[]) => void
  onAlbumOpen?: (photoIds: string[]) => void
  onAlbumRemove?: (photoIds: string[]) => void
  onPhotoPin?: (photoId: string, isPinned: boolean) => void
  onPhotosUpdated?: (photoIds: string[], changes: Partial<PhotoVo>) => void
}

interface PhotoMasonryContextValue {
  selectedPhotoIds: string[]
  selectionActive: boolean
  onPhotoOpen?: (index: number, origin?: HeroTransitionOrigin) => void
  onSelectedChange?: (photoId: string, selected: boolean) => void
  onPhotoPin?: (photoId: string, isPinned: boolean) => void
  touchHoverCloseRef: React.MutableRefObject<(() => void) | null>
}

const PhotoMasonryContext = createContext<PhotoMasonryContextValue | null>(null)

// Standalone memoized item renderer with stable function identity to prevent Masonic from remounting cells on data append
const MasonicPhotoCard = memo(function MasonicPhotoCard({
  data,
  index,
  width,
}: RenderComponentProps<PhotoVo>) {
  const ctx = useContext(PhotoMasonryContext)
  const isSelected = Boolean(ctx?.selectedPhotoIds.includes(data.photoId))
  const handleOpen = useCallback((origin?: HeroTransitionOrigin) => {
    ctx?.onPhotoOpen?.(index, origin)
  }, [ctx, index])

  return (
    <PhotoCard
      data={data}
      index={index}
      width={width}
      selected={isSelected}
      selectionActive={ctx?.selectionActive ?? false}
      onOpen={handleOpen}
      onSelectedChange={ctx?.onSelectedChange}
      onPhotoPin={ctx?.onPhotoPin}
      touchHoverCloseRef={ctx?.touchHoverCloseRef}
    />
  )
})


// Convert rem unit to current root font size px safely.
function remToPx(rem: number) {
  if (typeof window === "undefined") return rem * 16
  const rootFontSize = parseFloat(
    getComputedStyle(document.documentElement).fontSize
  )

  return rem * rootFontSize
}

// Calculate waterfall initialization width based on sidebar status.
function getInitialWrapWidth(sidebarOpen: boolean) {
  if (typeof window === "undefined") return 1200
  const width = window.innerWidth

  if (width < 768) {
    return width
  }

  return width - remToPx(sidebarOpen ? 14.25 : 3.25)
}

// Calculate deterministic column count from window/screen width so that opening/closing sidebar
// NEVER scrambles or re-orders cards across columns, but smoothly scales card sizes in place.
function getResponsiveColumnCount(screenWidth: number, isMobile: boolean): number {
  if (isMobile || screenWidth < 640) return 2
  if (screenWidth < 960) return 3
  if (screenWidth < 1360) return 4
  if (screenWidth < 1780) return 5
  if (screenWidth < 2200) return 6
  return 7
}

// Calculate the true height of the photo at the current column width.
function getPhotoHeight(photo: PhotoVo, columnWidth: number) {
  const ratio = photo.width && photo.height ? photo.height / photo.width : 1

  return Math.max(1, Math.round(columnWidth * ratio))
}

// Sync the height of each photo to masonic positioner.
function syncPhotoPositioner(items: PhotoVo[], columnWidth: number, positioner: Positioner) {
  const updates: number[] = []

  items.forEach((photo, index) => {
    const height = getPhotoHeight(photo, columnWidth)
    const current = positioner.get(index)

    if (!current) {
      positioner.set(index, height)
    } else if (current.height !== height) {
      updates.push(index, height)
    }
  })

  if (updates.length) {
    positioner.update(updates)
  }
}

// Parse and format photo date taken for clean section header grouping.
function getPhotoDateKey(photo: PhotoVo): { dateKey: string; dateLabel: string } {
  const timeStr = photo.takenTime || photo.createTime
  if (!timeStr) {
    return { dateKey: "undated", dateLabel: "Undated Photos" }
  }
  const d = parseTime(timeStr)
  if (!d || isNaN(d.getTime())) {
    return { dateKey: "undated", dateLabel: "Undated Photos" }
  }

  const now = new Date()
  const isToday = d.toDateString() === now.toDateString()
  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)
  const isYesterday = d.toDateString() === yesterday.toDateString()

  const formattedDate = new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(d)

  const dateLabel = isToday ? `Today • ${formattedDate}` : isYesterday ? `Yesterday • ${formattedDate}` : formattedDate
  const dateKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`

  return { dateKey, dateLabel }
}

// Render photo waterfall, and notify parent component to load more when reaching bottom.
const PhotoMasonry = memo(function PhotoMasonry({
  photos,
  resetKey = 0,
  groupByDate = false,
  groupByType = false,
  enableTimelineScrubber = false,
  onReachBottom,
  onPhotoOpen,
  onPhotoDelete,
  onPhotoRestore,
  onAlbumOpen,
  onAlbumRemove,
  onPhotoPin,
  onPhotosUpdated,
}: PhotoMasonryProps) {
  const { sidebarOpen, userInfo } = useApp()
  const isAdmin = userInfo?.type === 1
  const isMobile = useIsMobile()
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const onReachBottomRef = useRef(onReachBottom)
  const [windowHeight, setWindowHeight] = useState(() => (typeof window !== "undefined" ? window.innerHeight : 800))
  const [screenWidth, setScreenWidth] = useState(() => (typeof window !== "undefined" ? window.innerWidth : 1200))
  const [wrapPosition, setWrapPosition] = useState({ offset: 0, width: getInitialWrapWidth(sidebarOpen) })
  const [selectedPhotoIds, setSelectedPhotoIds] = useState<string[]>([])
  const [batchEditDialogOpen, setBatchEditDialogOpen] = useState(false)
  const touchHoverCloseRef = useRef<(() => void) | null>(null)

  const defaultColumnCount = useMemo(() => getResponsiveColumnCount(screenWidth, isMobile), [screenWidth, isMobile])
  const [userColumns, setUserColumns] = useState<number | null>(null)
  const [indicatorInfo, setIndicatorInfo] = useState<{ columns: number; visible: boolean } | null>(null)
  const indicatorTimerRef = useRef<NodeJS.Timeout | null>(null)

  // Restore stored grid column preference
  useEffect(() => {
    try {
      const key = isMobile ? "naypict_gallery_cols_mobile" : "naypict_gallery_cols_desktop"
      const saved = localStorage.getItem(key)
      if (saved) {
        const parsed = parseInt(saved, 10)
        const min = isMobile ? 1 : 2
        const max = isMobile ? 4 : 8
        if (!isNaN(parsed) && parsed >= min && parsed <= max) {
          setUserColumns(parsed)
        }
      }
    } catch {}
  }, [isMobile])

  const columnCount = userColumns ?? defaultColumnCount

  const showColumnPill = useCallback((cols: number) => {
    setIndicatorInfo({ columns: cols, visible: true })
    if (indicatorTimerRef.current) clearTimeout(indicatorTimerRef.current)
    indicatorTimerRef.current = setTimeout(() => {
      setIndicatorInfo((prev) => (prev ? { ...prev, visible: false } : null))
    }, 1200)
  }, [])

  // Apple Photos-style Pinch-to-Zoom dynamic column grid gesture
  usePinch(
    ({ first, last, offset: [scale], memo = { lastScale: 1, cols: columnCount }, event }) => {
      if (selectedPhotoIds.length > 0 || batchEditDialogOpen) return memo

      if (event && event.cancelable) {
        event.preventDefault()
      }

      if (first) {
        memo = { lastScale: scale, cols: columnCount }
      }

      const minCols = isMobile ? 1 : 2
      const maxCols = isMobile ? 4 : Math.min(8, Math.max(3, Math.floor(screenWidth / 220)))
      const scaleDiff = scale - memo.lastScale

      // Zoom In (Spread fingers -> fewer columns, larger photos)
      if (scaleDiff > 0.22 && memo.cols > minCols) {
        const nextCols = memo.cols - 1
        setUserColumns(nextCols)
        showColumnPill(nextCols)
        if (typeof navigator !== "undefined" && navigator.vibrate) {
          navigator.vibrate(15)
        }
        try {
          const key = isMobile ? "naypict_gallery_cols_mobile" : "naypict_gallery_cols_desktop"
          localStorage.setItem(key, String(nextCols))
        } catch {}
        memo = { lastScale: scale, cols: nextCols }
      }
      // Zoom Out (Pinch fingers together -> more columns, overview)
      else if (scaleDiff < -0.20 && memo.cols < maxCols) {
        const nextCols = memo.cols + 1
        setUserColumns(nextCols)
        showColumnPill(nextCols)
        if (typeof navigator !== "undefined" && navigator.vibrate) {
          navigator.vibrate(15)
        }
        try {
          const key = isMobile ? "naypict_gallery_cols_mobile" : "naypict_gallery_cols_desktop"
          localStorage.setItem(key, String(nextCols))
        } catch {}
        memo = { lastScale: scale, cols: nextCols }
      }

      if (last) {
        try {
          const key = isMobile ? "naypict_gallery_cols_mobile" : "naypict_gallery_cols_desktop"
          localStorage.setItem(key, String(memo.cols))
        } catch {}
      }

      return memo
    },
    {
      target: wrapRef,
      eventOptions: { passive: false },
      pinchOnWheel: true,
    }
  )
  const width = wrapPosition.width
  const positioner = usePositioner(
    {
      width,
      columnCount,
      columnGutter: 4,
      rowGutter: 4,
    },
    [resetKey, columnCount]
  )

  syncPhotoPositioner(photos, positioner.columnWidth, positioner)
  const visibleSelectedPhotoIds = selectedPhotoIds.filter((photoId) => photos.some((photo) => photo.photoId === photoId))

  // Group photos by date taken if enabled
  const dateGroups = useMemo(() => {
    if (!groupByDate) return null

    const groups: {
      dateKey: string
      dateLabel: string
      items: { photo: PhotoVo; globalIndex: number }[]
    }[] = []

    const groupMap = new Map<string, typeof groups[0]>()

    photos.forEach((photo, globalIndex) => {
      const { dateKey, dateLabel } = getPhotoDateKey(photo)
      let group = groupMap.get(dateKey)
      if (!group) {
        group = {
          dateKey,
          dateLabel,
          items: [],
        }
        groupMap.set(dateKey, group)
        groups.push(group)
      }
      group.items.push({ photo, globalIndex })
    })

    return groups
  }, [photos, groupByDate])

  // Group photos by media type (Videos vs Photos) if enabled
  const typeGroups = useMemo(() => {
    if (!groupByType) return null

    const groups: {
      typeKey: string
      typeLabel: string
      icon: string
      items: { photo: PhotoVo; globalIndex: number }[]
    }[] = []

    const groupMap = new Map<string, typeof groups[0]>()

    photos.forEach((photo, globalIndex) => {
      const isVideo = Boolean(
        photo.type?.startsWith("video/") ||
        photo.name?.toLowerCase().match(/\.(mp4|mov|webm|avi|mkv)$/)
      )
      const typeKey = isVideo ? "video" : "photo"
      const typeLabel = isVideo ? "Videos" : "Photos"
      const icon = isVideo ? "🎥" : "📷"

      let group = groupMap.get(typeKey)
      if (!group) {
        group = {
          typeKey,
          typeLabel,
          icon,
          items: [],
        }
        groupMap.set(typeKey, group)
        groups.push(group)
      }
      group.items.push({ photo, globalIndex })
    })

    return groups
  }, [photos, groupByType])


  useEffect(() => {
    // Keep the bottoming callback as the latest method passed in by the parent component.
    onReachBottomRef.current = onReachBottom
  }, [onReachBottom])

  useEffect(() => {
    // Update window dimensions for masonic visible area and responsive column count.
    function handleResize() {
      setWindowHeight(window.innerHeight)
      setScreenWidth(window.innerWidth)
    }

    window.addEventListener("resize", handleResize)

    return () => {
      window.removeEventListener("resize", handleResize)
    }
  }, [])

  useLayoutEffect(() => {
    // Monitor the width changes of the outer visual container of the waterfall flow.
    const container = wrapRef.current

    if (!container) {
      return
    }

    const containerEl = container
    let rAFId: number | null = null

    // Calculate the distance between the outer layer of the waterfall and the top of the page.
    function getOffset() {
      let offset = 0
      let el: HTMLElement | null = containerEl

      while (el) {
        offset += el.offsetTop
        el = el.offsetParent as HTMLElement | null
      }

      return offset
    }

    // Get the current position and width of the outer layer of the waterfall flow.
    function getWrapPosition() {
      return {
        offset: getOffset(),
        width: containerEl.offsetWidth,
      }
    }

    // Force synchronization of the position and width of the outer layer of the waterfall flow.
    function syncWrapPosition() {
      const nextPosition = getWrapPosition()
      setWrapPosition((prev) => {
        if (prev.width === nextPosition.width && prev.offset === nextPosition.offset) {
          return prev
        }
        return nextPosition
      })
    }

    syncWrapPosition()

    const resizeObserver = new ResizeObserver(() => {
      if (rAFId !== null) {
        cancelAnimationFrame(rAFId)
      }
      rAFId = requestAnimationFrame(() => {
        syncWrapPosition()
      })
    })

    resizeObserver.observe(containerEl)

    return () => {
      if (rAFId !== null) {
        cancelAnimationFrame(rAFId)
      }
      resizeObserver.disconnect()
    }
  }, [sidebarOpen])

  useEffect(() => {
    let rAFId: number | null = null
    let lastScrollTime = Date.now()
    let lastScrollY = typeof window !== "undefined" ? window.scrollY || window.pageYOffset : 0

    function checkAutoLoad() {
      if (rAFId !== null) return
      rAFId = requestAnimationFrame(() => {
        rAFId = null

        if (touchHoverCloseRef.current) {
          touchHoverCloseRef.current()
          touchHoverCloseRef.current = null
        }

        const scrollHeight = document.documentElement.scrollHeight || document.body.scrollHeight
        const scrollY = window.scrollY || window.pageYOffset
        const innerHeight = window.innerHeight
        const bottomDistance = scrollHeight - scrollY - innerHeight
        const maxScroll = scrollHeight - innerHeight

        // Calculate scroll progress percentage (0.0 to 1.0)
        const scrollProgress = maxScroll > 0 ? scrollY / maxScroll : 0

        // Velocity calculation for predictive prefetching on fast scrolling
        const now = Date.now()
        const dt = Math.max(1, now - lastScrollTime)
        const dy = scrollY - lastScrollY
        const velocity = dy / dt // px/ms
        lastScrollTime = now
        lastScrollY = scrollY

        // Proactive 75%-80% Threshold: Trigger next page when scroll progress touches 75%
        const targetProgress = velocity > 0.8 ? 0.70 : 0.75

        // Pixel-based threshold as secondary fallback
        let distanceThreshold = isMobile ? 1400 : 2000
        if (photos.length >= 200) {
          distanceThreshold *= 1.4
        }
        if (velocity > 0.8) {
          distanceThreshold *= 1.8
        }

        const isPastProgressThreshold = maxScroll > 0 && scrollY > 80 && scrollProgress >= targetProgress
        const isWithinDistanceThreshold = (scrollY > 80 || maxScroll <= 200) && bottomDistance <= distanceThreshold

        if (isPastProgressThreshold || isWithinDistanceThreshold) {
          onReachBottomRef.current()
        }
      })
    }

    window.addEventListener("scroll", checkAutoLoad, { passive: true })
    window.addEventListener("resize", checkAutoLoad, { passive: true })
    checkAutoLoad()

    return () => {
      window.removeEventListener("scroll", checkAutoLoad)
      window.removeEventListener("resize", checkAutoLoad)
      if (rAFId !== null) cancelAnimationFrame(rAFId)
    }
  }, [isMobile, photos.length])

  // Proactive Lookahead & Directional Scroll Thumbnail Prefetcher
  // Continuously pre-warms thumbnails ahead of the user's scroll position and on initial page load,
  // populating loadedThumbnails so that newly mounted cards display instantaneously without blur.
  useEffect(() => {
    if (typeof window === "undefined" || !photos.length) return

    // Respect client Data Saver preference (Network Information API)
    const nav = navigator as unknown as { connection?: { saveData?: boolean } }
    if (nav?.connection?.saveData) return

    let lastScrollY = window.scrollY || window.pageYOffset
    let scheduled = false

    const warmUrl = (url?: string | null) => {
      if (!url || loadedThumbnails.has(url)) return
      const img = new Image()
      img.crossOrigin = "anonymous"
      img.decoding = "async"
      img.onload = () => {
        loadedThumbnails.add(url)
        if (loadedThumbnails.size > 2000) {
          const oldest = loadedThumbnails.values().next().value
          if (oldest) loadedThumbnails.delete(oldest)
        }
      }
      img.src = url
    }

    const prefetchAhead = () => {
      scheduled = false
      const currentScrollY = window.scrollY || window.pageYOffset
      const isScrollingDown = currentScrollY >= lastScrollY
      lastScrollY = currentScrollY

      const avgCardHeight = isMobile ? 180 : 260
      const cols = columnCount
      const estimatedVisibleIndex = Math.max(0, Math.floor((currentScrollY / avgCardHeight) * cols))

      // Downward lookahead window: next 48 photos ahead
      // Upward lookahead window: 24 photos above
      const forwardBatch = isMobile ? 36 : 48
      const backwardBatch = isMobile ? 18 : 24

      const startIdx = Math.max(0, estimatedVisibleIndex - (isScrollingDown ? 4 : backwardBatch))
      const endIdx = Math.min(photos.length, estimatedVisibleIndex + (isScrollingDown ? forwardBatch : 8))

      for (let i = startIdx; i < endIdx; i++) {
        const p = photos[i]
        if (!p) continue
        warmUrl(p.thumbnail || p.preview)
        // If upcoming item within 8 items is a video, prebuffer video stream
        if (p.type?.startsWith("video/") && Math.abs(i - estimatedVisibleIndex) <= 8) {
          const videoUrl = p.key || p.preview
          if (videoUrl) {
            prebufferVideo(videoUrl)
          }
        }
      }
    }

    let idleTimer: NodeJS.Timeout | null = null

    const schedulePrefetch = () => {
      if (idleTimer) clearTimeout(idleTimer)
      // Throttle prefetching during active scrolling (180ms delay) so 100% of CPU is dedicated to 120 FPS frame render
      idleTimer = setTimeout(() => {
        if (typeof window !== "undefined" && "requestIdleCallback" in window) {
          ;(window as unknown as { requestIdleCallback: (cb: () => void) => void }).requestIdleCallback(() => {
            prefetchAhead()
          })
        } else {
          prefetchAhead()
        }
      }, 180)
    }

    // Initial pre-warm of above-the-fold items
    prefetchAhead()

    window.addEventListener("scroll", schedulePrefetch, { passive: true })
    return () => {
      window.removeEventListener("scroll", schedulePrefetch)
      if (idleTimer) clearTimeout(idleTimer)
    }
  }, [photos, width, columnCount, isMobile])

  // Toggle photo selection in array photoId.
  function changePhotoSelected(photoId: string, selected: boolean) {
    setSelectedPhotoIds((prev) => {
      if (selected) {
        return prev.includes(photoId) ? prev : [...prev, photoId]
      }

      return prev.filter((id) => id !== photoId)
    })
  }

  // Clear the selections in the current photo list.
  function clearSelectedPhotos() {
    setSelectedPhotoIds([])
  }

  // Start by selecting photos from the front of the list, Most selected 100 open.
  function selectFirstPhotos() {
    setSelectedPhotoIds((prev) => {
      const visibleIds = prev.filter((photoId) => photos.some((photo) => photo.photoId === photoId))
      const allPhotosSelected = photos.length > 0 && photos.every((photo) => visibleIds.includes(photo.photoId))

      if (visibleIds.length >= 100 || allPhotosSelected) {
        return []
      }

      const remainTotal = Math.max(0, 100 - visibleIds.length)

      if (!remainTotal) {
        return visibleIds
      }

      const selectedSet = new Set(visibleIds)
      const idsToAdd = photos
        .map((photo) => photo.photoId)
        .filter((photoId) => !selectedSet.has(photoId))
        .slice(0, remainTotal)

      return [...visibleIds, ...idsToAdd]
    })
  }

  // After clearing the selection status, the currently selected photo id Pass to page for deletion.
  function deleteSelectedPhotos() {
    const photoIds = visibleSelectedPhotoIds
    clearSelectedPhotos()
    onPhotoDelete?.(photoIds)
  }

  // Change the currently selected photo id Pass to page recovery.
  function restoreSelectedPhotos() {
    onPhotoRestore?.(visibleSelectedPhotoIds)
    clearSelectedPhotos()
  }

  // Change the currently selected photo id Pass to page to open album selection.
  function openAlbumDialog() {
    onAlbumOpen?.(visibleSelectedPhotoIds)
    clearSelectedPhotos()
  }

  // After clearing the selection status, the currently selected photo id Pass to pageMove from album.
  function removeAlbumPhotos() {
    const photoIds = visibleSelectedPhotoIds
    clearSelectedPhotos()
    onAlbumRemove?.(photoIds)
  }

  // Handle batch edit success and propagate in-memory updates.
  function handleBatchEditSuccess(photoIds: string[], changes: Partial<PhotoVo>) {
    clearSelectedPhotos()
    onPhotosUpdated?.(photoIds, changes)
  }


  const masonryContextValue = useMemo<PhotoMasonryContextValue>(
    () => ({
      selectedPhotoIds: visibleSelectedPhotoIds,
      selectionActive: visibleSelectedPhotoIds.length > 0,
      onPhotoOpen,
      onSelectedChange: changePhotoSelected,
      onPhotoPin,
      touchHoverCloseRef,
    }),
    [visibleSelectedPhotoIds, onPhotoOpen, onPhotoPin]
  )

  return (
    <PhotoMasonryContext.Provider value={masonryContextValue}>
      <PhotoSelectionDrawer
        open={visibleSelectedPhotoIds.length > 0}
        selectedCount={visibleSelectedPhotoIds.length}
        onClose={clearSelectedPhotos}
        onDelete={deleteSelectedPhotos}
        onSelectAll={selectFirstPhotos}
        onRestore={onPhotoRestore ? restoreSelectedPhotos : undefined}
        onAlbumOpen={onAlbumOpen ? openAlbumDialog : undefined}
        onAlbumRemove={onAlbumRemove ? removeAlbumPhotos : undefined}
        onBatchEdit={isAdmin ? () => setBatchEditDialogOpen(true) : undefined}
      />
      {isAdmin && (
        <PhotoBatchEditDialog
          open={batchEditDialogOpen}
          onOpenChange={setBatchEditDialogOpen}
          photoIds={visibleSelectedPhotoIds}
          initialName={visibleSelectedPhotoIds.length === 1 ? photos.find((p) => p.photoId === visibleSelectedPhotoIds[0])?.name : undefined}
          initialTakenTime={visibleSelectedPhotoIds.length === 1 ? photos.find((p) => p.photoId === visibleSelectedPhotoIds[0])?.takenTime : undefined}
          onSuccess={handleBatchEditSuccess}
        />
      )}
      {/* Apple Photos-style floating capsule indicator during/after pinch gesture */}
      {indicatorInfo?.visible && (
        <div
          role="status"
          aria-live="polite"
          className="fixed top-16 left-1/2 -translate-x-1/2 z-50 pointer-events-none transition-all duration-300 ease-out animate-in fade-in zoom-in-95 slide-in-from-top-2"
        >
          <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-background/90 dark:bg-zinc-900/90 backdrop-blur-md border border-border/60 shadow-xl text-xs font-semibold text-foreground tracking-wide">
            <LayoutGrid className="w-3.5 h-3.5 text-primary" />
            <span>
              {indicatorInfo.columns} {indicatorInfo.columns === 1 ? "Column" : "Columns"}
            </span>
          </div>
        </div>
      )}
      {/* Google Photos & Apple Photos style fast date timeline scrubber */}
      <PhotoTimelineScrubber photos={photos} enabled={enableTimelineScrubber} />
      <div
        ref={wrapRef}
        className="w-full overflow-x-hidden masonry-grid-smooth subpixel-snap-grid transition-[width] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] touch-pan-y"
        style={{ touchAction: "pan-y pinch-zoom" }}
      >
        {groupByDate && dateGroups ? (
          <div className="space-y-6 pb-6">
            {dateGroups.map((group) => {
              const numCols = columnCount
              const currentColumnWidth = Math.max(1, Math.floor((width - 4 * (numCols - 1)) / numCols))
              const cols: { photo: PhotoVo; globalIndex: number; height: number }[][] = Array.from(
                { length: numCols },
                () => []
              )
              const colHeights = new Array(numCols).fill(0)

              group.items.forEach(({ photo, globalIndex }) => {
                const ratio = photo.width && photo.height ? photo.height / photo.width : 1
                const h = Math.max(1, Math.round(currentColumnWidth * ratio))
                let minCol = 0
                for (let c = 1; c < numCols; c++) {
                  if (colHeights[c] < colHeights[minCol]) {
                    minCol = c
                  }
                }
                cols[minCol].push({ photo, globalIndex, height: h })
                colHeights[minCol] += h + 4
              })

              const sectionHeight = Math.max(...colHeights, 160)
              return (
                <section
                  key={group.dateKey}
                  className="space-y-2.5 pt-2"
                >
                  {/* Clean Date Header: Pure typography without overlapping sticky headers or geotag labels */}
                  <div className="flex items-center justify-between py-1 px-1">
                    <span className="text-sm sm:text-base font-bold text-foreground tracking-tight">
                      {group.dateLabel}
                    </span>
                    <span className="text-[11px] font-semibold text-muted-foreground px-2 py-0.5 rounded-full bg-muted border border-border/40">
                      {group.items.length} {group.items.length === 1 ? "photo" : "photos"}
                    </span>
                  </div>

                  {/* Responsive Masonry Grid for this date */}
                  <div className="flex gap-1">
                    {cols.map((colItems, colIdx) => (
                      <div
                        key={colIdx}
                        className="flex flex-col gap-1 flex-1"
                        style={{ maxWidth: `${currentColumnWidth}px` }}
                      >
                        {colItems.map(({ photo, globalIndex }) => (
                          <PhotoCard
                            key={photo.photoId}
                            data={photo}
                            index={globalIndex}
                            width={currentColumnWidth}
                            selected={visibleSelectedPhotoIds.includes(photo.photoId)}
                            selectionActive={visibleSelectedPhotoIds.length > 0}
                            onOpen={(origin) => onPhotoOpen?.(globalIndex, origin)}
                            onSelectedChange={changePhotoSelected}
                            onPhotoPin={onPhotoPin}
                            touchHoverCloseRef={touchHoverCloseRef}
                          />
                        ))}
                      </div>
                    ))}
                  </div>
                </section>
              )
            })}
          </div>
        ) : groupByType && typeGroups ? (
          <div className="space-y-6 pb-6">
            {typeGroups.map((group) => {
              const numCols = columnCount
              const currentColumnWidth = Math.max(1, Math.floor((width - 4 * (numCols - 1)) / numCols))
              const cols: { photo: PhotoVo; globalIndex: number; height: number }[][] = Array.from(
                { length: numCols },
                () => []
              )
              const colHeights = new Array(numCols).fill(0)

              group.items.forEach(({ photo, globalIndex }) => {
                const ratio = photo.width && photo.height ? photo.height / photo.width : 1
                const h = Math.max(1, Math.round(currentColumnWidth * ratio))
                let minCol = 0
                for (let c = 1; c < numCols; c++) {
                  if (colHeights[c] < colHeights[minCol]) {
                    minCol = c
                  }
                }
                cols[minCol].push({ photo, globalIndex, height: h })
                colHeights[minCol] += h + 4
              })

              const sectionHeight = Math.max(...colHeights, 160)
              return (
                <section
                  key={group.typeKey}
                  className="space-y-2.5 pt-2"
                >
                  {/* Clean Media Type Header: Videos or Photos */}
                  <div className="flex items-center justify-between py-1 px-1 border-b border-border/40">
                    <div className="flex items-center gap-2">
                      <span className="text-base">{group.icon}</span>
                      <span className="text-sm sm:text-base font-bold text-foreground tracking-tight">
                        {group.typeLabel}
                      </span>
                    </div>
                    <span className="text-[11px] font-semibold text-muted-foreground px-2 py-0.5 rounded-full bg-muted border border-border/40">
                      {group.items.length} {group.items.length === 1 ? (group.typeKey === "video" ? "video" : "photo") : (group.typeKey === "video" ? "videos" : "photos")}
                    </span>
                  </div>

                  {/* Responsive Masonry Grid for this type group */}
                  <div className="flex gap-1">
                    {cols.map((colItems, colIdx) => (
                      <div
                        key={colIdx}
                        className="flex flex-col gap-1 flex-1"
                        style={{ maxWidth: `${currentColumnWidth}px` }}
                      >
                        {colItems.map(({ photo, globalIndex }) => (
                          <PhotoCard
                            key={photo.photoId}
                            data={photo}
                            index={globalIndex}
                            width={currentColumnWidth}
                            selected={visibleSelectedPhotoIds.includes(photo.photoId)}
                            selectionActive={visibleSelectedPhotoIds.length > 0}
                            onOpen={(origin) => onPhotoOpen?.(globalIndex, origin)}
                            onSelectedChange={changePhotoSelected}
                            onPhotoPin={onPhotoPin}
                            touchHoverCloseRef={touchHoverCloseRef}
                          />
                        ))}
                      </div>
                    ))}
                  </div>
                </section>
              )
            })}
          </div>
        ) : (
          <MasonryScroller
            className="outline-transparent"
            items={photos}
            positioner={positioner}
            offset={wrapPosition.offset}
            height={windowHeight}
            itemKey={(item) => item?.photoId ?? ''}
            overscanBy={isMobile ? 8 : 8}
            render={MasonicPhotoCard}
          />
        )}
      </div>
    </PhotoMasonryContext.Provider>
  )
})

export { PhotoMasonry }
