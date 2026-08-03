"use client"

import { createContext, useContext } from "react"

import { type PhotoVo } from "@/server/entity/vo/photo"

interface TrashPhotoContextValue {
  // initialPhotos Save the first page of the recycle bin photos queried by the server。
  initialPhotos: PhotoVo[]
}

interface TrashPhotoProviderProps {
  // children Is the content of the photo page in the recycle bin?。
  children: React.ReactNode
  // initialPhotos Save the first page of the recycle bin photos queried by the server。
  initialPhotos: PhotoVo[]
}

const TrashPhotoContext = createContext<TrashPhotoContextValue | null>(null)

// Read the photo data prefetched by the server on the recycle bin photo page。
function useTrashPhotoContext() {
  const context = useContext(TrashPhotoContext)

  if (!context) {
    throw new Error("useTrashPhotoContext must be used within TrashPhotoProvider.")
  }

  return context
}

// Provide server-side prefetching photos for the client component of the recycle bin photo page。
function TrashPhotoProvider({ children, initialPhotos }: TrashPhotoProviderProps) {
  return (
    <TrashPhotoContext.Provider value={{ initialPhotos }}>
      {children}
    </TrashPhotoContext.Provider>
  )
}

export { TrashPhotoProvider, useTrashPhotoContext }
