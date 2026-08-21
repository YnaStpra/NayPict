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
 * Parse any coordinate string (DMS like `8°20'43.0"S 116°31'58.9"E`, Google Maps URLs, or decimal pairs)
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

  // 2. DMS pattern: e.g. 8°20'43.0"S 116°31'58.9"E or 8° 20' 43.0" S, 116° 31' 58.9" E or 8 deg 20 min 43 sec S
  const dmsRegex = /(\d+)[°\s]+(\d+)['\s]+(\d+(?:\.\d+)?)["\s]*([NSEWnsew])/gi
  const matches = [...str.matchAll(dmsRegex)]
  if (matches.length >= 2) {
    function parseDmsMatch(m: RegExpMatchArray): { val: number; isLat: boolean } {
      const deg = parseFloat(m[1])
      const min = parseFloat(m[2])
      const sec = parseFloat(m[3])
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

  // 3. Simple Decimal Degrees: "-8.345278, 116.533028" or "-8.345278 116.533028"
  const ddRegex = /^(-?\d+\.?\d*)[,\s]+(-?\d+\.?\d*)$/
  const ddMatch = str.match(ddRegex)
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
