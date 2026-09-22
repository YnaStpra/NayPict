import { getCoordinate } from "./photo-client-exif.ts"

/**
 * Geographical coordinate conversion and parsing utilities.
 * Supports Degrees Minutes Seconds (DMS), Decimal Degrees (DD), and Google Maps formats.
 */

export interface ParsedCoordinate {
  latitude: number
  longitude: number
  dmsString: string
  decimalString: string
}

/**
 * Convert Decimal Degrees to standard DMS string.
 * Example: (-8.345278, 116.533028) -> '8°20\'43.0"S 116°31\'58.9"E'
 */
export function decimalToDms(lat: number, lng: number): string {
  function toDmsPart(val: number, isLat: boolean): string {
    const dir = isLat ? (val >= 0 ? "N" : "S") : (val >= 0 ? "E" : "W")
    const absVal = Math.abs(val)
    const deg = Math.floor(absVal)
    const minFloat = (absVal - deg) * 60
    const min = Math.floor(minFloat)
    const sec = ((minFloat - min) * 60).toFixed(1)
    return `${deg}°${min}'${sec}"${dir}`
  }

  return `${toDmsPart(lat, true)} ${toDmsPart(lng, false)}`
}

/**
 * Parse a single coordinate string (latitude or longitude) in any format:
 * DMS (8°20'43.0"S), decimal minutes (8°36.9482'S), Adobe format (8,36.9482S),
 * signed decimal (-8.345278), comma decimal (-8,345278), or directional decimal (8.345278S).
 */
export function parseSingleCoordinate(input: unknown, isLat = true): number | null {
  if (input === undefined || input === null || input === "") return null
  const str = String(input).trim()
  if (!str) return null

  const ref = isLat ? "N" : "E"
  const val = getCoordinate(str, ref)
  if (val === null || !Number.isFinite(val)) return null

  const bound = isLat ? 90 : 180
  if (val < -bound || val > bound) return null
  return Number(val.toFixed(6))
}

/**
 * Parse any coordinate string (DMS like `8°20'43.0"S 116°31'58.9"E`, Adobe format, Google Maps URLs, or decimal pairs)
 * into numeric latitude and longitude.
 */
export function parseCoordinateString(input: string): ParsedCoordinate | null {
  if (!input || !input.trim()) return null
  const str = input.trim()

  // 1. Google Maps URL or search query pattern: /@(-?\d+\.\d+),(-?\d+\.\d+) or ?q=(-?\d+\.\d+),(-?\d+\.\d+)
  const urlMatch = str.match(/(@|\?q=)(-?\d+\.?\d*),\s*(-?\d+\.?\d*)/)
  if (urlMatch) {
    const lat = parseFloat(urlMatch[2])
    const lng = parseFloat(urlMatch[3])
    if (!isNaN(lat) && !isNaN(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
      const roundedLat = Number(lat.toFixed(6))
      const roundedLng = Number(lng.toFixed(6))
      return {
        latitude: roundedLat,
        longitude: roundedLng,
        dmsString: decimalToDms(roundedLat, roundedLng),
        decimalString: `${roundedLat}, ${roundedLng}`,
      }
    }
  }

  // 2. Adobe Lightroom format pair: e.g. "8,36.9482S 116,5.8428E" or "8,36.9482S, 116,5.8428E"
  const adobePairMatch = str.match(/^([+-]?[0-9.]+[,;:\s]+[0-9.]+(?:[,;:\s]+[0-9.]+)?\s*[NSEW])[,;\s]+([+-]?[0-9.]+[,;:\s]+[0-9.]+(?:[,;:\s]+[0-9.]+)?\s*[NSEW])$/i)
  if (adobePairMatch) {
    const p1 = parseSingleCoordinate(adobePairMatch[1], true)
    const p2 = parseSingleCoordinate(adobePairMatch[2], false)
    if (p1 !== null && p2 !== null) {
      return {
        latitude: p1,
        longitude: p2,
        dmsString: decimalToDms(p1, p2),
        decimalString: `${p1}, ${p2}`,
      }
    }
  }

  // 3. DMS pattern: supports full DMS (8°20'43.0"S) or decimal minutes (8°36.9482'S)
  const dmsRegex = /(\d+)[°\s]+(\d+(?:\.\d+)?)(?:['\s]+(\d+(?:\.\d+)?)["\s]*)?\s*([NSEWnsew])/gi
  const matches = [...str.matchAll(dmsRegex)]
  if (matches.length >= 2) {
    function parseDmsMatch(m: RegExpMatchArray): { val: number; isLat: boolean } {
      const deg = parseFloat(m[1]) || 0
      const min = parseFloat(m[2]) || 0
      const sec = parseFloat(m[3]) || 0
      const dir = m[4].toUpperCase()
      const isLat = dir === "N" || dir === "S"
      let val = deg + min / 60 + sec / 3600
      if (dir === "S" || dir === "W") val = -val
      return { val, isLat }
    }

    const p1 = parseDmsMatch(matches[0])
    const p2 = parseDmsMatch(matches[1])

    const lat = p1.isLat ? p1.val : p2.val
    const lng = !p1.isLat ? p1.val : p2.val

    if (!isNaN(lat) && !isNaN(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
      const roundedLat = Number(lat.toFixed(6))
      const roundedLng = Number(lng.toFixed(6))
      return {
        latitude: roundedLat,
        longitude: roundedLng,
        dmsString: decimalToDms(roundedLat, roundedLng),
        decimalString: `${roundedLat}, ${roundedLng}`,
      }
    }
  }

  // 4. Simple Decimal Degrees: "-8.345278, 116.533028" or "-8.345278 116.533028" or with commas "-8,345278, 116,533028"
  let normalized = str
  if (/^[+-]?\d+,\d+\s*,\s*[+-]?\d+,\d+$/.test(str)) {
    const parts = str.split(/\s*,\s*/)
    if (parts.length === 2) {
      normalized = `${parts[0].replace(",", ".")} ${parts[1].replace(",", ".")}`
    }
  }
  const ddRegex = /^(-?\d+\.?\d*)[,\s]+(-?\d+\.?\d*)$/
  const ddMatch = normalized.match(ddRegex)
  if (ddMatch) {
    const lat = parseFloat(ddMatch[1])
    const lng = parseFloat(ddMatch[2])
    if (!isNaN(lat) && !isNaN(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
      const roundedLat = Number(lat.toFixed(6))
      const roundedLng = Number(lng.toFixed(6))
      return {
        latitude: roundedLat,
        longitude: roundedLng,
        dmsString: decimalToDms(roundedLat, roundedLng),
        decimalString: `${roundedLat}, ${roundedLng}`,
      }
    }
  }

  return null
}

/**
 * Calculate geographical distance in kilometers between two coordinates using the Haversine formula.
 */
export function calculateDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  if (lat1 === lat2 && lon1 === lon2) return 0
  const R = 6371 // Earth radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLon = ((lon2 - lon1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

/**
 * Format distance into concise human-readable badge text.
 * Examples: "850m", "1.2km", "25km", "1,250km"
 */
export function formatDistance(distKm: number): string {
  if (isNaN(distKm) || distKm < 0) return ""
  if (distKm < 0.1) return "< 100m"
  if (distKm < 1) {
    const meters = Math.round(distKm * 1000)
    return `${meters}m`
  }
  if (distKm < 10) {
    return `${distKm.toFixed(1)}km`
  }
  return `${Math.round(distKm).toLocaleString("en-US")}km`
}

/**
 * Format distance into an expressive perspective story string.
 * Examples:
 * - "Only 850m from your current location"
 * - "3.2 km from your current location"
 * - "Captured 950 km away from where you are"
 */
export function formatDistancePerspective(distKm: number): string {
  if (isNaN(distKm) || distKm < 0) return ""
  if (distKm < 1) {
    const meters = Math.round(distKm * 1000)
    return `Only ${meters}m from your current location`
  }
  if (distKm < 20) {
    return `${distKm.toFixed(1)} km from your current location`
  }
  if (distKm < 100) {
    return `${Math.round(distKm)} km from your current location`
  }
  return `Captured ${Math.round(distKm).toLocaleString("en-US")} km away from where you are`
}

/**
 * Generate universal Google Maps directions link from current user spot to photo coordinates.
 */
export function getDirectionsUrl(lat: number, lng: number): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`
}
