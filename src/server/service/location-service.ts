// This module provides reverse geocoding services to convert photo GPS coordinates into readable addresses.

interface ReverseGeocodeResult {
  address: string;
  latitude: number;
  longitude: number;
  mapsUrl: string;
}

// In-memory cache for reverse geocoding results to minimize external API requests.
const addressCache = new Map<string, string>();

const locationService = {

  // Reverse geocode latitude and longitude into a formatted human-readable address.
  async reverseGeocode(latitude: number, longitude: number): Promise<ReverseGeocodeResult> {
    const lat = Number(latitude);
    const lng = Number(longitude);

    const mapsUrl = `https://www.google.com/maps?q=${lat},${lng}`;

    if (isNaN(lat) || isNaN(lng)) {
      return {
        address: '',
        latitude: lat,
        longitude: lng,
        mapsUrl,
      };
    }

    // Cache key rounded to ~5 decimal places (approx. 1 meter precision)
    const cacheKey = `${lat.toFixed(5)},${lng.toFixed(5)}`;
    if (addressCache.has(cacheKey)) {
      return {
        address: addressCache.get(cacheKey)!,
        latitude: lat,
        longitude: lng,
        mapsUrl,
      };
    }

    try {
      // Query OpenStreetMap Nominatim reverse geocoder
      const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`;
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'NayPict-PhotoGallery/1.0 (https://naypict.vercel.app)',
          'Accept-Language': 'id,en;q=0.9',
        },
      });

      if (!response.ok) {
        throw new Error(`Nominatim error: ${response.status}`);
      }

      const data = await response.json();
      let formattedAddress = '';

      if (data && data.address) {
        const a = data.address;
        const parts: string[] = [];

        // Road / Street
        if (a.road) parts.push(a.road);
        if (a.house_number) parts.push(`No.${a.house_number}`);
        if (a.neighbourhood && a.neighbourhood !== a.road) parts.push(a.neighbourhood);
        if (a.suburb) parts.push(a.suburb);
        if (a.village && a.village !== a.suburb) parts.push(a.village);
        if (a.city_district) {
          const district = a.city_district.startsWith('Kecamatan') || a.city_district.startsWith('Kec.')
            ? a.city_district
            : `Kec. ${a.city_district}`;
          parts.push(district);
        }
        if (a.city || a.town || a.municipality || a.county) {
          parts.push(a.city || a.town || a.municipality || a.county);
        }
        if (a.state) parts.push(a.state);
        if (a.postcode) parts.push(a.postcode);
        if (a.country) parts.push(a.country);

        formattedAddress = parts.filter(Boolean).join(', ');
      }

      if (!formattedAddress && data?.display_name) {
        formattedAddress = data.display_name;
      }

      // Fallback to formatted coordinates if no address found
      if (!formattedAddress) {
        const latText = `${Math.abs(lat).toFixed(4)}°${lat >= 0 ? 'N' : 'S'}`;
        const lngText = `${Math.abs(lng).toFixed(4)}°${lng >= 0 ? 'E' : 'W'}`;
        formattedAddress = `${latText}, ${lngText}`;
      }

      addressCache.set(cacheKey, formattedAddress);

      return {
        address: formattedAddress,
        latitude: lat,
        longitude: lng,
        mapsUrl,
      };
    } catch (err) {
      console.warn('[LOCATION] Reverse geocoding failed, using coordinates fallback:', err);
      const latText = `${Math.abs(lat).toFixed(4)}°${lat >= 0 ? 'N' : 'S'}`;
      const lngText = `${Math.abs(lng).toFixed(4)}°${lng >= 0 ? 'E' : 'W'}`;
      const fallback = `${latText}, ${lngText}`;
      return {
        address: fallback,
        latitude: lat,
        longitude: lng,
        mapsUrl,
      };
    }
  },
};

export { locationService };
export type { ReverseGeocodeResult };
