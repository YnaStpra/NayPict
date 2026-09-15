"use client"

import { useEffect, useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import Image from "next/image"
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
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useApp } from "@/app/provider"
import { UserTypeEnum } from "@/server/enums/user-enum"
import { userInfo as fetchUserInfo } from "@/request/user"
import {
  getAnalyticsOverview,
  getVisitorSessions,
  getSessionDetail,
  resetAnalytics,
} from "@/request/analytics"
import {
  type AnalyticsOverviewVo,
  type VisitorSessionDetailVo,
  type VisitorSessionsListVo,
  type VisitorSessionVo,
} from "@/server/entity/vo/analytics"
import { toast } from "sonner"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Clock,
  Compass,
  Copy,
  Eye,
  Globe,
  Heart,
  Laptop,
  Loader2,
  RefreshCw,
  Search,
  Share2,
  Smartphone,
  Tablet,
  Download,
  Check,
  Trash2,
} from "lucide-react"

// Safely parse timestamps from Postgres, ensuring UTC interpretation regardless of local machine offset
function parseUtcDate(input?: string | Date | null): Date | null {
  if (!input) return null
  if (input instanceof Date) return isNaN(input.getTime()) ? null : input
  let str = String(input).trim()
  if (!str) return null

  // Fix PostgreSQL timestamp format: replace space with T
  if (str.includes(" ") && !str.includes("T")) {
    str = str.replace(" ", "T")
  }

  // Fix PostgreSQL 2-digit timezone offset (e.g. +00 or -08) to standard +00:00 or -08:00
  if (/[+-]\d{2}$/.test(str)) {
    str = str + ":00"
  }

  // If no timezone offset present, append Z to force UTC evaluation
  if (!str.endsWith("Z") && !/[+-]\d{2}:\d{2}$/.test(str)) {
    str += "Z"
  }

  const d = new Date(str)
  return isNaN(d.getTime()) ? null : d
}

// Convert 2-letter ISO country code into Unicode flag emoji
function getCountryFlag(countryCode?: string): string {
  if (!countryCode || countryCode === "Unknown" || countryCode.length !== 2) return "🌐"
  try {
    const codePoints = countryCode
      .toUpperCase()
      .split("")
      .map((c) => 127397 + c.charCodeAt(0))
    return String.fromCodePoint(...codePoints)
  } catch {
    return "🌐"
  }
}

// Resolve 2-letter country code into full readable English country name
function getCountryName(countryCode?: string): string {
  if (!countryCode || countryCode === "Unknown") return "Unknown"
  try {
    const regionNames = new Intl.DisplayNames(["en"], { type: "region" })
    return regionNames.of(countryCode.toUpperCase()) || countryCode
  } catch {
    return countryCode
  }
}

// Format seconds into human readable duration string
function formatDuration(seconds: number): string {
  if (!seconds || seconds <= 0) return "< 5s"
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  if (m === 0) return `${s}s`
  if (m < 60) return `${m}m ${s}s`
  const h = Math.floor(m / 60)
  return `${h}h ${m % 60}m`
}

// Format ISO date into relative time string accurately
function formatTimeAgo(isoString: string): string {
  if (!isoString) return "-"
  const parsed = parseUtcDate(isoString)
  if (!parsed) return "-"
  const diff = Math.max(0, Date.now() - parsed.getTime())
  const sec = Math.floor(diff / 1000)
  if (sec < 45) return "Just now"
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min}m ago`
  const hrs = Math.floor(min / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return `${days}d ago`
}

// Format date into human-readable full date and time string
function formatFullDateTime(isoString: string): string {
  const parsed = parseUtcDate(isoString)
  if (!parsed) return "-"
  return parsed.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  })
}

// Icon mapper for client device categories
function DeviceIcon({ device, className = "size-3.5" }: { device: string; className?: string }) {
  if (device === "Mobile") return <Smartphone className={className} />
  if (device === "Tablet") return <Tablet className={className} />
  return <Laptop className={className} />
}

export default function VisitorAnalyticsPage() {
  const router = useRouter()
  const { userInfo, setUserInfo, sidebarOpen, setSidebarOpen } = useApp()
  const isAdmin = userInfo?.type === UserTypeEnum.ADMIN

  const [checkingAuth, setCheckingAuth] = useState(!userInfo)
  const [overview, setOverview] = useState<AnalyticsOverviewVo | null>(null)
  const [sessionsData, setSessionsData] = useState<VisitorSessionsListVo | null>(null)
  const [loading, setLoading] = useState(true)
  const [isPending, startTransition] = useTransition()

  // Filter and pagination states
  const [page, setPage] = useState(1)
  const [pageSize] = useState(20)
  const [searchTerm, setSearchTerm] = useState("")
  const [deviceFilter, setDeviceFilter] = useState("all")
  const [browserFilter, setBrowserFilter] = useState("all")

  // Session inspector dialog state
  const [inspectSessionId, setInspectSessionId] = useState<string | null>(null)
  const [sessionDetail, setSessionDetail] = useState<VisitorSessionDetailVo | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [copiedIp, setCopiedIp] = useState<string | null>(null)

  // Real-time live auto-refresh state with background tab throttling
  const [liveRefresh, setLiveRefresh] = useState(true)
  const isFetchingRef = useRef(false)

  // Verify Admin session on mount
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
        .catch(() => router.replace("/login"))
        .finally(() => setCheckingAuth(false))
    } else if (!isAdmin) {
      router.replace("/login")
    } else {
      setCheckingAuth(false)
    }
  }, [userInfo, isAdmin, setUserInfo, router])

  // Fetch overview telemetry data
  const loadOverview = async () => {
    try {
      const data = await getAnalyticsOverview()
      setOverview(data)
    } catch (err) {
      console.error("[ANALYTICS] Failed to load overview:", err)
    }
  }

  // Fetch paginated sessions list
  const loadSessions = async (targetPage = page) => {
    try {
      const data = await getVisitorSessions({
        page: targetPage,
        pageSize,
        search: searchTerm.trim() || undefined,
        device: deviceFilter !== "all" ? deviceFilter : undefined,
        browser: browserFilter !== "all" ? browserFilter : undefined,
      })
      setSessionsData(data)
    } catch (err) {
      console.error("[ANALYTICS] Failed to load sessions:", err)
    }
  }

  // Initial and reactive load
  useEffect(() => {
    if (checkingAuth || !isAdmin) return

    setLoading(true)
    Promise.all([loadOverview(), loadSessions(1)])
      .then(() => setPage(1))
      .finally(() => setLoading(false))
  }, [checkingAuth, isAdmin, deviceFilter, browserFilter])

  // Debounced search
  useEffect(() => {
    if (checkingAuth || !isAdmin) return
    const timer = setTimeout(() => {
      loadSessions(1)
      setPage(1)
    }, 300)
    return () => clearTimeout(timer)
  }, [searchTerm])

  // Real-time live polling (20s interval), strictly paused when browser tab is inactive to protect Vercel usage
  useEffect(() => {
    if (!liveRefresh || checkingAuth || !isAdmin) return

    const interval = setInterval(() => {
      // Strictly skip polling if tab is hidden or fetch already in flight
      if (document.visibilityState !== "visible") return
      if (isFetchingRef.current) return

      isFetchingRef.current = true
      Promise.all([loadOverview(), loadSessions(page)]).finally(() => {
        isFetchingRef.current = false
      })
    }, 20000)

    return () => clearInterval(interval)
  }, [liveRefresh, checkingAuth, isAdmin, page, searchTerm, deviceFilter, browserFilter])

  // Manual refresh loading state
  const [isRefreshing, setIsRefreshing] = useState(false)

  // Reset dialog state
  const [resetDialogOpen, setResetDialogOpen] = useState(false)
  const [isResetting, setIsResetting] = useState(false)

  // Open inspector dialog for a specific session
  const handleInspect = async (sessionId: string) => {
    setInspectSessionId(sessionId)
    setDetailLoading(true)
    try {
      const detail = await getSessionDetail(sessionId)
      setSessionDetail(detail)
    } catch {
      toast.error("Failed to load session details.")
      setInspectSessionId(null)
    } finally {
      setDetailLoading(false)
    }
  }

  // Copy IP address to clipboard
  const handleCopyIp = (ip: string) => {
    if (!ip) return
    navigator.clipboard.writeText(ip)
    setCopiedIp(ip)
    toast.success(`Copied ${ip} to clipboard`)
    setTimeout(() => setCopiedIp(null), 2000)
  }

  // Refresh all analytics data with active spinning animation
  const handleRefresh = async () => {
    if (isRefreshing) return
    setIsRefreshing(true)
    try {
      await Promise.all([loadOverview(), loadSessions(page)])
      toast.success("Visitor telemetry refreshed")
    } catch {
      toast.error("Failed to refresh visitor telemetry")
    } finally {
      setIsRefreshing(false)
    }
  }

  // Completely wipe all visitor telemetry history
  const handleResetAnalytics = async () => {
    if (isResetting) return
    setIsResetting(true)
    try {
      await resetAnalytics()
      toast.success("All visitor telemetry history has been wiped")
      setResetDialogOpen(false)
      await Promise.all([loadOverview(), loadSessions(1)])
      setPage(1)
    } catch {
      toast.error("Failed to reset visitor analytics")
    } finally {
      setIsResetting(false)
    }
  }

  if (checkingAuth || !isAdmin) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <SidebarProvider defaultOpen={sidebarOpen} onOpenChange={setSidebarOpen}>
      <AppSidebar />
      <SidebarInset>
        {/* Header */}
        <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center justify-between border-b bg-background/90 px-4 backdrop-blur-md">
          <div className="flex items-center gap-2">
            <SidebarTrigger className="-ml-1" />
            <Separator orientation="vertical" className="mr-2 h-4" />
            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem className="hidden md:block">
                  <span className="text-muted-foreground">System</span>
                </BreadcrumbItem>
                <BreadcrumbItem>
                  <BreadcrumbPage className="font-semibold text-foreground">
                    Visitor Analytics
                  </BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          </div>

          <div className="flex items-center gap-2">
            <div className="hidden sm:flex items-center gap-1.5 rounded-full border bg-muted/40 px-2.5 py-1 text-xs text-muted-foreground">
              <span className="relative flex size-2">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex size-2 rounded-full bg-emerald-500"></span>
              </span>
              <span>{overview?.liveVisitors ?? 0} active now</span>
            </div>

            {/* Realtime auto-refresh toggle */}
            <Button
              variant={liveRefresh ? "secondary" : "outline"}
              size="sm"
              onClick={() => setLiveRefresh((prev) => !prev)}
              className="gap-1.5 text-xs h-8"
              title={liveRefresh ? "Auto-refresh active (pauses when tab is hidden)" : "Auto-refresh paused"}
            >
              <span className="relative flex size-2">
                {liveRefresh ? (
                  <>
                    <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex size-2 rounded-full bg-emerald-500"></span>
                  </>
                ) : (
                  <span className="relative inline-flex size-2 rounded-full bg-muted-foreground"></span>
                )}
              </span>
              <span>{liveRefresh ? "Live (20s)" : "Paused"}</span>
            </Button>

            {/* Refresh Button with spinning animation */}
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              disabled={isRefreshing || loading}
              className="gap-1.5 text-xs h-8"
              title="Refresh visitor analytics"
            >
              <RefreshCw className={`size-3.5 ${isRefreshing ? "animate-spin text-primary" : ""}`} />
              <span className="hidden sm:inline">{isRefreshing ? "Refreshing..." : "Refresh"}</span>
            </Button>

            {/* Reset History Button */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setResetDialogOpen(true)}
              disabled={isResetting || loading}
              className="gap-1.5 text-xs h-8 text-destructive hover:bg-destructive/10 hover:text-destructive border-destructive/30"
              title="Reset all visitor history"
            >
              <Trash2 className="size-3.5" />
              <span className="hidden sm:inline">Reset</span>
            </Button>
          </div>
        </header>

        {/* Content Body */}
        <main className="flex-1 space-y-6 p-4 sm:p-6 max-w-7xl mx-auto w-full">
          {/* Top Metric Cards */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card className="shadow-sm border-border/70 bg-gradient-to-br from-card to-card/60">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Total Visitors
                </CardTitle>
                <div className="rounded-lg bg-blue-500/10 p-2 text-blue-500">
                  <Globe className="size-4" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold tracking-tight">
                  {overview?.totalVisitors?.toLocaleString() ?? 0}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Across {overview?.totalSessions?.toLocaleString() ?? 0} total sessions
                </p>
              </CardContent>
            </Card>

            <Card className="shadow-sm border-border/70 bg-gradient-to-br from-card to-card/60">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Live Visitors
                </CardTitle>
                <div className="rounded-lg bg-emerald-500/10 p-2 text-emerald-500">
                  <Activity className="size-4" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2">
                  <div className="text-2xl font-bold tracking-tight text-emerald-600 dark:text-emerald-400">
                    {overview?.liveVisitors?.toLocaleString() ?? 0}
                  </div>
                  <span className="relative flex size-2.5">
                    <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex size-2.5 rounded-full bg-emerald-500"></span>
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Active within last 5 minutes
                </p>
              </CardContent>
            </Card>

            <Card className="shadow-sm border-border/70 bg-gradient-to-br from-card to-card/60">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Avg. Duration
                </CardTitle>
                <div className="rounded-lg bg-amber-500/10 p-2 text-amber-500">
                  <Clock className="size-4" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold tracking-tight">
                  {formatDuration(overview?.avgDurationSeconds ?? 0)}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Average session engagement time
                </p>
              </CardContent>
            </Card>

            <Card className="shadow-sm border-border/70 bg-gradient-to-br from-card to-card/60">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Media Actions
                </CardTitle>
                <div className="rounded-lg bg-purple-500/10 p-2 text-purple-500">
                  <Eye className="size-4" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold tracking-tight">
                  {overview?.totalMediaInteractions?.toLocaleString() ?? 0}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Photos & videos opened or interacted
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Breakdown Distributions */}
          <div className="grid gap-4 md:grid-cols-3">
            {/* Top Countries */}
            <Card className="shadow-sm border-border/70">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
                  <Globe className="size-4 text-blue-500" />
                  Top Countries
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2.5">
                {overview?.topCountries && overview.topCountries.length > 0 ? (
                  overview.topCountries.map((c) => (
                    <div key={c.name} className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <span className="text-base leading-none">{getCountryFlag(c.code)}</span>
                        <span className="font-medium text-foreground">{c.name || "Unknown"}</span>
                      </div>
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <span>{c.count}</span>
                        <span className="w-9 text-right font-mono text-[10px]">({c.percentage}%)</span>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-muted-foreground py-2 text-center">No location data yet</p>
                )}
              </CardContent>
            </Card>

            {/* Top Browsers */}
            <Card className="shadow-sm border-border/70">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
                  <Compass className="size-4 text-purple-500" />
                  Top Browsers
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2.5">
                {overview?.topBrowsers && overview.topBrowsers.length > 0 ? (
                  overview.topBrowsers.map((b) => (
                    <div key={b.name} className="flex items-center justify-between text-xs">
                      <span className="font-medium text-foreground">{b.name || "Other"}</span>
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <span>{b.count}</span>
                        <span className="w-9 text-right font-mono text-[10px]">({b.percentage}%)</span>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-muted-foreground py-2 text-center">No browser data yet</p>
                )}
              </CardContent>
            </Card>

            {/* Top Referrers */}
            <Card className="shadow-sm border-border/70">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
                  <ArrowRight className="size-4 text-emerald-500" />
                  Top Referrers
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2.5">
                {overview?.topReferrers && overview.topReferrers.length > 0 ? (
                  overview.topReferrers.map((r) => (
                    <div key={r.name} className="flex items-center justify-between text-xs">
                      <span className="font-medium truncate max-w-[160px] text-foreground">
                        {r.name || "Direct"}
                      </span>
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <span>{r.count}</span>
                        <span className="w-9 text-right font-mono text-[10px]">({r.percentage}%)</span>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-muted-foreground py-2 text-center">No referrer data yet</p>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Visitor Sessions Table Card */}
          <Card className="shadow-sm border-border/70">
            <CardHeader className="pb-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <CardTitle className="text-base font-semibold">Visitor Sessions</CardTitle>
                  <CardDescription className="text-xs">
                    Detailed record of individual visitors, device telemetries, and media interaction histories.
                  </CardDescription>
                </div>

                {/* Filter Toolbar */}
                <div className="flex flex-wrap items-center gap-2">
                  <div className="relative w-full sm:w-56">
                    <Search className="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
                    <Input
                      placeholder="Search IP, city, GPS, referrer..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="h-8 pl-8 text-xs bg-muted/30"
                    />
                  </div>

                  <Select value={deviceFilter} onValueChange={setDeviceFilter}>
                    <SelectTrigger className="h-8 text-xs w-28 bg-muted/30">
                      <SelectValue placeholder="Device" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Devices</SelectItem>
                      <SelectItem value="Desktop">Desktop</SelectItem>
                      <SelectItem value="Mobile">Mobile</SelectItem>
                      <SelectItem value="Tablet">Tablet</SelectItem>
                    </SelectContent>
                  </Select>

                  <Select value={browserFilter} onValueChange={setBrowserFilter}>
                    <SelectTrigger className="h-8 text-xs w-28 bg-muted/30">
                      <SelectValue placeholder="Browser" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Browsers</SelectItem>
                      <SelectItem value="Samsung Internet">Samsung Internet</SelectItem>
                      <SelectItem value="Chrome">Chrome</SelectItem>
                      <SelectItem value="Safari">Safari</SelectItem>
                      <SelectItem value="Brave">Brave</SelectItem>
                      <SelectItem value="Firefox">Firefox</SelectItem>
                      <SelectItem value="Edge">Edge</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardHeader>

            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/40 hover:bg-muted/40">
                      <TableHead className="text-xs font-semibold py-3 min-w-[280px]">Visitor / IP</TableHead>
                      <TableHead className="text-xs font-semibold py-3 min-w-[220px]">Location (IP & Device)</TableHead>
                      <TableHead className="text-xs font-semibold py-3">Device & Browser</TableHead>
                      <TableHead className="text-xs font-semibold py-3">Referrer</TableHead>
                      <TableHead className="text-xs font-semibold py-3">Duration</TableHead>
                      <TableHead className="text-xs font-semibold py-3">Media Viewed</TableHead>
                      <TableHead className="text-xs font-semibold py-3">Time</TableHead>
                      <TableHead className="text-xs font-semibold py-3 text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading ? (
                      <TableRow>
                        <TableCell colSpan={8} className="h-40 text-center">
                          <Loader2 className="size-6 animate-spin mx-auto text-muted-foreground" />
                          <span className="text-xs text-muted-foreground mt-2 block">
                            Loading sessions...
                          </span>
                        </TableCell>
                      </TableRow>
                    ) : sessionsData?.items && sessionsData.items.length > 0 ? (
                      sessionsData.items.map((s) => (
                        <TableRow key={s.id} className="hover:bg-muted/30 transition-colors">
                          {/* IP Address & Copy */}
                          <TableCell className="py-2.5">
                            <div className="inline-flex items-center gap-1.5 font-mono text-xs">
                              <span
                                className="font-semibold text-foreground whitespace-nowrap"
                                title={s.ip}
                              >
                                {s.ip || "Unknown"}
                              </span>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="size-5 shrink-0 text-muted-foreground hover:text-foreground cursor-pointer"
                                onClick={() => handleCopyIp(s.ip)}
                                title="Copy IP address"
                              >
                                {copiedIp === s.ip ? (
                                  <Check className="size-3 text-emerald-500" />
                                ) : (
                                  <Copy className="size-3" />
                                )}
                              </Button>
                            </div>
                            <div className="text-[10px] text-muted-foreground truncate max-w-[240px]" title={s.landingPath}>
                              {s.landingPath}
                            </div>
                          </TableCell>

                          {/* Dual Geolocation: IP & User Device GPS */}
                          <TableCell className="py-2.5">
                            <div className="space-y-1.5 min-w-[200px]">
                              {/* 1. IP Location */}
                              <div>
                                <div className="flex items-center gap-1.5 text-xs">
                                  <span className="text-sm leading-none">{getCountryFlag(s.country)}</span>
                                  <span className="font-medium text-foreground">
                                    {s.city && s.city !== "Unknown" ? `${s.city}, ` : ""}
                                    {getCountryName(s.country)}
                                  </span>
                                </div>
                                <div className="text-[10px] text-muted-foreground flex items-center gap-1">
                                  <span className="text-[9px] uppercase font-semibold text-muted-foreground/70">IP:</span>
                                  <span className="truncate max-w-[180px]">
                                    {s.region && s.region !== "Unknown" && s.region !== s.city ? `${s.region}, ` : ""}
                                    {s.country}
                                  </span>
                                </div>
                              </div>

                              {/* 2. Device Location (GPS) */}
                              {s.userLat && s.userLng ? (
                                <div className="pt-1 border-t border-border/40">
                                  <div className="flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                                    <Compass className="size-3 shrink-0 text-emerald-500" />
                                    <span className="truncate max-w-[170px]" title={s.userLocationName || `${s.userLat}, ${s.userLng}`}>
                                      {s.userLocationName || `${Number(s.userLat).toFixed(4)}°, ${Number(s.userLng).toFixed(4)}°`}
                                    </span>
                                    <Badge variant="secondary" className="px-1 py-0 text-[8px] bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-none uppercase font-bold shrink-0">
                                      GPS
                                    </Badge>
                                  </div>
                                </div>
                              ) : (
                                <div className="pt-1 border-t border-border/40">
                                  <div className="text-[10px] text-muted-foreground/60 italic">
                                    GPS not shared
                                  </div>
                                </div>
                              )}
                            </div>
                          </TableCell>

                          {/* Device & Browser */}
                          <TableCell className="py-2.5">
                            <div className="flex items-center gap-1.5 text-xs">
                              <DeviceIcon device={s.device} className="size-3 text-muted-foreground" />
                              <span className="font-medium text-foreground">{s.browser}</span>
                              {s.browser === "Brave" && (
                                <Badge variant="secondary" className="px-1 py-0 text-[9px] bg-amber-500/15 text-amber-600 dark:text-amber-400 border-none">
                                  Brave
                                </Badge>
                              )}
                            </div>
                            <div className="text-[10px] text-muted-foreground">
                              {s.os} • {s.device}
                            </div>
                          </TableCell>

                          {/* Referrer */}
                          <TableCell className="py-2.5">
                            <Badge
                              variant="outline"
                              className="text-[10px] font-normal px-2 py-0.5 rounded-full border-border/80"
                            >
                              {s.referrer || "Direct"}
                            </Badge>
                          </TableCell>

                          {/* Duration */}
                          <TableCell className="py-2.5 text-xs font-mono">
                            {formatDuration(s.durationSeconds)}
                          </TableCell>

                          {/* Media Count */}
                          <TableCell className="py-2.5">
                            <Badge
                              variant="secondary"
                              className={`text-[10px] px-2 py-0.5 ${
                                s.mediaCount > 0
                                  ? "bg-purple-500/15 text-purple-600 dark:text-purple-400 font-semibold"
                                  : "text-muted-foreground"
                              }`}
                            >
                              {s.mediaCount} media
                            </Badge>
                          </TableCell>

                          {/* Started Time */}
                          <TableCell
                            className="py-2.5 text-xs text-muted-foreground whitespace-nowrap cursor-default"
                            title={formatFullDateTime(s.startedAt)}
                          >
                            {formatTimeAgo(s.startedAt)}
                          </TableCell>

                          {/* Action */}
                          <TableCell className="py-2.5 text-right">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleInspect(s.id)}
                              className="h-7 text-xs px-2 text-primary hover:text-primary hover:bg-primary/10"
                            >
                              Inspect
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={8} className="h-32 text-center text-xs text-muted-foreground">
                          No visitor sessions found matching the current criteria.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>

              {/* Pagination Bar */}
              {sessionsData && sessionsData.totalPages > 1 && (
                <div className="flex items-center justify-between border-t px-4 py-3 text-xs text-muted-foreground">
                  <div>
                    Page {sessionsData.page} of {sessionsData.totalPages} ({sessionsData.total} total sessions)
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        const newPage = Math.max(1, page - 1)
                        setPage(newPage)
                        loadSessions(newPage)
                      }}
                      disabled={page <= 1 || loading}
                      className="h-7 text-xs px-2.5"
                    >
                      Previous
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        const newPage = Math.min(sessionsData.totalPages, page + 1)
                        setPage(newPage)
                        loadSessions(newPage)
                      }}
                      disabled={page >= sessionsData.totalPages || loading}
                      className="h-7 text-xs px-2.5"
                    >
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </main>

        {/* Session Inspector Dialog */}
        <Dialog open={Boolean(inspectSessionId)} onOpenChange={(open) => !open && setInspectSessionId(null)}>
          <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-base font-semibold flex items-center gap-2">
                <Activity className="size-4 text-primary" />
                Visitor Session Inspector
              </DialogTitle>
              <DialogDescription className="text-xs">
                Complete timeline and media interaction details for this visitor session.
              </DialogDescription>
            </DialogHeader>

            {detailLoading ? (
              <div className="py-12 text-center">
                <Loader2 className="size-6 animate-spin mx-auto text-muted-foreground" />
                <span className="text-xs text-muted-foreground mt-2 block">Loading session details...</span>
              </div>
            ) : sessionDetail ? (
              <div className="space-y-5 pt-2">
                {/* Meta details card */}
                <div className="rounded-lg border bg-muted/20 p-3.5 space-y-3 text-xs">
                  {/* Full-width dedicated IP Address row */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2.5 border-b border-border/50">
                    <div className="space-y-0.5 min-w-0 flex-1">
                      <span className="text-muted-foreground block text-[10px] uppercase font-semibold tracking-wider">
                        IP Address
                      </span>
                      <div className="flex items-center gap-2 font-mono font-semibold text-foreground text-xs sm:text-sm">
                        <span className="break-all leading-normal">{sessionDetail.session.ip}</span>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-6 shrink-0 text-muted-foreground hover:text-foreground"
                          onClick={() => handleCopyIp(sessionDetail.session.ip)}
                          title="Copy IP Address"
                        >
                          {copiedIp === sessionDetail.session.ip ? (
                            <Check className="size-3.5 text-emerald-500" />
                          ) : (
                            <Copy className="size-3.5" />
                          )}
                        </Button>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0 flex-wrap">
                      <Badge variant="secondary" className="text-[10px] gap-1 px-2 py-0.5">
                        <DeviceIcon device={sessionDetail.session.device} className="size-3" />
                        {sessionDetail.session.device}
                      </Badge>
                      <Badge variant="outline" className="text-[10px] px-2 py-0.5 font-medium">
                        {sessionDetail.session.browser}
                      </Badge>
                    </div>
                  </div>

                  {/* Dedicated Dual Geolocation Card */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 rounded-lg bg-background/60 border border-border/60">
                    {/* 1. IP Geolocation (Network Edge) */}
                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground text-[10px] uppercase font-semibold tracking-wider flex items-center gap-1">
                          <Globe className="size-3 text-muted-foreground" />
                          IP Geolocation (Edge)
                        </span>
                        <Badge variant="outline" className="text-[9px] px-1.5 py-0">
                          ISP / Transit
                        </Badge>
                      </div>
                      <div className="font-semibold text-foreground text-xs flex items-center gap-1.5 mt-0.5">
                        <span className="text-base leading-none">{getCountryFlag(sessionDetail.session.country)}</span>
                        <span>
                          {sessionDetail.session.city && sessionDetail.session.city !== "Unknown" ? `${sessionDetail.session.city}, ` : ""}
                          {getCountryName(sessionDetail.session.country)}
                        </span>
                      </div>
                      {sessionDetail.session.region &&
                        sessionDetail.session.region !== "Unknown" &&
                        sessionDetail.session.region !== sessionDetail.session.city && (
                          <div className="text-[11px] text-muted-foreground">
                            Region: {sessionDetail.session.region}
                          </div>
                        )}
                    </div>

                    {/* 2. Device Geolocation (User Consented GPS) */}
                    <div className="space-y-1 sm:border-l sm:border-border/60 sm:pl-3">
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground text-[10px] uppercase font-semibold tracking-wider flex items-center gap-1">
                          <Compass className="size-3 text-emerald-500" />
                          Device Location (User Consented)
                        </span>
                        {sessionDetail.session.userLat && sessionDetail.session.userLng ? (
                          <Badge variant="secondary" className="text-[9px] px-1.5 py-0 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 font-bold border-none">
                            GPS Verified
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-[9px] px-1.5 py-0 text-muted-foreground/70">
                            Not Shared
                          </Badge>
                        )}
                      </div>

                      {sessionDetail.session.userLat && sessionDetail.session.userLng ? (
                        <div className="space-y-1 mt-0.5">
                          <div className="font-semibold text-foreground text-xs flex items-center gap-1.5">
                            <span className="text-emerald-600 dark:text-emerald-400">📍</span>
                            <span className="break-words">
                              {sessionDetail.session.userLocationName || `${sessionDetail.session.userLat}, ${sessionDetail.session.userLng}`}
                            </span>
                          </div>
                          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                            <span className="font-mono text-[10px]">
                              {Number(sessionDetail.session.userLat).toFixed(6)}°, {Number(sessionDetail.session.userLng).toFixed(6)}°
                            </span>
                            <a
                              href={`https://www.google.com/maps?q=${sessionDetail.session.userLat},${sessionDetail.session.userLng}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-[10px] text-primary hover:underline font-medium ml-2"
                            >
                              Google Maps
                              <ArrowRight className="size-2.5" />
                            </a>
                          </div>
                        </div>
                      ) : (
                        <div className="text-[11px] text-muted-foreground/70 italic mt-0.5">
                          Visitor has not granted device location permission for this session.
                        </div>
                      )}
                    </div>
                  </div>

                  {/* 3-Column Metadata Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-0.5">
                    <div>
                      <span className="text-muted-foreground block text-[10px] uppercase font-semibold">Duration</span>
                      <span className="font-mono font-medium mt-0.5 block text-foreground">
                        {formatDuration(sessionDetail.session.durationSeconds)}
                      </span>
                      <span className="text-[10px] text-muted-foreground block mt-0.5">
                        Started {formatTimeAgo(sessionDetail.session.startedAt)}
                      </span>
                    </div>

                    <div>
                      <span className="text-muted-foreground block text-[10px] uppercase font-semibold">OS & Platform</span>
                      <span className="font-medium mt-0.5 block text-foreground truncate">
                        {sessionDetail.session.os}
                      </span>
                      <span className="text-[10px] text-muted-foreground block mt-0.5">
                        {sessionDetail.session.browserVersion ? `v${sessionDetail.session.browserVersion}` : "Standard Client"}
                      </span>
                    </div>

                    <div>
                      <span className="text-muted-foreground block text-[10px] uppercase font-semibold">Referrer & Path</span>
                      <span className="font-medium mt-0.5 block truncate" title={sessionDetail.session.referrer}>
                        {sessionDetail.session.referrer || "Direct"}
                      </span>
                      <span className="text-[10px] text-muted-foreground block truncate mt-0.5" title={sessionDetail.session.landingPath}>
                        {sessionDetail.session.landingPath}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Media Viewed Timeline */}
                <div>
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 flex items-center justify-between">
                    <span>Media Opened & Actions ({sessionDetail.activities.length})</span>
                    <span className="text-[10px] font-normal normal-case">Chronological order</span>
                  </h4>

                  {sessionDetail.activities.length > 0 ? (
                    <div className="space-y-2.5">
                      {sessionDetail.activities.map((item, idx) => (
                        <div
                          key={item.id}
                          className="flex items-center justify-between gap-3 rounded-lg border bg-card p-2.5 shadow-sm hover:border-border transition-colors"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <span className="font-mono text-[10px] text-muted-foreground w-4 text-center">
                              #{idx + 1}
                            </span>

                            {item.thumbnail ? (
                              <div className="relative size-12 shrink-0 rounded-md overflow-hidden bg-muted border">
                                <Image
                                  src={item.thumbnail}
                                  alt={item.photoTitle}
                                  fill
                                  sizes="48px"
                                  className="object-cover"
                                />
                              </div>
                            ) : (
                              <div className="size-12 shrink-0 rounded-md bg-muted border flex items-center justify-center text-muted-foreground">
                                <Eye className="size-4" />
                              </div>
                            )}

                            <div className="min-w-0">
                              <div className="font-medium text-xs truncate max-w-[240px] text-foreground">
                                {item.photoTitle}
                              </div>
                              <div className="text-[10px] text-muted-foreground mt-0.5">
                                {parseUtcDate(item.createdAt)?.toLocaleTimeString() || item.createdAt}
                              </div>
                            </div>
                          </div>

                          <div className="shrink-0 flex items-center gap-1.5">
                            {item.action === "download" ? (
                              <Badge className="bg-amber-500/15 text-amber-600 dark:text-amber-400 border-none text-[10px] gap-1 px-2">
                                <Download className="size-3" /> Downloaded
                              </Badge>
                            ) : item.action === "reaction" ? (
                              <Badge className="bg-rose-500/15 text-rose-600 dark:text-rose-400 border-none text-[10px] gap-1 px-2">
                                <Heart className="size-3" /> Reacted
                              </Badge>
                            ) : item.action === "share" ? (
                              <Badge className="bg-blue-500/15 text-blue-600 dark:text-blue-400 border-none text-[10px] gap-1 px-2">
                                <Share2 className="size-3" /> Shared
                              </Badge>
                            ) : (
                              <Badge variant="secondary" className="text-[10px] gap-1 px-2">
                                <Eye className="size-3" /> Viewed
                              </Badge>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-lg border border-dashed py-8 text-center text-xs text-muted-foreground">
                      No media opened during this session.
                    </div>
                  )}
                </div>
              </div>
            ) : null}
          </DialogContent>
        </Dialog>

        {/* Reset Analytics Confirmation Modal */}
        <AlertDialog open={resetDialogOpen} onOpenChange={setResetDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2 text-destructive">
                <AlertTriangle className="size-5 text-destructive" />
                Reset Visitor Analytics History?
              </AlertDialogTitle>
              <AlertDialogDescription className="text-xs leading-relaxed text-muted-foreground">
                This action will permanently delete all visitor session records, IP logs, geo-location
                history, and media interaction timelines. Aggregate statistics will be reset to zero.
                This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isResetting} className="text-xs h-8">
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={(e) => {
                  e.preventDefault()
                  handleResetAnalytics()
                }}
                disabled={isResetting}
                className="bg-destructive hover:bg-destructive/90 text-destructive-foreground text-xs h-8 gap-1.5"
              >
                {isResetting ? (
                  <>
                    <Loader2 className="size-3.5 animate-spin" />
                    <span>Wiping Data...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="size-3.5" />
                    <span>Yes, Wipe All History</span>
                  </>
                )}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </SidebarInset>
    </SidebarProvider>
  )
}
