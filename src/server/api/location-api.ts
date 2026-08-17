import type { Context, Hono } from 'hono';
import result from '@/server/model/result';
import { locationService } from '@/server/service/location-service';
import type { HonoEnv } from '../hono/type';

// This module handles API endpoints for reverse geocoding photo GPS coordinates.

export function registerLocationApi(app: Hono<HonoEnv>) {

  // Public endpoint: Reverse geocode latitude and longitude into formatted address.
  app.get('/location/reverse', async (c: Context) => {
    const latParam = c.req.query('lat');
    const lngParam = c.req.query('lng');

    if (!latParam || !lngParam) {
      return c.json(result.ok({ address: '', latitude: 0, longitude: 0, mapsUrl: '' }));
    }

    const lat = parseFloat(latParam);
    const lng = parseFloat(lngParam);

    const res = await locationService.reverseGeocode(lat, lng);
    return c.json(result.ok(res));
  });
}
