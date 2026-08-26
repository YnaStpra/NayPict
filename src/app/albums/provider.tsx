"use client"

import { createContext, useContext } from "react"

import { type AlbumVo } from "@/server/entity/vo/album"

interface AlbumContextValue {
  // initialAlbums Save all photo albums queried by the server.
  initialAlbums: AlbumVo[]
}

interface AlbumProviderProps {
  // children yes /album Page content under routing.
  children: React.ReactNode
  // initialAlbums Save all photo albums queried by the server.
  initialAlbums: AlbumVo[]
}

const AlbumContext = createContext<AlbumContextValue | null>(null)

// read /album Album data prefetched by the server under routing.
function useAlbumContext() {
  const context = useContext(AlbumContext)

  if (!context) {
    throw new Error("useAlbumContext must be used within AlbumProvider.")
  }

  return context
}

// Give /album The client component under routing provides server-side prefetching of photo albums.
function AlbumProvider({ children, initialAlbums }: AlbumProviderProps) {
  return (
    <AlbumContext.Provider value={{ initialAlbums }}>
      {children}
    </AlbumContext.Provider>
  )
}

export { AlbumProvider, useAlbumContext }
