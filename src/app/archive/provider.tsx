'use client'

import { createContext, useContext } from 'react'
import { type PhotoVo } from '@/server/entity/vo/photo'

interface ArchiveContextType {
  initialPhotos: PhotoVo[]
}

const ArchiveContext = createContext<ArchiveContextType>({
  initialPhotos: [],
})

export function ArchiveProvider({
  children,
  initialPhotos,
}: {
  children: React.ReactNode
  initialPhotos: PhotoVo[]
}) {
  return (
    <ArchiveContext.Provider value={{ initialPhotos }}>
      {children}
    </ArchiveContext.Provider>
  )
}

export function useArchiveContext() {
  return useContext(ArchiveContext)
}
