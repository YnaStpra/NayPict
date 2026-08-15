"use client"

import { useEffect, useRef, useState, type ChangeEvent } from "react"
import { CheckIcon, CircleAlertIcon, PlusIcon, RedoDot, SettingsIcon, Trash2Icon, CopyIcon, ShieldAlertIcon, CheckCircle2Icon } from "lucide-react"
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

// Calculate browser SHA-1 Checksum
async function getFileChecksum(file: File) {
  const buffer = await file.arrayBuffer()
  return sha1(new Uint8Array(buffer))
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

    request.onerror = () => reject(new Error("Network error"))
    request.open("POST", "/api/photo/add")
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

  const [uploading, setUploading] = useState(false)
  const [storageId, setStorageId] = useState<string | null>(null)
  const [, setPreviewTick] = useState(0)

  // Duplicate Review Modal States
  const [duplicatePairs, setDuplicatePairs] = useState<DuplicateReviewPair[]>([])
  const [showDuplicateModal, setShowDuplicateModal] = useState<boolean>(false)

  const storages = useStorageStore((state) => state.storages)
  const open = usePhotoStore((state) => state.uploadOpen)
  const uploadAlbumId = usePhotoStore((state) => state.uploadAlbumId)
  const closeUpload = usePhotoStore((state) => state.closeUpload)
  const addUploadedPhoto = usePhotoStore((state) => state.addUploadedPhoto)
  const selectedStorageId = storageId ?? storages[0]?.storageId ?? null

  useEffect(() => {
    return () => {
      previewsRef.current.forEach((preview) => URL.revokeObjectURL(preview.cover))
    }
  }, [])

  function setPreviews(next: UploadPreview[]) {
    previewsRef.current = next
    setPreviewTick((tick) => tick + 1)
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

  function handleOpenChange(next: boolean) {
    if (uploadingRef.current) {
      toast.warning("Uploading in progress")
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
        return { ...preview, progress: 100, status: "new" as UploadStatus }
      }
      return preview
    })

    setPreviews(nextPreviews)
    uploadingRef.current = false
    setUploading(false)
  }

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? [])
    if (!files.length) return

    const nextPreviews = [...previewsRef.current]

    for (const file of files) {
      const cover = await createPhotoCover(file)
      nextPreviews.push({
        id: `${file.name}-${file.size}-${file.lastModified}-${Math.random()}`,
        file,
        cover,
        status: "new",
        progress: 0,
        albumId: uploadAlbumId ?? undefined,
      })
    }

    setPreviews(nextPreviews)
    if (fileInputRef.current) fileInputRef.current.value = ""

    if (uploadingRef.current) {
      const newItems = nextPreviews.filter((p) => p.status === "new")
      if (newItems.length) {
        const newIds = new Set(newItems.map((p) => p.id))
        uploadQueueRef.current.push(...newItems)
        setPreviews(previewsRef.current.map((p) => (
          newIds.has(p.id) ? { ...p, status: "waiting" } : p
        )))
        runNext()
      }
    }
  }

  function enqueueUploadItems() {
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
    const currentStorageId = uploadStorageIdRef.current!

    setPreviews(previewsRef.current.map((p) => (
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
        if (item.albumId && (existsResult as any).photoId) {
          await albumAddPhoto({ albumIds: [item.albumId], photoIds: [(existsResult as any).photoId] })
          toast.success("Foto sudah ada di galeri, otomatis ditautkan ke album!")
        }

        // Record duplicate pair for end-of-upload review modal
        detectedDuplicatesRef.current.push({
          id: item.id,
          uploadPreview: item,
          existingPhoto: (existsResult as any).photo ?? null,
          photoId: (existsResult as any).photoId ?? null,
        })

        setPreviews(previewsRef.current.map((p) => (
          p.id === item.id ? { ...p, progress: 100, status: "skipped" } : p
        )))
        return
      }

      if (pausedRef.current) {
        setPreviews(previewsRef.current.map((p) => (
          p.id === item.id ? { ...p, progress: 100, status: "new" } : p
        )))
        return
      }

      const formData = new FormData()
      formData.set("storageId", currentStorageId)
      formData.set("file", fileToUpload)
      formData.set("lastModified", String(item.file.lastModified))
      formData.set("allowDownload", String(uploadSettings.allowDownload))
      if (item.albumId) {
        formData.set("albumId", item.albumId)
      }

      const result = await uploadPhotoAdd(formData, (progress) => {
        setPreviews(previewsRef.current.map((p) => (
          p.id === item.id ? { ...p, progress } : p
        )))
      }, (abort) => abortMapRef.current.set(preview.id, abort))

      if (result.duplicate) {
        if (result.photo && item.albumId) {
          addUploadedPhoto(result.photo, item.albumId)
        }

        // Record duplicate pair for end-of-upload review modal
        detectedDuplicatesRef.current.push({
          id: item.id,
          uploadPreview: item,
          existingPhoto: result.photo ?? null,
          uploadedPhoto: result.photo ?? null,
          photoId: result.photo?.photoId ?? null,
        })

        setPreviews(previewsRef.current.map((p) => (
          p.id === item.id ? { ...p, progress: 100, status: "skipped" } : p
        )))
        return
      }

      if (result.photo) {
        addUploadedPhoto(result.photo, item.albumId ?? null)
      }

      setPreviews(previewsRef.current.map((p) => (
        p.id === item.id ? { ...p, progress: 100, status: "success" } : p
      )))

    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return
      if (error instanceof Error) {
        toast.error(error.message)
      }

      if (readPhotoUploadSettings().retryOnFail) {
        uploadQueueRef.current.push(item)
        setPreviews(previewsRef.current.map((p) => (
          p.id === item.id ? { ...p, progress: 0, status: "waiting" } : p
        )))
        return
      }

      setPreviews(previewsRef.current.map((p) => (
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

    if (!selectedStorageId && previewsRef.current.length > 0) {
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
    } catch (err: any) {
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
    } catch (err: any) {
      toast.error("Gagal menghapus foto duplikat massal.")
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="grid h-[80vh] max-h-[720px] min-h-0 grid-rows-[auto_minmax(0,1fr)_auto] sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t("title")}</DialogTitle>
            <DialogDescription className="sr-only">
              Select photos to upload to the current photo list.
            </DialogDescription>
          </DialogHeader>

          <div className="min-h-0 overflow-y-auto [scrollbar-width:thin]">
            <div className="grid grid-cols-3 content-start gap-1 md:grid-cols-4">
              {previewsRef.current.map((preview) => (
                <div key={preview.id} className="relative aspect-square w-full overflow-hidden bg-muted [contain-intrinsic-size:160px_160px] [content-visibility:auto]">
                  <img
                    src={preview.cover}
                    alt={preview.file.name}
                    decoding="async"
                    loading="lazy"
                    className="h-full w-full object-cover"
                  />
                  {preview.progress < 100 && (
                    <div
                      className="pointer-events-none absolute inset-x-0 bottom-0 bg-black/60 transition-[height] duration-200"
                      style={{ height: `${100 - preview.progress}%` }}
                    />
                  )}
                  {preview.status === "success" && (
                    <div className="absolute right-1 bottom-1 flex size-5 items-center justify-center rounded-full bg-black/60 text-white">
                      <CheckIcon className="size-3.5" />
                    </div>
                  )}
                  {preview.status === "failed" && (
                    <div className="absolute right-1 bottom-1 flex size-5 items-center justify-center rounded-full bg-black/60 text-white">
                      <CircleAlertIcon className="size-3.5" />
                    </div>
                  )}
                  {preview.status === "skipped" && (
                    <div className="absolute right-1 bottom-1 flex size-5 items-center justify-center rounded-full bg-amber-500/90 text-white" title="Foto duplikat terdeteksi">
                      <CopyIcon className="size-3.5" />
                    </div>
                  )}
                </div>
              ))}
              <button
                type="button"
                className="flex aspect-square w-full items-center justify-center bg-muted text-muted-foreground hover:bg-muted/80"
                onClick={openFilePicker}
              >
                <PlusIcon />
                <span className="sr-only">Add photos</span>
              </button>
            </div>
          </div>

          <DialogFooter className="flex-row items-center justify-between gap-3 sm:justify-between">
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
                <SelectTrigger className="w-40">
                  <SelectValue placeholder={t("selectStorage")} />
                </SelectTrigger>
                <SelectContent>
                  {storages.map((storage) => (
                    <SelectItem key={storage.storageId} value={storage.storageId}>
                      {storage.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Popover>
                <PopoverTrigger asChild>
                  <Button type="button" variant="ghost" size="icon" aria-label="Upload settings">
                    <SettingsIcon className="size-4" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent side="top" align="start" className="w-64">
                  <PhotoUploadSettings onChange={runNext} />
                </PopoverContent>
              </Popover>
            </div>
            <div className="flex items-center gap-2">
              {!uploading && (
                <Button type="button" variant="secondary" onClick={resetUpload}>
                  {t("clear")}
                </Button>
              )}
              <Button type="button" onClick={handleUploadAction}>
                {uploading ? t("pause") : t("start")}
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
                        className="h-7 text-xs gap-1 text-muted-foreground hover:text-foreground"
                        onClick={() => handleKeepPair(pair.id)}
                      >
                        <CheckIcon className="size-3.5" />
                        <span>Biarkan</span>
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        className="h-7 text-xs gap-1"
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
