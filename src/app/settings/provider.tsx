"use client"

import { createContext, useContext } from "react"

import { type Setting } from "@/server/entity/setting"

interface SettingContextValue {
  // initialSetting Save the system settings queried by the server。
  initialSetting: Setting
}

interface SettingProviderProps {
  // children yes /settings Page content under routing。
  children: React.ReactNode
  // initialSetting Save the system settings queried by the server。
  initialSetting: Setting
}

const SettingContext = createContext<SettingContextValue | null>(null)

// read /settings System settings for server-side prefetching under routing。
function useSettingContext() {
  const context = useContext(SettingContext)

  if (!context) {
    throw new Error("useSettingContext must be used within SettingProvider.")
  }

  return context
}

// Give /settings The client component under routing provides server-side prefetching system settings。
function SettingProvider({ children, initialSetting }: SettingProviderProps) {
  return (
    <SettingContext.Provider value={{ initialSetting }}>
      {children}
    </SettingContext.Provider>
  )
}

export { SettingProvider, useSettingContext }
