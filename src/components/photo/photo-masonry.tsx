"use client"

import { memo, useEffect, useMemo, useRef, useState, useLayoutEffect } from "react"
import { flushSync } from "react-dom"
import {
  MasonryScroller,
  type Positioner,
  usePositioner,
} from "masonic"

import dynamic from "next/dynamic"
import { useApp } from "@/app/provider"
import { useIsMobile } from "@/hooks/use-mobile"
import { PhotoCard } from "@/components/photo/photo-card"
import { PhotoSelectionDrawer } from "@/components/photo/photo-selection-drawer"
import { type PhotoVo } from "@/server/entity/vo/photo"
import { parseTime } from "@/lib/date"

const PhotoBatchEditDialog = dynamic(
  () => import("@/components/photo/photo-batch-edit-dialog").then((mod) => mod.PhotoBatchEditDialog),
  { ssr: false }
)

interface PhotoMasonryProps {
  photos: PhotoVo[]
  resetKey?: number
  groupByDate?: boolean
  onReachBottom: () => void
  onPhotoOpen?: (index: number) => void
  onPhotoDelete?: (photoIds: string[]) => void
  onPhotoRestore?: (photoIds: string[]) => void
  onAlbumOpen?: (photoIds: string[]) => void
  onAlbumRemove?: (photoIds: string[]) => void
  onPhotoPin?: (photoId: string, isPinned: boolean) => void
  onPhotosUpdated?: (photoIds: string[], changes: Partial<PhotoVo>) => void
}

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
  const [wrapPosition, setWrapPosition] = useState({ offset: 0, width: getInitialWrapWidth(sidebarOpen) })
  const [selectedPhotoIds, setSelectedPhotoIds] = useState<string[]>([])
  const [batchEditDialogOpen, setBatchEditDialogOpen] = useState(false)
  const touchHoverCloseRef = useRef<(() => void) | null>(null)
  const width = wrapPosition.width
  const columnWidth = isMobile ? (width - 4) / 2 : 240
  const positioner = usePositioner(
    {
      width,
      columnWidth,
      columnGutter: 4,
      rowGutter: 4,
    },
    [resetKey]
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


  useEffect(() => {
    // Keep the bottoming callback as the latest method passed in by the parent component.
    onReachBottomRef.current = onReachBottom
  }, [onReachBottom])

  useEffect(() => {
    // Update window height, for masonic Calculate visible area.
    function handleResize() {
      setWindowHeight(window.innerHeight)
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
    let timerId: number | null = null

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
      setWrapPosition(getWrapPosition())
    }

    // Measure the position and width of the outer layer of the waterfall, after the first synchronization is completed.
    function measureWrapPosition() {
      const nextPosition = getWrapPosition()
      let needSync = false

      flushSync(() => {
        setWrapPosition((prev) => {
          const widthDiff = Math.abs(prev.width - nextPosition.width)
          const sameOffset = prev.offset === nextPosition.offset

          if (widthDiff <= 10 && sameOffset) {
            return prev
          }

          needSync = true
          return nextPosition
        })
      })

      if (needSync) {
        syncWrapPosition()
      }
    }

    // Debounce ResizeObserver updates
    function updateWrapPosition() {
      if (timerId !== null) {
        window.clearTimeout(timerId)
      }

      timerId = window.setTimeout(() => {
        timerId = null
        measureWrapPosition()
      }, 350)
    }

    syncWrapPosition()

    const resizeObserver = new ResizeObserver(updateWrapPosition)

    resizeObserver.observe(containerEl)

    return () => {
      if (timerId !== null) {
        window.clearTimeout(timerId)
      }

      resizeObserver.disconnect()
    }
  }, [])

  useEffect(() => {
    let isChecking = false
    let lastScrollTime = Date.now()
    let lastScrollY = typeof window !== "undefined" ? window.scrollY || window.pageYOffset : 0

    function checkAutoLoad() {
      if (isChecking) return
      isChecking = true

      if (touchHoverCloseRef.current) {
        touchHoverCloseRef.current()
        touchHoverCloseRef.current = null
      }

      const scrollHeight = document.documentElement.scrollHeight || document.body.scrollHeight
      const scrollY = window.scrollY || window.pageYOffset
      const bottomDistance = scrollHeight - scrollY - window.innerHeight
      let threshold = isMobile ? 9000 : 4500

      if (photos.length >= 200) {
        threshold *= 1.5
      }

      // Intelligent Predictive Prefetching: Scale threshold on fast downward scrolling
      const now = Date.now()
      const dt = Math.max(1, now - lastScrollTime)
      const dy = scrollY - lastScrollY
      const velocity = dy / dt // px/ms
      lastScrollTime = now
      lastScrollY = scrollY

      if (velocity > 0.8) {
        threshold *= 1.6
      }

      if (bottomDistance <= threshold) {
        onReachBottomRef.current()
      }
      isChecking = false
    }

    window.addEventListener("scroll", checkAutoLoad, { passive: true })
    window.addEventListener("resize", checkAutoLoad, { passive: true })
    checkAutoLoad()

    return () => {
      window.removeEventListener("scroll", checkAutoLoad)
      window.removeEventListener("resize", checkAutoLoad)
    }
  }, [isMobile, photos.length])

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

  return (
    <>
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
          onSuccess={handleBatchEditSuccess}
        />
      )}
      <div ref={wrapRef} className="w-full overflow-x-hidden masonry-grid-smooth subpixel-snap-grid">
        {groupByDate && dateGroups ? (
          <div className="space-y-6 pb-6">
            {dateGroups.map((group) => {
              const numCols = Math.max(1, Math.floor((width + 4) / (columnWidth + 4)))
              const cols: { photo: PhotoVo; globalIndex: number; height: number }[][] = Array.from(
                { length: numCols },
                () => []
              )
              const colHeights = new Array(numCols).fill(0)

              group.items.forEach(({ photo, globalIndex }) => {
                const ratio = photo.width && photo.height ? photo.height / photo.width : 1
                const h = Math.max(1, Math.round(columnWidth * ratio))
                let minCol = 0
                for (let c = 1; c < numCols; c++) {
                  if (colHeights[c] < colHeights[minCol]) {
                    minCol = c
                  }
                }
                cols[minCol].push({ photo, globalIndex, height: h })
                colHeights[minCol] += h + 4
              })

              return (
                <section key={group.dateKey} className="space-y-2.5 pt-2">
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
                        style={{ maxWidth: `${columnWidth}px` }}
                      >
                        {colItems.map(({ photo, globalIndex }) => (
                          <PhotoCard
                            key={photo.photoId}
                            data={photo}
                            index={globalIndex}
                            width={columnWidth}
                            selected={visibleSelectedPhotoIds.includes(photo.photoId)}
                            selectionActive={visibleSelectedPhotoIds.length > 0}
                            onOpen={() => onPhotoOpen?.(globalIndex)}
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
            itemKey={(item) => item.photoId}
            overscanBy={3}
            render={(props) => (
              <PhotoCard
                {...props}
                selected={visibleSelectedPhotoIds.includes(props.data.photoId)}
                selectionActive={visibleSelectedPhotoIds.length > 0}
                onOpen={() => onPhotoOpen?.(props.index)}
                onSelectedChange={changePhotoSelected}
                onPhotoPin={onPhotoPin}
                touchHoverCloseRef={touchHoverCloseRef}
              />
            )}
          />
        )}
      </div>
    </>
  )
})

export { PhotoMasonry }
