"use client"

import { useEffect, useState } from "react"
import {
  Laptop,
  Smartphone,
  Tablet,
  MapPin,
  Clock,
  LogOut,
  Shield,
  History,
  CheckCircle2,
  XCircle,
  LoaderCircle,
  RefreshCw,
} from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { getActiveSessions, getLoginLogs, revokeSession } from "@/request/login-log"
import { type ActiveSessionVo, type LoginLogItemVo } from "@/server/entity/vo/login-log"

export function LoginSessionsCard() {
  const [activeTab, setActiveTab] = useState<"sessions" | "history">("sessions")
  const [sessions, setSessions] = useState<ActiveSessionVo[]>([])
  const [logs, setLogs] = useState<LoginLogItemVo[]>([])
  const [loading, setLoading] = useState(true)
  const [revokingUuid, setRevokingUuid] = useState<string | null>(null)

  useEffect(() => {
    fetchData()
  }, [])

  function fetchData() {
    setLoading(true)
    Promise.all([getActiveSessions(), getLoginLogs()])
      .then(([sessionRes, logRes]) => {
        if (sessionRes) setSessions(sessionRes)
        if (logRes) setLogs(logRes)
      })
      .catch((err: Error) => {
        console.error("Failed to fetch login sessions/logs:", err)
      })
      .finally(() => {
        setLoading(false)
      })
  }

  function handleRevokeSession(uuid: string) {
    if (!confirm("Apakah Anda yakin ingin mengeluarkan sesi login ini? Sesi perangkat tersebut akan langsung terputus.")) return

    setRevokingUuid(uuid)
    revokeSession(uuid)
      .then(() => {
        toast.success("Sesi berhasil dikeluarkan / di-logout")
        fetchData()
      })
      .catch((err: Error) => {
        toast.error("Gagal mengeluarkan sesi: " + (err?.message || "Error server"))
      })
      .finally(() => {
        setRevokingUuid(null)
      })
  }

  function getDeviceIcon(device: string) {
    const d = device.toLowerCase()
    if (d.includes("mobile") || d.includes("phone")) return <Smartphone className="size-4 text-purple-500" />
    if (d.includes("tablet") || d.includes("ipad")) return <Tablet className="size-4 text-indigo-500" />
    return <Laptop className="size-4 text-blue-500" />
  }

  function formatDate(dateStr: string) {
    if (!dateStr) return "-"
    try {
      const d = new Date(dateStr)
      return d.toLocaleString("id-ID", {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      })
    } catch {
      return dateStr
    }
  }

  return (
    <div className="w-full flex flex-col gap-4 pt-6 border-t mt-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Shield className="size-5 text-purple-600" />
            Sesi Login Aktif & Riwayat Log Login
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Pantau perangkat yang sedang login dan riwayat akses akun Admin (Perangkat, IP Address, Lokasi, dan Waktu)
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={fetchData}
          disabled={loading}
          className="shrink-0"
        >
          <RefreshCw className={`size-3.5 mr-1.5 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      <div className="flex items-center gap-1 p-1 bg-muted/60 rounded-lg w-fit border">
        <Button
          type="button"
          variant={activeTab === "sessions" ? "secondary" : "ghost"}
          size="sm"
          onClick={() => setActiveTab("sessions")}
          className="text-xs h-7 px-3 flex items-center gap-1.5"
        >
          <Laptop className="size-3.5" />
          Sesi Aktif ({sessions.length})
        </Button>
        <Button
          type="button"
          variant={activeTab === "history" ? "secondary" : "ghost"}
          size="sm"
          onClick={() => setActiveTab("history")}
          className="text-xs h-7 px-3 flex items-center gap-1.5"
        >
          <History className="size-3.5" />
          Riwayat Log ({logs.length})
        </Button>
      </div>

      {activeTab === "sessions" && (
        <div className="mt-2">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <LoaderCircle className="size-6 animate-spin text-muted-foreground" />
            </div>
          ) : sessions.length === 0 ? (
            <div className="text-center py-8 text-xs text-muted-foreground border rounded-lg bg-muted/20">
              Tidak ada sesi aktif terdeteksi.
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {sessions.map((sess) => (
                <div
                  key={sess.logId || sess.uuid}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-xl border bg-card/60 hover:bg-card transition-colors shadow-xs"
                >
                  <div className="flex items-start gap-3">
                    <div className="p-2.5 rounded-lg bg-muted/60 shrink-0 mt-0.5">
                      {getDeviceIcon(sess.device)}
                    </div>
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-sm text-foreground">
                          {sess.browser || "Browser"} di {sess.os || "OS"} ({sess.device})
                        </span>
                        {sess.isCurrent ? (
                          <Badge className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20 border-emerald-500/30 text-[10px] px-2 py-0">
                            Perangkat Ini
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-[10px] px-2 py-0">
                            Aktif
                          </Badge>
                        )}
                      </div>

                      <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
                        <span className="flex items-center gap-1 font-mono">
                          IP: {sess.ip}
                        </span>
                        <span className="flex items-center gap-1">
                          <MapPin className="size-3 text-muted-foreground" />
                          {sess.location || "Lokasi Tidak Diketahui"}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="size-3 text-muted-foreground" />
                          {formatDate(sess.loginTime)}
                        </span>
                      </div>
                    </div>
                  </div>

                  {!sess.isCurrent && (
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      onClick={() => handleRevokeSession(sess.uuid)}
                      disabled={revokingUuid === sess.uuid}
                      className="shrink-0 self-end sm:self-center text-xs"
                    >
                      {revokingUuid === sess.uuid ? (
                        <LoaderCircle className="size-3.5 animate-spin mr-1" />
                      ) : (
                        <LogOut className="size-3.5 mr-1" />
                      )}
                      Keluarkan Sesi
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === "history" && (
        <div className="mt-2">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <LoaderCircle className="size-6 animate-spin text-muted-foreground" />
            </div>
          ) : logs.length === 0 ? (
            <div className="text-center py-8 text-xs text-muted-foreground border rounded-lg bg-muted/20">
              Belum ada riwayat log login tercatat.
            </div>
          ) : (
            <div className="rounded-xl border overflow-hidden bg-card/60">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-muted/50 border-b font-medium text-muted-foreground">
                    <tr>
                      <th className="p-3">Waktu Login</th>
                      <th className="p-3">Perangkat & Browser</th>
                      <th className="p-3">IP Address</th>
                      <th className="p-3">Lokasi</th>
                      <th className="p-3">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {logs.map((log) => (
                      <tr key={log.logId} className="hover:bg-muted/30 transition-colors">
                        <td className="p-3 font-mono whitespace-nowrap text-muted-foreground">
                          {formatDate(log.loginTime)}
                        </td>
                        <td className="p-3">
                          <div className="flex items-center gap-2">
                            {getDeviceIcon(log.device)}
                            <span className="font-medium text-foreground">
                              {log.browser} / {log.os}
                            </span>
                          </div>
                        </td>
                        <td className="p-3 font-mono">{log.ip}</td>
                        <td className="p-3">
                          <div className="flex items-center gap-1.5">
                            <MapPin className="size-3 text-muted-foreground shrink-0" />
                            <span>{log.location || "Lokasi Tidak Diketahui"}</span>
                          </div>
                        </td>
                        <td className="p-3">
                          {log.isRevoked ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-600 dark:text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/20">
                              <XCircle className="size-3" />
                              Dikeluarkan
                            </span>
                          ) : log.status === 1 ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                              <CheckCircle2 className="size-3" />
                              Sukses
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-rose-600 dark:text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded-full border border-rose-500/20">
                              <XCircle className="size-3" />
                              Gagal
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
