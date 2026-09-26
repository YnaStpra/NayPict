"use client"

import { useEffect } from "react"
import { useApp } from "@/app/provider"
import { UserTypeEnum } from "@/server/enums/user-enum"

interface RightClickGuardProps {
  // enabled: Explicit toggle flag from system settings
  enabled?: boolean
}

// Global client guard that prevents unauthorized right-click saving, drag-to-copy, iOS touch sheet, and print extraction for guest visitors.
export function RightClickGuard({ enabled = true }: RightClickGuardProps) {
  const { userInfo } = useApp()
  const isAdmin = userInfo?.type === UserTypeEnum.ADMIN

  useEffect(() => {
    // Never restrict administrative users
    if (!enabled || isAdmin || typeof window === "undefined") {
      return
    }

    // Intercept right-click context menu on media elements silently without intrusive alerts
    const handleContextMenu = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null
      if (!target) return

      // Allow native context menu on interactive form fields
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) {
        return
      }

      if (
        target.tagName === "IMG" ||
        target.tagName === "VIDEO" ||
        target.tagName === "CANVAS" ||
        target.closest(".houdini-smooth-card") ||
        target.closest("[data-slot='photo-card']") ||
        target.closest("[data-photo-item]") ||
        target.closest(".photo-viewer-root") ||
        target.closest(".yet-another-react-lightbox")
      ) {
        e.preventDefault()
      }
    }

    // Prevent dragging images or videos to desktop, folder, or browser tabs
    const handleDragStart = (e: DragEvent) => {
      const target = e.target as HTMLElement | null
      if (!target) return
      if (
        target.tagName === "IMG" ||
        target.tagName === "VIDEO" ||
        target.closest(".houdini-smooth-card") ||
        target.closest("[data-photo-item]")
      ) {
        e.preventDefault()
      }
    }

    // Intercept keyboard export shortcuts (Print to PDF, Save Page)
    const handleKeyDown = (e: KeyboardEvent) => {
      const isCmdOrCtrl = e.metaKey || e.ctrlKey
      const key = e.key ? e.key.toLowerCase() : ""

      // Intercept Print shortcut (Cmd+P / Ctrl+P)
      if (isCmdOrCtrl && key === "p") {
        e.preventDefault()
        e.stopPropagation()
        return
      }

      // Intercept Save Page shortcut (Cmd+S / Ctrl+S)
      if (isCmdOrCtrl && !e.shiftKey && key === "s") {
        e.preventDefault()
        e.stopPropagation()
        return
      }

      // Intercept PrintScreen key: clear clipboard text
      if (e.key === "PrintScreen" || e.keyCode === 44) {
        try {
          if (navigator.clipboard?.writeText) {
            navigator.clipboard.writeText("").catch(() => {})
          }
        } catch {}
      }
    }

    document.addEventListener("contextmenu", handleContextMenu, { capture: true })
    document.addEventListener("dragstart", handleDragStart, { capture: true })
    window.addEventListener("keydown", handleKeyDown, { capture: true })

    return () => {
      document.removeEventListener("contextmenu", handleContextMenu, { capture: true })
      document.removeEventListener("dragstart", handleDragStart, { capture: true })
      window.removeEventListener("keydown", handleKeyDown, { capture: true })
    }
  }, [enabled, isAdmin])

  // Never render protective styles for admin
  if (!enabled || isAdmin) {
    return null
  }

  return (
    <style
      dangerouslySetInnerHTML={{
        __html: `
          /* Passive Media Shield: Disables drag, selection, and iOS Safari long-press Save sheet */
          img, video, canvas {
            -webkit-user-drag: none !important;
            -khtml-user-drag: none !important;
            -moz-user-drag: none !important;
            -o-user-drag: none !important;
            user-drag: none !important;
            -webkit-touch-callout: none !important; /* Disables iOS Safari 'Save to Photos' long-press sheet */
            user-select: none !important;
            -webkit-user-select: none !important;
          }

          /* Anti-Print to PDF Protection */
          @media print {
            html, body {
              visibility: hidden !important;
              height: 100% !important;
              overflow: hidden !important;
            }
            body::before {
              content: "Protected Media — Printing and digital export are restricted on this gallery.";
              visibility: visible !important;
              display: block !important;
              text-align: center !important;
              padding-top: 120px !important;
              font-size: 18px !important;
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important;
              font-weight: 600 !important;
              color: #555 !important;
            }
            img, video, canvas, [data-photo-item], [data-slot="photo-card"], .houdini-smooth-card {
              display: none !important;
              visibility: hidden !important;
            }
          }
        `,
      }}
    />
  )
}
