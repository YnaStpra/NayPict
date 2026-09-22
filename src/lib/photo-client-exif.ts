// This module provides browser-side EXIF and GPS extraction directly from original uncompressed file buffers.

import exifr from 'exifr';

export interface ClientExifResult {
  latitude: number | null;
  longitude: number | null;
  altitude: number | null;
  takenTime: string | null;
  exif: string | null;
}

function parseRational(val: unknown): number {
  if (typeof val === 'number') return val;
  if (typeof val === 'string') {
    const s = val.trim();
    if (s.includes('/')) {
      const parts = s.split('/');
      const num = parseFloat(parts[0]);
      const den = parseFloat(parts[1]);
      if (den !== 0 && !isNaN(num) && !isNaN(den)) return num / den;
    }
    return parseFloat(s);
  }
  return NaN;
}

export function getCoordinate(value: unknown, ref?: unknown): number | null {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  const refStr = typeof ref === 'string' ? ref.trim().toUpperCase() : '';
  const isLatRef = refStr === 'N' || refStr === 'S' || refStr === 'NORTH' || refStr === 'SOUTH';
  const maxBound = isLatRef ? 90 : 180;

  // 1. Direct finite number
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return null;
    let dec = value;
    if (refStr === 'S' || refStr === 'W' || refStr === '-1' || refStr === 'SOUTH' || refStr === 'WEST') {
      dec = -Math.abs(dec);
    }
    return Number.isFinite(dec) && dec >= -maxBound && dec <= maxBound ? dec : null;
  }

  // 2. Array of numbers or rational strings [deg, min, sec]
  if (Array.isArray(value) && value.length >= 1) {
    const deg = parseRational(value[0]) || 0;
    const min = parseRational(value[1]) || 0;
    const sec = parseRational(value[2]) || 0;
    let dec = Math.abs(deg) + min / 60 + sec / 3600;
    if (deg < 0 || refStr === 'S' || refStr === 'W' || refStr === '-1' || refStr === 'SOUTH' || refStr === 'WEST') {
      dec = -Math.abs(dec);
    }
    return Number.isFinite(dec) && dec >= -maxBound && dec <= maxBound ? dec : null;
  }

  // 3. Object with degrees, minutes, seconds
  if (typeof value === 'object' && value !== null) {
    const obj = value as Record<string, unknown>;
    if ('degrees' in obj || 'deg' in obj) {
      const deg = parseRational(obj.degrees ?? obj.deg) || 0;
      const min = parseRational(obj.minutes ?? obj.min) || 0;
      const sec = parseRational(obj.seconds ?? obj.sec) || 0;
      let dec = Math.abs(deg) + min / 60 + sec / 3600;
      if (deg < 0 || refStr === 'S' || refStr === 'W' || refStr === '-1' || refStr === 'SOUTH' || refStr === 'WEST') {
        dec = -Math.abs(dec);
      }
      return Number.isFinite(dec) && dec >= -180 && dec <= 180 ? dec : null;
    }
  }

  // 4. String format
  if (typeof value === 'string') {
    const str = value.trim();
    if (!str) return null;

    // Fractional rational string e.g. "12345/1000"
    if (/^[+-]?[0-9]+\/[0-9]+$/.test(str)) {
      const num = parseRational(str);
      if (Number.isFinite(num)) {
        const dec = (refStr === 'S' || refStr === 'W') ? -Math.abs(num) : num;
        return dec >= -180 && dec <= 180 ? dec : null;
      }
    }

    // A. Adobe XMP format: '8,36.9482S' or '116,5.8428E' or '8,36,56.89S' (Mandatory NSEW)
    const adobeMatch = str.match(/^([+-]?[0-9.]+)[,;:\s]+([0-9.]+)(?:[,;:\s]+([0-9.]+))?\s*([NSEW])$/i);
    if (adobeMatch) {
      const deg = parseFloat(adobeMatch[1]) || 0;
      const min = parseFloat(adobeMatch[2]) || 0;
      const sec = parseFloat(adobeMatch[3]) || 0;
      const dir = (adobeMatch[4] || refStr).toUpperCase();
      let dec = Math.abs(deg) + min / 60 + sec / 3600;
      if (deg < 0 || dir === 'S' || dir === 'W') {
        dec = -Math.abs(dec);
      }
      const bound = (dir === 'N' || dir === 'S') ? 90 : 180;
      return Number.isFinite(dec) && dec >= -bound && dec <= bound ? dec : null;
    }

    // B. DMS symbols: 8° 36' 56.9" S or 8 deg 36 min 56.9 sec S or 8° 36.9482' S
    const dmsMatch = str.match(/([0-9.]+)\s*(?:deg|°|\*)\s*([0-9.]+)?\s*(?:'|min|m|′)?\s*([0-9.]+)?\s*(?:"|sec|s|″)?\s*([NSEW])?/i);
    if (dmsMatch) {
      const deg = parseFloat(dmsMatch[1]) || 0;
      const min = parseFloat(dmsMatch[2]) || 0;
      const sec = parseFloat(dmsMatch[3]) || 0;
      const dir = (dmsMatch[4] || refStr).toUpperCase();
      let dec = deg + min / 60 + sec / 3600;
      if (dir === 'S' || dir === 'W') {
        dec = -Math.abs(dec);
      }
      const bound = (dir === 'N' || dir === 'S') ? 90 : 180;
      return Number.isFinite(dec) && dec >= -bound && dec <= bound ? dec : null;
    }

    // C. Decimal with leading or trailing direction: '8.615803S' or 'S8.615803'
    const dirDecMatch = str.match(/^([NSEW])?\s*([+-]?[0-9.]+)\s*([NSEW])?$/i);
    if (dirDecMatch && (dirDecMatch[1] || dirDecMatch[3])) {
      const dir = (dirDecMatch[1] || dirDecMatch[3] || refStr).toUpperCase();
      const num = parseFloat(dirDecMatch[2]);
      if (Number.isFinite(num)) {
        const dec = (dir === 'S' || dir === 'W') ? -Math.abs(num) : Math.abs(num);
        const bound = (dir === 'N' || dir === 'S') ? 90 : 180;
        return dec >= -bound && dec <= bound ? dec : null;
      }
    }

    // D. Direct decimal number with dot or comma: '-8.615803' or '-8,615803'
    const cleanNumStr = str.replace(',', '.');
    const directNum = parseFloat(cleanNumStr);
    if (!Number.isNaN(directNum) && Number.isFinite(directNum)) {
      let dec = directNum;
      if (refStr === 'S' || refStr === 'W') {
        dec = directNum > 0 ? -directNum : directNum;
      }
      return dec >= -maxBound && dec <= maxBound ? dec : null;
    }
  }

  return null;
}

export function getAltitude(value: unknown, ref?: unknown): number | null {
  if (value === undefined || value === null || value === '') return null;
  const num = getCoordinate(value);
  if (num === null) return null;

  const refStr = typeof ref === 'string' ? ref.trim().toUpperCase() : '';
  if (ref === 1 || ref === '1' || refStr === 'BELOW SEA LEVEL' || refStr === 'BELOW_SEA_LEVEL' || refStr === '1') {
    return -Math.abs(num);
  }
  return num;
}

/**
 * Parses shooting EXIF metadata and GPS coordinates directly from original File object in browser.
 */
export async function extractClientExif(file: File): Promise<ClientExifResult> {
  try {
    const rawTags = (await exifr.parse(file, {
      tiff: true,
      exif: true,
      gps: true,
      xmp: true,
      icc: true,
      iptc: true,
      reviveValues: true,
      translateKeys: true,
      translateValues: true,
      mergeOutput: true,
    }).catch(() => null)) as any;

    const rawLatitude =
      rawTags?.latitude ??
      rawTags?.GPSLatitude ??
      rawTags?.['exif:GPSLatitude'] ??
      rawTags?.xmp?.GPSLatitude ??
      rawTags?.xmp?.latitude ??
      rawTags?.exif?.GPSLatitude ??
      rawTags?.gps?.GPSLatitude ??
      rawTags?.gps?.latitude;

    const rawLatRef =
      rawTags?.GPSLatitudeRef ??
      rawTags?.['exif:GPSLatitudeRef'] ??
      rawTags?.xmp?.GPSLatitudeRef ??
      rawTags?.exif?.GPSLatitudeRef ??
      rawTags?.gps?.GPSLatitudeRef;

    const rawLongitude =
      rawTags?.longitude ??
      rawTags?.GPSLongitude ??
      rawTags?.['exif:GPSLongitude'] ??
      rawTags?.xmp?.GPSLongitude ??
      rawTags?.xmp?.longitude ??
      rawTags?.exif?.GPSLongitude ??
      rawTags?.gps?.GPSLongitude ??
      rawTags?.gps?.longitude;

    const rawLngRef =
      rawTags?.GPSLongitudeRef ??
      rawTags?.['exif:GPSLongitudeRef'] ??
      rawTags?.xmp?.GPSLongitudeRef ??
      rawTags?.exif?.GPSLongitudeRef ??
      rawTags?.gps?.GPSLongitudeRef;

    let latitude = getCoordinate(rawLatitude, rawLatRef);
    let longitude = getCoordinate(rawLongitude, rawLngRef);

    // Fallback: dedicated exifr.gps(file) call if primary parse didn't resolve coordinates
    if (latitude === null || longitude === null) {
      const gpsFallback = (await exifr.gps(file).catch(() => null)) as any;
      if (gpsFallback) {
        if (latitude === null && typeof gpsFallback.latitude === 'number' && Number.isFinite(gpsFallback.latitude)) {
          latitude = gpsFallback.latitude;
        }
        if (longitude === null && typeof gpsFallback.longitude === 'number' && Number.isFinite(gpsFallback.longitude)) {
          longitude = gpsFallback.longitude;
        }
      }
    }

    // Geographic bounds validation
    if (latitude !== null && (latitude < -90 || latitude > 90)) {
      latitude = null;
    }
    if (longitude !== null && (longitude < -180 || longitude > 180)) {
      longitude = null;
    }

    const rawAlt =
      rawTags?.altitude ??
      rawTags?.GPSAltitude ??
      rawTags?.['exif:GPSAltitude'] ??
      rawTags?.xmp?.GPSAltitude ??
      rawTags?.gps?.GPSAltitude;

    const rawAltRef =
      rawTags?.altitudeRef ??
      rawTags?.GPSAltitudeRef ??
      rawTags?.['exif:GPSAltitudeRef'] ??
      rawTags?.xmp?.GPSAltitudeRef ??
      rawTags?.gps?.GPSAltitudeRef;

    const altitude = getAltitude(rawAlt, rawAltRef);

    if (!rawTags && latitude === null && longitude === null) {
      return {
        latitude: null,
        longitude: null,
        altitude: null,
        takenTime: null,
        exif: null,
      };
    }

    let takenTime: string | null = null;
    const dateVal = rawTags.DateTimeOriginal || rawTags.CreateDate || rawTags.ModifyDate;
    const offsetVal = rawTags.OffsetTimeOriginal || rawTags.OffsetTime;
    const offsetStr = typeof offsetVal === 'string' && /^[+-]\d{2}:\d{2}$/.test(offsetVal.trim()) ? offsetVal.trim() : null;

    if (dateVal instanceof Date && !isNaN(dateVal.getTime())) {
      // Extract the raw EXIF numbers that exifr read from the file
      const year = dateVal.getUTCFullYear();
      const month = String(dateVal.getUTCMonth() + 1).padStart(2, '0');
      const day = String(dateVal.getUTCDate()).padStart(2, '0');
      const hour = String(dateVal.getUTCHours()).padStart(2, '0');
      const min = String(dateVal.getUTCMinutes()).padStart(2, '0');
      const sec = String(dateVal.getUTCSeconds()).padStart(2, '0');

      // Preserve camera wall-clock shooting time without UTC day-shift rollback
      takenTime = `${year}-${month}-${day}T${hour}:${min}:${sec}`;
    } else if (typeof dateVal === 'string') {
      const match = dateVal.trim().match(/^(\d{4})[:\-](\d{2})[:\-](\d{2})[T\s](\d{2}):(\d{2}):?(\d{2})?/);
      if (match) {
        const [_, year, month, day, hour, min, sec] = match;
        const second = sec || '00';
        takenTime = `${year}-${month}-${day}T${hour}:${min}:${second}`;
      }
    }

    const data: Record<string, unknown> = {};
    const setIfValid = (targetKey: string, val: unknown) => {
      if (val !== undefined && val !== null && val !== '') {
        data[targetKey] = typeof val === 'object' && 'toString' in val ? String(val) : val;
      }
    };

    setIfValid('Make', rawTags.Make);
    setIfValid('Model', rawTags.Model);
    setIfValid('LensMake', rawTags.LensMake);
    setIfValid('LensModel', rawTags.LensModel);
    setIfValid('Software', rawTags.Software);
    setIfValid('ISO', rawTags.ISO ?? rawTags.ISOSpeedRatings);
    setIfValid('FNumber', rawTags.FNumber ? String(rawTags.FNumber) : null);
    setIfValid('FocalLength', rawTags.FocalLength ? `${rawTags.FocalLength} mm` : null);

    if (rawTags.ExposureTime != null) {
      const et = Number(rawTags.ExposureTime);
      if (!isNaN(et)) {
        setIfValid('ExposureTime', et < 1 ? `1/${Math.round(1 / et)}` : String(et));
      }
    }

    if (rawTags.ColorSpace) {
      setIfValid('ColorSpace', String(rawTags.ColorSpace));
    }

    return {
      latitude,
      longitude,
      altitude,
      takenTime,
      exif: Object.keys(data).length > 0 ? JSON.stringify(data) : null,
    };
  } catch (err) {
    console.warn('Client-side EXIF parse warning:', err);
    return {
      latitude: null,
      longitude: null,
      altitude: null,
      takenTime: null,
      exif: null,
    };
  }
}
