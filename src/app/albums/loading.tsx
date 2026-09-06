"use client"

import { useApp } from "@/app/provider"
import { AppSidebar } from "@/components/layout/app-sidebar"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { Skeleton } from "@/components/ui/skeleton"

// Display an immediate loading skeleton when navigating to the albums gallery.
export default function AlbumsLoading() {
  const { sidebarOpen, setSidebarOpen } = useApp()

  return (
    <SidebarProvider open={sidebarOpen} onOpenChange={setSidebarOpen}>
      <AppSidebar />
      <SidebarInset>
        {/* Header Skeleton */}
        <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center justify-between gap-2 border-b bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/60">
          <div className="flex items-center gap-2">
            <Skeleton className="h-5 w-20 rounded-sm" />
          </div>
          <div className="flex items-center gap-2">
            <Skeleton className="h-8 w-24 rounded-md" />
          </div>
        </header>

        {/* Shimmering Album Cards Grid Skeleton */}
        <main className="flex-1 p-2 md:p-4">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
            {Array.from({ length: 12 }).map((_, i) => (
              <div
                key={i}
                className="relative aspect-square overflow-hidden rounded-xs bg-muted/40"
              >
                <Skeleton className="h-full w-full rounded-none" />
              </div>
            ))}
          </div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
