'use client'

import { createContext, useContext } from 'react'
import { type PhotoVo } from '@/server/entity/vo/photo'
import { type AlbumVo } from '@/server/entity/vo/album'

interface ArchiveContextType {
  initialPhotos: PhotoVo[]
  initialAlbums: AlbumVo[]
}

const ArchiveContext = createContext<ArchiveContextType>({
  initialPhotos: [],
  initialAlbums: [],
})

export function ArchiveProvider({
  children,
  initialPhotos,
  initialAlbums = [],
}: {
  children: React.ReactNode
  initialPhotos: PhotoVo[]
  initialAlbums?: AlbumVo[]
}) {
  return (
    <ArchiveContext.Provider value={{ initialPhotos, initialAlbums }}>
      {children}
    </ArchiveContext.Provider>
  )
}

export function useArchiveContext() {
  return useContext(ArchiveContext)
}
