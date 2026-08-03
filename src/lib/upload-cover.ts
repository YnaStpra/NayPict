// This module is responsible for generating the photo cover preview in the upload dialog box.。

// Generate a cover image only for interface display，Upload the original image without modification。
export async function createPhotoCover(file: File) {
  const bitmap = await createImageBitmap(file)
  const size = 400
  const scale = Math.max(size / bitmap.width, size / bitmap.height)
  const width = bitmap.width * scale
  const height = bitmap.height * scale
  const x = (size - width) / 2
  const y = (size - height) / 2
  const canvas = document.createElement("canvas")
  canvas.width = size
  canvas.height = size
  canvas.getContext("2d")!.drawImage(bitmap, x, y, width, height)
  bitmap.close()

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((value) => {
      if (value) {
        resolve(value)
        return
      }

      reject(new Error("Cover generation failed"))
    }, "image/webp", 0.9)
  })

  return URL.createObjectURL(blob)
}
