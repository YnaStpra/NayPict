"use client"

import { createContext, useContext } from "react"

import { type StorageVo } from "@/server/entity/vo/storage"

interface StorageContextValue {
  // initialStorageList Save the storage configuration list queried by the server。
  initialStorageList: StorageVo[]
}

interface StorageProviderProps {
  // children yes /storage Page content under routing。
  children: React.ReactNode
  // initialStorageList Save the storage configuration list queried by the server。
  initialStorageList: StorageVo[]
}

const StorageContext = createContext<StorageContextValue | null>(null)

// read /storage Storage configuration list for server-side prefetching under routing。
function useStorageContext() {
  const context = useContext(StorageContext)

  if (!context) {
    throw new Error("useStorageContext must be used within StorageProvider.")
  }

  return context
}

// Give /storage The client component under routing provides server-side prefetching storage configuration。
function StorageProvider({ children, initialStorageList }: StorageProviderProps) {
  return (
    <StorageContext.Provider value={{ initialStorageList }}>
      {children}
    </StorageContext.Provider>
  )
}

export { StorageProvider, useStorageContext }
