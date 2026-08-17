// This module is responsible for generating the photo cover preview in the upload dialog box.

// Generate a cover image only for interface display, with fail-safe fallback to direct ObjectURL.
export async function createPhotoCover(file: File): Promise<string> {
  try {
    if (typeof createImageBitmap === "function") {
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
      const ctx = canvas.getContext("2d")
      if (ctx) {
        ctx.drawImage(bitmap, x, y, width, height)
        bitmap.close()

        const blob = await new Promise<Blob | null>((resolve) => {
          canvas.toBlob(resolve, "image/jpeg", 0.85)
        })

        if (blob) {
          return URL.createObjectURL(blob)
        }
      }
    }
  } catch (err) {
    console.warn("createPhotoCover canvas generation fallback:", err)
  }

  // Direct object URL fallback
  return URL.createObjectURL(file)
}
