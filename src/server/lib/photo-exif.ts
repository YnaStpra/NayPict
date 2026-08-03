// This module is from the original image Exif Read shooting metadata。

import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { ExifDateTime, ExifTool, type Tags } from "exiftool-vendored"

// Enable time zone inference exiftool Example。
const exiftool = new ExifTool({
  backfillTimezones: true,
  inferTimezoneFromDatestamps: true,
})

const exifPickKeys = [
  "DateTimeOriginal",
  "CreateDate",
  "OffsetTimeOriginal",
  "OffsetTimeDigitized",
  "OffsetTime",
  "Make",
  "Model",
  "LensMake",
  "LensModel",
  "Software",
  "ExposureTime",
  "FNumber",
  "FocalLength",
  "ISO",
  "ColorSpace",
  "ProfileDescription",
] as const

const readArgs = [
  ...exifPickKeys.map((key) => `-${key}`),
  "-GPSLatitude",
  "-GPSLongitude",
  "-GPSAltitude",
  "-GPSAltitudeRef",
]

// Bundle exiftool The field value can be converted to JSON serialized value。
function tagValueToJson(value: unknown) {
  if (value instanceof ExifDateTime) {
    return value.toString() ?? value.toExifString()
  }

  return value
}

// Bundle UTC Offset minutes formatted as +08:00。
function formatTzOffset(minutes: number) {
  const sign = minutes >= 0 ? "+" : "-"
  const abs = Math.abs(minutes)
  const hour = Math.floor(abs / 60)
  const minute = abs % 60

  return `${sign}${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`
}

// Extract time zone name and offset from shooting time field。
function getTimezoneInfo(tags: Tags) {
  const candidates = [tags.DateTimeOriginal, tags.CreateDate]

  for (const value of candidates) {
    if (!(value instanceof ExifDateTime) || !value.hasZone) {
      continue
    }

    const info: Record<string, unknown> = {}

    if (value.zoneName) {
      info.TimeZone = value.zoneName
    } else if (typeof value.zone === "string") {
      info.TimeZone = value.zone
    }

    if (value.tzoffsetMinutes != null) {
      info.TimeZoneOffset = formatTzOffset(value.tzoffsetMinutes)
    }

    if (value.inferredZone) {
      info.TimeZoneInferred = true
    }

    if (Object.keys(info).length) {
      return info
    }
  }

  return null
}

// from exiftool The result is extracted from the shooting time and converted into ISO UTC。
function getTakenTime(tags: Tags) {
  const candidates = [tags.DateTimeOriginal, tags.CreateDate]

  for (const value of candidates) {
    if (!value) {
      continue
    }

    if (value instanceof ExifDateTime) {
      const iso = value.toISOString()
      if (iso) {
        return iso
      }
      continue
    }

    if (typeof value === "string") {
      const iso = ExifDateTime.fromEXIF(value)?.toISOString()
      if (iso) {
        return iso
      }
    }
  }

  return null
}

// Bundle GPS Coordinate fields parse into decimal degrees。
function getCoordinate(value: unknown) {
  if (value === undefined || value === null || value === "") {
    return null
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null
  }

  const num = Number(value)
  return Number.isNaN(num) ? null : num
}

// from GPS Altitude field parses altitude（rice）。
function getAltitude(tags: Tags) {
  const num = getCoordinate(tags.GPSAltitude)
  if (num === null) {
    return null
  }

  const ref = tags.GPSAltitudeRef
  if (ref === 1) {
    return -num
  }

  return num
}

// Bundle exiftool Convert the specified field to JSON string。
function buildExifJson(tags: Tags) {
  const data: Record<string, unknown> = {}
  const record = tags as Record<string, unknown>

  for (const key of exifPickKeys) {
    const value = record[key]
    if (value !== undefined && value !== null && value !== "") {
      data[key] = tagValueToJson(value)
    }
  }

  if (!data.ProfileDescription) {
    const profile = record.ProfileDescription ?? record["ICC_Profile:ProfileDescription"]
    if (profile !== undefined && profile !== null && profile !== "") {
      data.ProfileDescription = tagValueToJson(profile)
    }
  }

  const timezone = getTimezoneInfo(tags)
  if (timezone) {
    Object.assign(data, timezone)

    // The original image was not written OffsetTime* hour，Complete commonly used offset fields with inferred results。
    if (timezone.TimeZoneOffset && !data.OffsetTimeOriginal) {
      data.OffsetTimeOriginal = timezone.TimeZoneOffset
    }
  }

  return Object.keys(data).length ? JSON.stringify(data) : null
}

// From the original picture Exif Read shooting time、latitude and longitude with exif JSON string。
export async function readPhotoExifFromBuffer(input: ArrayBuffer | Buffer) {
  const source = input instanceof Buffer ? input : Buffer.from(input)
  const dir = await mkdtemp(join(tmpdir(), "album-exif-"))
  const filePath = join(dir, "photo")

  try {
    await writeFile(filePath, source)
    const tags = await exiftool.read(filePath, { readArgs })

    return {
      takenTime: getTakenTime(tags),
      latitude: getCoordinate(tags.GPSLatitude),
      longitude: getCoordinate(tags.GPSLongitude),
      altitude: getAltitude(tags),
      exif: buildExifJson(tags),
    }
  } catch {
    return {
      takenTime: null,
      latitude: null,
      longitude: null,
      altitude: null,
      exif: null,
    }
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}
