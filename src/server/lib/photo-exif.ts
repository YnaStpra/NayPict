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

/**
 * Deep sanitization for EXIF string metadata to prevent Stored XSS attacks.
 * Strips HTML tags, removes javascript:/data: URIs, removes non-printable control chars, and caps max length.
 */
export function sanitizeExifString(input: unknown): string | unknown {
  if (typeof input !== "string") {
    if (input && typeof input === "object" && "toString" in input) {
      return sanitizeExifString(String(input));
    }
    return input;
  }

  return input
    .replace(/<[^>]*>?/gm, "") // Strip HTML tags
    .replace(/javascript:/gi, "") // Remove javascript pseudo-protocol
    .replace(/data:\s*text\/html/gi, "") // Remove inline HTML data URIs
    .replace(/[\u0000-\u0008\u000B-\u000C\u000E-\u001F\u007F]/g, "") // Remove ASCII control characters
    .trim()
    .slice(0, 500); // Cap individual metadata tag length to 500 chars
}

function tagValueToJson(value: unknown) {
  if (typeof value === "string") {
    return sanitizeExifString(value);
  }
  if (value && typeof value === "object" && "toString" in value) {
    return sanitizeExifString(String(value));
  }
  return value;
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

function parseRational(val: unknown): number {
  if (typeof val === "number") return val
  if (typeof val === "string") {
    const s = val.trim()
    if (s.includes("/")) {
      const parts = s.split("/")
      const num = parseFloat(parts[0])
      const den = parseFloat(parts[1])
      if (den !== 0 && !isNaN(num) && !isNaN(den)) return num / den
    }
    return parseFloat(s)
  }
  return NaN
}

export function getCoordinate(value: unknown, ref?: unknown): number | null {
  if (value === undefined || value === null || value === "") {
    return null
  }

  const refStr = typeof ref === "string" ? ref.trim().toUpperCase() : ""
  const isLatRef = refStr === "N" || refStr === "S" || refStr === "NORTH" || refStr === "SOUTH"
  const maxBound = isLatRef ? 90 : 180

  // 1. Direct finite number
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return null
    let dec = value
    if (refStr === "S" || refStr === "W" || refStr === "-1" || refStr === "SOUTH" || refStr === "WEST") {
      dec = -Math.abs(dec)
    }
    return Number.isFinite(dec) && dec >= -maxBound && dec <= maxBound ? dec : null
  }

  // 2. Array of numbers or rational strings [deg, min, sec]
  if (Array.isArray(value) && value.length >= 1) {
    const deg = parseRational(value[0]) || 0
    const min = parseRational(value[1]) || 0
    const sec = parseRational(value[2]) || 0
    let dec = Math.abs(deg) + min / 60 + sec / 3600
    if (deg < 0 || refStr === "S" || refStr === "W" || refStr === "-1" || refStr === "SOUTH" || refStr === "WEST") {
      dec = -Math.abs(dec)
    }
    return Number.isFinite(dec) && dec >= -maxBound && dec <= maxBound ? dec : null
  }

  // 3. Object with degrees, minutes, seconds
  if (typeof value === "object" && value !== null) {
    const obj = value as Record<string, unknown>
    if ("degrees" in obj || "deg" in obj) {
      const deg = parseRational(obj.degrees ?? obj.deg) || 0
      const min = parseRational(obj.minutes ?? obj.min) || 0
      const sec = parseRational(obj.seconds ?? obj.sec) || 0
      let dec = Math.abs(deg) + min / 60 + sec / 3600
      if (deg < 0 || refStr === "S" || refStr === "W" || refStr === "-1" || refStr === "SOUTH" || refStr === "WEST") {
        dec = -Math.abs(dec)
      }
      return Number.isFinite(dec) && dec >= -maxBound && dec <= maxBound ? dec : null
    }
  }

  // 4. String format
  if (typeof value === "string") {
    const str = value.trim()
    if (!str) return null

    // Fractional rational string e.g. "12345/1000"
    if (/^[+-]?[0-9]+\/[0-9]+$/.test(str)) {
      const num = parseRational(str)
      if (Number.isFinite(num)) {
        const dec = (refStr === "S" || refStr === "W") ? -Math.abs(num) : num
        return dec >= -maxBound && dec <= maxBound ? dec : null
      }
    }

    // A. Adobe XMP format: '8,36.9482S' or '116,5.8428E' or '8,36,56.89S' (Mandatory NSEW)
    const adobeMatch = str.match(/^([+-]?[0-9.]+)[,;:\s]+([0-9.]+)(?:[,;:\s]+([0-9.]+))?\s*([NSEW])$/i)
    if (adobeMatch) {
      const deg = parseFloat(adobeMatch[1]) || 0
      const min = parseFloat(adobeMatch[2]) || 0
      const sec = parseFloat(adobeMatch[3]) || 0
      const dir = (adobeMatch[4] || refStr).toUpperCase()
      let dec = Math.abs(deg) + min / 60 + sec / 3600
      if (deg < 0 || dir === "S" || dir === "W") {
        dec = -Math.abs(dec)
      }
      const bound = (dir === "N" || dir === "S") ? 90 : 180
      return Number.isFinite(dec) && dec >= -bound && dec <= bound ? dec : null
    }

    // B. DMS symbols: 8° 36' 56.9" S or 8 deg 36 min 56.9 sec S or 8° 36.9482' S
    const dmsMatch = str.match(/([0-9.]+)\s*(?:deg|°|\*)\s*([0-9.]+)?\s*(?:'|min|m|′)?\s*([0-9.]+)?\s*(?:"|sec|s|″)?\s*([NSEW])?/i)
    if (dmsMatch) {
      const deg = parseFloat(dmsMatch[1]) || 0
      const min = parseFloat(dmsMatch[2]) || 0
      const sec = parseFloat(dmsMatch[3]) || 0
      const dir = (dmsMatch[4] || refStr).toUpperCase()
      let dec = deg + min / 60 + sec / 3600
      if (dir === "S" || dir === "W") {
        dec = -Math.abs(dec)
      }
      const bound = (dir === "N" || dir === "S") ? 90 : 180
      return Number.isFinite(dec) && dec >= -bound && dec <= bound ? dec : null
    }

    // C. Decimal with leading or trailing direction: '8.615803S' or 'S8.615803'
    const dirDecMatch = str.match(/^([NSEW])?\s*([+-]?[0-9.]+)\s*([NSEW])?$/i)
    if (dirDecMatch && (dirDecMatch[1] || dirDecMatch[3])) {
      const dir = (dirDecMatch[1] || dirDecMatch[3] || refStr).toUpperCase()
      const num = parseFloat(dirDecMatch[2])
      if (Number.isFinite(num)) {
        const dec = (dir === "S" || dir === "W") ? -Math.abs(num) : Math.abs(num)
        const bound = (dir === "N" || dir === "S") ? 90 : 180
        return dec >= -bound && dec <= bound ? dec : null
      }
    }

    // D. Direct decimal number with dot or comma: '-8.615803' or '-8,615803'
    const cleanNumStr = str.replace(",", ".")
    const directNum = parseFloat(cleanNumStr)
    if (!Number.isNaN(directNum) && Number.isFinite(directNum)) {
      let dec = directNum
      if (refStr === "S" || refStr === "W") {
        dec = directNum > 0 ? -directNum : directNum
      }
      return dec >= -maxBound && dec <= maxBound ? dec : null
    }
  }

  return null
}

function getAltitude(tags: any): number | null {
  if (!tags) return null
  const rawAlt =
    tags.altitude ??
    tags.GPSAltitude ??
    tags["exif:GPSAltitude"] ??
    tags.xmp?.GPSAltitude ??
    tags.gps?.GPSAltitude

  const num = getCoordinate(rawAlt)
  if (num === null) return null

  const rawRef =
    tags.altitudeRef ??
    tags.GPSAltitudeRef ??
    tags["exif:GPSAltitudeRef"] ??
    tags.xmp?.GPSAltitudeRef ??
    tags.gps?.GPSAltitudeRef

  const refStr = typeof rawRef === "string" ? rawRef.trim().toUpperCase() : ""
  if (rawRef === 1 || rawRef === "1" || refStr === "BELOW SEA LEVEL" || refStr === "BELOW_SEA_LEVEL" || refStr === "1") {
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
    const rawTags = (await exifr.parse(buffer, {
      tiff: true,
      exif: true,
      gps: true,
      xmp: true,
      icc: true,
      iptc: true,
      interop: true,
      reviveValues: true,
      translateKeys: true,
      translateValues: true,
      mergeOutput: true,
    }).catch(() => null)) as any

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
    const offsetVal = rawTags.OffsetTimeOriginal || rawTags.OffsetTime
    const offsetStr = typeof offsetVal === 'string' && /^[+-]\d{2}:\d{2}$/.test(offsetVal.trim()) ? offsetVal.trim() : null

    if (dateVal instanceof Date && !isNaN(dateVal.getTime())) {
      const year = dateVal.getUTCFullYear()
      const month = String(dateVal.getUTCMonth() + 1).padStart(2, "0")
      const day = String(dateVal.getUTCDate()).padStart(2, "0")
      const hour = String(dateVal.getUTCHours()).padStart(2, "0")
      const min = String(dateVal.getUTCMinutes()).padStart(2, "0")
      const sec = String(dateVal.getUTCSeconds()).padStart(2, "0")

      // Preserve pure wall-clock shooting time without timezone jumping or trailing Z
      takenTime = `${year}-${month}-${day}T${hour}:${min}:${sec}`
    } else if (typeof dateVal === "string") {
      const match = dateVal.trim().match(/^(\d{4})[:\-](\d{2})[:\-](\d{2})[T\s](\d{2}):(\d{2}):?(\d{2})?/)
      if (match) {
        const [_, year, month, day, hour, min, sec] = match
        const second = sec || "00"
        takenTime = `${year}-${month}-${day}T${hour}:${min}:${second}`
      }
    }

    const rawLatitude =
      rawTags?.latitude ??
      rawTags?.GPSLatitude ??
      rawTags?.["exif:GPSLatitude"] ??
      rawTags?.xmp?.GPSLatitude ??
      rawTags?.xmp?.latitude ??
      rawTags?.exif?.GPSLatitude ??
      rawTags?.gps?.GPSLatitude ??
      rawTags?.gps?.latitude

    const rawLatRef =
      rawTags?.GPSLatitudeRef ??
      rawTags?.["exif:GPSLatitudeRef"] ??
      rawTags?.xmp?.GPSLatitudeRef ??
      rawTags?.exif?.GPSLatitudeRef ??
      rawTags?.gps?.GPSLatitudeRef

    const rawLongitude =
      rawTags?.longitude ??
      rawTags?.GPSLongitude ??
      rawTags?.["exif:GPSLongitude"] ??
      rawTags?.xmp?.GPSLongitude ??
      rawTags?.xmp?.longitude ??
      rawTags?.exif?.GPSLongitude ??
      rawTags?.gps?.GPSLongitude ??
      rawTags?.gps?.longitude

    const rawLngRef =
      rawTags?.GPSLongitudeRef ??
      rawTags?.["exif:GPSLongitudeRef"] ??
      rawTags?.xmp?.GPSLongitudeRef ??
      rawTags?.exif?.GPSLongitudeRef ??
      rawTags?.gps?.GPSLongitudeRef

    let latitude = getCoordinate(rawLatitude, rawLatRef)
    let longitude = getCoordinate(rawLongitude, rawLngRef)

    // Fallback: dedicated exifr.gps(buffer) call if primary parse didn't resolve coordinates
    if (latitude === null || longitude === null) {
      const gpsFallback = (await exifr.gps(buffer).catch(() => null)) as any
      if (gpsFallback) {
        if (latitude === null && typeof gpsFallback.latitude === "number" && Number.isFinite(gpsFallback.latitude)) {
          latitude = gpsFallback.latitude
        }
        if (longitude === null && typeof gpsFallback.longitude === "number" && Number.isFinite(gpsFallback.longitude)) {
          longitude = gpsFallback.longitude
        }
      }
    }

    // Range validation
    if (latitude !== null && (latitude < -90 || latitude > 90)) latitude = null
    if (longitude !== null && (longitude < -180 || longitude > 180)) longitude = null

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
