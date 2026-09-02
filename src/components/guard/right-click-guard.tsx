"use client"

import { useEffect } from "react"
import { toast } from "sonner"
import { useApp } from "@/app/provider"
import { UserTypeEnum } from "@/server/enums/user-enum"

interface RightClickGuardProps {
  // enabled: Explicit toggle flag from system settings
  enabled?: boolean
}

// Global client guard that prevents unauthorized right-click saving and image drag-to-copy for guest visitors.
export function RightClickGuard({ enabled = true }: RightClickGuardProps) {
  const { userInfo } = useApp()
  const isAdmin = userInfo?.type === UserTypeEnum.ADMIN

  useEffect(() => {
    // Never restrict administrative users
    if (!enabled || isAdmin || typeof window === "undefined") {
      return
    }

    // Intercept right-click context menu on images
    const handleContextMenu = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null
      if (target && (target.tagName === "IMG" || target.closest(".yet-another-react-lightbox") || target.closest("[data-photo-item]"))) {
        e.preventDefault()
        toast.info("Image save is protected by copyright", {
          id: "right-click-guard-toast",
          duration: 1500,
        })
      }
    }

    // Prevent dragging images to desktop or folder
    const handleDragStart = (e: DragEvent) => {
      const target = e.target as HTMLElement | null
      if (target && target.tagName === "IMG") {
        e.preventDefault()
      }
    }

    document.addEventListener("contextmenu", handleContextMenu, { capture: true })
    document.addEventListener("dragstart", handleDragStart, { capture: true })

    return () => {
      document.removeEventListener("contextmenu", handleContextMenu, { capture: true })
      document.removeEventListener("dragstart", handleDragStart, { capture: true })
    }
  }, [enabled, isAdmin])

  // Inject global CSS rule for non-admin visitors to prevent drag ghosting
  if (!enabled || isAdmin) {
    return null
  }

  return (
    <style dangerouslySetInnerHTML={{
      __html: `
        img {
          -webkit-user-drag: none !important;
          user-select: none !important;
        }
      `
    }} />
  )
}
