"use client"

import dynamic from "next/dynamic"
import * as React from "react"
import { useEffect } from "react"
import { usePathname } from "next/navigation"
import { TooltipProvider } from "@/components/ui/tooltip"
import { Toaster } from "@/components/ui/sonner"
import { albumList } from "@/request/album"
import { storageSelect } from "@/request/storage"
import { type UserInfoVo } from "@/server/entity/vo/user"
import { useIsMobile } from "@/hooks/use-mobile"
import { useAlbumStore } from "@/store/album-store"
import { usePhotoStore } from "@/store/photo-store"
import { useStorageStore } from "@/store/storage-store"
import { TOKEN_COOKIE_MAX_AGE } from "@/server/const/global"

const PhotoUploadDialog = dynamic(
  () => import("@/components/photo/photo-upload-dialog").then((mod) => mod.PhotoUploadDialog),
  { ssr: false }
)

type Theme = "light" | "dark"

const THEME_COOKIE_NAME = "theme"

type ProviderProps = {
  children: React.ReactNode
  defaultTheme: Theme
  defaultSidebarOpen: boolean
  initialUserInfo: UserInfoVo | null
  title: string
}

type AppContextValue = {
  title: string
  theme: Theme
  userInfo: UserInfoVo | null
  setUserInfo: React.Dispatch<React.SetStateAction<UserInfoVo | null>>
  sidebarOpen: boolean
  setSidebarOpen: React.Dispatch<React.SetStateAction<boolean>>
  refreshAlbums: () => Promise<void>
  refreshStorages: () => Promise<void>
  setTheme: (theme: Theme) => void
  toggleTheme: () => void
}

const AppContext = React.createContext<AppContextValue | null>(null)

// Read application-level global state，For reuse by client components within the layout。
function useApp() {
  const context = React.useContext(AppContext)

  if (!context) {
    throw new Error("useApp must be used within a Provider.")
  }

  return context
}

// Host application level Provider。
function Provider({ children, defaultTheme, defaultSidebarOpen, initialUserInfo, title }: ProviderProps) {
  const [theme, setThemeState] = React.useState<Theme>(defaultTheme)
  // userInfo Save current logged in user information，You can immediately update the layout display after logging in。
  const [userInfo, setUserInfo] = React.useState<UserInfoVo | null>(initialUserInfo)
  // sidebarOpen Save the current expanded state of the sidebar，For continued reuse after page switching。
  const [sidebarOpen, setSidebarOpen] = React.useState(defaultSidebarOpen)
  const setAlbums = useAlbumStore((state) => state.setAlbums)
  const setStorages = useStorageStore((state) => state.setStorages)
  const setInfoOpen = usePhotoStore((state) => state.setInfoOpen)
  // isMobile Determine whether the current viewport is the mobile terminal。
  const isMobile = useIsMobile()
  // pathname Used to skip authentication interface requests such as albums and storage on the login page。
  const pathname = usePathname()
  const isLogin = pathname === "/login"

  useEffect(() => {
    if (initialUserInfo) {
      setUserInfo(initialUserInfo)
    }
  }, [initialUserInfo])

  // Query normal storage configuration and write global storage options。
  useEffect(() => {
    if (isLogin) {
      return
    }

    void storageSelect().then((storages) => {
      setStorages(storages)
    })
  }, [isLogin, setStorages])

  // Query the album list and write global album options。
  useEffect(() => {
    if (isLogin) {
      return
    }

    void albumList().then((albums) => {
      setAlbums(albums)
    })
  }, [isLogin, setAlbums])

  // The mobile side collapses the photo information sidebar by default。
  useEffect(() => {
    if (isMobile) {
      setInfoOpen(false)
    }
  }, [isMobile, setInfoOpen])

  // Update theme class and cookie，Let the current theme be restored next time server-side rendering。
  const setTheme = React.useCallback((theme: Theme) => {
    setThemeState(theme)
    document.documentElement.classList.toggle("dark", theme === "dark")
    document.cookie = `${THEME_COOKIE_NAME}=${theme}; path=/; max-age=${TOKEN_COOKIE_MAX_AGE}`
  }, [])

  // Switch between light and dark themes。
  const toggleTheme = React.useCallback(() => {
    setTheme(theme === "dark" ? "light" : "dark")
  }, [setTheme, theme])

  // Requery normal storage configuration and write global storage options，The login page does not send a request。
  const refreshStorages = React.useCallback(() => {
    if (isLogin) {
      return Promise.resolve()
    }

    return storageSelect().then((storages) => {
      setStorages(storages)
    })
  }, [isLogin, setStorages])

  // Query the album list again and write global album options，The login page does not send a request。
  const refreshAlbums = React.useCallback(() => {
    if (isLogin) {
      return Promise.resolve()
    }

    return albumList().then((albums) => {
      setAlbums(albums)
    })
  }, [isLogin, setAlbums])

  const value = React.useMemo<AppContextValue>(
    () => ({
      title,
      theme,
      userInfo,
      setUserInfo,
      sidebarOpen,
      setSidebarOpen,
      refreshAlbums,
      refreshStorages,
      setTheme,
      toggleTheme,
    }),
    [title, theme, userInfo, sidebarOpen, refreshAlbums, refreshStorages, setTheme, toggleTheme]
  )

  return (
    <AppContext.Provider value={value}>
      <TooltipProvider>
        {children}
        <PhotoUploadDialog />
        <Toaster position="top-center" />
      </TooltipProvider>
    </AppContext.Provider>
  )
}

export { Provider, useApp }
export type { Theme }
