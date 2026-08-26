"use client"

import { useEffect, useState } from "react"
import Cropper, { type Area, type Point } from "react-easy-crop"

import { Dialog } from "@/components/common/dialog"
import { Slider } from "@/components/ui/slider"
import { userSetAvatar } from "@/request/user"
import { useTranslations } from "next-intl"

interface AvatarUploadProps {
  open: boolean
  image: string
  name: string
  onOpenChange: (open: boolean) => void
  onAvatarChange: (avatarKey: string) => void
}

// Load images, for canvas Generate avatar based on cropped area.
function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()

    image.crossOrigin = "anonymous"
    image.onload = () => resolve(image)
    image.onerror = reject
    image.src = src
  })
}

// Generate a fixed-size avatar based on the cropped area.
async function getCroppedAvatar(src: string, crop: Area) {
  const image = await loadImage(src)
  const canvas = document.createElement("canvas")
  const context = canvas.getContext("2d")
  const size = 128

  if (!context || !crop.width || !crop.height) {
    return ""
  }

  canvas.width = size
  canvas.height = size
  context.drawImage(
    image,
    crop.x,
    crop.y,
    crop.width,
    crop.height,
    0,
    0,
    size,
    size
  )

  return canvas.toDataURL("image/webp", 0.9)
}

// Render avatar upload and crop pop-up frame.
export function AvatarUpload({ open, image, onOpenChange, onAvatarChange }: AvatarUploadProps) {
  const t = useTranslations("layout.avatar")

  // cropperImage Delay binding to Cropper, Avoid measuring in advance when the pop-up layout is not stable.
  const [cropperImage, setCropperImage] = useState("")
  // crop Save the dragged position of the image in the crop window.
  const [crop, setCrop] = useState<Point>({ x: 0, y: 0 })
  // zoom Save the zoom ratio of the image in the crop window.
  const [zoom, setZoom] = useState(1)
  // croppedAreaPixels Save the original image pixel area corresponding to the current cropping window.
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null)

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setCropperImage(image)
    }, 100)

    return () => {
      window.clearTimeout(timer)
    }
  }, [image])

  // Save current cropping area, Generate avatar when click to save.
  function completeCrop(_: Area, nextAreaPixels: Area) {
    setCroppedAreaPixels(nextAreaPixels)
  }

  // Save the cropped avatar, and pass the result to the parent component.
  async function saveAvatar() {

    if (!croppedAreaPixels) {
      onOpenChange(false)
      return
    }

    onOpenChange(false)

    setTimeout(async () => {
      const nextAvatar = await getCroppedAvatar(image, croppedAreaPixels)
      const avatarKey = await userSetAvatar({ avatar: nextAvatar })
      onAvatarChange(avatarKey)
    }, 100)

  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={t("title")}
      showCloseButton={false}
      contentClassName="sm:max-w-md"
      onConfirm={saveAvatar}
    >
      <div className="flex flex-col gap-4">
        <div className="relative h-[360px] w-full overflow-hidden rounded-lg bg-muted">
          <Cropper
            image={cropperImage}
            crop={crop}
            zoom={zoom}
            aspect={1}
            cropShape="rect"
            showGrid
            objectFit="contain"
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={completeCrop}
            classes={{
              cropAreaClassName: "rounded-lg",
            }}
          />
        </div>
        <Slider
          min={1}
          max={3}
          step={0.01}
          value={[zoom]}
          aria-label="Adjust profile picture zoom"
          onValueChange={(value) => setZoom(value[0] ?? 1)}
        />
      </div>
    </Dialog>
  )
}
