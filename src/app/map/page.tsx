"use client"

import { useState } from "react"
import Link from "next/link"
import { useTranslations } from "next-intl"
import { ArrowLeft } from "lucide-react"

import { AppSidebar } from "@/components/layout/app-sidebar"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
} from "@/components/ui/breadcrumb"
import { Separator } from "@/components/ui/separator"
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar"
import { Button } from "@/components/ui/button"
import dynamic from "next/dynamic"

// Dynamic Code Splitting: Lazy-load Leaflet map bundle with interactive skeleton loader to accelerate FCP and LCP
const PhotoMapView = dynamic(() => import("@/components/map/photo-map-view"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex flex-col items-center justify-center bg-muted/40 animate-pulse gap-3 text-muted-foreground">
      <div className="size-10 rounded-full border-2 border-primary/40 border-t-primary animate-spin" />
      <p className="text-xs font-medium tracking-wide">Loading interactive map explorer...</p>
    </div>
  ),
})

export default function MapPage() {
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const t = useTranslations("layout")

  return (
    <SidebarProvider open={sidebarOpen} onOpenChange={setSidebarOpen}>
      <AppSidebar />
      <SidebarInset className="min-w-0 max-w-full h-dvh flex flex-col overflow-hidden">
        <header className="sticky top-0 z-30 flex h-12 shrink-0 items-center justify-between gap-2 bg-background/95 backdrop-blur-md border-b transition-[width,height] ease-linear">
          <div className="flex min-w-0 items-center gap-2 px-4">
            <SidebarTrigger className="-ml-1 cursor-pointer" />
            <Separator
              orientation="vertical"
              className="mr-2 data-vertical:h-4 data-vertical:self-auto"
            />
            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem>
                  <BreadcrumbPage className="flex items-center gap-2 font-semibold text-sm">
                    <span>{t("navigation.map") || "Photo Map"}</span>
                  </BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          </div>

          <div className="flex items-center gap-2 px-4">
            <Button asChild variant="ghost" size="sm" className="h-8 gap-1.5 text-xs rounded-xl text-muted-foreground hover:text-foreground">
              <Link href="/photos">
                <ArrowLeft className="size-3.5" />
                <span className="hidden sm:inline">Photo Gallery</span>
              </Link>
            </Button>
          </div>
        </header>

        <main className="flex-1 min-h-0 relative w-full h-full">
          <PhotoMapView />
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
