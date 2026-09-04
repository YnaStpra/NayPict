"use client"

import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { flushSync } from "react-dom"
import {
  MasonryScroller,
  type Positioner,
  usePositioner,
} from "masonic"
import { FolderOpen } from "lucide-react"

import { useApp } from "@/app/provider"
import { AlbumCard } from "@/components/album/album-card"
import { type AlbumVo } from "@/server/entity/vo/album"

interface AlbumMasonryProps {
  albums: AlbumVo[]
  resetKey?: number
  onAlbumRename?: (album: AlbumVo) => void
  onAlbumTop?: (album: AlbumVo) => void
  onAlbumDelete?: (album: AlbumVo) => void
  onAlbumChangeCover?: (album: AlbumVo) => void
}

// Convert rem unit to current root font size px safely.
function remToPx(rem: number) {
  if (typeof window === "undefined") return rem * 16
  const rootFontSize = parseFloat(
    getComputedStyle(document.documentElement).fontSize
  )

  return rem * rootFontSize
}

// Calculate the initial width of the album list based on the sidebar status.
function getInitialWrapWidth(sidebarOpen: boolean) {
  if (typeof window === "undefined") return 1200
  const width = window.innerWidth

  if (width < 768) {
    return width
  }

  return width - remToPx(sidebarOpen ? 15.25 : 4.25)
}

// Calculate the fixed height of the album card under the current column width.
function getAlbumHeight(columnWidth: number) {
  return Math.max(1, Math.round(columnWidth))
}

// Synchronize the height of each album card to masonic positioner.
function syncAlbumPositioner(items: AlbumVo[], columnWidth: number, positioner: Positioner) {
  const height = getAlbumHeight(columnWidth)
  const updates: number[] = []

  items.forEach((_, index) => {
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

// Rendering a virtual scrolling list of photo albums.
export function AlbumMasonry({ albums, resetKey = 0, onAlbumRename, onAlbumTop, onAlbumDelete, onAlbumChangeCover }: AlbumMasonryProps) {
  const { sidebarOpen } = useApp()
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const [windowHeight, setWindowHeight] = useState(() => (typeof window !== "undefined" ? window.innerHeight : 800))
  const [wrapPosition, setWrapPosition] = useState({ offset: 0, width: getInitialWrapWidth(sidebarOpen) })

  const width = wrapPosition.width
  const isSmallScreen = width < 768
  const columnWidth = isSmallScreen ? (width - 12) / 2 : 240
  const positioner = usePositioner(
    {
      width,
      columnWidth,
      columnGutter: isSmallScreen ? 8 : 12,
      rowGutter: isSmallScreen ? 8 : 12,
    },
    [resetKey]
  )

  syncAlbumPositioner(albums, positioner.columnWidth, positioner)

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
    // Monitor the width change of the outer visual container of the album list.
    const container = wrapRef.current

    if (!container) {
      return
    }

    const containerEl = container
    let rAFId: number | null = null

    // Calculate the distance between the outer layer of the album list and the top of the page.
    function getOffset() {
      let offset = 0
      let el: HTMLElement | null = containerEl

      while (el) {
        offset += el.offsetTop
        el = el.offsetParent as HTMLElement | null
      }

      return offset
    }

    // Get the current position and width of the outer layer of the album list.
    function getWrapPosition() {
      return {
        offset: getOffset(),
        width: containerEl.offsetWidth,
      }
    }

    // Force synchronization of the position and width of the outer layer of the album list.
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

  if (!albums || albums.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] w-full text-center p-8">
        <div className="flex size-20 items-center justify-center rounded-2xl bg-muted/50 border border-border/50 mb-4 shadow-sm">
          <FolderOpen className="size-10 text-muted-foreground/70" />
        </div>
        <h3 className="text-xl font-semibold text-foreground mb-1">
          belum ada albumnya cuy, sorry yeah.
        </h3>
        <p className="text-sm text-muted-foreground max-w-sm">
          Album belum ditambahkan oleh Admin. Silakan cek kembali nanti!
        </p>
      </div>
    )
  }

  return (
    <div ref={wrapRef} className="w-full overflow-x-hidden">
      <MasonryScroller
        items={albums}
        positioner={positioner}
        offset={wrapPosition.offset}
        height={windowHeight}
        itemKey={(item) => item.albumId}
        overscanBy={1.5}
        render={(props) => (
          <AlbumCard
            {...props}
            onRename={onAlbumRename}
            onTop={onAlbumTop}
            onDelete={onAlbumDelete}
            onChangeCover={onAlbumChangeCover}
          />
        )}
      />
    </div>
  )
}
