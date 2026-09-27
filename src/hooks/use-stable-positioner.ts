"use client"

import { useMemo, useRef } from "react"
import { createIntervalTree, type Positioner, type PositionerItem } from "masonic"

export interface UseStablePositionerOptions {
  width: number
  columnCount: number
  columnGutter?: number
  rowGutter?: number
  getItemRatio?: (index: number) => number
  resetDeps?: React.DependencyList
}

function binarySearch(a: number[], y: number): number {
  let l = 0
  let h = a.length - 1

  while (l <= h) {
    const m = (l + h) >>> 1
    const x = a[m]
    if (x === y) return m
    else if (x <= y) l = m + 1
    else h = m - 1
  }

  return -1
}

/**
 * High-Performance Column-Preserving Stable Positioner for Masonic virtualizer.
 *
 * Problem with Masonic's default `usePositioner`:
 * Whenever container `width` changes (such as when the left sidebar opens or closes),
 * Masonic completely destroys the positioner and re-packs all items using a greedy
 * shortest-column algorithm. Because of rounding differences, cards scramble and jump
 * unpredictably across columns.
 *
 * Solution:
 * This hook permanently locks each item into its assigned column. When the sidebar
 * opens/closes or width changes (with `columnCount` remaining the same), thumbnails
 * simply scale down or scale up in place within their existing columns. Zero scrambling!
 */
export function useStablePositioner({
  width,
  columnCount,
  columnGutter = 0,
  rowGutter = columnGutter,
  getItemRatio,
  resetDeps = [],
}: UseStablePositionerOptions): Positioner {
  // Stable refs to preserve layout integrity and locked column assignments
  const itemsRef = useRef<PositionerItem[]>([])
  const assignedColumnsRef = useRef<number[]>([])
  const columnItemsRef = useRef<number[][]>([])
  const columnHeightsRef = useRef<number[]>([])
  const columnRatioSumsRef = useRef<number[]>([])
  const intervalTreeRef = useRef<ReturnType<typeof createIntervalTree>>(createIntervalTree())
  const versionRef = useRef(0)

  const prevWidthRef = useRef<number>(width)
  const prevColumnCountRef = useRef<number>(columnCount)
  const prevGutterRef = useRef({ columnGutter, rowGutter })
  const prevDepsRef = useRef(resetDeps)

  // Determine if a full re-initialization is required (e.g., columnCount changed or resetDeps bumped)
  const depsChanged =
    resetDeps.length !== prevDepsRef.current.length ||
    !resetDeps.every((dep, i) => dep === prevDepsRef.current[i])
  const countChanged = columnCount !== prevColumnCountRef.current
  const gutterChanged =
    columnGutter !== prevGutterRef.current.columnGutter ||
    rowGutter !== prevGutterRef.current.rowGutter
  const isInitialized =
    columnItemsRef.current.length === columnCount &&
    itemsRef.current !== undefined

  const needsFullReset = !isInitialized || countChanged || depsChanged || gutterChanged

  // Compute column width based on container width
  const computedColumnWidth = Math.max(
    1,
    Math.floor((width - columnGutter * (columnCount - 1)) / columnCount)
  )
  const currentColumnWidthRef = useRef<number>(computedColumnWidth)

  if (needsFullReset) {
    // Fresh distribution across columns when columnCount or resetDeps change
    currentColumnWidthRef.current = computedColumnWidth
    itemsRef.current = []
    assignedColumnsRef.current = []
    columnItemsRef.current = Array.from({ length: columnCount }, () => [])
    columnHeightsRef.current = new Array(columnCount).fill(0)
    columnRatioSumsRef.current = new Array(columnCount).fill(0)
    intervalTreeRef.current = createIntervalTree()

    prevWidthRef.current = width
    prevColumnCountRef.current = columnCount
    prevGutterRef.current = { columnGutter, rowGutter }
    prevDepsRef.current = resetDeps
    versionRef.current += 1
  } else if (
    width !== prevWidthRef.current ||
    computedColumnWidth !== currentColumnWidthRef.current
  ) {
    // Width changed (e.g. sidebar open/close or window resize within same column count).
    // CRITICAL: LOCK & PRESERVE ALL COLUMN ASSIGNMENTS!
    // Every item remains strictly in its assigned column; only its width, height,
    // and vertical position within that column are scaled.
    const oldColWidth = currentColumnWidthRef.current
    currentColumnWidthRef.current = computedColumnWidth
    prevWidthRef.current = width

    const items = itemsRef.current
    const columnItems = columnItemsRef.current
    const columnHeights = columnHeightsRef.current
    const newIntervalTree = createIntervalTree()

    for (let c = 0; c < columnCount; c++) {
      columnHeights[c] = 0
      const colLeft = c * (computedColumnWidth + columnGutter)
      const indices = columnItems[c] || []

      for (const index of indices) {
        const item = items[index]
        if (!item) continue

        const ratio = getItemRatio
          ? getItemRatio(index)
          : oldColWidth > 0 && item.height > 0
          ? item.height / oldColWidth
          : 1
        const newHeight = Math.max(1, Math.round(computedColumnWidth * ratio))
        const top = columnHeights[c]
        columnHeights[c] = top + newHeight + rowGutter

        items[index] = {
          left: colLeft,
          top,
          height: newHeight,
          column: c,
        }
        newIntervalTree.insert(top, top + newHeight, index)
      }
    }

    intervalTreeRef.current = newIntervalTree
    versionRef.current += 1
  }

  // Construct stable Positioner conforming to Masonic's Positioner interface
  const positioner = useMemo<Positioner>(() => {
    return {
      columnCount,
      get columnWidth() {
        return currentColumnWidthRef.current
      },
      set columnWidth(val: number) {
        currentColumnWidthRef.current = val
      },
      set: (index: number, height: number) => {
        const items = itemsRef.current
        const assignedColumns = assignedColumnsRef.current
        const columnItems = columnItemsRef.current
        const columnHeights = columnHeightsRef.current
        const columnRatioSums = columnRatioSumsRef.current
        const intervalTree = intervalTreeRef.current
        const colWidth = currentColumnWidthRef.current

        let column = assignedColumns[index]
        if (column === undefined) {
          // Deterministic column assignment using aspect ratio sums so assignments
          // are completely invariant to container width and sidebar toggles.
          const ratio = getItemRatio
            ? getItemRatio(index)
            : colWidth > 0 && height > 0
            ? height / colWidth
            : 1
          let minCol = 0
          for (let c = 1; c < columnCount; c++) {
            if (columnRatioSums[c] < columnRatioSums[minCol]) {
              minCol = c
            }
          }
          column = minCol
          assignedColumns[index] = column
          if (!columnItems[column]) {
            columnItems[column] = []
          }
          columnItems[column].push(index)
          columnRatioSums[column] += ratio
        }

        const top = columnHeights[column] || 0
        const left = column * (colWidth + columnGutter)
        columnHeights[column] = top + height + rowGutter
        items[index] = { left, top, height, column }
        intervalTree.insert(top, top + height, index)
      },
      get: (index: number) => itemsRef.current[index],
      update: (updates: number[]) => {
        const items = itemsRef.current
        const columnItems = columnItemsRef.current
        const columnHeights = columnHeightsRef.current
        const intervalTree = intervalTreeRef.current
        const columns = new Array(columnCount)

        for (let i = 0; i < updates.length - 1; i++) {
          const index = updates[i]
          const item = items[index]
          if (!item) continue
          const newHeight = updates[++i]
          if (item.height === newHeight) continue
          item.height = newHeight
          intervalTree.remove(index)
          intervalTree.insert(item.top, item.top + item.height, index)
          columns[item.column] =
            columns[item.column] === undefined
              ? index
              : Math.min(index, columns[item.column])
        }

        for (let i = 0; i < columns.length; i++) {
          if (columns[i] === undefined) continue
          const itemsInColumn = columnItems[i]
          if (!itemsInColumn) continue
          const startIndex = binarySearch(itemsInColumn, columns[i])
          if (startIndex === -1) continue
          const index = itemsInColumn[startIndex]
          const startItem = items[index]
          if (!startItem) continue
          columnHeights[i] = startItem.top + startItem.height + rowGutter

          for (let j = startIndex + 1; j < itemsInColumn.length; j++) {
            const idx = itemsInColumn[j]
            const itm = items[idx]
            if (!itm) continue
            itm.top = columnHeights[i]
            columnHeights[i] = itm.top + itm.height + rowGutter
            intervalTree.remove(idx)
            intervalTree.insert(itm.top, itm.top + itm.height, idx)
          }
        }
      },
      range: (
        lo: number,
        hi: number,
        renderCallback: (index: number, left: number, top: number) => void
      ) => {
        const items = itemsRef.current
        intervalTreeRef.current.search(lo, hi, (index, top) => {
          if (items[index]) {
            renderCallback(index, items[index].left, top)
          }
        })
      },
      estimateHeight: (itemCount: number, defaultItemHeight: number) => {
        const columnHeights = columnHeightsRef.current
        const tallestColumn = Math.max(0, ...columnHeights)
        const measuredSize = intervalTreeRef.current.size
        return itemCount === measuredSize
          ? tallestColumn
          : tallestColumn +
              Math.ceil((itemCount - measuredSize) / columnCount) *
                defaultItemHeight
      },
      shortestColumn: () => {
        const columnHeights = columnHeightsRef.current
        if (columnHeights.length > 1) return Math.min(...columnHeights)
        return columnHeights[0] || 0
      },
      size: () => intervalTreeRef.current.size,
      all: () => itemsRef.current,
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [versionRef.current, columnCount])

  return positioner
}
