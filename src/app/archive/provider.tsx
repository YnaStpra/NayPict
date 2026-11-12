'use client'

import { createContext, useContext } from 'react'
import { type PhotoVo } from '@/server/entity/vo/photo'
import { type AlbumVo } from '@/server/entity/vo/album'

interface ArchiveContextType {
  initialPhotos: PhotoVo[]
  initialTotal: number
  initialAlbums: AlbumVo[]
}

const ArchiveContext = createContext<ArchiveContextType>({
  initialPhotos: [],
  initialTotal: 0,
  initialAlbums: [],
})

export function ArchiveProvider({
  children,
  initialPhotos,
  initialTotal = 0,
  initialAlbums = [],
}: {
  children: React.ReactNode
  initialPhotos: PhotoVo[]
  initialTotal?: number
  initialAlbums?: AlbumVo[]
}) {
  return (
    <ArchiveContext.Provider value={{ initialPhotos, initialTotal, initialAlbums }}>
      {children}
    </ArchiveContext.Provider>
  )
}

export function useArchiveContext() {
  return useContext(ArchiveContext)
}
