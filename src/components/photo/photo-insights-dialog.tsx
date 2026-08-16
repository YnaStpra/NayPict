"use client"

import { useEffect, useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { type PhotoInsightsDetailVo } from "@/server/entity/vo/insights"
import { getPhotoInsightsDetail } from "@/request/insights"
import { Eye, Heart, MessageSquare, Share2, TrendingUp, Loader2, Calendar } from "lucide-react"
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
      return
    }

    let isMounted = true

    getPhotoInsightsDetail(photoId)
      .then((res) => {
        if (isMounted) {
          setDetail(res)
          setError(null)
        }
      })
      .catch((err) => {
        if (isMounted) {
          console.error("Failed to fetch photo insights:", err)
          setError("Unable to load photo insights.")
        }
      })
      .finally(() => {
        if (isMounted) {
          setLoading(false)
        }
      })

    return () => {
      isMounted = false
    }
  }, [open, photoId])

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      setDetail(null)
      setError(null)
    } else {
      setLoading(true)
    }
    onOpenChange(nextOpen)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto sm:rounded-2xl p-6">
        <DialogHeader className="space-y-1 text-left">
          <div className="flex items-center gap-2 text-xs font-semibold text-primary uppercase tracking-wider">
            <TrendingUp className="size-3.5" />
            <span>Photo Insights (Admin Only)</span>
          </div>
          <DialogTitle className="text-xl font-bold truncate">
            {detail?.name || "Photo Analytics"}
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Public visitor interaction statistics for this photo.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-3">
            <Loader2 className="size-8 animate-spin text-primary" />
            <p className="text-sm font-medium">Loading photo analytics...</p>
          </div>
        ) : error ? (
          <div className="py-12 text-center text-sm text-destructive">
            {error}
          </div>
        ) : detail ? (
          <div className="space-y-5 pt-2">
            {/* Photo Preview & Key Summary */}
            <div className="flex items-center gap-4 p-3 rounded-xl bg-muted/40 border border-border/50">
              <img
                src={detail.thumbnail || detail.preview}
                alt={detail.name}
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
                    <Heart className="size-3 text-pink-500" />
                    {detail.favorites}
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
              <div className="flex items-center gap-2.5 p-2.5 rounded-xl bg-pink-500/10 border border-pink-500/20 text-pink-600 dark:text-pink-400">
                <Heart className="size-4 shrink-0" />
                <div className="min-w-0 text-left">
                  <div className="text-[10px] font-medium uppercase leading-none opacity-80">Favorites</div>
                  <div className="text-base font-bold leading-tight mt-0.5">{detail.favorites}</div>
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
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
