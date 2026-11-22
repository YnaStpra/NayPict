"use client"

import { useEffect, useState, useCallback } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { listSessions, revokeSession, revokeOtherSessions } from "@/request/session"
import { userSudo, userSudoStatus, userSudoDrop } from "@/request/user"
import { getTotpStatus } from "@/request/totp"
import { getSecurityAuditLogs, type SecurityAuditRecord } from "@/request/audit"
import { type ActiveSessionVo } from "@/server/entity/vo/session"
import { humanizeError } from "@/lib/error-formatter"
import { toast } from "sonner"
import {
  ShieldAlert,
  ShieldCheck,
  KeyRound,
  Laptop,
  Smartphone,
  Tablet,
  Monitor,
  RefreshCw,
  LogOut,
  Clock,
  Lock,
  Unlock,
  CheckCircle2,
  AlertTriangle,
  LoaderCircle,
  ExternalLink,
  Activity,
  ScrollText,
} from "lucide-react"

interface AdminSecurityCardProps {
  has2Fa?: boolean
  className?: string
}

export function AdminSecurityCard({ has2Fa: initial2Fa, className = "" }: AdminSecurityCardProps) {
  const router = useRouter()
  const [sessions, setSessions] = useState<ActiveSessionVo[]>([])
  const [loading, setLoading] = useState(true)
  const [has2Fa, setHas2Fa] = useState(Boolean(initial2Fa))
  const [revokingUuid, setRevokingUuid] = useState<string | null>(null)
  const [revokingAll, setRevokingAll] = useState(false)

  // Sudo Mode state
  const [sudoActive, setSudoActive] = useState(false)
  const [sudoRemaining, setSudoRemaining] = useState(0)
  const [sudoDialogOpen, setSudoDialogOpen] = useState(false)
  const [sudoPassword, setSudoPassword] = useState("")
  const [sudoSubmitting, setSudoSubmitting] = useState(false)
  const [lockingSudo, setLockingSudo] = useState(false)

  // Security Audit Trail state
  const [auditLogs, setAuditLogs] = useState<SecurityAuditRecord[]>([])
  const [loadingLogs, setLoadingLogs] = useState(false)
  const [logFilter, setLogFilter] = useState<'ALL' | 'CRITICAL' | 'WARNING' | 'INFO'>('ALL')

  const fetchAuditLogs = useCallback(async () => {
    setLoadingLogs(true)
    try {
      const logs = await getSecurityAuditLogs({ limit: 60 })
      setAuditLogs(Array.isArray(logs) ? logs : [])
    } catch (err) {
      console.error("Failed to load security audit logs:", err)
    } finally {
      setLoadingLogs(false)
    }
  }, [])

  const fetchSecurityData = useCallback(async () => {
    setLoading(true)
    try {
      const [sessionList, sudoInfo, totpInfo, logs] = await Promise.all([
        listSessions().catch(() => []),
        userSudoStatus().catch(() => ({ active: false, remainingSeconds: 0 })),
        getTotpStatus().catch(() => null),
        getSecurityAuditLogs({ limit: 60 }).catch(() => []),
      ])

      setSessions(sessionList || [])
      setSudoActive(Boolean(sudoInfo?.active))
      setSudoRemaining(sudoInfo?.remainingSeconds || 0)
      if (totpInfo) {
        setHas2Fa(Boolean(totpInfo.enabled))
      }
      if (Array.isArray(logs)) {
        setAuditLogs(logs)
      }
    } catch (err) {
      console.error("Failed to load security state:", err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchSecurityData()
  }, [fetchSecurityData])

  // Count down Sudo Mode timer
  useEffect(() => {
    if (!sudoActive || sudoRemaining <= 0) return
    const timer = setInterval(() => {
      setSudoRemaining((prev) => {
        if (prev <= 1) {
          setSudoActive(false)
          return 0
        }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(timer)
  }, [sudoActive, sudoRemaining])

  const handleElevateSudo = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!sudoPassword.trim()) {
      toast.error("Please enter your account password")
      return
    }

    setSudoSubmitting(true)
    try {
      const res = await userSudo(sudoPassword)
      if (res?.active) {
        setSudoActive(true)
        setSudoRemaining(res.remainingSeconds || 900)
        setSudoDialogOpen(false)
        setSudoPassword("")
        toast.success("Sudo Mode elevated! Privileged actions unlocked for 15 minutes.")
      }
    } catch (err) {
      toast.error(humanizeError(err, "Failed to verify administrator password."))
    } finally {
      setSudoSubmitting(false)
    }
  }

  const handleLockSudo = async () => {
    setLockingSudo(true)
    try {
      await userSudoDrop()
      setSudoActive(false)
      setSudoRemaining(0)
      toast.success("Sudo Mode locked. Administrative actions re-secured.")
      void fetchAuditLogs()
    } catch (err) {
      toast.error(humanizeError(err, "Failed to lock Sudo Mode."))
    } finally {
      setLockingSudo(false)
    }
  }

  const handleRevokeSession = async (uuid: string) => {
    setRevokingUuid(uuid)
    try {
      const ok = await revokeSession(uuid)
      if (ok) {
        toast.success("Device session revoked successfully.")
        setSessions((prev) => prev.filter((s) => s.uuid !== uuid))
      }
    } catch (err) {
      toast.error(humanizeError(err, "Failed to revoke device session."))
    } finally {
      setRevokingUuid(null)
    }
  }

  const handleRevokeOtherSessions = async () => {
    if (!confirm("Are you sure you want to log out all other devices? Only your current device session will remain active.")) {
      return
    }

    setRevokingAll(true)
    try {
      const ok = await revokeOtherSessions()
      if (ok) {
        toast.success("All other active device sessions have been revoked.")
        setSessions((prev) => prev.filter((s) => s.isCurrent))
      }
    } catch (err) {
      toast.error(humanizeError(err, "Failed to revoke other sessions."))
    } finally {
      setRevokingAll(false)
    }
  }

  const getDeviceIcon = (deviceType?: string) => {
    switch (deviceType?.toLowerCase()) {
      case "mobile":
      case "phone":
        return <Smartphone className="size-4.5 text-muted-foreground" />
      case "tablet":
        return <Tablet className="size-4.5 text-muted-foreground" />
      case "desktop":
        return <Monitor className="size-4.5 text-muted-foreground" />
      default:
        return <Laptop className="size-4.5 text-muted-foreground" />
    }
  }

  const formatTimeAgo = (ts?: number) => {
    if (!ts) return "Recently"
    const diff = Math.max(0, Math.floor((Date.now() - ts) / 1000))
    if (diff < 60) return "Just now"
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
    return `${Math.floor(diff / 86400)}d ago`
  }

  const formatRemainingMinutes = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, "0")}`
  }

  const otherSessionsCount = sessions.filter((s) => !s.isCurrent).length

  const filteredLogs = auditLogs.filter((log) => {
    if (logFilter === 'ALL') return true
    return log.severity === logFilter
  })

  return (
    <Card className={`border-border/80 shadow-sm overflow-hidden ${className}`}>
      <CardHeader className="border-b bg-muted/20 pb-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <ShieldCheck className="size-5 text-primary" />
              <CardTitle className="text-lg font-semibold">Security Center & Active Sessions</CardTitle>
            </div>
            <CardDescription className="text-xs">
              Monitor active device sessions, manage authentication credentials, and elevate administrative privileges.
            </CardDescription>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto">
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 text-xs cursor-pointer"
              onClick={fetchSecurityData}
              disabled={loading}
            >
              <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} />
              <span>Refresh</span>
            </Button>
          </div>
        </div>

        {/* Security Posture Status Badges */}
        <div className="flex flex-wrap items-center gap-2 pt-3">
          {/* Sudo Mode Privilege Badge */}
          {sudoActive ? (
            <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30 gap-1.5 py-1 px-2.5">
              <Unlock className="size-3.5" />
              <span>Sudo Mode Elevated ({formatRemainingMinutes(sudoRemaining)})</span>
            </Badge>
          ) : (
            <Badge variant="outline" className="border-amber-500/30 text-amber-700 dark:text-amber-400 bg-amber-500/10 gap-1.5 py-1 px-2.5">
              <Lock className="size-3.5" />
              <span>Sudo Mode Inactive</span>
            </Badge>
          )}

          {/* 2FA Status Badge */}
          {has2Fa ? (
            <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30 gap-1.5 py-1 px-2.5">
              <CheckCircle2 className="size-3.5" />
              <span>2FA Protected</span>
            </Badge>
          ) : (
            <Badge
              variant="outline"
              className="border-primary/30 text-muted-foreground hover:bg-muted cursor-pointer gap-1.5 py-1 px-2.5"
              onClick={() => router.push("/settings")}
            >
              <KeyRound className="size-3.5 text-primary" />
              <span>Configure 2FA</span>
              <ExternalLink className="size-3 ml-0.5 opacity-60" />
            </Badge>
          )}

          {/* Elevate Button if not active */}
          {!sudoActive ? (
            <Button
              variant="secondary"
              size="sm"
              className="h-7 text-xs gap-1.5 px-2.5 cursor-pointer"
              onClick={() => setSudoDialogOpen(true)}
            >
              <KeyRound className="size-3.5 text-primary" />
              <span>Elevate Sudo</span>
            </Button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs gap-1.5 px-2.5 cursor-pointer text-amber-700 dark:text-amber-400 border-amber-500/30 hover:bg-amber-500/10"
              onClick={handleLockSudo}
              disabled={lockingSudo}
            >
              {lockingSudo ? (
                <LoaderCircle className="size-3.5 animate-spin" />
              ) : (
                <Lock className="size-3.5" />
              )}
              <span>Lock Sudo Now</span>
            </Button>
          )}
        </div>
      </CardHeader>

      <CardContent className="p-4 sm:p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="text-xs font-semibold text-foreground uppercase tracking-wider">
            Connected Devices ({sessions.length})
          </div>

          {otherSessionsCount > 0 && (
            <Button
              variant="destructive"
              size="sm"
              className="h-7 text-xs gap-1.5 px-2.5 cursor-pointer"
              onClick={handleRevokeOtherSessions}
              disabled={revokingAll}
            >
              {revokingAll ? (
                <LoaderCircle className="size-3.5 animate-spin" />
              ) : (
                <LogOut className="size-3.5" />
              )}
              <span>Revoke {otherSessionsCount} Other {otherSessionsCount === 1 ? "Session" : "Sessions"}</span>
            </Button>
          )}
        </div>

        {/* Sessions List */}
        {loading && sessions.length === 0 ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <LoaderCircle className="size-6 animate-spin text-primary" />
          </div>
        ) : (
          <div className="divide-y rounded-xl border border-border/60 overflow-hidden bg-card/50">
            {sessions.map((session) => (
              <div
                key={session.uuid}
                className="flex flex-col sm:flex-row sm:items-center justify-between p-3.5 sm:px-4 gap-3 hover:bg-muted/30 transition-colors"
              >
                <div className="flex items-start gap-3">
                  <div className="p-2 rounded-lg bg-muted border border-border/40 shrink-0 mt-0.5 sm:mt-0">
                    {getDeviceIcon(session.deviceType)}
                  </div>

                  <div className="space-y-0.5 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-foreground truncate max-w-[220px] sm:max-w-xs">
                        {session.deviceLabel || "Web Browser"}
                      </span>
                      {session.isCurrent && (
                        <Badge className="bg-primary/15 text-primary border-primary/20 text-[10px] py-0 px-2 font-normal">
                          Current Device
                        </Badge>
                      )}
                    </div>

                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>{session.ip || "Unknown IP"}</span>
                      <span>•</span>
                      <span className="flex items-center gap-1">
                        <Clock className="size-3" />
                        {formatTimeAgo(session.lastActive || session.createdAt)}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center self-end sm:self-center">
                  {!session.isCurrent ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 text-xs text-rose-600 hover:text-rose-700 hover:bg-rose-500/10 cursor-pointer gap-1"
                      onClick={() => handleRevokeSession(session.uuid)}
                      disabled={revokingUuid === session.uuid}
                    >
                      {revokingUuid === session.uuid ? (
                        <LoaderCircle className="size-3.5 animate-spin" />
                      ) : (
                        <LogOut className="size-3.5" />
                      )}
                      <span>Revoke</span>
                    </Button>
                  ) : (
                    <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium px-2 py-1">
                      Active
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      {/* Live Forensic Security Audit Trail */}
      <div className="border-t bg-muted/10 p-4 sm:p-5 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-0.5">
            <div className="flex items-center gap-2">
              <Activity className="size-4 text-primary" />
              <h3 className="text-sm font-semibold text-foreground">Security Audit Trail</h3>
              <Badge variant="outline" className="text-[10px] py-0 px-1.5 font-normal">
                Forensic Feed
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              Immutable activity log of administrative operations, authentication events, and high-risk actions.
            </p>
          </div>

          <div className="flex items-center gap-1.5 flex-wrap">
            {(['ALL', 'CRITICAL', 'WARNING', 'INFO'] as const).map((filter) => (
              <Button
                key={filter}
                variant={logFilter === filter ? 'default' : 'outline'}
                size="sm"
                className="h-7 text-[11px] px-2.5 rounded-full cursor-pointer"
                onClick={() => setLogFilter(filter)}
              >
                {filter === 'ALL' ? 'All' : filter.charAt(0) + filter.slice(1).toLowerCase()}
              </Button>
            ))}
            <Button
              variant="ghost"
              size="icon"
              className="size-7 ml-1 text-muted-foreground hover:text-foreground cursor-pointer"
              onClick={fetchAuditLogs}
              disabled={loadingLogs}
              title="Refresh Audit Trail"
            >
              <RefreshCw className={`size-3.5 ${loadingLogs ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>

        {loadingLogs && auditLogs.length === 0 ? (
          <div className="flex items-center justify-center p-6 text-xs text-muted-foreground gap-2">
            <LoaderCircle className="size-4 animate-spin text-primary" />
            <span>Loading security audit records...</span>
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className="p-6 text-center text-xs text-muted-foreground bg-muted/20 rounded-lg border border-border/40">
            No audit records found matching selected filter.
          </div>
        ) : (
          <div className="rounded-lg border border-border/60 bg-background/50 divide-y divide-border/40 max-h-72 overflow-y-auto">
            {filteredLogs.map((log) => (
              <div
                key={log.id}
                className="p-3 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2 hover:bg-muted/30 transition-colors"
              >
                <div className="space-y-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge
                      className={
                        log.severity === 'CRITICAL'
                          ? 'bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/20 text-[10px] py-0 px-1.5 font-medium'
                          : log.severity === 'WARNING'
                          ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/20 text-[10px] py-0 px-1.5 font-medium'
                          : 'bg-sky-500/15 text-sky-600 dark:text-sky-400 border-sky-500/20 text-[10px] py-0 px-1.5 font-medium'
                      }
                    >
                      {log.severity}
                    </Badge>
                    <span className="font-mono font-medium text-foreground text-[11px]">
                      {log.action}
                    </span>
                    {log.targetId && (
                      <span className="text-[11px] text-muted-foreground font-mono bg-muted px-1.5 py-0.2 rounded">
                        target: {log.targetId.slice(0, 12)}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                    <span>IP: {log.clientIp || 'Unknown'}</span>
                    <span>•</span>
                    <span>User: {log.userId || 'system'}</span>
                    {log.details && Object.keys(log.details).length > 0 && (
                      <>
                        <span>•</span>
                        <span className="truncate max-w-[240px] text-muted-foreground/80 font-mono">
                          {JSON.stringify(log.details)}
                        </span>
                      </>
                    )}
                  </div>
                </div>

                <div className="shrink-0 text-[11px] text-muted-foreground sm:text-right">
                  {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                  <div className="text-[10px] text-muted-foreground/70">
                    {new Date(log.timestamp).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Sudo Mode Password Elevation Dialog */}
      <Dialog open={sudoDialogOpen} onOpenChange={setSudoDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="size-5 text-primary" />
              <span>Elevate to Sudo Mode</span>
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Re-enter your administrative account password to unlock high-risk destructive actions (purging trash, clearing orphan storage files) for 15 minutes.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleElevateSudo} className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label htmlFor="sudo-password" className="text-xs font-medium">
                Admin Account Password
              </Label>
              <Input
                id="sudo-password"
                type="password"
                placeholder="Enter password..."
                value={sudoPassword}
                onChange={(e) => setSudoPassword(e.target.value)}
                autoFocus
                disabled={sudoSubmitting}
                className="h-9"
              />
            </div>

            <DialogFooter className="gap-2 sm:gap-0 pt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setSudoDialogOpen(false)}
                disabled={sudoSubmitting}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                className="gap-1.5 shadow-sm"
                disabled={sudoSubmitting || !sudoPassword.trim()}
              >
                {sudoSubmitting && <LoaderCircle className="size-3.5 animate-spin" />}
                <span>Confirm & Elevate</span>
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
