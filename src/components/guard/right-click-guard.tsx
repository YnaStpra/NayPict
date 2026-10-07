"use client"

import { useEffect, useState } from "react"
import { useApp } from "@/app/provider"
import { UserTypeEnum } from "@/server/enums/user-enum"
import { settingPublicGet } from "@/request/setting"

interface RightClickGuardProps {
  // enabled: Explicit toggle flag from system settings
  enabled?: boolean
}

// In-memory module cache to avoid redundant network calls across component re-renders
let cachedGuardEnabled: boolean | null = null

// Global client guard that prevents unauthorized right-click saving and image drag-to-copy for guest visitors.
export function RightClickGuard({ enabled }: RightClickGuardProps) {
  const { userInfo } = useApp()
  const isAdmin = userInfo?.type === UserTypeEnum.ADMIN

  const [isGuardEnabled, setIsGuardEnabled] = useState<boolean>(() => {
    if (enabled !== undefined) return enabled
    if (cachedGuardEnabled !== null) return cachedGuardEnabled
    if (typeof window !== "undefined") {
      try {
        const stored =
          sessionStorage.getItem("naypict_right_click_guard") ||
          localStorage.getItem("naypict_right_click_guard")
        if (stored !== null) return stored === "true"
      } catch {}
    }
    return false
  })

  // Synchronize with public settings for non-admin visitors
  useEffect(() => {
    if (isAdmin || enabled !== undefined) return

    let cancelled = false

    const fetchSetting = () => {
      settingPublicGet()
        .then((res) => {
          if (cancelled || !res) return
          const active = Boolean(res.rightClickGuard)
          cachedGuardEnabled = active
          setIsGuardEnabled(active)
          try {
            sessionStorage.setItem("naypict_right_click_guard", String(active))
            localStorage.setItem("naypict_right_click_guard", String(active))
          } catch {}
        })
        .catch(() => {
          // Gracefully fallback to disabled on network failure
        })
    }

    fetchSetting()

    const handleSettingChange = (e: Event) => {
      const customEvent = e as CustomEvent<{ rightClickGuard?: boolean }>
      if (typeof customEvent.detail?.rightClickGuard === "boolean") {
        cachedGuardEnabled = customEvent.detail.rightClickGuard
        setIsGuardEnabled(customEvent.detail.rightClickGuard)
        try {
          sessionStorage.setItem("naypict_right_click_guard", String(customEvent.detail.rightClickGuard))
          localStorage.setItem("naypict_right_click_guard", String(customEvent.detail.rightClickGuard))
        } catch {}
      } else {
        fetchSetting()
      }
    }

    window.addEventListener("naypict:setting-changed", handleSettingChange)
    return () => {
      cancelled = true
      window.removeEventListener("naypict:setting-changed", handleSettingChange)
    }
  }, [isAdmin, enabled])

  const effectiveEnabled = enabled !== undefined ? enabled : isGuardEnabled

  useEffect(() => {
    // Never restrict administrative users or when guard is disabled
    if (!effectiveEnabled || isAdmin || typeof window === "undefined") {
      return
    }

    // Intercept right-click context menu on images and media containers
    const handleContextMenu = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null
      if (
        target &&
        (target.tagName === "IMG" ||
          target.tagName === "VIDEO" ||
          target.closest(".photo-viewer") ||
          target.closest(".yet-another-react-lightbox") ||
          target.closest("[data-photo-item]"))
      ) {
        // Do not block interactive controls in sidebars or dialogs (e.g. comment input, links)
        if (target.closest("input, textarea, button, a, [role='button'], [data-allow-context-menu]")) {
          return
        }
        e.preventDefault()
      }
    }

    // Prevent dragging images or media to desktop/folder
    const handleDragStart = (e: DragEvent) => {
      const target = e.target as HTMLElement | null
      if (
        target &&
        (target.tagName === "IMG" ||
          target.tagName === "VIDEO" ||
          target.closest(".photo-viewer") ||
          target.closest("[data-photo-item]"))
      ) {
        e.preventDefault()
      }
    }

    document.addEventListener("contextmenu", handleContextMenu, { capture: true })
    document.addEventListener("dragstart", handleDragStart, { capture: true })

    return () => {
      document.removeEventListener("contextmenu", handleContextMenu, { capture: true })
      document.removeEventListener("dragstart", handleDragStart, { capture: true })
    }
  }, [effectiveEnabled, isAdmin])

  // Inject global CSS rule for non-admin visitors to prevent drag ghosting and mobile long-press callout
  if (!effectiveEnabled || isAdmin) {
    return null
  }

  return (
    <style
      dangerouslySetInnerHTML={{
        __html: `
        img, video {
          -webkit-user-drag: none !important;
          user-select: none !important;
        }
        .photo-viewer img, .photo-viewer video, [data-photo-item] img {
          -webkit-touch-callout: none !important;
        }
      `,
      }}
    />
  )
}
