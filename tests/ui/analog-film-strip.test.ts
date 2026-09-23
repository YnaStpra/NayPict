import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getPhotoAnalogExif } from '../../src/lib/viewer-field.ts';

describe('Analog Film Strip EXIF Parser & Metadata Suite', () => {
  it('correctly parses full Leica M system shooting parameters', () => {
    const leicaExif = JSON.stringify({
      Make: 'Leica Camera AG',
      Model: 'LEICA M11',
      LensMake: 'Leica',
      LensModel: 'Summilux-M 1:1.4/50 ASPH.',
      ExposureTime: 0.002, // 1/500s
      FNumber: 1.4,
      FocalLength: 50,
      ISO: 100,
      ExposureBiasValue: 0.33,
    });

    const parsed = getPhotoAnalogExif(leicaExif);

    assert.equal(parsed.hasExif, true);
    assert.equal(parsed.hasShootingParams, true);
    assert.equal(parsed.hasDeviceParams, true);
    assert.equal(parsed.camera, 'LEICA M11');
    assert.equal(parsed.lens, 'Leica Summilux-M 1:1.4/50 ASPH.');
    assert.equal(parsed.shutter, '1/500s');
    assert.equal(parsed.aperture, 'f/1.4');
    assert.equal(parsed.focalLength, '50mm');
    assert.equal(parsed.iso, '100');
    assert.equal(parsed.exposureBias, '+0.3 EV');
  });

  it('correctly parses Sony Alpha parameters without duplicating brand names', () => {
    const sonyExif = JSON.stringify({
      Make: 'Sony',
      Model: 'Sony ILCE-7M4',
      LensModel: 'FE 35mm F1.4 GM',
      ExposureTime: '1/1000',
      FNumber: '1.4',
      FocalLength: '35mm',
      ISO: 200,
    });

    const parsed = getPhotoAnalogExif(sonyExif);

    assert.equal(parsed.hasExif, true);
    assert.equal(parsed.camera, 'Sony ILCE-7M4');
    assert.equal(parsed.lens, 'FE 35mm F1.4 GM');
    assert.equal(parsed.shutter, '1/1000s');
    assert.equal(parsed.aperture, 'f/1.4');
    assert.equal(parsed.focalLength, '35mm');
    assert.equal(parsed.iso, '200');
  });

  it('correctly parses Fujifilm film simulation camera data', () => {
    const fujiExif = JSON.stringify({
      Make: 'FUJIFILM',
      Model: 'X-T5',
      LensModel: 'XF33mmF1.4 R LM WR',
      ExposureTime: 0.004, // 1/250s
      FNumber: 2.8,
      FocalLength: 33,
      ISO: 400,
      ExposureBiasValue: -0.67,
    });

    const parsed = getPhotoAnalogExif(fujiExif);

    assert.equal(parsed.hasExif, true);
    assert.equal(parsed.camera, 'FUJIFILM X-T5');
    assert.equal(parsed.shutter, '1/250s');
    assert.equal(parsed.aperture, 'f/2.8');
    assert.equal(parsed.focalLength, '33mm');
    assert.equal(parsed.iso, '400');
    assert.equal(parsed.exposureBias, '-0.7 EV');
  });

  it('handles smartphone computational photography (Apple iPhone)', () => {
    const iphoneExif = JSON.stringify({
      Make: 'Apple',
      Model: 'iPhone 15 Pro',
      LensModel: 'iPhone 15 Pro back triple camera 6.86mm f/1.78',
      ExposureTime: 0.016666, // ~1/60s
      FNumber: 1.78,
      FocalLength: 6.86,
      ISO: 64,
    });

    const parsed = getPhotoAnalogExif(iphoneExif);

    assert.equal(parsed.hasExif, true);
    assert.equal(parsed.camera, 'Apple iPhone 15 Pro');
    assert.equal(parsed.shutter, '1/60s');
    assert.equal(parsed.aperture, 'f/1.8');
    assert.equal(parsed.focalLength, '6.9mm');
    assert.equal(parsed.iso, '64');
  });

  it('gracefully handles missing, empty, or invalid JSON EXIF data', () => {
    assert.equal(getPhotoAnalogExif(null).hasExif, false);
    assert.equal(getPhotoAnalogExif(undefined).hasExif, false);
    assert.equal(getPhotoAnalogExif('').hasExif, false);
    assert.equal(getPhotoAnalogExif('{ broken json').hasExif, false);
    assert.equal(getPhotoAnalogExif('{}').hasExif, false);
  });
});
