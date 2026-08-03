"use client"

import { createContext, useContext } from "react"
import { type PhotoVo } from "@/server/entity/vo/photo"

interface PhotoContextValue {
  // initialPhotos Save the first page of photos queried by the server。
  initialPhotos: PhotoVo[]
}

interface PhotoProviderProps {
  // children yes /photo Page content under routing。
  children: React.ReactNode
  // initialPhotos Save the first page of photos queried by the server。
  initialPhotos: PhotoVo[]
}

const PhotoContext = createContext<PhotoContextValue | null>(null)

// read /photo Photo data prefetched by the server under routing。
function usePhotoContext() {
  const context = useContext(PhotoContext)

  if (!context) {
    throw new Error("usePhotoContext must be used within PhotoProvider.")
  }

  return context
}

// Give /photo The client component under routing provides server-side prefetching of photos。
function PhotoProvider({ children, initialPhotos }: PhotoProviderProps) {
  return (
    <PhotoContext.Provider value={{ initialPhotos }}>
      {children}
    </PhotoContext.Provider>
  )
}

export { PhotoProvider, usePhotoContext }
