"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { AppSidebar } from "@/components/layout/app-sidebar"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
} from "@/components/ui/breadcrumb"
import { Separator } from "@/components/ui/separator"
import {
  SidebarProvider,
  SidebarInset,
  SidebarTrigger,
} from "@/components/ui/sidebar"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { useApp } from "@/app/provider"
import { UserTypeEnum } from "@/server/enums/user-enum"
import { Image, FolderOpen, Database, Trash2, Settings, Upload, ShieldCheck, ArrowRight, LoaderCircle, BarChart3 } from "lucide-react"
import { usePhotoStore } from "@/store/photo-store"
import { userInfo as fetchUserInfo } from "@/request/user"

export default function AdminPage() {
  const router = useRouter()
  const { userInfo, setUserInfo, sidebarOpen, setSidebarOpen, title } = useApp()
  const openUpload = usePhotoStore((state) => state.openUpload)
  const [checking, setChecking] = useState(!userInfo)

  useEffect(() => {
    if (!userInfo) {
      fetchUserInfo()
        .then((info) => {
          if (info && info.type === UserTypeEnum.ADMIN) {
            setUserInfo(info)
          } else {
            router.replace("/login")
          }
        })
        .catch(() => {
          router.replace("/login")
        })
        .finally(() => {
          setChecking(false)
        })
    } else if (userInfo.type !== UserTypeEnum.ADMIN) {
      router.replace("/login")
    }
  }, [userInfo, setUserInfo, router])

  if (checking) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background">
        <LoaderCircle className="size-8 animate-spin text-primary" />
      </div>
    )
  }

  if (!userInfo || userInfo.type !== UserTypeEnum.ADMIN) {
    return null
  }

  const adminActions = [
    {
      title: "Manage Photos & Upload",
      description: "Upload new photos, batch manage, set download protection, and organize your gallery.",
      icon: <Image className="size-6 text-blue-500" />,
      actionLabel: "Go to Photos",
      onClick: () => router.push("/photos"),
      primaryAction: () => openUpload(null),
      primaryLabel: "Upload Photo",
    },
    {
      title: "Manage Albums",
      description: "Create new albums, edit details, and use Automatic Cover Selection.",
      icon: <FolderOpen className="size-6 text-amber-500" />,
      actionLabel: "Go to Albums",
      onClick: () => router.push("/albums"),
    },
    {
      title: "Storage Settings",
      description: "Configure your Cloudflare R2 storage provider for photo uploads and media delivery.",
      icon: <Database className="size-6 text-emerald-500" />,
      actionLabel: "Configure Storage",
      onClick: () => router.push("/storage"),
    },
    {
      title: "Photo Insights & Analytics",
      description: "Analyze public visitor traffic, view trends, top viewed photos, and engagement metrics.",
      icon: <BarChart3 className="size-6 text-indigo-500" />,
      actionLabel: "View Insights",
      onClick: () => router.push("/admin/insights"),
    },
    {
      title: "Trash & Recovery",
      description: "View recycled photos, restore deleted items, or permanently purge storage.",
      icon: <Trash2 className="size-6 text-rose-500" />,
      actionLabel: "Open Trash",
      onClick: () => router.push("/trash"),
    },
    {
      title: "System Settings",
      description: "Manage site title, language, theme preferences, and security settings.",
      icon: <Settings className="size-6 text-purple-500" />,
      actionLabel: "Open Settings",
      onClick: () => router.push("/settings"),
    },
  ]

  return (
    <SidebarProvider open={sidebarOpen} onOpenChange={setSidebarOpen}>
      <AppSidebar />
      <SidebarInset>
        <header className="sticky top-0 z-20 flex h-12 shrink-0 items-center justify-between gap-2 bg-background/80 backdrop-blur-md px-4 border-b">
          <div className="flex items-center gap-2">
            <SidebarTrigger className="-ml-1" />
            <Separator orientation="vertical" className="h-4" />
            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem>
                  <BreadcrumbPage className="font-semibold flex items-center gap-2">
                    <ShieldCheck className="size-4 text-primary" />
                    <span>Admin Control Portal</span>
                  </BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          </div>
        </header>

        <div className="p-6 md:p-8 space-y-6 max-w-6xl mx-auto">
          {/* Welcome Banner */}
          <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-primary/10 via-primary/5 to-transparent p-6 md:p-8 border border-primary/20 shadow-sm">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/15 text-primary text-xs font-medium mb-3">
                  <ShieldCheck className="size-3.5" />
                  Authenticated Admin Session
                </div>
                <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground">
                  Welcome to {title} Admin Portal
                </h1>
                <p className="text-muted-foreground mt-1 text-sm md:text-base">
                  Manage your public photo gallery, upload high-resolution media, organize albums, and manage storage settings.
                </p>
              </div>

              <Button
                size="lg"
                className="gap-2 shadow-md shrink-0 cursor-pointer"
                onClick={() => openUpload(null)}
              >
                <Upload className="size-4" />
                <span>Upload New Photos</span>
              </Button>
            </div>
          </div>

          {/* Quick Action Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {adminActions.map((action, index) => (
              <Card key={index} className="flex flex-col justify-between hover:shadow-md transition-all border-border/80">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div className="p-2.5 rounded-xl bg-muted/60 border border-border/40">
                      {action.icon}
                    </div>
                  </div>
                  <CardTitle className="text-lg font-semibold mt-3">{action.title}</CardTitle>
                  <CardDescription className="text-xs leading-relaxed">
                    {action.description}
                  </CardDescription>
                </CardHeader>
                <CardContent className="pt-0 flex items-center justify-between gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full justify-between group cursor-pointer"
                    onClick={action.onClick}
                  >
                    <span>{action.actionLabel}</span>
                    <ArrowRight className="size-3.5 group-hover:translate-x-0.5 transition-transform" />
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
