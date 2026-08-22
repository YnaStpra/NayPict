"use client"

import { memo, useEffect, useRef, useState, useLayoutEffect } from "react"
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

const PhotoBatchEditDialog = dynamic(
  () => import("@/components/photo/photo-batch-edit-dialog").then((mod) => mod.PhotoBatchEditDialog),
  { ssr: false }
)

interface PhotoMasonryProps {
  photos: PhotoVo[]
  resetKey?: number
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

// Render photo waterfall, and notify parent component to load more when reaching bottom.
const PhotoMasonry = memo(function PhotoMasonry({
  photos,
  resetKey = 0,
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


  useEffect(() => {
    // Keep the bottoming callback as the latest method passed in by the parent component。
    onReachBottomRef.current = onReachBottom
  }, [onReachBottom])

  useEffect(() => {
    // Update window height，for masonic Calculate visible area。
    function handleResize() {
      setWindowHeight(window.innerHeight)
    }

    window.addEventListener("resize", handleResize)

    return () => {
      window.removeEventListener("resize", handleResize)
    }
  }, [])

  useLayoutEffect(() => {
    // Monitor the width changes of the outer visual container of the waterfall flow。
    const container = wrapRef.current

    if (!container) {
      return
    }

    const containerEl = container
    let timerId: number | null = null

    // Calculate the distance between the outer layer of the waterfall and the top of the page。
    function getOffset() {
      let offset = 0
      let el: HTMLElement | null = containerEl

      while (el) {
        offset += el.offsetTop
        el = el.offsetParent as HTMLElement | null
      }

      return offset
    }

    // Get the current position and width of the outer layer of the waterfall flow。
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

  // Toggle photo selection in array photoId。
  function changePhotoSelected(photoId: string, selected: boolean) {
    setSelectedPhotoIds((prev) => {
      if (selected) {
        return prev.includes(photoId) ? prev : [...prev, photoId]
      }

      return prev.filter((id) => id !== photoId)
    })
  }

  // Clear the selections in the current photo list。
  function clearSelectedPhotos() {
    setSelectedPhotoIds([])
  }

  // Start by selecting photos from the front of the list，Most selected 100 open。
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

  // After clearing the selection status, the currently selected photo id Pass to page for deletion。
  function deleteSelectedPhotos() {
    const photoIds = visibleSelectedPhotoIds
    clearSelectedPhotos()
    onPhotoDelete?.(photoIds)
  }

  // Change the currently selected photo id Pass to page recovery。
  function restoreSelectedPhotos() {
    onPhotoRestore?.(visibleSelectedPhotoIds)
    clearSelectedPhotos()
  }

  // Change the currently selected photo id Pass to page to open album selection。
  function openAlbumDialog() {
    onAlbumOpen?.(visibleSelectedPhotoIds)
    clearSelectedPhotos()
  }

  // After clearing the selection status, the currently selected photo id Pass to pageMove from album。
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
          onSuccess={handleBatchEditSuccess}
        />
      )}
      <div ref={wrapRef} className="w-full overflow-x-hidden">
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
      </div>
    </>
  )
})

export { PhotoMasonry }
