import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { locationService } from '../../src/server/service/location-service.ts';

describe('GPS Coordinates & Reverse Geocoding Bounds Test Suite', () => {
  it('gracefully rejects NaN coordinates without calling external API', async () => {
    const res = await locationService.reverseGeocode(NaN, NaN);
    assert.equal(res.address, '');
    assert.equal(res.mapsUrl, '');
  });

  it('rejects positive and negative Infinity', async () => {
    const res1 = await locationService.reverseGeocode(Infinity, 100);
    assert.equal(res1.address, '');
    assert.equal(res1.mapsUrl, '');

    const res2 = await locationService.reverseGeocode(-8.5, -Infinity);
    assert.equal(res2.address, '');
    assert.equal(res2.mapsUrl, '');
  });

  it('rejects latitude outside boundary [-90, 90]', async () => {
    const resOver = await locationService.reverseGeocode(90.0001, 115.1);
    assert.equal(resOver.address, '');
    assert.equal(resOver.mapsUrl, '');

    const resUnder = await locationService.reverseGeocode(-90.0001, 115.1);
    assert.equal(resUnder.address, '');
    assert.equal(resUnder.mapsUrl, '');

    const resExtreme = await locationService.reverseGeocode(999999, 115.1);
    assert.equal(resExtreme.address, '');
  });

  it('rejects longitude outside boundary [-180, 180]', async () => {
    const resOver = await locationService.reverseGeocode(-8.65, 180.0001);
    assert.equal(resOver.address, '');
    assert.equal(resOver.mapsUrl, '');

    const resUnder = await locationService.reverseGeocode(-8.65, -180.0001);
    assert.equal(resUnder.address, '');
    assert.equal(resUnder.mapsUrl, '');

    const resExtreme = await locationService.reverseGeocode(-8.65, -999999);
    assert.equal(resExtreme.address, '');
  });
});
