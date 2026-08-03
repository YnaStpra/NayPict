"use client"

import { createContext, useContext } from "react"

import { type PhotoVo } from "@/server/entity/vo/photo"

interface AlbumPhotoContextValue {
  // initialPhotos Save the first page of the album photos queried by the server。
  initialPhotos: PhotoVo[]
}

interface AlbumPhotoProviderProps {
  // children It is the content of the photo page of the album。
  children: React.ReactNode
  // initialPhotos Save the first page of the album photos queried by the server。
  initialPhotos: PhotoVo[]
}

const AlbumPhotoContext = createContext<AlbumPhotoContextValue | null>(null)

// Read the photo data prefetched by the server on the album photo page。
function useAlbumPhotoContext() {
  const context = useContext(AlbumPhotoContext)

  if (!context) {
    throw new Error("useAlbumPhotoContext must be used within AlbumPhotoProvider.")
  }

  return context
}

// Provide server-side prefetched photos for the album photo page client component。
function AlbumPhotoProvider({ children, initialPhotos }: AlbumPhotoProviderProps) {
  return (
    <AlbumPhotoContext.Provider value={{ initialPhotos }}>
      {children}
    </AlbumPhotoContext.Provider>
  )
}

export { AlbumPhotoProvider, useAlbumPhotoContext }
