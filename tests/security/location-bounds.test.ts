import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { locationService } from '../../src/server/service/location-service.ts';
import { getCoordinate, getAltitude } from '../../src/lib/photo-client-exif.ts';

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

  describe('EXIF & Adobe XMP GPS Extraction Parsing', () => {
    it('correctly parses Adobe Lightroom XMP GPS coordinate format (e.g. "8,36.9482S", "116,5.8428E")', () => {
      const lat = getCoordinate('8,36.9482S');
      const lng = getCoordinate('116,5.8428E');

      assert.ok(lat !== null);
      assert.ok(lng !== null);
      // 8 + 36.9482/60 = 8.615803 -> S is negative: -8.615803
      assert.ok(Math.abs(lat - -8.615803) < 0.0001, `Expected ~-8.615803, got ${lat}`);
      // 116 + 5.8428/60 = 116.09738 -> E is positive: 116.09738
      assert.ok(Math.abs(lng - 116.09738) < 0.0001, `Expected ~116.09738, got ${lng}`);
    });

    it('correctly parses DMS string representations', () => {
      const lat = getCoordinate(`8° 36' 56.9" S`);
      const lng = getCoordinate(`116° 5' 50.57" E`);

      assert.ok(lat !== null);
      assert.ok(lng !== null);
      assert.ok(Math.abs(lat - -8.615805) < 0.0001);
      assert.ok(Math.abs(lng - 116.09738) < 0.0001);
    });

    it('correctly parses rational numbers and array coordinates', () => {
      const lat = getCoordinate([8, 36, '569/10'], 'S');
      assert.ok(lat !== null);
      assert.ok(Math.abs(lat - -8.615805) < 0.0001);

      const rationalCoord = getCoordinate('42/1');
      assert.equal(rationalCoord, 42);
    });

    it('correctly parses decimal strings with direction or commas', () => {
      const lat1 = getCoordinate('8.615803S');
      assert.ok(lat1 !== null && Math.abs(lat1 - -8.615803) < 0.000001);

      const lat2 = getCoordinate('S8.615803');
      assert.ok(lat2 !== null && Math.abs(lat2 - -8.615803) < 0.000001);

      const lat3 = getCoordinate('-8,615803');
      assert.ok(lat3 !== null && Math.abs(lat3 - -8.615803) < 0.000001);
    });

    it('enforces GPS latitude and longitude boundary limits', () => {
      assert.equal(getCoordinate(95.0, 'N'), null);
      assert.equal(getCoordinate(-95.0, 'S'), null);
      assert.equal(getCoordinate(195.0), null);
      assert.equal(getCoordinate(-195.0), null);
      assert.equal(getCoordinate('185,10.5E'), null);
      assert.equal(getCoordinate('95,10.5N'), null);
      assert.equal(getCoordinate('999'), null);
    });

    it('correctly parses altitude with below sea level references', () => {
      assert.equal(getAltitude(120), 120);
      assert.equal(getAltitude('45.5'), 45.5);
      assert.equal(getAltitude(15, 1), -15);
      assert.equal(getAltitude('20', 'BELOW SEA LEVEL'), -20);
    });
  });
});

