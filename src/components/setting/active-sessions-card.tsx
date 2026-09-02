"use client"

import { useEffect, useState } from "react"
import { Laptop, Smartphone, Tablet, Monitor, Shield, LogOut, RefreshCw, Trash2, CheckCircle2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { SettingItem } from "@/components/setting/setting-item"
import { listSessions, revokeSession, revokeOtherSessions } from "@/request/session"
import { type ActiveSessionVo } from "@/server/entity/vo/session"
import { formatRelativeTime } from "@/lib/date"
import { useLocale } from "next-intl"

export function ActiveSessionsCard() {
  const locale = useLocale()
  // sessions: List of active sessions retrieved from server
  const [sessions, setSessions] = useState<ActiveSessionVo[]>([])
  // loading: Indicates active sessions fetch in progress
  const [loading, setLoading] = useState(true)
  // revokingId: Session UUID currently being revoked
  const [revokingId, setRevokingId] = useState<string | null>(null)
  // revokingAll: Indicates bulk revocation of all other devices in progress
  const [revokingAll, setRevokingAll] = useState(false)

  // Fetch active sessions for the current logged-in user
  function fetchSessions() {
    setLoading(true)
    listSessions()
      .then((res) => {
        if (res && Array.isArray(res)) {
          setSessions(res)
        }
      })
      .catch((err) => {
        console.error("Failed to load active sessions:", err)
      })
      .finally(() => {
        setLoading(false)
      })
  }

  useEffect(() => {
    fetchSessions()
  }, [])

  // Revoke a single active device session
  async function handleRevoke(uuid: string) {
    setRevokingId(uuid)
    try {
      await revokeSession(uuid)
      toast.success("Session revoked successfully")
      setSessions((prev) => prev.filter((s) => s.uuid !== uuid))
    } catch (err: any) {
      toast.error(err?.message || "Failed to revoke session")
    } finally {
      setRevokingId(null)
    }
  }

  // Revoke all other device sessions except the current browser
  async function handleRevokeAll() {
    if (!confirm("Are you sure you want to log out from all other devices?")) {
      return
    }

    setRevokingAll(true)
    try {
      await revokeOtherSessions()
      toast.success("Logged out from all other devices")
      setSessions((prev) => prev.filter((s) => s.isCurrent))
    } catch (err: any) {
      toast.error(err?.message || "Failed to revoke other sessions")
    } finally {
      setRevokingAll(false)
    }
  }

  // Render appropriate device icon based on parsed device type
  function renderDeviceIcon(deviceType: string) {
    switch (deviceType) {
      case "mobile":
        return <Smartphone className="h-5 w-5 text-sky-500 shrink-0" />
      case "tablet":
        return <Tablet className="h-5 w-5 text-indigo-500 shrink-0" />
      case "desktop":
      default:
        return <Laptop className="h-5 w-5 text-emerald-500 shrink-0" />
    }
  }

  const otherSessionsCount = sessions.filter((s) => !s.isCurrent).length

  return (
    <SettingItem
      title="Active Sessions"
      description="Manage active devices and log out unrecognized sessions for maximum account security."
    >
      <div className="w-full flex flex-col gap-3">
        <div className="flex items-center justify-between pb-1">
          <span className="text-xs text-muted-foreground font-medium">
            {sessions.length} active {sessions.length === 1 ? "device" : "devices"}
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={fetchSessions}
              disabled={loading}
              className="h-7 px-2 text-xs"
            >
              <RefreshCw className={`h-3.5 w-3.5 mr-1 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            {otherSessionsCount > 0 && (
              <Button
                variant="destructive"
                size="sm"
                onClick={handleRevokeAll}
                disabled={revokingAll}
                className="h-7 px-2.5 text-xs"
              >
                <LogOut className="h-3.5 w-3.5 mr-1" />
                {revokingAll ? "Logging out..." : "Log Out Other Devices"}
              </Button>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-2">
          {sessions.map((session) => (
            <div
              key={session.uuid}
              className={`flex items-center justify-between p-3 rounded-lg border transition-colors ${
                session.isCurrent
                  ? "bg-emerald-50/40 dark:bg-emerald-950/20 border-emerald-500/30"
                  : "bg-muted/40 hover:bg-muted/60 border-border/70"
              }`}
            >
              <div className="flex items-center gap-3 min-w-0 pr-2">
                <div className="p-2 rounded-md bg-background border shadow-xs">
                  {renderDeviceIcon(session.deviceType)}
                </div>
                <div className="flex flex-col min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium truncate">
                      {session.deviceLabel}
                    </span>
                    {session.isCurrent && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-900/50 px-1.5 py-0.5 rounded-full shrink-0">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                        This Device
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                    <span>IP: {session.ip}</span>
                    <span>•</span>
                    <span>
                      {session.isCurrent
                        ? "Active now"
                        : `Active ${formatRelativeTime(session.lastActive, locale)}`}
                    </span>
                  </div>
                </div>
              </div>

              {!session.isCurrent && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleRevoke(session.uuid)}
                  disabled={revokingId === session.uuid}
                  className="h-8 text-xs text-destructive hover:text-destructive hover:bg-destructive/10 shrink-0"
                >
                  <Trash2 className="h-3.5 w-3.5 mr-1" />
                  {revokingId === session.uuid ? "Revoking..." : "Revoke"}
                </Button>
              )}
            </div>
          ))}

          {sessions.length === 0 && !loading && (
            <div className="text-center py-6 text-sm text-muted-foreground bg-muted/20 rounded-lg border border-dashed">
              No active sessions detected.
            </div>
          )}
        </div>
      </div>
    </SettingItem>
  )
}
