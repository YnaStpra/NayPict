"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import { photoList, photoRandomIdList } from "@/request/photo"
import { PHOTO_LIST_PAGE_SIZE } from "@/server/const/global"
import { type PhotoListBo } from "@/server/entity/bo/photo"
import { PhotoStatusEnum, PhotoVisibilityEnum } from "@/server/enums/photo-enum"
import { type PhotoVo } from "@/server/entity/vo/photo"
import { saveOfflineCatalog, getOfflineCatalog, getMemoryOfflineCatalog } from "@/lib/offline-catalog"

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
  // Queue of remaining unshown photo IDs that have not yet been rendered on screen.
  const remainingShuffledIdsRef = useRef<string[] | null>(null)
  // In-flight Promise for photoRandomIdList to avoid duplicate concurrent network fetches.
  const fetchRandomIdsPromiseRef = useRef<Promise<string[]> | null>(null)

  const hasCustomVisibility =
    initialParams.visibility !== undefined && initialParams.visibility !== null
  const isMainGalleryScope =
    !initialParams.albumId && !initialParams.status && !hasCustomVisibility

  // Initial photos from SSR, or seeded from landing page in-memory cache ONLY for main public gallery scope
  const seededCatalog = useMemo(() => {
    if (initialPhotos && initialPhotos.length > 0) return null
    if (isMainGalleryScope) {
      return getMemoryOfflineCatalog()
    }
    return null
  }, [initialPhotos, isMainGalleryScope])

  const initialPhotoList = useMemo(() => {
    if (initialPhotos && initialPhotos.length > 0) return initialPhotos
    if (seededCatalog && seededCatalog.photos.length > 0) return seededCatalog.photos
    return []
  }, [initialPhotos, seededCatalog])

  const isSeededRef = useRef(Boolean(seededCatalog && seededCatalog.photos.length > 0))
  const photosRef = useRef<PhotoVo[]>(initialPhotoList) // Save latest photo list.
  const hasInitialPhotos = Array.isArray(initialPhotos) && initialPhotos.length > 0
  const initialMoreAvailable = hasInitialPhotos
    ? (typeof initialTotal === "number" ? initialPhotos.length < initialTotal : initialPhotos.length >= pageSize)
    : (typeof initialTotal === "number" ? initialTotal > 0 : true)
  const hasMoreRef = useRef(initialMoreAvailable) // Tracks if more pages are available.
  const [hasMore, setHasMore] = useState<boolean>(initialMoreAvailable)
  const [photos, setPhotos] = useState<PhotoVo[]>(initialPhotoList) // Store the list of photos displayed on the current page.
  const [masonryKey, setMasonryKey] = useState(0) // Control waterfall flow to recalculate layout after list structure changes.

  const [totalCount, setTotalCount] = useState<number>(() => initialTotal || (seededCatalog?.totalCount ?? (hasInitialPhotos ? initialPhotos.length : 0)))
  const [loadingMore, setLoadingMore] = useState(false)
  const [loadMoreError, setLoadMoreError] = useState(false)
  const [isOffline, setIsOffline] = useState(false)

  // Listen to browser connectivity transitions
  useEffect(() => {
    if (typeof window === "undefined") return
    const handleOnline = () => setIsOffline(false)
    const handleOffline = () => setIsOffline(true)
    window.addEventListener("online", handleOnline)
    window.addEventListener("offline", handleOffline)
    return () => {
      window.removeEventListener("online", handleOnline)
      window.removeEventListener("offline", handleOffline)
    }
  }, [])

  useEffect(() => {
    // Skip the browser's first page request when there is data on the first page from the server.
    if (!initialUsedRef.current) {
      initialUsedRef.current = true
      photosRef.current = initialPhotoList
      setPhotos(initialPhotoList)
      setTotalCount(initialTotal ?? (seededCatalog?.totalCount ?? initialPhotoList.length))
      const hasInitialPhotos = Array.isArray(initialPhotos) && initialPhotos.length > 0
      const moreAvailable = hasInitialPhotos
        ? (typeof initialTotal === "number" ? initialPhotos.length < initialTotal : initialPhotos.length >= pageSize)
        : (typeof initialTotal === "number" ? initialTotal > 0 : true)
      hasMoreRef.current = moreAvailable
      setHasMore(moreAvailable)

      // Save initial page to offline IndexedDB catalog or restore cached snapshot ONLY for main public gallery
      if (initialPhotoList.length > 0 && isMainGalleryScope) {
        saveOfflineCatalog(initialPhotoList, initialTotal ?? (seededCatalog?.totalCount ?? initialPhotoList.length))
      } else if (initialPhotoList.length === 0 && isMainGalleryScope) {
        getOfflineCatalog().then((cached) => {
          if (cached && cached.photos.length > 0) {
            photosRef.current = cached.photos
            setPhotos(cached.photos)
            setTotalCount(cached.totalCount)
            if (typeof navigator !== "undefined" && !navigator.onLine) {
              setIsOffline(true)
            }
          }
        })
      }
      return
    }

    // Hydrate streamed server photos if client started with empty/snapshot state or seeded cache
    if (initialPhotos && initialPhotos.length > 0 && (photosRef.current.length === 0 || isSeededRef.current)) {
      isSeededRef.current = false
      photosRef.current = initialPhotos
      setPhotos(initialPhotos)
      setTotalCount(initialTotal ?? initialPhotos.length)
      const moreAvailable = typeof initialTotal === "number" ? initialPhotos.length < initialTotal : initialPhotos.length >= pageSize
      hasMoreRef.current = moreAvailable
      setHasMore(moreAvailable)
      if (isMainGalleryScope) {
        saveOfflineCatalog(initialPhotos, initialTotal ?? initialPhotos.length)
      }
    }
  }, [initialPhotos, pageSize, initialPhotoList, initialTotal, isMainGalleryScope, seededCatalog])

  // Speculatively prefetch randomized ID catalog in idle time so the first infinite scroll triggers 1 single request instead of 2 sequential requests
  useEffect(() => {
    if (typeof window === "undefined") return
    if (paramsRef.current.sortBy || paramsRef.current.cursorPhotoId || paramsRef.current.shuffle === false) return
    if (allShuffledIdsRef.current || remainingShuffledIdsRef.current) return

    const prefetchRandomIds = () => {
      const q = paramsRef.current
      if (q.sortBy || q.cursorPhotoId || q.shuffle === false || allShuffledIdsRef.current) return

      const promise = photoRandomIdList({
        status: q.status ?? null,
        albumId: q.albumId ?? null,
        visibility: q.visibility ?? null,
        startTakenTime: q.startTakenTime ?? null,
        endTakenTime: q.endTakenTime ?? null,
      })
      fetchRandomIdsPromiseRef.current = promise

      promise
        .then((allIds) => {
          if (fetchRandomIdsPromiseRef.current === promise) {
            fetchRandomIdsPromiseRef.current = null
          }
          if (Array.isArray(allIds) && allIds.length > 0) {
            allShuffledIdsRef.current = allIds
            setTotalCount(allIds.length)

            // Deduplicate against already rendered photos to compute unshown queue
            const shownIds = new Set(photosRef.current.map((p) => p.photoId))
            const unshownIds = allIds.filter((id) => !shownIds.has(id))
            remainingShuffledIdsRef.current = unshownIds

            const more = unshownIds.length > 0
            hasMoreRef.current = more
            setHasMore(more)
          }
        })
        .catch(() => {
          if (fetchRandomIdsPromiseRef.current === promise) {
            fetchRandomIdsPromiseRef.current = null
          }
        })
    }

    const idleWindow = window as Window & {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number
      cancelIdleCallback?: (id: number) => void
    }
    if (typeof idleWindow.requestIdleCallback === "function") {
      const handle = idleWindow.requestIdleCallback(prefetchRandomIds, { timeout: 1500 })
      return () => idleWindow.cancelIdleCallback?.(handle)
    } else {
      const timer: ReturnType<typeof setTimeout> = setTimeout(prefetchRandomIds, 400)
      return () => clearTimeout(timer)
    }
  }, [])

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
          if (typeof window !== "undefined") {
            window.scrollTo(0, 0)
          }
        }
      })
      .catch((err) => {
        console.error("Failed to load photos by IDs:", err)
        // Rollback unshown slice so subsequent retry re-fetches this exact slice instead of skipping
        if (append && ids.length > 0) {
          remainingShuffledIdsRef.current = [
            ...ids,
            ...(remainingShuffledIdsRef.current || [])
          ]
        }
        hasMoreRef.current = true
        setHasMore(true)
        if (append) {
          setLoadMoreError(true)
        }
      })
      .finally(() => {
        loadingRef.current = false
        setLoadingMore(false)
      })
  }, [refreshMasonry])

  // Load photo list — on first load fetches all IDs randomly, subsequent pages use ID slices.
  const loadPhotoList = useCallback((append: boolean) => {
    if (append && loadingRef.current) return
    if (append && !hasMoreRef.current) return

    const queryParams = paramsRef.current
    loadingRef.current = true
    if (append) {
      setLoadingMore(true)
      setLoadMoreError(false)
    }

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
          cursorTime = lastPhoto.recycleTime ?? null
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
            const isQueryMainGallery =
              !queryParams.albumId &&
              !queryParams.status &&
              (queryParams.visibility === undefined || queryParams.visibility === null)
            if (!append && isQueryMainGallery) {
              saveOfflineCatalog(uniquePhotos, data.total ?? uniquePhotos.length)
            }
            setIsOffline(false)
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
          hasMoreRef.current = true
          setHasMore(true)
          if (append) {
            setLoadMoreError(true)
          }
          const isQueryMainGallery =
            !queryParams.albumId &&
            !queryParams.status &&
            (queryParams.visibility === undefined || queryParams.visibility === null)
          if (photosRef.current.length === 0 && isQueryMainGallery) {
            getOfflineCatalog().then((cached) => {
              if (cached && cached.photos.length > 0) {
                photosRef.current = cached.photos
                setPhotos(cached.photos)
                setTotalCount(cached.totalCount)
                setIsOffline(true)
              }
            })
          }
        })
        .finally(() => {
          loadingRef.current = false
          setLoadingMore(false)
        })
      return
    }

    // Normal mode: use shuffled ID list for true random ordering across all pages
    if (append && remainingShuffledIdsRef.current) {
      const remainingIds = remainingShuffledIdsRef.current
      const nextBatch = remainingIds.slice(0, pageSize)
      remainingShuffledIdsRef.current = remainingIds.slice(pageSize)

      if (!nextBatch.length) {
        hasMoreRef.current = false
        setHasMore(false)
        loadingRef.current = false
        setLoadingMore(false)
        return
      }

      const more = remainingShuffledIdsRef.current.length > 0
      hasMoreRef.current = more
      setHasMore(more)
      loadPhotosByIds(nextBatch, true)
      return
    }

    // Reuse in-flight random ID fetch or initiate fresh one
    const randomPromise = fetchRandomIdsPromiseRef.current || photoRandomIdList({
      status: queryParams.status ?? null,
      albumId: queryParams.albumId ?? null,
      visibility: queryParams.visibility ?? null,
      startTakenTime: queryParams.startTakenTime ?? null,
      endTakenTime: queryParams.endTakenTime ?? null,
    })
    fetchRandomIdsPromiseRef.current = randomPromise

    randomPromise
      .then((allIds) => {
        if (fetchRandomIdsPromiseRef.current === randomPromise) {
          fetchRandomIdsPromiseRef.current = null
        }
        allShuffledIdsRef.current = allIds
        setTotalCount(allIds.length)

        if (append) {
          // User scrolled while IDs were still fetching: take first unshown batch
          const alreadyShownIds = new Set(photosRef.current.map((p) => p.photoId))
          const unshownIds = allIds.filter((id) => !alreadyShownIds.has(id))
          const nextBatch = unshownIds.slice(0, pageSize)
          remainingShuffledIdsRef.current = unshownIds.slice(pageSize)

          if (!nextBatch.length) {
            hasMoreRef.current = false
            setHasMore(false)
            loadingRef.current = false
            setLoadingMore(false)
            return
          }

          const more = remainingShuffledIdsRef.current.length > 0
          hasMoreRef.current = more
          setHasMore(more)
          loadPhotosByIds(nextBatch, true)
        } else {
          // Fresh load: replace everything with first page from shuffled IDs
          const firstBatch = allIds.slice(0, pageSize)
          const remaining = allIds.slice(pageSize)
          remainingShuffledIdsRef.current = remaining
          const more = remaining.length > 0
          hasMoreRef.current = more
          setHasMore(more)
          if (firstBatch.length) {
            loadPhotosByIds(firstBatch, false)
          } else {
            loadingRef.current = false
            setLoadingMore(false)
          }
        }
      })
      .catch((err) => {
        console.error("Failed to fetch random ID list:", err)
        if (fetchRandomIdsPromiseRef.current === randomPromise) {
          fetchRandomIdsPromiseRef.current = null
        }
        hasMoreRef.current = true
        setHasMore(true)
        loadingRef.current = false
        setLoadingMore(false)
        if (append) {
          setLoadMoreError(true)
        }
      })
  }, [pageSize, loadPhotosByIds, refreshMasonry])

  // Explicitly refresh the first page of the list by passing in parameters.
  const refreshPhotoList = useCallback((nextParams?: Partial<PhotoListBo>) => {
    if (nextParams) {
      paramsRef.current = nextParams
    }

    // Reset shuffled ID list and in-flight promise so next load fetches fresh random order
    allShuffledIdsRef.current = null
    remainingShuffledIdsRef.current = null
    fetchRandomIdsPromiseRef.current = null
    photosRef.current = []
    hasMoreRef.current = true
    setHasMore(true)
    setLoadingMore(false)
    setLoadMoreError(false)
    loadPhotoList(false)
  }, [loadPhotoList])

  // Handle next page request after photo list bottoms out.
  const loadMorePhotos = useCallback(() => {
    loadPhotoList(true)
  }, [loadPhotoList])

  // Retry loading more photos after a failure
  const retryLoadMore = useCallback(() => {
    loadingRef.current = false
    setLoadingMore(false)
    setLoadMoreError(false)
    hasMoreRef.current = true
    setHasMore(true)
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
      const newIds = newPhotos.map((p) => p.photoId)
      if (allShuffledIdsRef.current) {
        allShuffledIdsRef.current = [...newIds, ...allShuffledIdsRef.current]
      }
      if (remainingShuffledIdsRef.current) {
        const addedSet = new Set(newIds)
        remainingShuffledIdsRef.current = remainingShuffledIdsRef.current.filter((id) => !addedSet.has(id))
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
    if (remainingShuffledIdsRef.current) {
      remainingShuffledIdsRef.current = remainingShuffledIdsRef.current.filter((id) => !photoIdSet.has(id))
      const more = remainingShuffledIdsRef.current.length > 0
      hasMoreRef.current = more
      setHasMore(more)
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
    const isInArchiveView = paramsRef.current.visibility === PhotoVisibilityEnum.ARCHIVED
    const shouldRemoveFromView = isInArchiveView
      ? (updatedPhoto.visibility !== undefined && updatedPhoto.visibility !== PhotoVisibilityEnum.ARCHIVED)
      : (
          updatedPhoto.visibility === PhotoVisibilityEnum.ARCHIVED ||
          (!paramsRef.current.albumId && updatedPhoto.visibility === PhotoVisibilityEnum.ALBUM_ONLY)
        )
    if (shouldRemoveFromView) {
      removePhotos([updatedPhoto.photoId])
      return
    }

    let shouldRelayout = false
    setPhotos((prev) => {
      const next = prev.map((p) => {
        if (p.photoId !== updatedPhoto.photoId) return p
        if (
          (updatedPhoto.width !== undefined && updatedPhoto.width !== p.width) ||
          (updatedPhoto.height !== undefined && updatedPhoto.height !== p.height) ||
          (updatedPhoto.rotation !== undefined && updatedPhoto.rotation !== p.rotation)
        ) {
          shouldRelayout = true
        }
        return { ...p, ...updatedPhoto }
      })
      photosRef.current = next
      return next
    })
    if (shouldRelayout) {
      refreshMasonry()
    }
  }, [refreshMasonry, removePhotos])

  // Batch update in-memory photo fields across multiple photo IDs.
  const updatePhotos = useCallback((photoIds: string[], updatedFields: Partial<PhotoVo>) => {
    const isInArchiveView = paramsRef.current.visibility === PhotoVisibilityEnum.ARCHIVED
    const shouldRemoveFromView = isInArchiveView
      ? (updatedFields.visibility !== undefined && updatedFields.visibility !== PhotoVisibilityEnum.ARCHIVED)
      : (
          updatedFields.visibility === PhotoVisibilityEnum.ARCHIVED ||
          (!paramsRef.current.albumId && updatedFields.visibility === PhotoVisibilityEnum.ALBUM_ONLY)
        )
    if (shouldRemoveFromView) {
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
        visibility: queryParams.visibility ?? null,
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

          // 3. Update shuffled IDs reference and unshown queue
          allShuffledIdsRef.current = allIds
          const shownIds = new Set(photosRef.current.map((p) => p.photoId))
          const unshownIds = allIds.filter((id) => !shownIds.has(id))
          remainingShuffledIdsRef.current = unshownIds

          const more = unshownIds.length > 0
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
    loadingMore,
    loadMoreError,
    retryLoadMore,
    isOffline,
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
