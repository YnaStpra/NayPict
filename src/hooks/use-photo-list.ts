"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import { photoList } from "@/request/photo"
import { PHOTO_LIST_PAGE_SIZE } from "@/server/const/global"
import { type PhotoListBo } from "@/server/entity/bo/photo"
import { PhotoStatusEnum } from "@/server/enums/photo-enum"
import { type PhotoVo } from "@/server/entity/vo/photo"

type PhotoSortField = "takenTime" | "recycleTime"

// Compare two photos by photo list sorting rules，Sequence and backend desc(time), desc(photoId) consistent。
function comparePhotos(a: PhotoVo, b: PhotoVo, sortField: PhotoSortField) {
  const timeA = a[sortField] ?? ""
  const timeB = b[sortField] ?? ""

  if (timeA !== timeB) {
    return timeB.localeCompare(timeA)
  }

  return b.photoId.localeCompare(a.photoId)
}

// Find where in the sorted list the new photo should be inserted。
function findPhotoInsertIndex(list: PhotoVo[], photo: PhotoVo, sortField: PhotoSortField) {
  const index = list.findIndex((item) => comparePhotos(photo, item, sortField) < 0)

  return index === -1 ? list.length : index
}


// Manage photo paged list, Bottom loading and waterfall refresh markers.
function usePhotoList(params: Partial<PhotoListBo> = {}, pageSize = PHOTO_LIST_PAGE_SIZE, initialPhotos?: PhotoVo[]) {
  const paramsKey = JSON.stringify(params)
  const initialParams = useMemo<Partial<PhotoListBo>>(() => JSON.parse(paramsKey) as Partial<PhotoListBo>, [paramsKey])
  const paramsRef = useRef<Partial<PhotoListBo>>(initialParams) // Save current list request parameters, Updated by explicit refresh method.
  const sortField: PhotoSortField = paramsRef.current.status === PhotoStatusEnum.DELETE ? "recycleTime" : "takenTime"
  const initialUsedRef = useRef(false) // Mark whether the first screen data of the server has been used for the initialization list.
  const loadingRef = useRef(false) // Flag whether the photo list is currently loading.

  // Initial photos from SSR, used as-is (server returns random order when shuffle=true)
  const initialPhotoList = useMemo(() => initialPhotos ?? [], [initialPhotos])

  const photosRef = useRef<PhotoVo[]>(initialPhotoList) // Save latest photo list.
  const hasMoreRef = useRef(initialPhotos ? initialPhotos.length === pageSize : true) // Tracks if more pages are available; set to false on load error or when less than pageSize returned.
  const [photos, setPhotos] = useState<PhotoVo[]>(initialPhotoList) // Store the list of photos displayed on the current page.
  const [masonryKey, setMasonryKey] = useState(0) // Control waterfall flow to recalculate layout after list structure changes.

  useEffect(() => {
    // Skip the browser's first page request when there is data on the first page of the server.
    if (!initialUsedRef.current) {
      initialUsedRef.current = true
      photosRef.current = initialPhotoList
      setPhotos(initialPhotoList)
      hasMoreRef.current = initialPhotos ? initialPhotos.length === pageSize : true
      return
    }

  }, [initialPhotos, pageSize, initialPhotoList])

  // Refresh waterfall layout calculations。
  const refreshMasonry = useCallback(() => {
    setMasonryKey((prev) => prev + 1)
  }, [])

  // Load photo list，And generate the next page cursor based on the current last photo。
  const loadPhotoList = useCallback((append: boolean) => {
    if ((append && loadingRef.current) || (!hasMoreRef.current && append)) {
      return
    }

    const queryParams = paramsRef.current

    loadingRef.current = true

    const lastPhoto = append ? photosRef.current.at(-1) : null
    const cursorTime = lastPhoto
      ? (queryParams.status === PhotoStatusEnum.DELETE ? lastPhoto.recycleTime : lastPhoto.takenTime)
      : null

    photoList({
      ...queryParams,
      // Request server-side random ordering on first page (no cursor) for normal photos
      shuffle: !append && !queryParams.status ? true : undefined,
      size: pageSize,
      cursorPhotoId: lastPhoto?.photoId ?? null,
      cursorTime: cursorTime ?? null,
    })
      .then((data) => {
        setPhotos((prev) => {
          const raw = append ? [...prev, ...data.list] : data.list
          const seen = new Set<string>()
          // Deduplicate, preserving server-provided order
          const uniquePhotos = raw.filter((item) => {
            if (seen.has(item.photoId)) return false
            seen.add(item.photoId)
            return true
          })

          photosRef.current = uniquePhotos
          return uniquePhotos
        })
        // No more pages if fewer items than pageSize were returned
        hasMoreRef.current = data.list.length === pageSize
        if (!append) {
          refreshMasonry()
          window.scrollTo(0, 0)
        }
      })
      .catch((err) => {
        console.error('Failed to load photo list:', err)
        // Stop further load attempts on error
        hasMoreRef.current = false
      })
      .finally(() => {
        loadingRef.current = false
      })
  }, [pageSize, refreshMasonry])

  // Explicitly refresh the first page of the list by passing in parameters。
  const refreshPhotoList = useCallback((nextParams?: Partial<PhotoListBo>) => {
    if (nextParams) {
      paramsRef.current = nextParams
    }

    photosRef.current = []
    hasMoreRef.current = true
    loadPhotoList(false)
  }, [loadPhotoList])

  // Handle next page request after photo list bottoms out。
  const loadMorePhotos = useCallback(() => {
    loadPhotoList(true)
  }, [loadPhotoList])

  // press new photo taken_time Insert the corresponding positions in the list sequentially，and filter out photos that already exist。
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
      return nextPhotos
    })
    refreshMasonry()
  }, [refreshMasonry, sortField])

  // Remove specified photo from photo list，Not enough list 95 Zhang Shi continues to load the next page。
  const removePhotos = useCallback((photoIds: string[]) => {
    const photoIdSet = new Set(photoIds)
    const nextPhotos = photosRef.current.filter((photo) => !photoIdSet.has(photo.photoId))

    photosRef.current = nextPhotos
    setPhotos(nextPhotos)
    refreshMasonry()

    if (nextPhotos.length < 95) {
      loadPhotoList(true)
    }
  }, [loadPhotoList, refreshMasonry])

  return {
    photos,
    setPhotos,
    masonryKey,
    loadMorePhotos,
    refreshPhotoList,
    prependPhotos,
    removePhotos,
    refreshMasonry,
  }
}

export { usePhotoList }
