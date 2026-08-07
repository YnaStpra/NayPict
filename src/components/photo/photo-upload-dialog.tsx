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
import { useStorageStore } from "@/store/storage-store"
import { usePhotoStore } from "@/store/photo-store"
import { photoExists } from "@/request/photo"
import { type PhotoAddResultVo } from "@/server/entity/vo/photo"
import { useTranslations } from "next-intl"

type UploadStatus = "new" | "waiting" | "uploading" | "success" | "failed" | "skipped"

interface UploadPreview {
  id: string
  cover: string
  file: File
  albumId: string | null
  progress: number
  status: UploadStatus
}

// Calculate the size of the file to be uploaded in the browser SHA-1 Checksum。
async function getFileChecksum(file: File) {
  const buffer = await file.arrayBuffer()
  return sha1(new Uint8Array(buffer))
}

// Extract error message from upload interface response，XML Read first Message Label。
function getUploadErrorText(text: string) {
  const value = text.trim()

  try {
    const data = JSON.parse(value) as { message?: string }
    return data.message || value
  } catch {
    // No JSON Error continues by pressing normal text or XML deal with。
  }

  if (!value.startsWith("<") || !value.endsWith(">")) {
    return value || "Upload failed"
  }

  const xml = new DOMParser().parseFromString(value, "text/xml")
  const message = xml.querySelector("Message")?.textContent?.trim()

  return message || value
}

// use XMLHttpRequest Upload photos to /photo/add。
function uploadPhotoAdd(
  formData: FormData,
  onProgress?: (progress: number) => void,
  registerAbort?: (abort: () => void) => void,
) {
  return new Promise<PhotoAddResultVo>((resolve, reject) => {
    const request = new XMLHttpRequest()

    registerAbort?.(() => request.abort())
    request.open("POST", "/api/photo/add")
    request.withCredentials = true
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        onProgress?.(Math.min(95, Math.round((event.loaded / event.total) * 100)))
      }
    }
    request.onload = () => {
      try {
        const json = JSON.parse(request.responseText) as {
          code: number
          message?: string
          data?: PhotoAddResultVo
        }

        if (request.status >= 200 && request.status < 300 && json.code === 200 && json.data) {
          onProgress?.(100)
          resolve(json.data)
          return
        }

        reject(new Error(json.message || getUploadErrorText(request.responseText)))
      } catch {
        reject(new Error(getUploadErrorText(request.responseText)))
      }
    }
    request.onerror = () => reject(new Error("Upload failed"))
    request.onabort = () => reject(new DOMException("Upload aborted", "AbortError"))
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
    setPreviews([])
  }

  // Handle pop-up window opening status changes。
  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      closeUpload()
    }
  }

  // After generating the cover, add it to the preview list。
  async function addPhoto(file: File) {
    const cover = await createPhotoCover(file)
    const item: UploadPreview = {
      id: `${Math.random()}`,
      cover,
      file,
      albumId: uploadAlbumId,
      progress: 100,
      status: "new",
    }

    setPreviews([...previewsRef.current, item])
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

  // Process each new photo after selecting it。
  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? [])
    event.target.value = ""

    if (!files.length) {
      return
    }

    let index = 0

    async function runAddPhoto() {
      while (index < files.length) {
        const file = files[index]
        index += 1

        try {
          await addPhoto(file)
        } catch {
          toast.error(t("previewFailed", { name: file.name }))
        }
      }
    }

    await Promise.all(
      Array.from({ length: Math.min(6, files.length) }, runAddPhoto),
    )
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

    uploadQueueRef.current.push(...uploadList)

    const nextPreviews: UploadPreview[] = previewsRef.current.map((preview) => (
      uploadIds.has(preview.id)
        ? { ...preview, progress: 0, status: "waiting" }
        : preview
    ))

    setPreviews(nextPreviews)

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
      const checksum = await getFileChecksum(item.file)
      const existsResult = await photoExists({ checksum, name: item.file.name })

      if (existsResult.duplicate) {
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
      formData.set("file", item.file)
      formData.set("lastModified", String(item.file.lastModified))
      formData.set("allowDownload", String(readPhotoUploadSettings().allowDownload))
      if (item.albumId) {
        formData.set("albumId", item.albumId)
      }

      const result = await uploadPhotoAdd(formData, (progress) => {
        setPreviews(previewsRef.current.map((p) => (
          p.id === item.id ? { ...p, progress } : p
        )))
      }, (abort) => abortMapRef.current.set(preview.id, abort))

      if (result.duplicate) {
        setPreviews(previewsRef.current.map((p) => (
          p.id === item.id ? { ...p, progress: 100, status: "skipped" } : p
        )))
        return
      }

      if (result.photo) {
        addUploadedPhoto(result.photo, item.albumId)
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
