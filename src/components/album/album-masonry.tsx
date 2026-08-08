"use client"

import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { flushSync } from "react-dom"
import {
  MasonryScroller,
  type Positioner,
  usePositioner,
} from "masonic"

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

// Bundle rem The unit is converted to the current root font size px.
function remToPx(rem: number) {
  const rootFontSize = parseFloat(
    getComputedStyle(document.documentElement).fontSize
  )

  return rem * rootFontSize
}

// Calculate the initial width of the album list based on the sidebar status.
function getInitialWrapWidth(sidebarOpen: boolean) {
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
  // wrapRef Used to monitor the real visual width of the outer layer of the album list.
  const wrapRef = useRef<HTMLDivElement | null>(null)
  // windowHeight used to tell masonic Current virtual scroll visible height.
  const [windowHeight, setWindowHeight] = useState(() => window.innerHeight)
  // wrapPosition Record the page position and layout width of the outer container of the album list.
  const [wrapPosition, setWrapPosition] = useState({ offset: 0, width: getInitialWrapWidth(sidebarOpen) })

  const width = wrapPosition.width
  const columnWidth = innerWidth < 768 ? (width - 12) / 2 : 240
  const positioner = usePositioner(
    {
      width,
      columnWidth,
      columnGutter: innerWidth < 768 ? 8 : 12,
      rowGutter: innerWidth < 768 ? 8 : 12,
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
    let timerId: number | null = null

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
      console.log(wrapPosition.width)
      setWrapPosition(getWrapPosition())
    }

    // Measure the position and width of the outer layer of the album list, After the first synchronization is completed, force reading again..
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

    // Bundle ResizeObserver Notifications shake to stop changing 300ms Post-processing.
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

  return (
    <div ref={wrapRef} className="w-full overflow-x-hidden">
      <MasonryScroller
        items={albums}
        positioner={positioner}
        offset={wrapPosition.offset}
        height={windowHeight}
        itemKey={(item) => item.albumId}
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
