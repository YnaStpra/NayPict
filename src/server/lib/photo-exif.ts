// This module is from the original image Exif Read shooting metadata.

import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

let exiftoolInstance: any = null

function getExifTool() {
  if (!exiftoolInstance) {
    try {
      const { ExifTool } = require("exiftool-vendored")
      exiftoolInstance = new ExifTool({
        backfillTimezones: true,
        inferTimezoneFromDatestamps: true,
      })
    } catch {
      exiftoolInstance = null
    }
  }
  return exiftoolInstance
}

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

function tagValueToJson(value: unknown) {
  if (value && typeof value === "object" && "toString" in value) {
    return String(value)
  }
  return value
}

function formatTzOffset(minutes: number) {
  const sign = minutes >= 0 ? "+" : "-"
  const abs = Math.abs(minutes)
  const hour = Math.floor(abs / 60)
  const minute = abs % 60

  return `${sign}${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`
}

function getTimezoneInfo(tags: any) {
  const candidates = [tags.DateTimeOriginal, tags.CreateDate]

  for (const value of candidates) {
    if (!value || typeof value !== "object") {
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

function getTakenTime(tags: any) {
  const candidates = [tags.DateTimeOriginal, tags.CreateDate]

  for (const value of candidates) {
    if (!value) {
      continue
    }

    if (typeof value === "object" && typeof value.toISOString === "function") {
      const iso = value.toISOString()
      if (iso) {
        return iso
      }
      continue
    }

    if (typeof value === "string") {
      try {
        const { ExifDateTime } = require("exiftool-vendored")
        const iso = ExifDateTime.fromEXIF(value)?.toISOString()
        if (iso) {
          return iso
        }
      } catch {
        // Fallback
      }
    }
  }

  return null
}

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

function getAltitude(tags: any) {
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

function buildExifJson(tags: any) {
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

    if (timezone.TimeZoneOffset && !data.OffsetTimeOriginal) {
      data.OffsetTimeOriginal = timezone.TimeZoneOffset
    }
  }

  return Object.keys(data).length ? JSON.stringify(data) : null
}

export async function readPhotoExifFromBuffer(input: ArrayBuffer | Buffer) {
  const tool = getExifTool()
  if (!tool) {
    return {
      takenTime: null,
      latitude: null,
      longitude: null,
      altitude: null,
      exif: null,
    }
  }

  const source = input instanceof Buffer ? input : Buffer.from(input)
  const dir = await mkdtemp(join(tmpdir(), "album-exif-"))
  const filePath = join(dir, "photo")

  try {
    await writeFile(filePath, source)
    const tags = await tool.read(filePath, { readArgs })

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
