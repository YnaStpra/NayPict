"use client"

import { createContext, useContext } from "react"

import { type PhotoVo } from "@/server/entity/vo/photo"

interface FavoriteContextValue {
  // initialPhotos Save the first page of collected photos queried by the server。
  initialPhotos: PhotoVo[]
}

interface FavoriteProviderProps {
  // children It is the content of the favorite page。
  children: React.ReactNode
  // initialPhotos Save the first page of collected photos queried by the server。
  initialPhotos: PhotoVo[]
}

const FavoriteContext = createContext<FavoriteContextValue | null>(null)

// Read the photo data prefetched by the collection page server。
function useFavoriteContext() {
  const context = useContext(FavoriteContext)

  if (!context) {
    throw new Error("useFavoriteContext must be used within FavoriteProvider.")
  }

  return context
}

// Provide server-side prefetching photos for the collection page client component。
function FavoriteProvider({ children, initialPhotos }: FavoriteProviderProps) {
  return (
    <FavoriteContext.Provider value={{ initialPhotos }}>
      {children}
    </FavoriteContext.Provider>
  )
}

export { FavoriteProvider, useFavoriteContext }
