"use client"

import { ArrowLeftIcon } from "lucide-react"
import { useApp } from "@/app/provider"
import { AppSidebar } from "@/components/layout/app-sidebar"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { Skeleton } from "@/components/ui/skeleton"

// Display an immediate loading skeleton when navigating to an album.
export default function AlbumPhotoLoading() {
  const { sidebarOpen, setSidebarOpen } = useApp()

  return (
    <SidebarProvider open={sidebarOpen} onOpenChange={setSidebarOpen}>
      <AppSidebar />
      <SidebarInset>
        {/* Sticky Header Skeleton */}
        <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center justify-between gap-2 border-b bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/60">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              disabled
              className="h-8 w-8 text-muted-foreground opacity-50"
            >
              <ArrowLeftIcon className="h-4 w-4" />
            </Button>
            <Separator orientation="vertical" className="mr-2 h-4" />
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-muted-foreground">Albums</span>
              <span className="text-xs text-muted-foreground">/</span>
              <Skeleton className="h-4 w-28 rounded-sm" />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Skeleton className="h-8 w-8 rounded-md" />
            <Skeleton className="h-8 w-8 rounded-md" />
          </div>
        </header>

        {/* Shimmering Photo Grid Skeleton */}
        <main className="flex-1 p-1 md:p-2">
          <div className="grid grid-cols-2 gap-1 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
            {Array.from({ length: 18 }).map((_, i) => (
              <div
                key={i}
                className="relative overflow-hidden rounded-xs bg-muted/40"
                style={{
                  aspectRatio: i % 3 === 0 ? "4/5" : i % 2 === 0 ? "1/1" : "3/4",
                }}
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
