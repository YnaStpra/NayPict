"use client"

import dynamic from "next/dynamic"
import * as React from "react"
import { useEffect } from "react"
import { usePathname } from "next/navigation"
import { TooltipProvider } from "@/components/ui/tooltip"
import { Toaster } from "@/components/ui/sonner"
import { albumList } from "@/request/album"
import { storageSelect } from "@/request/storage"
import { userInfo as fetchUserInfo } from "@/request/user"
import { UserTypeEnum } from "@/server/enums/user-enum"
import { type UserInfoVo } from "@/server/entity/vo/user"
import { useIsMobile } from "@/hooks/use-mobile"
import { useAlbumStore } from "@/store/album-store"
import { usePhotoStore } from "@/store/photo-store"
import { useStorageStore } from "@/store/storage-store"
import { TOKEN_COOKIE_MAX_AGE } from "@/server/const/global"
import { useLiveCatalogSync } from "@/hooks/use-live-catalog-sync"
import { useVisitorTracker } from "@/hooks/use-visitor-tracker"
import { useUserLocation } from "@/hooks/use-user-location"
import { NetworkStatusNotifier } from "@/components/common/network-status-notifier"

const PhotoUploadDialog = dynamic(

  () => import("@/components/photo/photo-upload-dialog").then((mod) => mod.PhotoUploadDialog),
  { ssr: false }
)


const RightClickGuard = dynamic(
  () => import("@/components/guard/right-click-guard").then((mod) => mod.RightClickGuard),
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

// Read application-level global state, For reuse by client components within the layout.
function useApp() {
  const context = React.useContext(AppContext)

  if (!context) {
    throw new Error("useApp must be used within a Provider.")
  }

  return context
}

// Host application level Provider.
function Provider({ children, defaultTheme, defaultSidebarOpen, initialUserInfo, title }: ProviderProps) {
  const [theme, setThemeState] = React.useState<Theme>(defaultTheme)
  // userInfo: Synchronously restored from initialUserInfo (SSR) or localStorage (Client) to eliminate public-view flash on refresh
  const [userInfo, setUserInfoState] = React.useState<UserInfoVo | null>(() => {
    if (initialUserInfo) return initialUserInfo
    if (typeof window !== "undefined") {
      try {
        const cached = localStorage.getItem("naypict_user")
        if (cached) {
          const parsed = JSON.parse(cached)
          if (parsed && typeof parsed === "object" && parsed.userId && parsed.type) {
            return parsed
          }
        }
      } catch {}
    }
    return null
  })

  // Synchronize user updates to localStorage so session persists across refresh on this device
  const setUserInfo = React.useCallback((infoOrFn: React.SetStateAction<UserInfoVo | null>) => {
    setUserInfoState((prev) => {
      const next = typeof infoOrFn === "function" ? infoOrFn(prev) : infoOrFn
      if (typeof window !== "undefined") {
        try {
          if (next) {
            localStorage.setItem("naypict_user", JSON.stringify(next))
          } else {
            localStorage.removeItem("naypict_user")
          }
        } catch {}
      }
      return next
    })
  }, [])

  // Listen for cross-tab login / logout events via localStorage
  useEffect(() => {
    if (typeof window === "undefined") return

    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === "naypict_user") {
        if (e.newValue) {
          try {
            const parsed = JSON.parse(e.newValue)
            if (parsed?.userId) {
              setUserInfoState(parsed)
            }
          } catch {}
        } else {
          setUserInfoState(null)
        }
      }
    }

    window.addEventListener("storage", handleStorageChange)
    return () => window.removeEventListener("storage", handleStorageChange)
  }, [])

  // sidebarOpen Save the current expanded state of the sidebar, For continued reuse after page switching.
  const [sidebarOpen, setSidebarOpen] = React.useState(defaultSidebarOpen)
  const setAlbums = useAlbumStore((state) => state.setAlbums)
  const setStorages = useStorageStore((state) => state.setStorages)
  const setInfoOpen = usePhotoStore((state) => state.setInfoOpen)
  // isMobile Determine whether the current viewport is the mobile terminal.
  const isMobile = useIsMobile()
  // pathname Used to skip authentication interface requests such as albums and storage on the login page.
  const pathname = usePathname()
  const isLogin = pathname === "/login"

  // Restore client theme preference on mount
  useEffect(() => {
    if (typeof window !== "undefined") {
      const savedTheme = (localStorage.getItem("theme") || (document.cookie.match(/theme=([^;]+)/) || [])[1]) as Theme | undefined
      if (savedTheme === "light" || savedTheme === "dark") {
        setThemeState(savedTheme)
      }
    }
  }, [])

  // Revalidate session with server in background on mount / refresh
  useEffect(() => {
    if (initialUserInfo) {
      setUserInfo(initialUserInfo)
      return
    }

    fetchUserInfo(true)
      .then((info) => {
        if (info) {
          setUserInfo(info)
        } else {
          setUserInfo(null)
        }
      })
      .catch((err) => {
        // If offline, keep local state intact
        if (typeof navigator !== "undefined" && !navigator.onLine) {
          return
        }
        // If server confirms unauthenticated (e.g. cookies cleared or expired session), reset
        if (err?.code === 401 || err?.status === 401) {
          setUserInfo(null)
        }
      })
  }, [initialUserInfo, setUserInfo])

  // Query storage configuration only when an admin is logged in and store is empty
  useEffect(() => {
    if (isLogin || userInfo?.type !== UserTypeEnum.ADMIN) {
      return
    }
    if (useStorageStore.getState().storages.length > 0) {
      return
    }

    void storageSelect().then((storages) => {
      setStorages(storages)
    })
  }, [isLogin, userInfo?.type, setStorages])

  // Query the album list only if store is currently empty
  useEffect(() => {
    if (isLogin) {
      return
    }
    if (useAlbumStore.getState().albums.length > 0) {
      return
    }

    void albumList().then((albums) => {
      setAlbums(albums)
    })
  }, [isLogin, setAlbums])

  // The mobile side collapses the photo information sidebar by default.
  useEffect(() => {
    if (isMobile) {
      setInfoOpen(false)
    }
  }, [isMobile, setInfoOpen])

  // Update theme class and cookie, Let the current theme be restored next time server-side rendering.
  const setTheme = React.useCallback((theme: Theme) => {
    setThemeState(theme)
    document.documentElement.classList.toggle("dark", theme === "dark")
    document.cookie = `${THEME_COOKIE_NAME}=${theme}; path=/; max-age=${TOKEN_COOKIE_MAX_AGE}`
  }, [])

  // Switch between light and dark themes.
  const toggleTheme = React.useCallback(() => {
    setTheme(theme === "dark" ? "light" : "dark")
  }, [setTheme, theme])

  // Requery normal storage configuration and write global storage options, The login page does not send a request.
  const refreshStorages = React.useCallback(() => {
    if (isLogin) {
      return Promise.resolve()
    }

    return storageSelect().then((storages) => {
      setStorages(storages)
    })
  }, [isLogin, setStorages])

  // Query the album list again and write global album options, The login page does not send a request.
  const refreshAlbums = React.useCallback(() => {
    if (isLogin) {
      return Promise.resolve()
    }

    return albumList(undefined, true).then((albums) => {
      setAlbums(albums)
    })
  }, [isLogin, setAlbums])

  // Mount global background catalog heartbeat synchronization
  useLiveCatalogSync()

  // Automatically update global album store whenever an album is mutated across components or tabs
  useEffect(() => {
    const handleAlbumSync = () => {
      void refreshAlbums()
    }
    window.addEventListener("naypict:album-changed", handleAlbumSync)
    return () => window.removeEventListener("naypict:album-changed", handleAlbumSync)
  }, [refreshAlbums])

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
    [title, theme, userInfo, setUserInfo, sidebarOpen, refreshAlbums, refreshStorages, setTheme, toggleTheme]
  )

  return (
    <AppContext.Provider value={value}>
      <TooltipProvider>
        {children}
        <VisitorTrackerMount />
        <RightClickGuard />
        <PhotoUploadDialog />
        <NetworkStatusNotifier />
        <Toaster
          position="top-center"
          richColors
          closeButton
          expand={false}
          theme={theme === "dark" ? "dark" : theme === "light" ? "light" : "system"}
          toastOptions={{
            className: "!rounded-2xl !border !border-border/60 !backdrop-blur-xl !shadow-2xl !font-sans !text-xs !py-3 !px-4",
            style: {
              borderRadius: "1rem",
            },
          }}
        />
      </TooltipProvider>
    </AppContext.Provider>
  )
}

// Sub-component to execute visitor telemetry and location synchronization within application context.
function VisitorTrackerMount() {
  useVisitorTracker()
  useUserLocation()
  return null
}

export { Provider, useApp }

export type { Theme }
