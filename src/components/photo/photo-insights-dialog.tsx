"use client"

import { useEffect, useState } from "react"
import Image from "next/image"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { type PhotoInsightsDetailVo } from "@/server/entity/vo/insights"
import { getPhotoInsightsDetail } from "@/request/insights"
import { Eye, Download, MessageSquare, Share2, TrendingUp, Loader2, Calendar } from "lucide-react"
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts"

// This component renders an individual photo analytics and insights modal for Admin.

interface PhotoInsightsDialogProps {
  photoId: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function PhotoInsightsDialog({ photoId, open, onOpenChange }: PhotoInsightsDialogProps) {
  // detail stores the fetched photo analytics details
  const [detail, setDetail] = useState<PhotoInsightsDetailVo | null>(null)
  // loading indicates active API request
  const [loading, setLoading] = useState(false)
  // error stores any fetch failure message
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open || !photoId) {
      setDetail(null)
      setError(null)
      return
    }

    setLoading(true)
    setError(null)
    getPhotoInsightsDetail(photoId)
      .then((res) => {
        if (res) {
          setDetail(res)
        } else {
          setError("Photo analytics not available.")
        }
      })
      .catch((err) => {
        console.error("Failed to load photo insights:", err)
        setError("Unable to load insights for this photo.")
      })
      .finally(() => {
        setLoading(false)
      })
  }, [open, photoId])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto p-6 rounded-2xl border-border/80 bg-background/95 backdrop-blur-md">
        <DialogHeader className="pb-3 border-b border-border/60">
          <DialogTitle className="text-base font-bold flex items-center gap-2">
            <TrendingUp className="size-4 text-primary" />
            <span>Photo Insights & Analytics</span>
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Detailed public engagement performance for this photo
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="py-20 flex flex-col items-center justify-center gap-2 text-muted-foreground">
            <Loader2 className="size-6 animate-spin text-primary" />
            <span className="text-xs">Loading analytics...</span>
          </div>
        ) : error || !detail ? (
          <div className="py-12 text-center text-xs text-muted-foreground">
            {error || "No data available."}
          </div>
        ) : (
          <div className="space-y-6 pt-2">
            {/* Photo Header Card */}
            <div className="flex items-center gap-4 p-3 rounded-xl bg-card border border-border/70">
              <Image
                src={detail.thumbnail}
                alt={detail.name}
                width={64}
                height={64}
                unoptimized
                className="size-16 rounded-lg object-cover shrink-0 border border-border/60"
              />
              <div className="min-w-0 flex-1">
                <h4 className="font-semibold text-sm truncate text-foreground">{detail.name}</h4>
                <div className="flex flex-wrap items-center gap-2 mt-1.5 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1 font-medium text-foreground">
                    <Eye className="size-3.5 text-primary" />
                    {detail.totalViews.toLocaleString()} views
                  </span>
                  <span>•</span>
                  <span className="inline-flex items-center gap-1">
                    <Download className="size-3 text-amber-500" />
                    {detail.downloads} downloads
                  </span>
                  <span>•</span>
                  <span className="inline-flex items-center gap-1">
                    <MessageSquare className="size-3 text-blue-500" />
                    {detail.comments}
                  </span>
                  <span>•</span>
                  <span className="inline-flex items-center gap-1">
                    <Share2 className="size-3 text-emerald-500" />
                    {detail.shares}
                  </span>
                </div>
              </div>
            </div>

            {/* View Velocity Breakdown */}
            <div>
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
                <Calendar className="size-3.5" />
                <span>Public View Velocity</span>
              </div>
              <div className="grid grid-cols-3 gap-2.5">
                <div className="p-3 rounded-xl bg-card border border-border/70 text-center">
                  <div className="text-xs text-muted-foreground font-medium">Today</div>
                  <div className="text-lg font-bold mt-0.5 text-foreground">
                    {detail.viewsToday.toLocaleString()}
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-card border border-border/70 text-center">
                  <div className="text-xs text-muted-foreground font-medium">This Week</div>
                  <div className="text-lg font-bold mt-0.5 text-foreground">
                    {detail.viewsThisWeek.toLocaleString()}
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-card border border-border/70 text-center">
                  <div className="text-xs text-muted-foreground font-medium">This Month</div>
                  <div className="text-lg font-bold mt-0.5 text-foreground">
                    {detail.viewsThisMonth.toLocaleString()}
                  </div>
                </div>
              </div>
            </div>

            {/* Interaction Badges */}
            <div className="grid grid-cols-3 gap-2.5">
              <div className="flex items-center gap-2.5 p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400">
                <Download className="size-4 shrink-0" />
                <div className="min-w-0 text-left">
                  <div className="text-[10px] font-medium uppercase leading-none opacity-80">Downloads</div>
                  <div className="text-base font-bold leading-tight mt-0.5">{detail.downloads}</div>
                </div>
              </div>
              <div className="flex items-center gap-2.5 p-2.5 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-600 dark:text-blue-400">
                <MessageSquare className="size-4 shrink-0" />
                <div className="min-w-0 text-left">
                  <div className="text-[10px] font-medium uppercase leading-none opacity-80">Comments</div>
                  <div className="text-base font-bold leading-tight mt-0.5">{detail.comments}</div>
                </div>
              </div>
              <div className="flex items-center gap-2.5 p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400">
                <Share2 className="size-4 shrink-0" />
                <div className="min-w-0 text-left">
                  <div className="text-[10px] font-medium uppercase leading-none opacity-80">Shares</div>
                  <div className="text-base font-bold leading-tight mt-0.5">{detail.shares}</div>
                </div>
              </div>
            </div>

            {/* 30-Day Views Trend Chart */}
            <div className="pt-2">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  30-Day View Trend
                </span>
                <span className="text-[11px] text-muted-foreground">Daily public views</span>
              </div>
              <div className="h-44 w-full rounded-xl bg-card border border-border/70 p-3 pt-4">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={detail.chart.points} margin={{ top: 5, right: 5, left: -25, bottom: 0 }}>
                    <defs>
                      <linearGradient id="photoViewGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="var(--color-primary, #6366f1)" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="var(--color-primary, #6366f1)" stopOpacity={0.0} />
                      </linearGradient>
                    </defs>
                    <XAxis
                      dataKey="label"
                      tick={{ fontSize: 10, fill: "currentColor", opacity: 0.5 }}
                      axisLine={false}
                      tickLine={false}
                      interval="preserveStartEnd"
                    />
                    <YAxis
                      allowDecimals={false}
                      tick={{ fontSize: 10, fill: "currentColor", opacity: 0.5 }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip
                      content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          const data = payload[0].payload
                          return (
                            <div className="rounded-lg bg-popover border border-border px-2.5 py-1.5 shadow-md text-xs">
                              <p className="font-semibold text-foreground">{data.date}</p>
                              <p className="text-primary font-medium">{data.views} public views</p>
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
                      strokeWidth={2}
                      fillOpacity={1}
                      fill="url(#photoViewGradient)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
