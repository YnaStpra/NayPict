"use client"

import { useEffect, useRef, useState, type ChangeEvent } from "react"
import { CheckIcon, CircleAlertIcon, PlusIcon, RedoDot, SettingsIcon } from "lucide-react"
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
import { photoExists } from "@/request/photo"
import { albumAddPhoto } from "@/request/album"
import { type PhotoAddResultVo } from "@/server/entity/vo/photo"
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

// Calculate the size of the file to be uploaded in the browser SHA-1 Checksum。
async function getFileChecksum(file: File) {
  const buffer = await file.arrayBuffer()
  return sha1(new Uint8Array(buffer))
}

// Extract error message from upload interface response，XML Read first Message Label。
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
    // Ignore JSON Parsing error
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
      if (!event.lengthComputable) {
        return
      }

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

    request.onerror = () => {
      reject(new Error("Network error"))
    }

    request.open("POST", "/api/photo/add")
    onAbort?.(() => request.abort())
    request.send(formData)
  })
}

// Render photo upload pop-up window。
export function PhotoUploadDialog() {
  const t = useTranslations("photos.upload")
  const fileInputRef = useRef<HTMLInputElement>(null) // File selection input，Used to trigger the system file selector。
  const previewsRef = useRef<UploadPreview[]>([]) // Save photo preview and upload status list。
  const uploadQueueRef = useRef<UploadPreview[]>([]) // Save the photo queue to be uploaded，Supports adding photos while uploading。
  const uploadingRef = useRef(false) // Mark whether there is currently an upload task running。
  const activeCountRef = useRef(0) // Record the number of photos currently being uploaded，Used to limit the number of concurrencies。
  const abortMapRef = useRef<Map<string, () => void>>(new Map()) // Save the stop upload method corresponding to each photo。
  const pausedRef = useRef(false) // Whether the tag is paused，prevent abort Restart upload at the end。
  const uploadStorageIdRef = useRef<string | null>(null) // Storage configuration locked after start id。
  const [uploading, setUploading] = useState(false) // Flag whether uploading is currently in progress，for switching start/pause button。
  const [storageId, setStorageId] = useState<string | null>(null) // Current manually selected storage configuration id。
  const [, setPreviewTick] = useState(0) // Increments when preview list changes，Used to trigger interface refresh。
  const storages = useStorageStore((state) => state.storages) // Global optional storage configuration list。
  const open = usePhotoStore((state) => state.uploadOpen) // Is the upload pop-up window open?。
  const uploadAlbumId = usePhotoStore((state) => state.uploadAlbumId) // Currently uploading target album id。
  const closeUpload = usePhotoStore((state) => state.closeUpload) // How to close the upload pop-up window。
  const addUploadedPhoto = usePhotoStore((state) => state.addUploadedPhoto) // How to write a photo list after successful upload。
  const selectedStorageId = storageId ?? storages[0]?.storageId ?? null

  useEffect(() => {
    return () => {
      previewsRef.current.forEach((preview) => URL.revokeObjectURL(preview.cover))
    }
  }, [])

  // Update the preview list and trigger an interface refresh。
  function setPreviews(next: UploadPreview[]) {
    previewsRef.current = next
    setPreviewTick((tick) => tick + 1)
  }

  // Open the system file selector。
  function openFilePicker() {
    fileInputRef.current?.click()
  }

  // Clear the generated preview in the pop-up window。
  function resetUpload() {
    previewsRef.current.forEach((preview) => URL.revokeObjectURL(preview.cover))
    uploadQueueRef.current = []
    uploadingRef.current = false
    setUploading(false)
    activeCountRef.current = 0
    abortMapRef.current.clear()
    pausedRef.current = false
    uploadStorageIdRef.current = null
    setPreviews([])
  }

  // Close the upload pop-up window and clean up the preview cache。
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

  // Pause upload，Interrupt only xhr，and reset the queue/Photos being uploaded。
  function pauseUpload() {
    pausedRef.current = true
    const abortingIds = new Set(abortMapRef.current.keys())
    abortMapRef.current.forEach((abort) => abort())
    abortMapRef.current.clear()
    uploadQueueRef.current = []

    const nextPreviews = previewsRef.current.map((preview) => {
      if (preview.status === "waiting") {
        return { ...preview, progress: 100, status: "new" as UploadStatus }
      }
      if (preview.status === "uploading" && abortingIds.has(preview.id)) {
        return { ...preview, progress: 100, status: "new" as UploadStatus }
      }
      return preview
    })

    setPreviews(nextPreviews)
    uploadingRef.current = false
    setUploading(false)
  }

  // Read files in batches when selecting files, Generate temporary local object preview URL。
  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? [])
    if (!files.length) {
      return
    }

    const nextPreviews = [...previewsRef.current]

    for (const file of files) {
      const cover = await createPhotoCover(file)
      nextPreviews.push({
        id: `${file.name}-${file.size}-${file.lastModified}`,
        file,
        cover,
        status: "new",
        progress: 0,
        albumId: uploadAlbumId ?? undefined,
      })
    }

    setPreviews(nextPreviews)

    if (fileInputRef.current) {
      fileInputRef.current.value = ""
    }

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

  // Add currently eligible photos to the upload queue。
  function enqueueUploadItems() {
    const uploadList = previewsRef.current.filter((preview) => (
      preview.status === "new" || preview.status === "failed"
    ))

    if (!uploadList.length) {
      return 0
    }

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

  // Upload a single photo，And press the result to refresh the current photo status。
  async function uploadPhoto(preview: UploadPreview) {
    const currentStorageId = uploadStorageIdRef.current!

    setPreviews(previewsRef.current.map((p) => (
      p.id === preview.id ? { ...p, progress: 0, status: "uploading" } : p
    )))

    const item = previewsRef.current.find((p) => p.id === preview.id) ?? preview

    try {
      const uploadSettings = readPhotoUploadSettings()
      let fileToUpload = item.file

      // Compress large images client-side if enabled in upload settings
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
          setPreviews(previewsRef.current.map((p) => (
            p.id === item.id ? { ...p, progress: 100, status: "success" } : p
          )))
          return
        }

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
          toast.success("Foto sudah ada di galeri, otomatis ditautkan ke album!")
          setPreviews(previewsRef.current.map((p) => (
            p.id === item.id ? { ...p, progress: 100, status: "success" } : p
          )))
          return
        }

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

      if (error instanceof DOMException && error.name === "AbortError") {
        return
      }

      if (error instanceof Error) {
        toast.error(error.message)
        console.error(error.message)
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

  // After each request is completed, the next one will be added immediately.，The number of concurrencies is determined by the upload settings。
  function runNext() {
    if (pausedRef.current) {
      return
    }

    if (!uploadQueueRef.current.length && activeCountRef.current === 0) {
      uploadingRef.current = false
      setUploading(false)
      return
    }

    uploadingRef.current = true
    setUploading(true)
    const concurrency = readPhotoUploadSettings().concurrency

    while (activeCountRef.current < concurrency && uploadQueueRef.current.length) {
      const preview = uploadQueueRef.current.shift()

      if (!preview) {
        continue
      }

      activeCountRef.current += 1
      uploadPhoto(preview).finally(() => {
        activeCountRef.current -= 1
        runNext()
      })
    }
  }

  // Upload photos to be processed in the pop-up window，Notify parent page after success。
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
    const count = enqueueUploadItems()

    if (!count && uploadingRef.current) {
      return
    }

    runNext()
  }

  // Toggle start or pause upload。
  function handleUploadAction() {
    if (uploading) {
      pauseUpload()
      return
    }

    startUpload()
  }

  return (
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
                  <div className="absolute right-1 bottom-1 flex size-5 items-center justify-center rounded-full bg-black/60 text-white">
                    <RedoDot className="size-3.5" />
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
  )
}
