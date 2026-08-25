// This module provides browser-side EXIF and GPS extraction directly from original uncompressed file buffers.

import exifr from 'exifr';

export interface ClientExifResult {
  latitude: number | null;
  longitude: number | null;
  altitude: number | null;
  takenTime: string | null;
  exif: string | null;
}

function getCoordinate(value: unknown, ref?: unknown): number | null {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  const refStr = typeof ref === 'string' ? ref.trim().toUpperCase() : '';

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return null;
    if (refStr === 'S' || refStr === 'W' || refStr === '-1' || refStr === 'SOUTH' || refStr === 'WEST') {
      return value > 0 ? -value : value;
    }
    return value;
  }

  if (Array.isArray(value) && value.length >= 1) {
    const deg = Number(value[0]) || 0;
    const min = Number(value[1]) || 0;
    const sec = Number(value[2]) || 0;
    let dec = deg + min / 60 + sec / 3600;
    if (refStr === 'S' || refStr === 'W' || refStr === '-1' || refStr === 'SOUTH' || refStr === 'WEST') {
      dec = -Math.abs(dec);
    }
    return Number.isFinite(dec) ? dec : null;
  }

  if (typeof value === 'object' && value !== null) {
    const obj = value as Record<string, unknown>;
    if ('degrees' in obj || 'deg' in obj) {
      const deg = Number(obj.degrees ?? obj.deg) || 0;
      const min = Number(obj.minutes ?? obj.min) || 0;
      const sec = Number(obj.seconds ?? obj.sec) || 0;
      let dec = deg + min / 60 + sec / 3600;
      if (refStr === 'S' || refStr === 'W' || refStr === '-1' || refStr === 'SOUTH' || refStr === 'WEST') {
        dec = -Math.abs(dec);
      }
      return Number.isFinite(dec) ? dec : null;
    }
  }

  if (typeof value === 'string') {
    const str = value.trim();
    const directNum = Number(str);
    if (!Number.isNaN(directNum) && Number.isFinite(directNum)) {
      if (refStr === 'S' || refStr === 'W') {
        return directNum > 0 ? -directNum : directNum;
      }
      return directNum;
    }

    const dmsMatch = str.match(/([0-9.]+)\s*(?:deg|°)\s*([0-9.]+)?\s*(?:'|min)?\s*([0-9.]+)?\s*(?:"|sec)?\s*([NSEW])?/i);
    if (dmsMatch) {
      const deg = parseFloat(dmsMatch[1]) || 0;
      const min = parseFloat(dmsMatch[2]) || 0;
      const sec = parseFloat(dmsMatch[3]) || 0;
      const dir = (dmsMatch[4] || refStr).toUpperCase();
      let dec = deg + min / 60 + sec / 3600;
      if (dir === 'S' || dir === 'W') {
        dec = -Math.abs(dec);
      }
      return Number.isFinite(dec) ? dec : null;
    }
  }

  return null;
}

/**
 * Parses shooting EXIF metadata and GPS coordinates directly from original File object in browser.
 */
export async function extractClientExif(file: File): Promise<ClientExifResult> {
  try {
    const rawTags = await exifr.parse(file, {
      tiff: true,
      exif: true,
      gps: true,
      xmp: true,
      reviveValues: true,
      translateKeys: true,
      translateValues: true,
    });

    if (!rawTags) {
      return {
        latitude: null,
        longitude: null,
        altitude: null,
        takenTime: null,
        exif: null,
      };
    }

    const latitude = getCoordinate(rawTags.latitude ?? rawTags.GPSLatitude, rawTags.GPSLatitudeRef);
    const longitude = getCoordinate(rawTags.longitude ?? rawTags.GPSLongitude, rawTags.GPSLongitudeRef);
    const rawAlt = rawTags.altitude ?? rawTags.GPSAltitude;
    const altitude = rawAlt != null ? getCoordinate(rawAlt) : null;

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

      if (offsetStr) {
        const d = new Date(`${year}-${month}-${day}T${hour}:${min}:${sec}${offsetStr}`);
        if (!isNaN(d.getTime())) takenTime = d.toISOString();
      } else {
        // Map wall-clock numbers to local time
        const local = new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(min), Number(sec));
        if (!isNaN(local.getTime())) takenTime = local.toISOString();
      }
    } else if (typeof dateVal === 'string') {
      const match = dateVal.trim().match(/^(\d{4})[:\-](\d{2})[:\-](\d{2})[T\s](\d{2}):(\d{2}):?(\d{2})?/);
      if (match) {
        const [_, year, month, day, hour, min, sec] = match;
        const second = sec || '00';
        if (offsetStr) {
          const d = new Date(`${year}-${month}-${day}T${hour}:${min}:${second}${offsetStr}`);
          if (!isNaN(d.getTime())) takenTime = d.toISOString();
        } else {
          const local = new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(min), Number(second));
          if (!isNaN(local.getTime())) takenTime = local.toISOString();
        }
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
