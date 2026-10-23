"use client"

import * as React from "react"
import { useState, useRef, useEffect, useMemo, useCallback } from "react"
import JSZip from "jszip"
import { toast } from "sonner"
import {
  AlertCircle,
  CheckCircle2,
  Download,
  FolderArchive,
  HardDriveDownload,
  Loader2,
  X,
  FileArchive,
} from "lucide-react"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { PhotoVo } from "@/server/entity/vo/photo"

export interface PhotoBatchDownloadDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  photos: PhotoVo[]
  selectedPhotoIds: string[]
  albumName?: string
  onSuccess?: () => void
}

type DownloadStatus = "idle" | "downloading" | "zipping" | "success" | "error"

function formatBytes(bytes: number, decimals = 1) {
  if (!bytes || bytes === 0) return "0 B"
  const k = 1024
  const dm = decimals < 0 ? 0 : decimals
  const sizes = ["B", "KB", "MB", "GB", "TB"]
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`
}

function getSafeArchiveName(albumName?: string) {
  const dateStr = new Date().toISOString().split("T")[0]
  if (albumName && albumName.trim()) {
    const sanitized = albumName.trim().replace(/[/\\?%*:|"<>]/g, "_")
    return `${sanitized}_export_${dateStr}.zip`
  }
  return `NayPict_batch_export_${dateStr}.zip`
}

export function PhotoBatchDownloadDialog({
  open,
  onOpenChange,
  photos,
  selectedPhotoIds,
  albumName,
  onSuccess,
}: PhotoBatchDownloadDialogProps) {
  const [status, setStatus] = useState<DownloadStatus>("idle")
  const [archiveName, setArchiveName] = useState<string>(() => getSafeArchiveName(albumName))
  const [downloadProgress, setDownloadProgress] = useState(0)
  const [zipProgress, setZipProgress] = useState(0)
  const [completedCount, setCompletedCount] = useState(0)
  const [currentFileName, setCurrentFileName] = useState("")
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [failedFiles, setFailedFiles] = useState<{ id: string; name: string; error: string }[]>([])

  const abortControllerRef = useRef<AbortController | null>(null)

  // Map selected IDs to available photo objects
  const targetPhotos = useMemo(() => {
    const photoMap = new Map<string, PhotoVo>()
    for (const p of photos) {
      photoMap.set(p.photoId, p)
    }

    return selectedPhotoIds.map((id) => {
      const found = photoMap.get(id)
      return (
        found || {
          photoId: id,
          name: `media_${id.slice(0, 8)}.jpg`,
          size: 0,
        }
      )
    })
  }, [photos, selectedPhotoIds])

  const totalEstimatedBytes = useMemo(() => {
    return targetPhotos.reduce((acc, curr) => acc + (curr.size || 0), 0)
  }, [targetPhotos])

  const resetState = useCallback(() => {
    setStatus("idle")
    setArchiveName(getSafeArchiveName(albumName))
    setDownloadProgress(0)
    setZipProgress(0)
    setCompletedCount(0)
    setCurrentFileName("")
    setErrorMessage(null)
    setFailedFiles([])
  }, [albumName])

  // Cleanup abort controller on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }
    }
  }, [])

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (!nextOpen) {
        if (abortControllerRef.current) {
          abortControllerRef.current.abort()
          abortControllerRef.current = null
        }
        resetState()
      }
      onOpenChange(nextOpen)
    },
    [onOpenChange, resetState]
  )

  const handleCancel = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
    }
    if (status === "downloading" || status === "zipping") {
      toast.info("Batch download canceled")
    }
    handleOpenChange(false)
  }, [status, handleOpenChange])

  const handleStartDownload = async () => {
    if (targetPhotos.length === 0) return

    const controller = new AbortController()
    abortControllerRef.current = controller
    const signal = controller.signal

    setStatus("downloading")
    setDownloadProgress(0)
    setZipProgress(0)
    setCompletedCount(0)
    setErrorMessage(null)
    setFailedFiles([])

    const zip = new JSZip()
    const usedNames = new Set<string>()

    function getUniqueFilename(rawName: string) {
      const clean = rawName.replace(/[/\\?%*:|"<>]/g, "_")
      if (!usedNames.has(clean)) {
        usedNames.add(clean)
        return clean
      }
      const extIndex = clean.lastIndexOf(".")
      const base = extIndex !== -1 ? clean.substring(0, extIndex) : clean
      const ext = extIndex !== -1 ? clean.substring(extIndex) : ""
      let counter = 1
      while (usedNames.has(`${base}_(${counter})${ext}`)) {
        counter++
      }
      const unique = `${base}_(${counter})${ext}`
      usedNames.add(unique)
      return unique
    }

    const CONCURRENCY = 3
    let index = 0
    let finishedCount = 0
    const totalCount = targetPhotos.length
    const failures: { id: string; name: string; error: string }[] = []

    async function worker() {
      while (index < totalCount) {
        if (signal.aborted) break
        const currentIndex = index++
        const item = targetPhotos[currentIndex]
        if (!item) break

        setCurrentFileName(item.name || `Photo #${currentIndex + 1}`)

        try {
          const res = await fetch(`/api/photo/download/${item.photoId}`, {
            signal,
          })

          if (!res.ok) {
            throw new Error(`Server returned HTTP ${res.status}`)
          }

          let resolvedFilename = item.name || `photo_${item.photoId}.jpg`
          const disp = res.headers.get("content-disposition")
          if (disp && disp.includes("filename=")) {
            const match = disp.match(/filename\*?=(?:UTF-8'')?"?([^";]+)"?/i)
            if (match && match[1]) {
              try {
                resolvedFilename = decodeURIComponent(match[1])
              } catch {
                resolvedFilename = match[1]
              }
            }
          }

          const blob = await res.blob()
          const uniqueFilename = getUniqueFilename(resolvedFilename)
          zip.file(uniqueFilename, blob)
        } catch (err: unknown) {
          if (signal.aborted) return
          const msg = err instanceof Error ? err.message : "Failed to download"
          failures.push({
            id: item.photoId,
            name: item.name || item.photoId,
            error: msg,
          })
        } finally {
          if (!signal.aborted) {
            finishedCount++
            setCompletedCount(finishedCount)
            setDownloadProgress(Math.round((finishedCount / totalCount) * 100))
          }
        }
      }
    }

    try {
      const workers = Array.from({ length: Math.min(CONCURRENCY, totalCount) }, () => worker())
      await Promise.all(workers)

      if (signal.aborted) return

      if (failures.length > 0) {
        setFailedFiles(failures)
      }

      if (Object.keys(zip.files).length === 0) {
        setStatus("error")
        setErrorMessage("Failed to download any media files. Please check network connection.")
        return
      }

      // Transition to Zipping phase
      setStatus("zipping")

      const zipBlob = await zip.generateAsync(
        {
          type: "blob",
          compression: "DEFLATE",
          compressionOptions: { level: 6 },
        },
        (metadata) => {
          setZipProgress(Math.round(metadata.percent))
        }
      )

      if (signal.aborted) return

      // Trigger automatic client download
      const safeDownloadName = archiveName.trim()
        ? archiveName.endsWith(".zip")
          ? archiveName
          : `${archiveName}.zip`
        : getSafeArchiveName(albumName)

      const downloadUrl = URL.createObjectURL(zipBlob)
      const downloadAnchor = document.createElement("a")
      downloadAnchor.href = downloadUrl
      downloadAnchor.download = safeDownloadName
      document.body.appendChild(downloadAnchor)
      downloadAnchor.click()
      document.body.removeChild(downloadAnchor)

      setTimeout(() => {
        URL.revokeObjectURL(downloadUrl)
      }, 10000)

      setStatus("success")
      toast.success(`Successfully packaged & downloaded ${finishedCount - failures.length} media files!`)
      onSuccess?.()
    } catch (err: unknown) {
      if (signal.aborted) return
      const msg = err instanceof Error ? err.message : "An unexpected error occurred during zip creation."
      setStatus("error")
      setErrorMessage(msg)
      toast.error("Batch download failed")
    }
  }

  const isWorking = status === "downloading" || status === "zipping"

  return (
    <Dialog open={open} onOpenChange={(next) => (isWorking ? undefined : handleOpenChange(next))}>
      <DialogContent className="max-w-md border-border/80 bg-background/95 backdrop-blur-xl shadow-2xl sm:rounded-2xl">
        <DialogHeader className="gap-2">
          <div className="flex items-center gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-sky-500/10 text-sky-500 border border-sky-500/20">
              <FolderArchive className="size-5" />
            </div>
            <div>
              <DialogTitle className="text-base font-semibold sm:text-lg">
                Batch Download (ZIP)
              </DialogTitle>
              <DialogDescription className="text-xs sm:text-sm text-muted-foreground">
                Package {targetPhotos.length} item{targetPhotos.length > 1 ? "s" : ""} with full original quality & EXIF metadata.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {status === "idle" && (
            <>
              <div className="rounded-xl border border-border/60 bg-muted/30 p-3.5 space-y-2 text-xs sm:text-sm">
                <div className="flex justify-between items-center text-foreground font-medium">
                  <span>Selected Media</span>
                  <span className="font-semibold text-primary">
                    {targetPhotos.length} item{targetPhotos.length > 1 ? "s" : ""}
                  </span>
                </div>
                {totalEstimatedBytes > 0 && (
                  <div className="flex justify-between items-center text-muted-foreground text-xs">
                    <span>Estimated Size</span>
                    <span>~{formatBytes(totalEstimatedBytes)}</span>
                  </div>
                )}
                <div className="flex justify-between items-center text-muted-foreground text-xs">
                  <span>Access Level</span>
                  <span className="text-emerald-500 font-medium">Admin (Full Metadata)</span>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="archive-name" className="text-xs font-medium text-foreground">
                  Archive File Name
                </Label>
                <div className="relative">
                  <Input
                    id="archive-name"
                    value={archiveName}
                    onChange={(e) => setArchiveName(e.target.value)}
                    placeholder="NayPict_batch_export.zip"
                    className="pr-10 text-xs sm:text-sm h-9"
                  />
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                    <FileArchive className="size-4" />
                  </div>
                </div>
              </div>
            </>
          )}

          {status === "downloading" && (
            <div className="space-y-3 py-2">
              <div className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-1.5 font-medium text-foreground">
                  <HardDriveDownload className="size-3.5 text-sky-500 animate-bounce" />
                  Downloading media...
                </span>
                <span className="font-semibold text-sky-500">{downloadProgress}%</span>
              </div>
              <Progress value={downloadProgress} className="h-2" />
              <div className="flex items-center justify-between text-[11px] text-muted-foreground truncate">
                <span className="truncate max-w-[240px]">
                  {currentFileName || "Fetching files..."}
                </span>
                <span>
                  {completedCount} / {targetPhotos.length}
                </span>
              </div>
            </div>
          )}

          {status === "zipping" && (
            <div className="space-y-3 py-2">
              <div className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-1.5 font-medium text-foreground">
                  <Loader2 className="size-3.5 text-amber-500 animate-spin" />
                  Compressing ZIP archive...
                </span>
                <span className="font-semibold text-amber-500">{zipProgress}%</span>
              </div>
              <Progress value={zipProgress} className="h-2" />
              <p className="text-[11px] text-muted-foreground text-center">
                Packing original media into compressed ZIP archive. Almost ready...
              </p>
            </div>
          )}

          {status === "success" && (
            <div className="flex flex-col items-center justify-center py-4 text-center space-y-2">
              <div className="flex size-12 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 animate-in zoom-in-75">
                <CheckCircle2 className="size-6" />
              </div>
              <h3 className="text-sm font-semibold text-foreground">Download Ready!</h3>
              <p className="text-xs text-muted-foreground max-w-xs">
                Your ZIP archive has been generated and sent to your browser downloads.
              </p>
              {failedFiles.length > 0 && (
                <div className="w-full text-left rounded-lg bg-red-500/10 border border-red-500/20 p-2.5 mt-2 text-[11px] text-red-400">
                  <span className="font-semibold">{failedFiles.length} file(s) failed:</span>
                  <ul className="list-disc pl-4 mt-1 space-y-0.5">
                    {failedFiles.map((f) => (
                      <li key={f.id} className="truncate">
                        {f.name}: {f.error}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {status === "error" && (
            <div className="flex flex-col items-center justify-center py-3 text-center space-y-2 text-destructive">
              <AlertCircle className="size-8" />
              <h3 className="text-sm font-semibold">Batch Download Failed</h3>
              <p className="text-xs text-muted-foreground max-w-xs">
                {errorMessage || "Unable to package photos. Please check your network connection and try again."}
              </p>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          {status === "idle" && (
            <>
              <Button variant="ghost" size="sm" onClick={() => handleOpenChange(false)} className="text-xs">
                Cancel
              </Button>
              <Button
                variant="default"
                size="sm"
                onClick={handleStartDownload}
                className="gap-1.5 text-xs bg-sky-500 hover:bg-sky-600 text-white font-medium"
              >
                <Download className="size-3.5" />
                Start Download ({targetPhotos.length})
              </Button>
            </>
          )}

          {isWorking && (
            <Button variant="outline" size="sm" onClick={handleCancel} className="w-full text-xs">
              <X className="size-3.5 mr-1" /> Cancel Download
            </Button>
          )}

          {(status === "success" || status === "error") && (
            <Button
              variant="default"
              size="sm"
              onClick={() => handleOpenChange(false)}
              className="w-full text-xs"
            >
              Close
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
