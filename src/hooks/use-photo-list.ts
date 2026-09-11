"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import { photoList, photoRandomIdList } from "@/request/photo"
import { PHOTO_LIST_PAGE_SIZE } from "@/server/const/global"
import { type PhotoListBo } from "@/server/entity/bo/photo"
import { PhotoStatusEnum, PhotoVisibilityEnum } from "@/server/enums/photo-enum"
import { type PhotoVo } from "@/server/entity/vo/photo"

type PhotoSortField = "takenTime" | "recycleTime"

// Compare two photos by photo list sorting rules (for inserting newly uploaded photos).
function comparePhotos(a: PhotoVo, b: PhotoVo, sortField: PhotoSortField) {
  const timeA = a[sortField] ?? ""
  const timeB = b[sortField] ?? ""

  if (timeA !== timeB) {
    return timeB.localeCompare(timeA)
  }

  return b.photoId.localeCompare(a.photoId)
}

// Find where in the sorted list the new photo should be inserted.
function findPhotoInsertIndex(list: PhotoVo[], photo: PhotoVo, sortField: PhotoSortField) {
  const index = list.findIndex((item) => comparePhotos(photo, item, sortField) < 0)

  return index === -1 ? list.length : index
}

// Manage photo paged list, bottom loading and waterfall refresh markers.
function usePhotoList(
  params: Partial<PhotoListBo> = {},
  pageSize = PHOTO_LIST_PAGE_SIZE,
  initialPhotos?: PhotoVo[],
  initialTotal?: number
) {
  const paramsKey = JSON.stringify(params)
  const initialParams = useMemo<Partial<PhotoListBo>>(() => JSON.parse(paramsKey) as Partial<PhotoListBo>, [paramsKey])
  const paramsRef = useRef<Partial<PhotoListBo>>(initialParams) // Save current list request parameters, updated by explicit refresh method.
  const sortField: PhotoSortField = initialParams.status === PhotoStatusEnum.DELETE ? "recycleTime" : "takenTime"
  const initialUsedRef = useRef(false) // Mark whether the first screen data of the server has been used for the initialization list.
  const loadingRef = useRef(false) // Flag whether the photo list is currently loading.

  // Holds the full shuffled list of photo IDs fetched from the server for random pagination.
  const allShuffledIdsRef = useRef<string[] | null>(null)
  // Tracks the current offset into allShuffledIdsRef for the next page fetch.
  const pageOffsetRef = useRef(0)

  // Initial photos from SSR, used as-is (server returns random order when shuffle=true).
  const initialPhotoList = useMemo(() => initialPhotos ?? [], [initialPhotos])

  const photosRef = useRef<PhotoVo[]>(initialPhotoList) // Save latest photo list.
  const hasMoreRef = useRef(initialPhotos ? initialPhotos.length === pageSize : true) // Tracks if more pages are available.
  const [hasMore, setHasMore] = useState<boolean>(() => initialPhotos ? initialPhotos.length === pageSize : true)
  const [photos, setPhotos] = useState<PhotoVo[]>(initialPhotoList) // Store the list of photos displayed on the current page.
  const [masonryKey, setMasonryKey] = useState(0) // Control waterfall flow to recalculate layout after list structure changes.

  const [totalCount, setTotalCount] = useState<number>(() => initialTotal ?? (initialPhotos ? initialPhotos.length : 0))

  useEffect(() => {
    // Skip the browser's first page request when there is data on the first page from the server.
    if (!initialUsedRef.current) {
      initialUsedRef.current = true
      photosRef.current = initialPhotoList
      setPhotos(initialPhotoList)
      setTotalCount(initialTotal ?? initialPhotoList.length)
      const moreAvailable = initialPhotos ? initialPhotos.length === pageSize : true
      hasMoreRef.current = moreAvailable
      setHasMore(moreAvailable)
      // Offset starts at how many SSR photos we already have
      pageOffsetRef.current = initialPhotoList.length
      return
    }
  }, [initialPhotos, pageSize, initialPhotoList, initialTotal])

  // Refresh waterfall layout calculations.
  const refreshMasonry = useCallback(() => {
    setMasonryKey((prev) => prev + 1)
  }, [])

  // Fetch next page of photos by ID slice from the shuffled ID list.
  const loadPhotosByIds = useCallback((ids: string[], append: boolean) => {
    const queryParams = paramsRef.current

    photoList({
      ...queryParams,
      size: ids.length,
      photoIds: ids,
      cursorPhotoId: null,
      cursorTime: null,
    })
      .then((data) => {
        // Preserve the order of the requested IDs (server may return in different order)
        const idOrder = new Map(ids.map((id, i) => [id, i]))
        const ordered = [...data.list].sort((a, b) => (idOrder.get(a.photoId) ?? 0) - (idOrder.get(b.photoId) ?? 0))

        setPhotos((prev) => {
          const raw = append ? [...prev, ...ordered] : ordered
          const seen = new Set<string>()
          // Deduplicate while preserving order
          const uniquePhotos = raw.filter((item) => {
            if (seen.has(item.photoId)) return false
            seen.add(item.photoId)
            return true
          })

          photosRef.current = uniquePhotos
          return uniquePhotos
        })

        if (!append) {
          refreshMasonry()
          window.scrollTo(0, 0)
        }
      })
      .catch((err) => {
        console.error("Failed to load photos by IDs:", err)
        hasMoreRef.current = false
        setHasMore(false)
      })
      .finally(() => {
        loadingRef.current = false
      })
  }, [refreshMasonry])

  // Load photo list — on first load fetches all IDs randomly, subsequent pages use ID slices.
  const loadPhotoList = useCallback((append: boolean) => {
    if (append && loadingRef.current) return
    if (append && !hasMoreRef.current) return

    const queryParams = paramsRef.current
    loadingRef.current = true

    const isSortedMode = Boolean(queryParams.sortBy) || queryParams.status === PhotoStatusEnum.DELETE || queryParams.shuffle === false

    // Sorted mode or recycle bin: use normal cursor-based pagination
    if (isSortedMode) {
      const lastPhoto = append ? photosRef.current.at(-1) : null
      let cursorTime: string | null = null

      if (lastPhoto) {
        if (queryParams.sortBy === "createTime") {
          cursorTime = lastPhoto.createTime
        } else if (queryParams.sortBy === "size") {
          cursorTime = String(lastPhoto.size)
        } else if (queryParams.sortBy === "name") {
          cursorTime = lastPhoto.name
        } else if (queryParams.sortBy === "type") {
          const isVideo = Boolean(
            lastPhoto.type?.startsWith("video/") ||
            lastPhoto.name?.toLowerCase().match(/\.(mp4|mov|webm|avi|mkv)$/)
          )
          const isVideosFirst = queryParams.sortOrder === "asc"
          const rank = isVideosFirst ? (isVideo ? 0 : 1) : (isVideo ? 1 : 0)
          cursorTime = `${rank}__${lastPhoto.takenTime || lastPhoto.createTime || ""}`
        } else if (queryParams.status === PhotoStatusEnum.DELETE) {
          cursorTime = lastPhoto.recycleTime
        } else {
          cursorTime = lastPhoto.takenTime
        }
      }

      photoList({
        ...queryParams,
        size: pageSize,
        cursorPhotoId: lastPhoto?.photoId ?? null,
        cursorTime: cursorTime,
      })
        .then((data) => {
          setPhotos((prev) => {
            const raw = append ? [...prev, ...data.list] : data.list
            const seen = new Set<string>()
            const uniquePhotos = raw.filter((item) => {
              if (seen.has(item.photoId)) return false
              seen.add(item.photoId)
              return true
            })
            photosRef.current = uniquePhotos
            if (data.total !== undefined) {
              setTotalCount(data.total)
            }
            return uniquePhotos
          })
          const more = data.list.length === pageSize
          hasMoreRef.current = more
          setHasMore(more)
          if (!append) {
            refreshMasonry()
            if (typeof window !== "undefined") {
              window.scrollTo(0, 0)
            }
          }
        })
        .catch((err) => {
          console.error("Failed to load photo list:", err)
          hasMoreRef.current = false
          setHasMore(false)
        })
        .finally(() => {
          loadingRef.current = false
        })
      return
    }

    // Normal mode: use shuffled ID list for true random ordering across all pages
    if (append && allShuffledIdsRef.current) {
      // Already have the full ID list — take the next page slice
      const allIds = allShuffledIdsRef.current
      const offset = pageOffsetRef.current
      const nextIds = allIds.slice(offset, offset + pageSize)

      if (!nextIds.length) {
        hasMoreRef.current = false
        setHasMore(false)
        loadingRef.current = false
        return
      }

      pageOffsetRef.current = offset + nextIds.length
      const more = pageOffsetRef.current < allIds.length
      hasMoreRef.current = more
      setHasMore(more)
      loadPhotosByIds(nextIds, true)
      return
    }

    // Initial load: fetch all IDs in random order, then load first page
    photoRandomIdList({
      status: queryParams.status ?? null,
      albumId: queryParams.albumId ?? null,
      startTakenTime: queryParams.startTakenTime ?? null,
      endTakenTime: queryParams.endTakenTime ?? null,
    })
      .then((allIds) => {
        allShuffledIdsRef.current = allIds
        setTotalCount(allIds.length)

        // First page: use IDs that aren't already shown via SSR
        const alreadyShownIds = new Set(photosRef.current.map((p) => p.photoId))
        const remainingIds = allIds.filter((id) => !alreadyShownIds.has(id))

        if (append) {
          // loadMorePhotos called before IDs were ready — load next page
          const nextIds = remainingIds.slice(0, pageSize)
          if (!nextIds.length) {
            hasMoreRef.current = false
            setHasMore(false)
            loadingRef.current = false
            return
          }
          const lastId = nextIds[nextIds.length - 1]
          const lastIdx = allIds.indexOf(lastId)
          pageOffsetRef.current = lastIdx !== -1 ? lastIdx + 1 : allIds.length
          const more = pageOffsetRef.current < allIds.length
          hasMoreRef.current = more
          setHasMore(more)
          loadPhotosByIds(nextIds, true)
        } else {
          // Fresh load: replace everything with first page from shuffled IDs
          const firstPageIds = allIds.slice(0, pageSize)
          pageOffsetRef.current = firstPageIds.length
          const more = allIds.length > pageSize
          hasMoreRef.current = more
          setHasMore(more)
          if (firstPageIds.length) {
            loadPhotosByIds(firstPageIds, false)
          } else {
            loadingRef.current = false
          }
        }
      })
      .catch((err) => {
        console.error("Failed to fetch random ID list:", err)
        hasMoreRef.current = false
        setHasMore(false)
        loadingRef.current = false
      })
  }, [pageSize, loadPhotosByIds, refreshMasonry])

  // Explicitly refresh the first page of the list by passing in parameters.
  const refreshPhotoList = useCallback((nextParams?: Partial<PhotoListBo>) => {
    if (nextParams) {
      paramsRef.current = nextParams
    }

    // Reset shuffled ID list so next load fetches fresh random order
    allShuffledIdsRef.current = null
    pageOffsetRef.current = 0
    photosRef.current = []
    hasMoreRef.current = true
    setHasMore(true)
    loadPhotoList(false)
  }, [loadPhotoList])

  // Handle next page request after photo list bottoms out.
  const loadMorePhotos = useCallback(() => {
    loadPhotoList(true)
  }, [loadPhotoList])

  // Insert newly uploaded photos at the top of the list.
  const prependPhotos = useCallback((photosToAdd: PhotoVo[]) => {
    setPhotos((prev) => {
      const photoIds = new Set(prev.map((photo) => photo.photoId))
      const newPhotos = photosToAdd.filter((photo) => !photoIds.has(photo.photoId))

      if (!newPhotos.length) {
        return prev
      }

      const nextPhotos = [...prev]
      const sortedNewPhotos = [...newPhotos].sort((a, b) => comparePhotos(a, b, sortField))

      for (const photo of sortedNewPhotos) {
        const index = findPhotoInsertIndex(nextPhotos, photo, sortField)
        nextPhotos.splice(index, 0, photo)
      }

      photosRef.current = nextPhotos
      if (allShuffledIdsRef.current) {
        const newIds = newPhotos.map((p) => p.photoId)
        allShuffledIdsRef.current = [...newIds, ...allShuffledIdsRef.current]
      }
      setTotalCount((c) => c + newPhotos.length)
      return nextPhotos
    })
    refreshMasonry()
  }, [refreshMasonry, sortField])

  // Remove specified photos from photo list; refill if list falls below threshold.
  const removePhotos = useCallback((photoIds: string[]) => {
    const photoIdSet = new Set(photoIds)
    const nextPhotos = photosRef.current.filter((photo) => !photoIdSet.has(photo.photoId))

    photosRef.current = nextPhotos
    if (allShuffledIdsRef.current) {
      allShuffledIdsRef.current = allShuffledIdsRef.current.filter((id) => !photoIdSet.has(id))
    }
    setPhotos(nextPhotos)
    setTotalCount((c) => Math.max(0, c - photoIds.length))
    refreshMasonry()

    if (nextPhotos.length < 95) {
      loadPhotoList(true)
    }
  }, [loadPhotoList, refreshMasonry])

  // Update in-memory photo fields (e.g. visibility, allowDownload).
  const updatePhoto = useCallback((updatedPhoto: Partial<PhotoVo> & { photoId: string }) => {
    // If photo is archived or moved out of gallery scope, remove it from view and decrement totalCount
    if (
      updatedPhoto.visibility === PhotoVisibilityEnum.ARCHIVED ||
      (!paramsRef.current.albumId && updatedPhoto.visibility === PhotoVisibilityEnum.ALBUM_ONLY)
    ) {
      removePhotos([updatedPhoto.photoId])
      return
    }

    setPhotos((prev) => {
      const next = prev.map((p) => (p.photoId === updatedPhoto.photoId ? { ...p, ...updatedPhoto } : p))
      photosRef.current = next
      return next
    })
  }, [removePhotos])

  // Batch update in-memory photo fields across multiple photo IDs.
  const updatePhotos = useCallback((photoIds: string[], updatedFields: Partial<PhotoVo>) => {
    // If photos are archived or moved out of gallery scope, remove them from view and decrement totalCount
    if (
      updatedFields.visibility === PhotoVisibilityEnum.ARCHIVED ||
      (!paramsRef.current.albumId && updatedFields.visibility === PhotoVisibilityEnum.ALBUM_ONLY)
    ) {
      removePhotos(photoIds)
      return
    }

    const idSet = new Set(photoIds)
    setPhotos((prev) => {
      const next = prev.map((p) => (idSet.has(p.photoId) ? { ...p, ...updatedFields } : p))
      photosRef.current = next
      return next
    })
    refreshMasonry()
  }, [refreshMasonry, removePhotos])

  // Silently re-sync the list with server state without forcing scroll to top
  const silentRefresh = useCallback((expectedPhotoCount?: number) => {
    if (typeof expectedPhotoCount === "number") {
      setTotalCount(expectedPhotoCount)
    }

    const queryParams = paramsRef.current
    const isSortedMode = Boolean(queryParams.sortBy) || queryParams.status === PhotoStatusEnum.DELETE || queryParams.shuffle === false

    if (!isSortedMode) {
      photoRandomIdList({
        status: queryParams.status ?? null,
        albumId: queryParams.albumId ?? null,
        startTakenTime: queryParams.startTakenTime ?? null,
        endTakenTime: queryParams.endTakenTime ?? null,
      })
        .then((allIds) => {
          const activeSet = new Set(allIds)
          setTotalCount(allIds.length)

          // 1. Remove any photos currently on screen that no longer exist or are now archived
          const currentPhotos = photosRef.current
          const filteredPhotos = currentPhotos.filter((p) => activeSet.has(p.photoId))

          if (filteredPhotos.length !== currentPhotos.length) {
            photosRef.current = filteredPhotos
            setPhotos(filteredPhotos)
            refreshMasonry()
          }

          // 2. If screen was empty or had fewer than pageSize photos, and new photos are available, fetch them
          if (filteredPhotos.length < pageSize && allIds.length > filteredPhotos.length) {
            const shownIds = new Set(filteredPhotos.map((p) => p.photoId))
            const missingIds = allIds.filter((id) => !shownIds.has(id)).slice(0, pageSize - filteredPhotos.length)
            if (missingIds.length > 0) {
              loadPhotosByIds(missingIds, true)
            }
          }

          // 3. Update shuffled IDs reference preserving existing order plus newly available IDs
          if (allShuffledIdsRef.current) {
            const existingActive = allShuffledIdsRef.current.filter((id) => activeSet.has(id))
            const existingActiveSet = new Set(existingActive)
            const newlyAdded = allIds.filter((id) => !existingActiveSet.has(id))
            allShuffledIdsRef.current = [...existingActive, ...newlyAdded]
          } else {
            allShuffledIdsRef.current = allIds
          }

          const currentCount = photosRef.current.length
          pageOffsetRef.current = currentCount
          const more = currentCount < allIds.length
          hasMoreRef.current = more
          setHasMore(more)
        })
        .catch((err) => {
          console.error("Silent sync failed:", err)
        })
    } else {
      // In sorted mode, query the current slice quietly
      const currentCount = Math.max(photosRef.current.length, pageSize)
      photoList({
        ...queryParams,
        size: currentCount,
        cursorPhotoId: null,
        cursorTime: null,
      })
        .then((data) => {
          photosRef.current = data.list
          setPhotos(data.list)
          if (data.total !== undefined) {
            setTotalCount(data.total)
          }
          refreshMasonry()
        })
        .catch((err) => {
          console.error("Silent sync sorted mode failed:", err)
        })
    }
  }, [pageSize, loadPhotosByIds, refreshMasonry])

  return {
    photos,
    totalCount,
    setTotalCount,
    hasMore,
    setPhotos,
    masonryKey,
    loadMorePhotos,
    refreshPhotoList,
    silentRefresh,
    prependPhotos,
    removePhotos,
    updatePhoto,
    updatePhotos,
    refreshMasonry,
  }
}

export { usePhotoList }
