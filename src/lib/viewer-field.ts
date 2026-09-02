// This module is responsible for the echo formatting of the information column in the sidebar of the photo viewer..

// Analyze photos exif JSON string.
function parsePhotoExifJson(exif: string | null | undefined) {
  if (!exif) {
    return null
  }

  try {
    return JSON.parse(exif) as Record<string, unknown>
  } catch {
    return null
  }
}

const colorSpaceLabels: Record<number, string> = {
  1: "sRGB",
  2: "Adobe RGB",
}

// Bundle Exif Color space fields formatted into readable text.
function formatColorSpace(exif: Record<string, unknown> | null | undefined, uncalibrated: string) {
  if (!exif) {
    return null
  }

  const profile = exif.ProfileDescription
  if (profile !== undefined && profile !== null && profile !== "") {
    return String(profile)
  }

  const colorSpace = exif.ColorSpace
  if (colorSpace === undefined || colorSpace === null || colorSpace === "") {
    return null
  }

  if (typeof colorSpace === "number") {
    return colorSpace === 65535 ? uncalibrated : colorSpaceLabels[colorSpace] ?? String(colorSpace)
  }

  return String(colorSpace)
}

// from photos exif JSON String reading color space.
export function getPhotoColorSpace(exif: string | null | undefined, uncalibrated = "Uncalibrated") {
  return formatColorSpace(parsePhotoExifJson(exif), uncalibrated)
}

type ViewerField = {
  key: "camera" | "lens" | "shutter" | "aperture" | "focalLength" | "iso"
  value: string
  wrap?: boolean
}

// Bundle Exif Convert text field to non-empty string.
function exifText(value: unknown) {
  if (value === undefined || value === null || value === "") {
    return null
  }

  const text = String(value).trim()
  return text || null
}

// format Exif shutter speed.
function formatExposureTime(value: unknown) {
  const text = exifText(value)
  if (!text) {
    return null
  }

  if (text.includes("/")) {
    return text.endsWith("s") ? text : `${text}s`
  }

  const seconds = Number(text)
  if (Number.isNaN(seconds)) {
    return text
  }

  if (seconds >= 1) {
    return `${Number.isInteger(seconds) ? seconds : seconds.toFixed(1)}s`
  }

  return `1/${Math.round(1 / seconds)}s`
}

// format Exif Aperture value.
function formatFNumber(value: unknown) {
  const text = exifText(value)
  if (!text) {
    return null
  }

  if (text.startsWith("f/")) {
    return text
  }

  const num = Number(text)
  if (Number.isNaN(num)) {
    return text
  }

  return `f/${Number.isInteger(num) ? num : num.toFixed(1)}`
}

// format Exif focal length.
function formatFocalLength(value: unknown) {
  const text = exifText(value)
  if (!text) {
    return null
  }

  if (text.endsWith("mm")) {
    return text
  }

  const num = Number(text)
  if (Number.isNaN(num)) {
    return text
  }

  return `${Number.isInteger(num) ? num : num.toFixed(1)}mm`
}

/**
 * Format camera make and model cleanly without duplicate brand names.
 * e.g., Make="Canon", Model="Canon EOS M3" -> "Canon EOS M3" (not "Canon Canon EOS M3")
 * e.g., Make="samsung", Model="SM-S901E" -> "Samsung SM-S901E"
 * e.g., Make="NIKON CORPORATION", Model="NIKON D750" -> "Nikon D750"
 */
export function formatCameraDeviceName(make?: unknown, model?: unknown): string {
  let cleanMake = make != null ? String(make).trim() : ""
  let cleanModel = model != null ? String(model).trim() : ""

  // Clean vendor corporate suffixes like "NIKON CORPORATION" -> "Nikon"
  cleanMake = cleanMake
    .replace(/\s+(corporation|corp|co\.,?\s*ltd\.?|ltd\.?|ag|inc\.?)$/i, "")
    .trim()

  if (!cleanMake && !cleanModel) return ""
  if (!cleanMake) return cleanModel
  if (!cleanModel) return cleanMake

  const makeLower = cleanMake.toLowerCase()
  const modelLower = cleanModel.toLowerCase()

  // If model already begins with the make name (e.g. "Canon" and "Canon EOS M3")
  if (modelLower.startsWith(makeLower)) {
    return cleanModel
  }

  // If make has multiple words and model starts with first word of make (e.g. "Fujifilm" and "FUJIFILM X-T5")
  const firstMakeWord = makeLower.split(/\s+/)[0]
  if (firstMakeWord && modelLower.startsWith(firstMakeWord)) {
    return cleanModel
  }

  // Capitalize make if it's all lowercase (e.g. "samsung" -> "Samsung")
  const formattedMake =
    cleanMake === cleanMake.toLowerCase()
      ? cleanMake.charAt(0).toUpperCase() + cleanMake.slice(1)
      : cleanMake

  return `${formattedMake} ${cleanModel}`.trim()
}

/**
 * Format lens make and model cleanly without duplicate brand names.
 */
export function formatLensDeviceName(lensMake?: unknown, lensModel?: unknown): string {
  const cleanMake = lensMake != null ? String(lensMake).trim() : ""
  const cleanModel = lensModel != null ? String(lensModel).trim() : ""

  if (!cleanMake && !cleanModel) return ""
  if (!cleanMake) return cleanModel
  if (!cleanModel) return cleanMake

  const makeLower = cleanMake.toLowerCase()
  const modelLower = cleanModel.toLowerCase()

  if (modelLower.startsWith(makeLower)) {
    return cleanModel
  }

  return `${cleanMake} ${cleanModel}`.trim()
}

// from photos exif JSON String reading device information list.
export function getPhotoDeviceParams(exif: string | null | undefined): ViewerField[] {
  const data = parsePhotoExifJson(exif)
  if (!data) {
    return []
  }

  const items: ViewerField[] = []
  const camera = formatCameraDeviceName(data.Make, data.Model)

  if (camera) {
    items.push({ key: "camera", value: camera, wrap: true })
  }

  const lens = formatLensDeviceName(data.LensMake, data.LensModel)
  if (lens) {
    items.push({ key: "lens", value: lens, wrap: true })
  }

  return items
}

// from photos exif JSON String reading shooting parameter list.
export function getPhotoShootingParams(exif: string | null | undefined): ViewerField[] {
  const data = parsePhotoExifJson(exif)
  if (!data) {
    return []
  }

  const items: ViewerField[] = []

  const exposureTime = formatExposureTime(data.ExposureTime)
  if (exposureTime) {
    items.push({ key: "shutter", value: exposureTime })
  }

  const fNumber = formatFNumber(data.FNumber)
  if (fNumber) {
    items.push({ key: "aperture", value: fNumber })
  }

  const focalLength = formatFocalLength(data.FocalLength)
  if (focalLength) {
    items.push({ key: "focalLength", value: focalLength })
  }

  const iso = exifText(data.ISO)
  if (iso) {
    items.push({ key: "iso", value: iso })
  }

  return items
}

// Bundle EXIF The offset is formatted as UTC +8 / UTC +5:30.
function formatUtcOffset(offset: string) {
  const match = offset.trim().match(/^([+-])(\d{1,2})(?::(\d{2}))?$/)
  if (!match) {
    return null
  }

  const sign = match[1] === "-" ? "-" : "+"
  const hour = Number(match[2])
  const minute = Number(match[3] ?? "0")

  if (minute === 0) {
    return `UTC ${sign}${hour}`
  }

  return `UTC ${sign}${hour}:${String(minute).padStart(2, "0")}`
}

// from photos exif JSON String reading time zone display text, Show only unified UTC offset.
export function getPhotoTimezone(exif: string | null | undefined) {
  const data = parsePhotoExifJson(exif)

  const offset = exifText(data?.TimeZoneOffset)
    ?? exifText(data?.OffsetTimeOriginal)
    ?? exifText(data?.OffsetTime)

  return offset ? formatUtcOffset(offset) : null
}

// from photos exif JSON String reading software information.
export function getPhotoSoftware(exif: string | null | undefined) {
  return exifText(parsePhotoExifJson(exif)?.Software)
}

// Format latitude, longitude and altitude into location text, For example 52.5187°N 13.3763°E 46 m.
export function formatPhotoLocation(
  latitude: number | null | undefined,
  longitude: number | null | undefined,
  altitude: number | null | undefined,
) {
  if (latitude == null || longitude == null) {
    return null
  }

  const latText = `${Math.abs(latitude).toFixed(4)}°${latitude >= 0 ? "N" : "S"}`
  const lngText = `${Math.abs(longitude).toFixed(4)}°${longitude >= 0 ? "E" : "W"}`
  let text = `${latText} ${lngText}`

  if (altitude != null) {
    text += ` ${Math.round(altitude)} m`
  }

  return text
}
