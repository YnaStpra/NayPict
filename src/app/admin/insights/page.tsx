"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import dynamic from "next/dynamic"
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
import { AppSidebar } from "@/components/layout/app-sidebar"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { useApp } from "@/app/provider"
import { UserTypeEnum } from "@/server/enums/user-enum"
import {
  type InsightsChartDataVo,
  type InsightsOverviewVo,
  type InsightsTopPhotoVo,
} from "@/server/entity/vo/insights"
import { type PhotoVo } from "@/server/entity/vo/photo"
import { getInsightsChart, getInsightsOverview, getInsightsTopPhotos } from "@/request/insights"
import { userInfo as fetchUserInfo } from "@/request/user"
import { photoList } from "@/request/photo"
import {
  BarChart3,
  Calendar,
  Eye,
  Heart,
  Image as ImageIcon,
  Loader2,
  MessageSquare,
  RefreshCw,
  TrendingUp,
  Sparkles,
} from "lucide-react"
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts"
import { PhotoInsightsDialog } from "@/components/photo/photo-insights-dialog"

// Dynamically import PhotoViewer for smooth previewing
const PhotoViewer = dynamic(
  () => import("@/components/photo/photo-viewer").then((mod) => mod.PhotoViewer),
  { ssr: false }
)

export default function AdminInsightsPage() {
  const router = useRouter()
  const { userInfo, setUserInfo, sidebarOpen, setSidebarOpen } = useApp()
  const isAdmin = userInfo?.type === UserTypeEnum.ADMIN

  // Authentication check state
  const [checkingAuth, setCheckingAuth] = useState(!userInfo)

  // Insights statistics states
  const [overview, setOverview] = useState<InsightsOverviewVo | null>(null)
  const [chartData, setChartData] = useState<InsightsChartDataVo | null>(null)
  const [chartRange, setChartRange] = useState<"7d" | "30d" | "90d">("7d")
  const [topPhotos, setTopPhotos] = useState<{
    mostViewed: InsightsTopPhotoVo[]
    mostFavorited: InsightsTopPhotoVo[]
  }>({ mostViewed: [], mostFavorited: [] })

  const [loading, setLoading] = useState(true)
  const [chartLoading, setChartLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Single-photo insights dialog state
  const [selectedPhotoIdForInsights, setSelectedPhotoIdForInsights] = useState<string | null>(null)
  const [insightsDialogOpen, setInsightsDialogOpen] = useState(false)

  // Photo viewer modal state for previewing ranked photos
  const [viewerOpen, setViewerOpen] = useState(false)
  const [viewerPhotos, setViewerPhotos] = useState<PhotoVo[]>([])
  const [viewerIndex, setViewerIndex] = useState(0)

  // 1. Authenticate Admin session on mount
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
          setCheckingAuth(false)
        })
    } else if (userInfo.type !== UserTypeEnum.ADMIN) {
      router.replace("/login")
    }
  }, [userInfo, setUserInfo, router])

  // 2. Fetch all overview data once authenticated
  const loadAllData = () => {
    setLoading(true)
    setError(null)
    Promise.all([
      getInsightsOverview(),
      getInsightsChart(chartRange),
      getInsightsTopPhotos(10),
    ])
      .then(([overviewRes, chartRes, topPhotosRes]) => {
        setOverview(overviewRes)
        setChartData(chartRes)
        setTopPhotos(topPhotosRes || { mostViewed: [], mostFavorited: [] })
      })
      .catch((err) => {
        console.error("Failed to load insights:", err)
        setError("Unable to load insights. Please check your database connection.")
      })
      .finally(() => {
        setLoading(false)
      })
  }

  useEffect(() => {
    if (isAdmin) {
      Promise.all([
        getInsightsOverview(),
        getInsightsChart(chartRange),
        getInsightsTopPhotos(10),
      ])
        .then(([overviewRes, chartRes, topPhotosRes]) => {
          setOverview(overviewRes)
          setChartData(chartRes)
          setTopPhotos(topPhotosRes || { mostViewed: [], mostFavorited: [] })
        })
        .catch((err) => {
          console.error("Failed to load insights:", err)
          setError("Unable to load insights. Please check your database connection.")
        })
        .finally(() => {
          setLoading(false)
        })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin])

  // 3. Handle Chart Range Switch (7d / 30d / 90d)
  const handleRangeChange = async (range: "7d" | "30d" | "90d") => {
    setChartRange(range)
    setChartLoading(true)
    try {
      const res = await getInsightsChart(range)
      setChartData(res)
    } catch (err) {
      console.error("Failed to update chart range:", err)
    } finally {
      setChartLoading(false)
    }
  }

  // 4. Open photo in Lightbox Viewer
  const handleOpenPhotoViewer = async (photoId: string) => {
    try {
      const res = await photoList({ photoIds: [photoId], size: 1 })
      if (res?.list && res.list.length > 0) {
        setViewerPhotos(res.list)
        setViewerIndex(0)
        setViewerOpen(true)
      }
    } catch (err) {
      console.error("Failed to load photo details:", err)
    }
  }

  // 5. Open single-photo insights modal
  const handleOpenSingleInsights = (photoId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setSelectedPhotoIdForInsights(photoId)
    setInsightsDialogOpen(true)
  }

  if (checkingAuth) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background">
        <Loader2 className="size-8 animate-spin text-primary" />
      </div>
    )
  }

  if (!isAdmin) {
    return null
  }

  return (
    <SidebarProvider open={sidebarOpen} onOpenChange={setSidebarOpen}>
      <AppSidebar />
      <SidebarInset>
        {/* Header */}
        <header className="sticky top-0 z-20 flex h-12 shrink-0 items-center justify-between gap-2 bg-background/80 backdrop-blur-md px-4 border-b">
          <div className="flex items-center gap-2">
            <SidebarTrigger className="-ml-1" />
            <Separator orientation="vertical" className="h-4" />
            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem>
                  <BreadcrumbPage className="font-semibold flex items-center gap-2">
                    <BarChart3 className="size-4 text-primary" />
                    <span>Photo Insights</span>
                  </BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 text-xs h-8 cursor-pointer"
              onClick={loadAllData}
              disabled={loading}
            >
              <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} />
              <span className="hidden sm:inline">Refresh</span>
            </Button>
          </div>
        </header>

        {/* Main Dashboard Container */}
        <div className="p-4 md:p-8 space-y-6 max-w-7xl mx-auto w-full">
          {/* Header Banner */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-primary/10 text-primary text-xs font-semibold mb-1.5">
                <Sparkles className="size-3" />
                <span>Admin Analytics</span>
              </div>
              <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground">
                Gallery Insights
              </h1>
              <p className="text-xs md:text-sm text-muted-foreground mt-0.5">
                Public visitor activity, view velocity, and photo popularity statistics.
              </p>
            </div>
          </div>

          {error ? (
            <Card className="border-destructive/30 bg-destructive/5 text-destructive p-6 text-center">
              <p className="text-sm font-medium">{error}</p>
              <Button
                variant="outline"
                size="sm"
                className="mt-3 text-xs"
                onClick={loadAllData}
              >
                Try Again
              </Button>
            </Card>
          ) : loading && !overview ? (
            /* Skeleton Loading State */
            <div className="space-y-6 animate-pulse">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="h-28 rounded-2xl bg-muted/60" />
                ))}
              </div>
              <div className="h-80 rounded-2xl bg-muted/60" />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="h-96 rounded-2xl bg-muted/60" />
                <div className="h-96 rounded-2xl bg-muted/60" />
              </div>
            </div>
          ) : overview ? (
            <>
              {/* Top Overview Cards Grid */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5 md:gap-4">
                {/* 1. Total Views Card */}
                <Card className="border-border/80 bg-card hover:shadow-sm transition-all">
                  <CardHeader className="p-4 pb-2 flex flex-row items-center justify-between space-y-0">
                    <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      Total Views
                    </CardTitle>
                    <div className="p-2 rounded-lg bg-primary/10 text-primary">
                      <Eye className="size-4" />
                    </div>
                  </CardHeader>
                  <CardContent className="p-4 pt-1">
                    <div className="text-2xl md:text-3xl font-bold tracking-tight text-foreground">
                      {overview.totalViews.toLocaleString()}
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-1">
                      Public visitor views
                    </p>
                  </CardContent>
                </Card>

                {/* 2. Total Photos Card */}
                <Card className="border-border/80 bg-card hover:shadow-sm transition-all">
                  <CardHeader className="p-4 pb-2 flex flex-row items-center justify-between space-y-0">
                    <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      Total Photos
                    </CardTitle>
                    <div className="p-2 rounded-lg bg-blue-500/10 text-blue-500">
                      <ImageIcon className="size-4" />
                    </div>
                  </CardHeader>
                  <CardContent className="p-4 pt-1">
                    <div className="text-2xl md:text-3xl font-bold tracking-tight text-foreground">
                      {overview.totalPhotos.toLocaleString()}
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-1">
                      Published in gallery
                    </p>
                  </CardContent>
                </Card>

                {/* 3. Total Favorites Card */}
                <Card className="border-border/80 bg-card hover:shadow-sm transition-all">
                  <CardHeader className="p-4 pb-2 flex flex-row items-center justify-between space-y-0">
                    <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      Favorites
                    </CardTitle>
                    <div className="p-2 rounded-lg bg-pink-500/10 text-pink-500">
                      <Heart className="size-4" />
                    </div>
                  </CardHeader>
                  <CardContent className="p-4 pt-1">
                    <div className="text-2xl md:text-3xl font-bold tracking-tight text-foreground">
                      {overview.totalFavorites.toLocaleString()}
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-1">
                      Featured / starred photos
                    </p>
                  </CardContent>
                </Card>

                {/* 4. Total Comments Card */}
                <Card className="border-border/80 bg-card hover:shadow-sm transition-all">
                  <CardHeader className="p-4 pb-2 flex flex-row items-center justify-between space-y-0">
                    <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      Comments
                    </CardTitle>
                    <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-500">
                      <MessageSquare className="size-4" />
                    </div>
                  </CardHeader>
                  <CardContent className="p-4 pt-1">
                    <div className="text-2xl md:text-3xl font-bold tracking-tight text-foreground">
                      {overview.totalComments.toLocaleString()}
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-1">
                      Visitor responses
                    </p>
                  </CardContent>
                </Card>
              </div>

              {/* View Velocity Sub-Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 md:gap-4">
                <div className="flex items-center justify-between p-4 rounded-xl bg-card border border-border/70 shadow-xs">
                  <div>
                    <div className="text-xs font-medium text-muted-foreground">Views Today</div>
                    <div className="text-xl font-bold text-foreground mt-0.5">
                      {overview.viewsToday.toLocaleString()}
                    </div>
                  </div>
                  <div className="p-2 rounded-lg bg-muted text-foreground/80">
                    <Calendar className="size-4" />
                  </div>
                </div>

                <div className="flex items-center justify-between p-4 rounded-xl bg-card border border-border/70 shadow-xs">
                  <div>
                    <div className="text-xs font-medium text-muted-foreground">Views This Week</div>
                    <div className="text-xl font-bold text-foreground mt-0.5">
                      {overview.viewsThisWeek.toLocaleString()}
                    </div>
                  </div>
                  <div className="p-2 rounded-lg bg-muted text-foreground/80">
                    <TrendingUp className="size-4" />
                  </div>
                </div>

                <div className="flex items-center justify-between p-4 rounded-xl bg-card border border-border/70 shadow-xs">
                  <div>
                    <div className="text-xs font-medium text-muted-foreground">Views This Month</div>
                    <div className="text-xl font-bold text-foreground mt-0.5">
                      {overview.viewsThisMonth.toLocaleString()}
                    </div>
                  </div>
                  <div className="p-2 rounded-lg bg-muted text-foreground/80">
                    <BarChart3 className="size-4" />
                  </div>
                </div>
              </div>

              {/* Interactive Views Trend Chart Section */}
              <Card className="border-border/80 bg-card shadow-xs">
                <CardHeader className="p-5 pb-2 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <CardTitle className="text-base md:text-lg font-bold">
                      Public Photo Views
                    </CardTitle>
                    <CardDescription className="text-xs">
                      Historical visitor traffic across public gallery
                    </CardDescription>
                  </div>

                  {/* Range Switcher Tabs */}
                  <div className="flex items-center p-1 rounded-xl bg-muted/70 border border-border/60 self-start sm:self-auto">
                    {(["7d", "30d", "90d"] as const).map((range) => (
                      <button
                        key={range}
                        type="button"
                        onClick={() => handleRangeChange(range)}
                        className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                          chartRange === range
                            ? "bg-background text-foreground shadow-xs"
                            : "text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        {range === "7d" ? "7 Days" : range === "30d" ? "30 Days" : "90 Days"}
                      </button>
                    ))}
                  </div>
                </CardHeader>

                <CardContent className="p-5 pt-4">
                  {chartLoading ? (
                    <div className="h-64 flex items-center justify-center text-muted-foreground">
                      <Loader2 className="size-6 animate-spin text-primary" />
                    </div>
                  ) : chartData && chartData.points.length > 0 ? (
                    <div className="h-64 md:h-72 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={chartData.points} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                          <defs>
                            <linearGradient id="mainViewGradient" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="var(--color-primary, #6366f1)" stopOpacity={0.35} />
                              <stop offset="95%" stopColor="var(--color-primary, #6366f1)" stopOpacity={0.0} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="currentColor" opacity={0.08} />
                          <XAxis
                            dataKey="label"
                            tick={{ fontSize: 11, fill: "currentColor", opacity: 0.6 }}
                            axisLine={false}
                            tickLine={false}
                            interval="preserveStartEnd"
                          />
                          <YAxis
                            allowDecimals={false}
                            tick={{ fontSize: 11, fill: "currentColor", opacity: 0.6 }}
                            axisLine={false}
                            tickLine={false}
                          />
                          <Tooltip
                            content={({ active, payload }) => {
                              if (active && payload && payload.length) {
                                const data = payload[0].payload
                                return (
                                  <div className="rounded-xl bg-popover/95 backdrop-blur-md border border-border px-3 py-2 shadow-lg text-xs">
                                    <p className="font-semibold text-foreground">{data.date}</p>
                                    <p className="text-primary font-bold mt-0.5">
                                      {data.views.toLocaleString()} public views
                                    </p>
                                  </div>
                                )
                              }
                              return null
                            }}
                          />
                          <Area
                            type="monotone"
                            dataKey="views"
                            stroke="var(--color-primary, #6366f1)"
                            strokeWidth={2.5}
                            fillOpacity={1}
                            fill="url(#mainViewGradient)"
                          />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <div className="h-64 flex flex-col items-center justify-center text-muted-foreground gap-2">
                      <BarChart3 className="size-8 opacity-40" />
                      <p className="text-xs font-medium">No public views yet.</p>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Rankings Grid: Most Viewed & Most Favorited */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* 1. Most Viewed Photos */}
                <Card className="border-border/80 bg-card shadow-xs">
                  <CardHeader className="p-5 pb-3">
                    <CardTitle className="text-base font-bold flex items-center justify-between">
                      <span>Most Viewed Photos</span>
                      <span className="text-xs font-medium text-muted-foreground">Top 10</span>
                    </CardTitle>
                    <CardDescription className="text-xs">
                      Ranked by public visitor view count
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="p-5 pt-0">
                    {topPhotos.mostViewed.length === 0 ? (
                      <div className="py-12 text-center text-xs text-muted-foreground">
                        No public photo views recorded yet.
                      </div>
                    ) : (
                      <div className="divide-y divide-border/50">
                        {topPhotos.mostViewed.map((photo, index) => (
                          <div
                            key={photo.photoId}
                            onClick={() => handleOpenPhotoViewer(photo.photoId)}
                            className="flex items-center gap-3 py-3 group hover:bg-muted/40 px-2 rounded-xl transition-colors cursor-pointer"
                          >
                            <span className="text-xs font-bold text-muted-foreground w-4 text-center">
                              {index + 1}
                            </span>
                            <img
                              src={photo.thumbnail}
                              alt={photo.name}
                              className="size-12 rounded-lg object-cover shrink-0 border border-border/60"
                            />
                            <div className="min-w-0 flex-1">
                              <h4 className="text-xs font-semibold truncate group-hover:text-primary transition-colors">
                                {photo.name}
                              </h4>
                              <div className="flex items-center gap-2 mt-1 text-[11px] text-muted-foreground">
                                <span className="inline-flex items-center gap-1 font-semibold text-primary">
                                  <Eye className="size-3" />
                                  {photo.viewCount.toLocaleString()} views
                                </span>
                                {photo.commentCount > 0 && (
                                  <>
                                    <span>•</span>
                                    <span className="inline-flex items-center gap-0.5">
                                      <MessageSquare className="size-3" />
                                      {photo.commentCount}
                                    </span>
                                  </>
                                )}
                              </div>
                            </div>

                            {/* Single Photo Insights Button */}
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-8 px-2.5 text-xs text-muted-foreground hover:text-foreground opacity-80 group-hover:opacity-100 cursor-pointer"
                              onClick={(e) => handleOpenSingleInsights(photo.photoId, e)}
                            >
                              <TrendingUp className="size-3.5 mr-1" />
                              <span>Insights</span>
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* 2. Most Favorited Photos */}
                <Card className="border-border/80 bg-card shadow-xs">
                  <CardHeader className="p-5 pb-3">
                    <CardTitle className="text-base font-bold flex items-center justify-between">
                      <span>Featured / Favorited Photos</span>
                      <span className="text-xs font-medium text-muted-foreground">Starred</span>
                    </CardTitle>
                    <CardDescription className="text-xs">
                      Curated favorite photos sorted by views
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="p-5 pt-0">
                    {topPhotos.mostFavorited.length === 0 ? (
                      <div className="py-12 text-center text-xs text-muted-foreground">
                        No favorited photos found.
                      </div>
                    ) : (
                      <div className="divide-y divide-border/50">
                        {topPhotos.mostFavorited.map((photo, index) => (
                          <div
                            key={photo.photoId}
                            onClick={() => handleOpenPhotoViewer(photo.photoId)}
                            className="flex items-center gap-3 py-3 group hover:bg-muted/40 px-2 rounded-xl transition-colors cursor-pointer"
                          >
                            <span className="text-xs font-bold text-muted-foreground w-4 text-center">
                              {index + 1}
                            </span>
                            <img
                              src={photo.thumbnail}
                              alt={photo.name}
                              className="size-12 rounded-lg object-cover shrink-0 border border-border/60"
                            />
                            <div className="min-w-0 flex-1">
                              <h4 className="text-xs font-semibold truncate group-hover:text-primary transition-colors">
                                {photo.name}
                              </h4>
                              <div className="flex items-center gap-2 mt-1 text-[11px] text-muted-foreground">
                                <span className="inline-flex items-center gap-1 font-medium text-pink-500">
                                  <Heart className="size-3 fill-current" />
                                  Favorited
                                </span>
                                <span>•</span>
                                <span className="inline-flex items-center gap-1">
                                  <Eye className="size-3" />
                                  {photo.viewCount.toLocaleString()} views
                                </span>
                              </div>
                            </div>

                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-8 px-2.5 text-xs text-muted-foreground hover:text-foreground opacity-80 group-hover:opacity-100 cursor-pointer"
                              onClick={(e) => handleOpenSingleInsights(photo.photoId, e)}
                            >
                              <TrendingUp className="size-3.5 mr-1" />
                              <span>Insights</span>
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </>
          ) : null}
        </div>
      </SidebarInset>

      {/* Per-Photo Insights Dialog */}
      <PhotoInsightsDialog
        photoId={selectedPhotoIdForInsights}
        open={insightsDialogOpen}
        onOpenChange={setInsightsDialogOpen}
      />

      {/* Photo Viewer Modal */}
      <PhotoViewer
        open={viewerOpen}
        index={viewerIndex}
        photos={viewerPhotos}
        onBack={() => setViewerOpen(false)}
        onBrowserBack={() => setViewerOpen(false)}
      />
    </SidebarProvider>
  )
}
