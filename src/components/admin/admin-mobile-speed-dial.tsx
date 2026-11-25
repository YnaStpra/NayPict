"use client"

import { useState, useEffect } from "react"
import { useRouter, usePathname } from "next/navigation"
import { Plus, Upload, FolderOpen, Shield, X } from "lucide-react"
import { useApp } from "@/app/provider"
import { UserTypeEnum } from "@/server/enums/user-enum"
import { usePhotoStore } from "@/store/photo-store"
import { cn } from "@/lib/utils"

/**
 * Mobile Floating Speed Dial (FAB) for Admin Users
 * - One-handed quick actions positioned right above Mobile Bottom Dock
 * - 1-tap shortcuts: Upload Media, Albums, and Admin Console
 * - Gated strictly to UserTypeEnum.ADMIN and mobile viewports (<768px / md:hidden)
 */
export function AdminMobileSpeedDial() {
  const { userInfo } = useApp()
  const router = useRouter()
  const pathname = usePathname()
  const openUpload = usePhotoStore((state) => state.openUpload)

  const [isOpen, setIsOpen] = useState(false)
  const [isViewerOpen, setIsViewerOpen] = useState(false)

  // Auto-hide when lightbox / fullscreen photo viewer is open
  useEffect(() => {
    if (typeof document === "undefined") return

    const checkViewer = () => {
      const open = Boolean(document.querySelector("[data-yarl-viewer-open='true']"))
      setIsViewerOpen(open)
      if (open) setIsOpen(false)
    }

    checkViewer()

    const observer = new MutationObserver(checkViewer)
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["data-yarl-viewer-open"],
    })

    return () => observer.disconnect()
  }, [])

  // Close speed dial on route change
  useEffect(() => {
    setIsOpen(false)
  }, [pathname])

  // Strictly gate to authenticated Admins on mobile
  if (!userInfo || userInfo.type !== UserTypeEnum.ADMIN) {
    return null
  }

  // Conceal on login page or when viewer is active
  if (pathname === "/login" || isViewerOpen) {
    return null
  }

  const handleAction = (action: () => void) => {
    setIsOpen(false)
    action()
  }

  return (
    <>
      {/* Dimmed backdrop when speed dial actions are revealed */}
      {isOpen && (
        <div
          role="presentation"
          onClick={() => setIsOpen(false)}
          className="fixed inset-0 z-40 bg-black/45 backdrop-blur-[2px] transition-opacity md:hidden animate-in fade-in duration-200"
          aria-hidden="true"
        />
      )}

      {/* Speed Dial Container */}
      <div
        className="fixed right-4 z-40 md:hidden flex flex-col items-end gap-2.5 pointer-events-none"
        style={{
          bottom: "calc(max(0.75rem, env(safe-area-inset-bottom, 12px)) + 4.25rem)",
        }}
      >
        {/* Expanded Action Menu Items */}
        {isOpen && (
          <div className="flex flex-col items-end gap-2.5 pb-1 pointer-events-auto animate-in slide-in-from-bottom-3 fade-in duration-200">
            {/* Action 1: Upload Media */}
            <button
              type="button"
              onClick={() => handleAction(() => openUpload(null))}
              className="flex items-center gap-2.5 px-3.5 py-2 rounded-full bg-primary text-primary-foreground shadow-sm active:scale-97 transition-[transform,opacity] duration-150 text-xs font-medium cursor-pointer select-none"
              aria-label="Upload Media"
            >
              <span>Upload Media</span>
              <div className="flex size-7 items-center justify-center rounded-full bg-primary-foreground/15">
                <Upload className="size-3.5 stroke-[1.5]" />
              </div>
            </button>

            {/* Action 2: Albums */}
            <button
              type="button"
              onClick={() => handleAction(() => router.push("/albums"))}
              className="flex items-center gap-2.5 px-3.5 py-2 rounded-full bg-card text-foreground border border-border/80 shadow-sm active:scale-97 transition-[transform,background-color] duration-150 text-xs font-medium cursor-pointer select-none"
              aria-label="Manage Albums"
            >
              <span>Albums</span>
              <div className="flex size-7 items-center justify-center rounded-full bg-muted text-muted-foreground">
                <FolderOpen className="size-3.5 stroke-[1.5]" />
              </div>
            </button>

            {/* Action 3: Admin Console */}
            <button
              type="button"
              onClick={() => handleAction(() => router.push("/admin"))}
              className="flex items-center gap-2.5 px-3.5 py-2 rounded-full bg-card text-foreground border border-border/80 shadow-sm active:scale-97 transition-[transform,background-color] duration-150 text-xs font-medium cursor-pointer select-none"
              aria-label="Admin Console"
            >
              <span>Admin Console</span>
              <div className="flex size-7 items-center justify-center rounded-full bg-muted text-muted-foreground">
                <Shield className="size-3.5 stroke-[1.5]" />
              </div>
            </button>
          </div>
        )}

        {/* Primary FAB Toggle Button */}
        <button
          type="button"
          onClick={() => setIsOpen((prev) => !prev)}
          aria-expanded={isOpen}
          aria-label={isOpen ? "Close Quick Actions" : "Open Admin Quick Actions"}
          className={cn(
            "pointer-events-auto flex size-12 items-center justify-center rounded-full shadow-lg transition-[transform,background-color] duration-200 active:scale-95 cursor-pointer select-none border border-border/60",
            isOpen
              ? "bg-muted text-foreground rotate-90 scale-95"
              : "bg-primary text-primary-foreground hover:bg-primary/90"
          )}
        >
          {isOpen ? (
            <X className="size-5 transition-transform duration-200" />
          ) : (
            <Plus className="size-5 transition-transform duration-200" />
          )}
        </button>
      </div>
    </>
  )
}
