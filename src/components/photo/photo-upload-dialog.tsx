"use client"

import { useEffect, useRef, useState, type ChangeEvent } from "react"
import { CheckIcon, CircleAlertIcon, PlusIcon, SettingsIcon, Trash2Icon, CopyIcon, ShieldAlertIcon, CheckCircle2Icon, Loader2, UploadCloud, X } from "lucide-react"
import { toast } from "sonner"
import { sha1 } from "hash-wasm"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { PhotoUploadSettings, readPhotoUploadSettings } from "@/components/photo/photo-upload-settings"
import { createPhotoCover } from "@/lib/upload-cover"
import { compressImageFile } from "@/lib/image-compress"
import { useStorageStore } from "@/store/storage-store"
import { usePhotoStore } from "@/store/photo-store"
import { photoExists, photoRecycle } from "@/request/photo"
import { albumAddPhoto } from "@/request/album"
import { storageSelect } from "@/request/storage"
import { type PhotoAddResultVo, type PhotoVo } from "@/server/entity/vo/photo"
import { useTranslations } from "next-intl"

type UploadStatus = "new" | "waiting" | "uploading" | "success" | "failed" | "skipped"

interface UploadPreview {
  id: string
  file: File
  cover: string
  status: UploadStatus
  progress: number
  albumId?: string
}

interface DuplicateReviewPair {
  id: string
  uploadPreview: UploadPreview
  existingPhoto?: PhotoVo | null
  uploadedPhoto?: PhotoVo | null
  photoId?: string | null
}

// Format photo size helper
function formatPhotoSize(size: number) {
  if (size < 1024) return `${size}B`
  if (size < 1024 * 1024) return `${Math.round(size / 1024)}KB`
  return `${(size / 1024 / 1024).toFixed(1)}MB`
}

let uploadItemCounter = 0

function createUploadItemId(file: File): string {
  uploadItemCounter += 1
  return `${file.name}-${file.size}-${file.lastModified}-${uploadItemCounter}`
}

// Calculate browser SHA-1 Checksum using Web Crypto API with hash-wasm fallback
async function getFileChecksum(file: File): Promise<string> {
  try {
    const buffer = await file.arrayBuffer()
    if (typeof crypto !== "undefined" && crypto.subtle) {
      const hashBuffer = await crypto.subtle.digest("SHA-1", buffer)
      const hashArray = Array.from(new Uint8Array(hashBuffer))
      return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("")
    }
    return await sha1(new Uint8Array(buffer))
  } catch (err) {
    console.warn("Checksum calculation fallback:", err)
    return `${file.name}-${file.size}-${file.lastModified}`
  }
}

function getUploadErrorMessage(xhr: XMLHttpRequest): string {
  const xml = xhr.responseXML
  if (xml) {
    const messageNode = xml.querySelector("Message")
    if (messageNode?.textContent) {
      return messageNode.textContent
    }
  }

  try {
    const json = JSON.parse(xhr.responseText)
    if (json.message) {
      return json.message
    }
  } catch {
    // Ignore JSON error
  }

  return xhr.statusText || "Upload failed"
}

function uploadPhotoAdd(
  formData: FormData,
  onProgress?: (progress: number) => void,
  onAbort?: (abort: () => void) => void
): Promise<PhotoAddResultVo> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest()

    request.upload.onprogress = (event) => {
      if (!event.lengthComputable) return
      onProgress?.(Math.round((event.loaded / event.total) * 100))
    }

    request.onload = () => {
      if (request.status < 200 || request.status >= 300) {
        reject(new Error(getUploadErrorMessage(request)))
        return
      }

      try {
        const result = JSON.parse(request.responseText)
        if (result.code !== 200) {
          reject(new Error(result.message || "Upload failed"))
          return
        }
        resolve(result.data)
      } catch (err) {
        reject(err)
      }
    }

    request.onerror = () => reject(new Error("Network error during upload"))
    request.open("POST", "/api/photo/add")
    request.withCredentials = true
    onAbort?.(() => request.abort())
    request.send(formData)
  })
}

export function PhotoUploadDialog() {
  const t = useTranslations("photos.upload")
  const fileInputRef = useRef<HTMLInputElement>(null)
  const previewsRef = useRef<UploadPreview[]>([])
  const uploadQueueRef = useRef<UploadPreview[]>([])
  const uploadingRef = useRef(false)
  const activeCountRef = useRef(0)
  const abortMapRef = useRef<Map<string, () => void>>(new Map())
  const pausedRef = useRef(false)
  const uploadStorageIdRef = useRef<string | null>(null)

  // Track detected duplicate pairs during upload batch
  const detectedDuplicatesRef = useRef<DuplicateReviewPair[]>([])

  const [previews, setPreviewsState] = useState<UploadPreview[]>([])
  const [uploading, setUploading] = useState(false)
  const [storageId, setStorageId] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)

  // Duplicate Review Modal States
  const [duplicatePairs, setDuplicatePairs] = useState<DuplicateReviewPair[]>([])
  const [showDuplicateModal, setShowDuplicateModal] = useState<boolean>(false)

  const storages = useStorageStore((state) => state.storages)
  const open = usePhotoStore((state) => state.uploadOpen)
  const uploadAlbumId = usePhotoStore((state) => state.uploadAlbumId)
  const closeUpload = usePhotoStore((state) => state.closeUpload)
  const addUploadedPhoto = usePhotoStore((state) => state.addUploadedPhoto)
  const selectedStorageId = storageId ?? storages[0]?.storageId ?? null

  // Ensure storage list is available when upload modal opens
  useEffect(() => {
    if (open && storages.length === 0) {
      void storageSelect().then((res) => {
        if (res && res.length > 0) {
          useStorageStore.getState().setStorages(res)
        }
      })
    }
  }, [open, storages.length])

  useEffect(() => {
    return () => {
      previewsRef.current.forEach((preview) => URL.revokeObjectURL(preview.cover))
    }
  }, [])

  function setPreviews(next: UploadPreview[] | ((prev: UploadPreview[]) => UploadPreview[])) {
    if (typeof next === "function") {
      setPreviewsState((prev) => {
        const computed = next(prev)
        previewsRef.current = computed
        return computed
      })
    } else {
      previewsRef.current = next
      setPreviewsState(next)
    }
  }

  function openFilePicker() {
    fileInputRef.current?.click()
  }

  function resetUpload() {
    previewsRef.current.forEach((preview) => URL.revokeObjectURL(preview.cover))
    uploadQueueRef.current = []
    detectedDuplicatesRef.current = []
    uploadingRef.current = false
    setUploading(false)
    activeCountRef.current = 0
    abortMapRef.current.clear()
    pausedRef.current = false
    uploadStorageIdRef.current = null
    setPreviews([])
  }

  function removePreview(id: string) {
    if (uploadingRef.current) return
    const item = previewsRef.current.find((p) => p.id === id)
    if (item) {
      URL.revokeObjectURL(item.cover)
    }
    setPreviews((prev) => prev.filter((p) => p.id !== id))
  }

  function handleOpenChange(next: boolean) {
    if (uploadingRef.current) {
      toast.warning("Upload sedang berlangsung...")
      return
    }

    if (!next) {
      resetUpload()
      closeUpload()
    }
  }

  function pauseUpload() {
    pausedRef.current = true
    const abortingIds = new Set(abortMapRef.current.keys())
    abortMapRef.current.forEach((abort) => abort())
    abortMapRef.current.clear()
    uploadQueueRef.current = []

    const nextPreviews = previewsRef.current.map((preview) => {
      if (preview.status === "waiting" || (preview.status === "uploading" && abortingIds.has(preview.id))) {
        return { ...preview, progress: 0, status: "new" as UploadStatus }
      }
      return preview
    })

    setPreviews(nextPreviews)
    uploadingRef.current = false
    setUploading(false)
  }

  async function addFilesToPreviews(files: File[]) {
    if (!files.length) return

    const newItems: UploadPreview[] = []

    for (const file of files) {
      try {
        const cover = await createPhotoCover(file)
        newItems.push({
          id: createUploadItemId(file),
          file,
          cover,
          status: "new",
          progress: 0,
          albumId: uploadAlbumId ?? undefined,
        })
      } catch (err) {
        console.warn("Cover creation fallback for file:", file.name, err)
        newItems.push({
          id: createUploadItemId(file),
          file,
          cover: URL.createObjectURL(file),
          status: "new",
          progress: 0,
          albumId: uploadAlbumId ?? undefined,
        })
      }
    }

    const nextPreviews = [...previewsRef.current, ...newItems]
    setPreviews(nextPreviews)

    if (fileInputRef.current) fileInputRef.current.value = ""

    if (uploadingRef.current) {
      const newItemsWaiting = newItems.map((p) => ({ ...p, status: "waiting" as UploadStatus }))
      uploadQueueRef.current.push(...newItemsWaiting)
      const newIds = new Set(newItemsWaiting.map((p) => p.id))
      setPreviews((prev) => prev.map((p) => (newIds.has(p.id) ? { ...p, status: "waiting" } : p)))
      runNext()
    }
  }

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? [])
    await addFilesToPreviews(files)
  }

  function enqueueUploadItems(): number {
    const uploadList = previewsRef.current.filter((preview) => (
      preview.status === "new" || preview.status === "failed"
    ))

    if (!uploadList.length) return 0

    const uploadIds = new Set(uploadList.map((preview) => preview.id))
    uploadStorageIdRef.current = selectedStorageId
    uploadQueueRef.current.push(...uploadList)

    setPreviews(previewsRef.current.map((preview) => (
      uploadIds.has(preview.id)
        ? { ...preview, status: "waiting", progress: 0 }
        : preview
    )))

    return uploadList.length
  }

  async function uploadPhoto(preview: UploadPreview) {
    const currentStorageId = uploadStorageIdRef.current || selectedStorageId

    setPreviews((prev) => prev.map((p) => (
      p.id === preview.id ? { ...p, progress: 0, status: "uploading" } : p
    )))

    const item = previewsRef.current.find((p) => p.id === preview.id) ?? preview

    try {
      const uploadSettings = readPhotoUploadSettings()
      let fileToUpload = item.file

      if (uploadSettings.compressImage) {
        fileToUpload = await compressImageFile(item.file, {
          maxDimension: 3840,
          quality: 0.85,
        })
      }

      const checksum = await getFileChecksum(fileToUpload)
      const existsResult = await photoExists({ checksum, name: fileToUpload.name })

      if (existsResult.duplicate) {
        const dupPhotoId = existsResult.photoId
        if (item.albumId && dupPhotoId) {
          await albumAddPhoto({ albumIds: [item.albumId], photoIds: [dupPhotoId] })
          toast.success("Foto sudah ada di galeri, otomatis ditautkan ke album!")
        }

        // Record duplicate pair for end-of-upload review modal
        detectedDuplicatesRef.current.push({
          id: item.id,
          uploadPreview: item,
          existingPhoto: null,
          photoId: dupPhotoId ?? null,
        })

        setPreviews((prev) => prev.map((p) => (
          p.id === item.id ? { ...p, progress: 100, status: "skipped" } : p
        )))
        return
      }

      if (pausedRef.current) {
        setPreviews((prev) => prev.map((p) => (
          p.id === item.id ? { ...p, progress: 0, status: "new" } : p
        )))
        return
      }

      const formData = new FormData()
      if (currentStorageId) {
        formData.set("storageId", currentStorageId)
      }
      formData.set("file", fileToUpload)
      formData.set("lastModified", String(item.file.lastModified))
      formData.set("allowDownload", String(uploadSettings.allowDownload))
      if (item.albumId) {
        formData.set("albumId", item.albumId)
      }

      const result = await uploadPhotoAdd(
        formData,
        (progress) => {
          setPreviews((prev) => prev.map((p) => (
            p.id === item.id ? { ...p, progress } : p
          )))
        },
        (abort) => abortMapRef.current.set(preview.id, abort)
      )

      if (result.duplicate) {
        if (result.photo && item.albumId) {
          addUploadedPhoto(result.photo, item.albumId)
        }

        detectedDuplicatesRef.current.push({
          id: item.id,
          uploadPreview: item,
          existingPhoto: result.photo ?? null,
          uploadedPhoto: result.photo ?? null,
          photoId: result.photo?.photoId ?? null,
        })

        setPreviews((prev) => prev.map((p) => (
          p.id === item.id ? { ...p, progress: 100, status: "skipped" } : p
        )))
        return
      }

      if (result.photo) {
        addUploadedPhoto(result.photo, item.albumId ?? null)
      }

      setPreviews((prev) => prev.map((p) => (
        p.id === item.id ? { ...p, progress: 100, status: "success" } : p
      )))

    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return
      const errMsg = error instanceof Error ? error.message : "Upload gagal"
      toast.error(errMsg)

      if (readPhotoUploadSettings().retryOnFail) {
        uploadQueueRef.current.push(item)
        setPreviews((prev) => prev.map((p) => (
          p.id === item.id ? { ...p, progress: 0, status: "waiting" } : p
        )))
        return
      }

      setPreviews((prev) => prev.map((p) => (
        p.id === item.id ? { ...p, progress: 100, status: "failed" } : p
      )))
    } finally {
      abortMapRef.current.delete(preview.id)
    }
  }

  function runNext() {
    if (pausedRef.current) return

    if (!uploadQueueRef.current.length && activeCountRef.current === 0) {
      uploadingRef.current = false
      setUploading(false)

      const successCount = previewsRef.current.filter((p) => p.status === "success").length
      if (successCount > 0) {
        toast.success(`Upload selesai: ${successCount} foto berhasil diunggah!`)
      }

      // Open Duplicate Review Dialog if duplicates were detected during batch upload
      if (detectedDuplicatesRef.current.length > 0) {
        const dups = [...detectedDuplicatesRef.current]
        setDuplicatePairs(dups)
        setShowDuplicateModal(true)
        toast.warning(`Terdeteksi ${dups.length} foto duplikat. Silakan tentukan tindakan di bawah!`)
      }
      return
    }

    uploadingRef.current = true
    setUploading(true)
    const concurrency = readPhotoUploadSettings().concurrency

    while (activeCountRef.current < concurrency && uploadQueueRef.current.length) {
      const preview = uploadQueueRef.current.shift()
      if (!preview) continue

      activeCountRef.current += 1
      uploadPhoto(preview).finally(() => {
        activeCountRef.current -= 1
        runNext()
      })
    }
  }

  function startUpload() {
    if (process.env.NEXT_PUBLIC_DEMO_USERNAME && previewsRef.current.length > 0) {
      toast.error("The application is running in read-only mode.")
      return
    }

    if (!selectedStorageId && storages.length === 0) {
      toast.error(t("invalidStorage"))
      return
    }

    pausedRef.current = false
    uploadStorageIdRef.current = selectedStorageId
    detectedDuplicatesRef.current = []
    const count = enqueueUploadItems()

    if (!count && uploadingRef.current) return
    runNext()
  }

  function handleUploadAction() {
    if (uploading) {
      pauseUpload()
      return
    }
    startUpload()
  }

  // Duplicate Review Decision Handlers
  const handleKeepPair = (pairId: string) => {
    setDuplicatePairs((prev) => prev.filter((p) => p.id !== pairId))
    toast.success("Foto duplikat dibiarkan tetap ada di galeri.")
  }

  const handleDeleteNewDuplicatePair = async (pair: DuplicateReviewPair) => {
    try {
      const pId = pair.photoId || pair.uploadedPhoto?.photoId
      if (pId) {
        await photoRecycle({ photoIds: [pId] })
      }
      setDuplicatePairs((prev) => prev.filter((p) => p.id !== pair.id))
      toast.success("Foto duplikat baru berhasil dipindahkan ke Tong Sampah.")
    } catch {
      toast.error("Gagal menghapus foto duplikat.")
    }
  }

  const handleKeepAllDuplicates = () => {
    setDuplicatePairs([])
    setShowDuplicateModal(false)
    toast.success("Semua foto duplikat dibiarkan tetap ada.")
  }

  const handleDeleteAllDuplicates = async () => {
    try {
      const photoIdsToDelete = duplicatePairs
        .map((p) => p.photoId || p.uploadedPhoto?.photoId)
        .filter((id): id is string => Boolean(id))

      if (photoIdsToDelete.length > 0) {
        await photoRecycle({ photoIds: photoIdsToDelete })
      }
      setDuplicatePairs([])
      setShowDuplicateModal(false)
      toast.success(`Berhasil menghapus ${photoIdsToDelete.length} foto duplikat baru!`)
    } catch {
      toast.error("Gagal menghapus foto duplikat massal.")
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="grid h-[85vh] max-h-[760px] min-h-0 grid-rows-[auto_minmax(0,1fr)_auto] sm:max-w-2xl p-6">
          <DialogHeader>
            <div className="flex items-center gap-2">
              <UploadCloud className="size-5 text-primary" />
              <DialogTitle className="text-lg font-bold">{t("title")}</DialogTitle>
            </div>
            <DialogDescription className="text-xs text-muted-foreground">
              Pilih atau seret foto ke dalam area ini untuk mengunggah ke galeri.
            </DialogDescription>
          </DialogHeader>

          {/* Upload Drop Zone & Preview Grid */}
          <div
            className={`relative min-h-0 overflow-y-auto rounded-xl border-2 border-dashed p-3 transition-colors ${
              isDragging
                ? "border-primary bg-primary/5"
                : "border-border/60 bg-muted/20 hover:border-border"
            }`}
            onDragOver={(e) => {
              e.preventDefault()
              e.stopPropagation()
              setIsDragging(true)
            }}
            onDragLeave={(e) => {
              e.preventDefault()
              e.stopPropagation()
              setIsDragging(false)
            }}
            onDrop={async (e) => {
              e.preventDefault()
              e.stopPropagation()
              setIsDragging(false)
              const files = Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith("image/"))
              if (files.length > 0) {
                await addFilesToPreviews(files)
              }
            }}
          >
            <div className="grid grid-cols-3 sm:grid-cols-4 content-start gap-2.5">
              {previews.map((preview) => (
                <div
                  key={preview.id}
                  className="group relative aspect-square w-full overflow-hidden rounded-xl bg-muted border border-border/60 shadow-2xs"
                >
                  <img
                    src={preview.cover}
                    alt={preview.file.name}
                    decoding="async"
                    loading="lazy"
                    className="h-full w-full object-cover"
                  />

                  {/* Dark Progress Overlay */}
                  {preview.status === "uploading" && (
                    <div
                      className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center text-white gap-1"
                    >
                      <Loader2 className="size-5 animate-spin text-primary" />
                      <span className="text-[11px] font-bold">{preview.progress}%</span>
                    </div>
                  )}

                  {/* Waiting Queue Overlay */}
                  {preview.status === "waiting" && (
                    <div className="absolute inset-0 bg-black/40 flex items-center justify-center text-white text-[10px] font-semibold">
                      Antrean...
                    </div>
                  )}

                  {/* Delete Button (Pre-upload) */}
                  {!uploading && preview.status === "new" && (
                    <button
                      type="button"
                      onClick={() => removePreview(preview.id)}
                      className="absolute top-1 right-1 flex size-6 items-center justify-center rounded-full bg-black/60 text-white hover:bg-destructive transition-colors opacity-80 group-hover:opacity-100 cursor-pointer"
                      title="Hapus foto"
                    >
                      <X className="size-3.5" />
                    </button>
                  )}

                  {/* Status Badges */}
                  {preview.status === "success" && (
                    <div className="absolute right-1 bottom-1 flex size-5 items-center justify-center rounded-full bg-emerald-500 text-white shadow-xs">
                      <CheckIcon className="size-3.5" />
                    </div>
                  )}
                  {preview.status === "failed" && (
                    <div className="absolute right-1 bottom-1 flex size-5 items-center justify-center rounded-full bg-destructive text-white shadow-xs">
                      <CircleAlertIcon className="size-3.5" />
                    </div>
                  )}
                  {preview.status === "skipped" && (
                    <div
                      className="absolute right-1 bottom-1 flex size-5 items-center justify-center rounded-full bg-amber-500 text-white shadow-xs"
                      title="Foto duplikat terdeteksi"
                    >
                      <CopyIcon className="size-3.5" />
                    </div>
                  )}
                </div>
              ))}

              {/* Add More Photos Card Button */}
              <button
                type="button"
                className="flex aspect-square w-full flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-border/80 bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground hover:border-primary/50 transition-all cursor-pointer select-none"
                onClick={openFilePicker}
              >
                <PlusIcon className="size-6" />
                <span className="text-[11px] font-medium">Tambah Foto</span>
              </button>
            </div>
          </div>

          <DialogFooter className="flex-row items-center justify-between gap-3 sm:justify-between pt-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={handleFileChange}
            />
            <div className="flex items-center gap-2">
              <Select
                value={selectedStorageId ?? undefined}
                onValueChange={setStorageId}
                disabled={uploading}
              >
                <SelectTrigger className="w-40 h-9 text-xs">
                  <SelectValue placeholder={t("selectStorage")} />
                </SelectTrigger>
                <SelectContent>
                  {storages.map((storage) => (
                    <SelectItem key={storage.storageId} value={storage.storageId} className="text-xs">
                      {storage.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Popover>
                <PopoverTrigger asChild>
                  <Button type="button" variant="ghost" size="icon" aria-label="Upload settings" className="size-9">
                    <SettingsIcon className="size-4" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent side="top" align="start" className="w-64">
                  <PhotoUploadSettings onChange={runNext} />
                </PopoverContent>
              </Popover>
            </div>

            <div className="flex items-center gap-2">
              {!uploading && previews.length > 0 && (
                <Button type="button" variant="outline" size="sm" onClick={resetUpload} className="text-xs h-9">
                  {t("clear")}
                </Button>
              )}
              <Button
                type="button"
                size="sm"
                className="text-xs h-9 px-4 font-semibold cursor-pointer"
                onClick={handleUploadAction}
                disabled={previews.length === 0}
              >
                {uploading ? (
                  <span className="flex items-center gap-1.5">
                    <Loader2 className="size-3.5 animate-spin" />
                    {t("pause")}
                  </span>
                ) : (
                  t("start")
                )}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* =================================================== */}
      {/* DUPLICATE PHOTOS REVIEW DIALOG (ADMIN DECISION MODAL) */}
      {/* =================================================== */}
      {showDuplicateModal && (
        <Dialog open={showDuplicateModal} onOpenChange={setShowDuplicateModal}>
          <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col p-6">
            <DialogHeader>
              <div className="flex items-center gap-2 text-amber-500">
                <ShieldAlertIcon className="size-6" />
                <DialogTitle className="text-xl font-bold">Peringatan Foto Duplikat Terdeteksi</DialogTitle>
              </div>
              <DialogDescription className="text-sm text-muted-foreground mt-1">
                Terdapat <span className="font-semibold text-foreground">{duplicatePairs.length} foto</span> yang terdeteksi duplikat selama proses upload. Silakan tentukan keputusan Admin untuk membiarkan atau menghapusnya.
              </DialogDescription>
            </DialogHeader>

            {/* Batch Decision Bar */}
            <div className="flex flex-wrap items-center justify-between gap-2 p-3 bg-muted/50 rounded-xl border border-border/80 my-2">
              <span className="text-xs font-medium text-muted-foreground">Tindakan Massal Admin:</span>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5 text-xs cursor-pointer border-amber-500/40 text-amber-600 dark:text-amber-400 hover:bg-amber-500/10"
                  onClick={handleKeepAllDuplicates}
                >
                  <CheckCircle2Icon className="size-3.5" />
                  <span>Biarkan Semua Duplikat</span>
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  className="gap-1.5 text-xs cursor-pointer"
                  onClick={handleDeleteAllDuplicates}
                >
                  <Trash2Icon className="size-3.5" />
                  <span>Hapus Semua Foto Baru Duplikat</span>
                </Button>
              </div>
            </div>

            {/* Side-by-Side Comparison List */}
            <div className="flex-1 overflow-y-auto space-y-4 pr-1 my-2 max-h-[50vh]">
              {duplicatePairs.map((pair, idx) => (
                <div key={pair.id} className="p-4 rounded-2xl border bg-card/60 shadow-sm space-y-3">
                  <div className="flex items-center justify-between border-b pb-2">
                    <span className="text-xs font-semibold text-amber-500 flex items-center gap-1.5">
                      <CopyIcon className="size-3.5" />
                      <span>Pasangan Duplikat #{idx + 1}</span>
                    </span>
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-xs gap-1 text-muted-foreground hover:text-foreground cursor-pointer"
                        onClick={() => handleKeepPair(pair.id)}
                      >
                        <CheckIcon className="size-3.5" />
                        <span>Biarkan</span>
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        className="h-7 text-xs gap-1 cursor-pointer"
                        onClick={() => handleDeleteNewDuplicatePair(pair)}
                      >
                        <Trash2Icon className="size-3.5" />
                        <span>Hapus Duplikat Baru</span>
                      </Button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {/* Uploaded New Photo Card */}
                    <div className="p-3 rounded-xl bg-amber-500/5 border border-amber-500/20 flex gap-3 items-center">
                      <img
                        src={pair.uploadPreview.cover}
                        alt="Foto Baru"
                        className="size-16 object-cover rounded-lg shrink-0 border"
                      />
                      <div className="min-w-0 text-xs space-y-1">
                        <div className="inline-block px-2 py-0.5 rounded bg-amber-500/20 text-amber-600 dark:text-amber-300 font-semibold text-[10px]">
                          FOTO BARU (DIUPLOAD)
                        </div>
                        <div className="font-semibold truncate text-foreground">{pair.uploadPreview.file.name}</div>
                        <div className="text-muted-foreground">Ukuran: {formatPhotoSize(pair.uploadPreview.file.size)}</div>
                      </div>
                    </div>

                    {/* Existing Photo in Gallery Card */}
                    <div className="p-3 rounded-xl bg-muted/40 border flex gap-3 items-center">
                      {pair.existingPhoto?.thumbnail || pair.existingPhoto?.preview ? (
                        <img
                          src={pair.existingPhoto.thumbnail || pair.existingPhoto.preview}
                          alt="Foto di Galeri"
                          className="size-16 object-cover rounded-lg shrink-0 border"
                          crossOrigin="anonymous"
                        />
                      ) : (
                        <div className="size-16 rounded-lg bg-muted flex items-center justify-center text-[10px] text-muted-foreground shrink-0 border">
                          Galeri
                        </div>
                      )}
                      <div className="min-w-0 text-xs space-y-1">
                        <div className="inline-block px-2 py-0.5 rounded bg-muted text-muted-foreground font-semibold text-[10px]">
                          FOTO DI GALERI (EKSISTING)
                        </div>
                        <div className="font-semibold truncate text-foreground">{pair.existingPhoto?.name || pair.uploadPreview.file.name}</div>
                        <div className="text-muted-foreground">
                          {pair.existingPhoto ? `${pair.existingPhoto.width} × ${pair.existingPhoto.height} • ${formatPhotoSize(pair.existingPhoto.size)}` : 'Sudah tersimpan di galeri'}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <DialogFooter className="mt-2">
              <Button type="button" onClick={() => setShowDuplicateModal(false)}>
                Selesai Peninjauan
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  )
}
