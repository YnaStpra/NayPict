"use client"

import { useEffect, useState } from "react"
import { Database, Download, Lock, RefreshCw, HardDrive, ShieldCheck, KeyRound } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { SettingItem } from "@/components/setting/setting-item"
import { downloadEncryptedBackup, getBackupStats } from "@/request/backup"
import { type DatabaseStatsVo } from "@/server/service/backup-service"
import { formatRelativeTime } from "@/lib/date"
import { useLocale } from "next-intl"

export function DatabaseBackupCard() {
  const locale = useLocale()
  // stats: Stores SQLite database metrics (size, last modified)
  const [stats, setStats] = useState<DatabaseStatsVo | null>(null)
  // loadingStats: Indicates stats fetching is in progress
  const [loadingStats, setLoadingStats] = useState(true)
  // password: User-entered encryption password for AES-256-GCM snapshot
  const [password, setPassword] = useState("")
  // downloading: Indicates encrypted backup generation & download in progress
  const [downloading, setDownloading] = useState(false)

  // Fetch SQLite database file metrics from backend
  function fetchStats() {
    setLoadingStats(true)
    getBackupStats()
      .then((res) => {
        if (res) setStats(res)
      })
      .catch((err) => {
        console.warn("Failed to load database stats:", err)
      })
      .finally(() => {
        setLoadingStats(false)
      })
  }

  useEffect(() => {
    fetchStats()
  }, [])

  // Trigger encrypted backup creation and browser download
  async function handleDownloadBackup() {
    setDownloading(true)
    try {
      await downloadEncryptedBackup(password.trim() || undefined)
      toast.success("Encrypted database backup downloaded successfully!")
      setPassword("")
      fetchStats()
    } catch (err: any) {
      toast.error(err?.message || "Failed to export database backup")
    } finally {
      setDownloading(false)
    }
  }

  return (
    <SettingItem
      title="Database Backup & Disaster Recovery"
      description="Create encrypted AES-256-GCM snapshots of your SQLite database to protect against data loss."
    >
      <div className="w-full flex flex-col gap-3">
        {/* Database Metric Badges */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <div className="flex items-center gap-2.5 p-2.5 rounded-lg border bg-muted/30">
            <HardDrive className="h-4 w-4 text-emerald-500 shrink-0" />
            <div className="flex flex-col min-w-0">
              <span className="text-[11px] text-muted-foreground">Database Location</span>
              <span className="text-xs font-semibold truncate font-mono">data/naypict.sqlite</span>
            </div>
          </div>

          <div className="flex items-center gap-2.5 p-2.5 rounded-lg border bg-muted/30">
            <Database className="h-4 w-4 text-sky-500 shrink-0" />
            <div className="flex flex-col min-w-0">
              <span className="text-[11px] text-muted-foreground">Size on Disk</span>
              <span className="text-xs font-semibold truncate">
                {loadingStats ? "Checking..." : stats?.sizeFormatted || "0 B"}
                {stats?.lastModified ? (
                  <span className="text-[10px] text-muted-foreground font-normal ml-1.5">
                    (Updated {formatRelativeTime(stats.lastModified, locale)})
                  </span>
                ) : null}
              </span>
            </div>
          </div>
        </div>

        {/* Encryption Password & Action */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 pt-1">
          <div className="relative flex-1">
            <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              type="password"
              placeholder="Custom backup password (optional)"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={downloading}
              className="pl-9 text-xs h-9"
            />
          </div>

          <Button
            type="button"
            onClick={handleDownloadBackup}
            disabled={downloading}
            className="h-9 px-4 text-xs font-medium shrink-0"
          >
            <Download className={`h-3.5 w-3.5 mr-1.5 ${downloading ? "animate-bounce" : ""}`} />
            {downloading ? "Encrypting & Exporting..." : "Export Encrypted Backup"}
          </Button>
        </div>

        <p className="text-[11px] text-muted-foreground">
          🔒 Backups are compressed with gzip and encrypted with military-grade AES-256-GCM. If no custom password is provided, your server&apos;s master key is used.
        </p>
      </div>
    </SettingItem>
  )
}
