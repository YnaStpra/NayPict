"use client"

import { createContext, useContext } from "react"

import { type AlbumVo } from "@/server/entity/vo/album"

interface TrashContextValue {
  // initialAlbum Save the recycle bin virtual album queried by the server。
  initialAlbum: AlbumVo
}

interface TrashProviderProps {
  // children yes /trash Page content under routing。
  children: React.ReactNode
  // initialAlbum Save the recycle bin virtual album queried by the server。
  initialAlbum: AlbumVo
}

const TrashContext = createContext<TrashContextValue | null>(null)

// read /trash The recycle bin album prefetched by the server under routing。
function useTrashContext() {
  const context = useContext(TrashContext)

  if (!context) {
    throw new Error("useTrashContext must be used within TrashProvider.")
  }

  return context
}

// Give /trash The client component under routing provides server-side prefetching of the recycle bin album.。
function TrashProvider({ children, initialAlbum }: TrashProviderProps) {
  return (
    <TrashContext.Provider value={{ initialAlbum }}>
      {children}
    </TrashContext.Provider>
  )
}

export { TrashProvider, useTrashContext }
