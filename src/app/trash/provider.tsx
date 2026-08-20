"use client"

import { createContext, useContext } from "react"
import { type PhotoVo } from "@/server/entity/vo/photo"

interface TrashContextValue {
  // initialPhotos holds the first page of recycled photos queried on the server.
  initialPhotos: PhotoVo[]
}

interface TrashProviderProps {
  children: React.ReactNode
  initialPhotos: PhotoVo[]
}

const TrashContext = createContext<TrashContextValue>({
  initialPhotos: [],
})

// Read the recycled photos prefetched by the server under /trash.
function useTrashContext() {
  return useContext(TrashContext)
}

// Provides server-prefetched recycled photos to the client.
function TrashProvider({ children, initialPhotos }: TrashProviderProps) {
  return (
    <TrashContext.Provider value={{ initialPhotos }}>
      {children}
    </TrashContext.Provider>
  )
}

export { TrashProvider, useTrashContext }
