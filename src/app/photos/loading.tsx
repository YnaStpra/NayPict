"use client"

import { useApp } from "@/app/provider"
import { AppSidebar } from "@/components/layout/app-sidebar"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { PhotoMasonrySkeleton } from "@/components/photo/photo-masonry-skeleton"
import { getMemoryOfflineCatalog } from "@/lib/offline-catalog"

// Display an immediate loading frame with cached landing photos when navigating to the photos gallery
export default function PhotosLoading() {
  const { sidebarOpen, setSidebarOpen } = useApp()
  const cachedPhotos = getMemoryOfflineCatalog()?.photos || []

  return (
    <SidebarProvider open={sidebarOpen} onOpenChange={setSidebarOpen}>
      <AppSidebar />
      <SidebarInset>
        {/* Header Skeleton */}
        <header className="sticky top-0 z-30 flex h-12 shrink-0 items-center justify-between gap-2 border-b bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/60">
          <div className="flex items-center gap-2">
            <div className="h-5 w-20 rounded-sm bg-muted/60 animate-pulse" />
          </div>
          <div className="flex items-center gap-2">
            <div className="size-8 rounded-lg bg-muted/60 animate-pulse" />
            <div className="size-8 rounded-lg bg-muted/60 animate-pulse" />
            <div className="size-8 rounded-lg bg-muted/60 animate-pulse" />
          </div>
        </header>

        {/* Zero-Skeleton Instant Masonry Grid Frame */}
        <div className="px-1 md:pl-1 md:pr-0 min-w-0 max-w-full">
          <PhotoMasonrySkeleton photos={cachedPhotos} />
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}

