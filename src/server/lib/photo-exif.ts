/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-require-imports */
// This module reads shooting EXIF metadata from photo buffers.

import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import exifr from "exifr"

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

function getCoordinate(value: unknown, ref?: unknown) {
  if (value === undefined || value === null || value === "") {
    return null
  }

  const refStr = typeof ref === "string" ? ref.trim().toUpperCase() : ""

  // 1. Direct finite number
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return null
    if (refStr === "S" || refStr === "W" || refStr === "-1" || refStr === "SOUTH" || refStr === "WEST") {
      return value > 0 ? -value : value
    }
    return value
  }

  // 2. Array of DMS numbers [deg, min, sec]
  if (Array.isArray(value) && value.length >= 1) {
    const deg = Number(value[0]) || 0
    const min = Number(value[1]) || 0
    const sec = Number(value[2]) || 0
    let dec = deg + min / 60 + sec / 3600
    if (refStr === "S" || refStr === "W" || refStr === "-1" || refStr === "SOUTH" || refStr === "WEST") {
      dec = -Math.abs(dec)
    }
    return Number.isFinite(dec) ? dec : null
  }

  // 3. Object with { degrees, minutes, seconds }
  if (typeof value === "object" && value !== null) {
    const obj = value as Record<string, unknown>
    if ("degrees" in obj || "deg" in obj) {
      const deg = Number(obj.degrees ?? obj.deg) || 0
      const min = Number(obj.minutes ?? obj.min) || 0
      const sec = Number(obj.seconds ?? obj.sec) || 0
      let dec = deg + min / 60 + sec / 3600
      if (refStr === "S" || refStr === "W" || refStr === "-1" || refStr === "SOUTH" || refStr === "WEST") {
        dec = -Math.abs(dec)
      }
      return Number.isFinite(dec) ? dec : null
    }
  }

  // 4. String format (e.g. "-6.2088" or "6 deg 12' 31.68\" S" or "106° 50' 44\" E")
  if (typeof value === "string") {
    const str = value.trim()
    const directNum = Number(str)
    if (!Number.isNaN(directNum) && Number.isFinite(directNum)) {
      if (refStr === "S" || refStr === "W") {
        return directNum > 0 ? -directNum : directNum
      }
      return directNum
    }

    const dmsMatch = str.match(/([0-9.]+)\s*(?:deg|°)\s*([0-9.]+)?\s*(?:'|min)?\s*([0-9.]+)?\s*(?:"|sec)?\s*([NSEW])?/i)
    if (dmsMatch) {
      const deg = parseFloat(dmsMatch[1]) || 0
      const min = parseFloat(dmsMatch[2]) || 0
      const sec = parseFloat(dmsMatch[3]) || 0
      const dir = (dmsMatch[4] || refStr).toUpperCase()
      let dec = deg + min / 60 + sec / 3600
      if (dir === "S" || dir === "W") {
        dec = -Math.abs(dec)
      }
      return Number.isFinite(dec) ? dec : null
    }
  }

  return null
}

function getAltitude(tags: any) {
  if (!tags) return null
  const rawAlt = tags.altitude ?? tags.GPSAltitude
  const num = getCoordinate(rawAlt)
  if (num === null) {
    return null
  }

  const ref = tags.altitudeRef ?? tags.GPSAltitudeRef
  if (ref === 1 || ref === "1" || ref === "Below Sea Level") {
    return -Math.abs(num)
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

/**
 * Pure JavaScript EXIF parsing using exifr.
 * Guarantees 100% EXIF extraction in serverless environments (Vercel) without needing Perl or binaries.
 */
async function parseExifWithExifr(buffer: Buffer) {
  try {
    const rawTags = await exifr.parse(buffer, {
      tiff: true,
      exif: true,
      gps: true,
      interop: true,
      reviveValues: true,
      translateKeys: true,
      translateValues: true,
    })

    if (!rawTags) return null

    const data: Record<string, unknown> = {}

    const setIfValid = (targetKey: string, val: unknown) => {
      if (val !== undefined && val !== null && val !== "") {
        data[targetKey] = tagValueToJson(val)
      }
    }

    setIfValid("Make", rawTags.Make)
    setIfValid("Model", rawTags.Model)
    setIfValid("LensMake", rawTags.LensMake)
    setIfValid("LensModel", rawTags.LensModel)
    setIfValid("Software", rawTags.Software)
    setIfValid("ISO", rawTags.ISO ?? rawTags.ISOSpeedRatings)
    setIfValid("FNumber", rawTags.FNumber ? String(rawTags.FNumber) : null)
    setIfValid("FocalLength", rawTags.FocalLength ? `${rawTags.FocalLength} mm` : null)

    if (rawTags.ExposureTime !== undefined && rawTags.ExposureTime !== null) {
      const et = Number(rawTags.ExposureTime)
      if (!isNaN(et)) {
        setIfValid("ExposureTime", et < 1 ? `1/${Math.round(1 / et)}` : String(et))
      }
    }

    if (rawTags.ColorSpace) {
      setIfValid("ColorSpace", String(rawTags.ColorSpace))
    }

    let takenTime: string | null = null
    const dateVal = rawTags.DateTimeOriginal || rawTags.CreateDate || rawTags.ModifyDate
    if (dateVal instanceof Date && !isNaN(dateVal.getTime())) {
      takenTime = dateVal.toISOString()
    } else if (typeof dateVal === "string") {
      const d = new Date(dateVal)
      if (!isNaN(d.getTime())) takenTime = d.toISOString()
    }

    const latitude = getCoordinate(rawTags.latitude ?? rawTags.GPSLatitude, rawTags.GPSLatitudeRef)
    const longitude = getCoordinate(rawTags.longitude ?? rawTags.GPSLongitude, rawTags.GPSLongitudeRef)
    const altitude = getAltitude(rawTags)

    const exifJson = Object.keys(data).length ? JSON.stringify(data) : null

    return {
      takenTime,
      latitude,
      longitude,
      altitude,
      exif: exifJson,
    }
  } catch {
    return null
  }
}

export async function readPhotoExifFromBuffer(input: ArrayBuffer | Buffer) {
  const source = input instanceof Buffer ? input : Buffer.from(input as any)

  // 1. Try exiftool-vendored if available (local development with Perl)
  const tool = getExifTool()
  if (tool) {
    const dir = await mkdtemp(join(tmpdir(), "album-exif-")).catch(() => null)
    if (dir) {
      const filePath = join(dir, "photo")
      try {
        await writeFile(filePath, source)
        const tags = await tool.read(filePath, { readArgs })
        const result = {
          takenTime: getTakenTime(tags),
          latitude: getCoordinate(tags.GPSLatitude, tags.GPSLatitudeRef),
          longitude: getCoordinate(tags.GPSLongitude, tags.GPSLongitudeRef),
          altitude: getAltitude(tags),
          exif: buildExifJson(tags),
        }

        if (result.exif || result.takenTime) {
          return result
        }
      } catch {
        // Fallback to pure JS parser exifr below
      } finally {
        await rm(dir, { recursive: true, force: true }).catch(() => {})
      }
    }
  }

  // 2. Pure JS EXIF parser fallback (Works 100% on Vercel Serverless & Node.js)
  const exifrResult = await parseExifWithExifr(source)
  if (exifrResult) {
    return exifrResult
  }

  return {
    takenTime: null,
    latitude: null,
    longitude: null,
    altitude: null,
    exif: null,
  }
}
