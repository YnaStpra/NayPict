// This module encapsulates photo location and reverse geocoding API requests.

interface LocationReverseVo {
  address: string;
  latitude: number;
  longitude: number;
  mapsUrl: string;
}

// Memory cache on client to avoid duplicate network calls while browsing.
const clientLocationCache = new Map<string, LocationReverseVo>();

// Fetch human-readable reverse-geocoded address for GPS coordinates.
export async function getReverseGeocode(latitude: number, longitude: number): Promise<LocationReverseVo> {
  const key = `${latitude.toFixed(5)},${longitude.toFixed(5)}`;
  if (clientLocationCache.has(key)) {
    return clientLocationCache.get(key)!;
  }

  try {
    const res = await fetch(`/api/location/reverse?lat=${latitude}&lng=${longitude}`, {
      method: 'GET',
    });
    const json = await res.json().catch(() => null);
    if (json?.data?.address) {
      clientLocationCache.set(key, json.data);
      return json.data;
    }
  } catch (err) {
    console.warn('Failed to fetch reverse geocode address:', err);
  }

  const latText = `${Math.abs(latitude).toFixed(4)}°${latitude >= 0 ? 'N' : 'S'}`;
  const lngText = `${Math.abs(longitude).toFixed(4)}°${longitude >= 0 ? 'E' : 'W'}`;
  const fallback: LocationReverseVo = {
    address: `${latText}, ${lngText}`,
    latitude,
    longitude,
    mapsUrl: `https://www.google.com/maps?q=${latitude},${longitude}`,
  };

  return fallback;
}

export type { LocationReverseVo };
