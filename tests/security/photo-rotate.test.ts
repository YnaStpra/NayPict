import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import BizError from '@/server/error/biz-error';
import { normalizeRotationAngle, processPhotoImages, rotatePhotoImages } from '@/server/lib/photo-process';
import {
  getEffectiveMediaDimensions,
  getRotatedMediaWrapperProps,
  isQuarterTurnRotation,
  normalizeRotationDegrees,
} from '@/lib/media-orientation';

describe('Admin Media Rotation & Default Persistence', () => {
  describe('RBAC & Endpoint Hardening', () => {
    it('registers /photo/rotate in SYSTEM_PATHS so guests and standard users are blocked', () => {
      const securitySrc = fs.readFileSync(
        path.join(process.cwd(), 'src/server/security/security.ts'),
        'utf8'
      );
      assert.match(securitySrc, /['"]\/photo\/rotate['"]/);
    });

    it('enforces authentication and emits PHOTO_ROTATE security audit logging in photo-api.ts', () => {
      const apiSrc = fs.readFileSync(
        path.join(process.cwd(), 'src/server/api/photo-api.ts'),
        'utf8'
      );
      assert.match(apiSrc, /app\.post\(['"]\/photo\/rotate['"]/);
      assert.match(apiSrc, /action:\s*['"]PHOTO_ROTATE['"]/);
    });

    it('defines integer rotation column defaulting to 0 on photo table and SQL migration', () => {
      const entitySrc = fs.readFileSync(
        path.join(process.cwd(), 'src/server/entity/photo.ts'),
        'utf8'
      );
      const migrateSrc = fs.readFileSync(
        path.join(process.cwd(), 'src/server/infra/migrate.ts'),
        'utf8'
      );
      assert.match(entitySrc, /rotation:\s*integer\(['"]rotation['"]\)\.notNull\(\)\.default\(0\)/);
      assert.match(migrateSrc, /ADD COLUMN IF NOT EXISTS "rotation" integer DEFAULT 0 NOT NULL/);
    });
  });

  describe('Server Rotation Angle Validation', () => {
    it('normalizes valid clockwise and negative 90-degree multiples into 0 | 90 | 180 | 270', () => {
      assert.equal(normalizeRotationAngle(0), 0);
      assert.equal(normalizeRotationAngle(90), 90);
      assert.equal(normalizeRotationAngle(180), 180);
      assert.equal(normalizeRotationAngle(270), 270);
      assert.equal(normalizeRotationAngle(-90), 270);
      assert.equal(normalizeRotationAngle(-180), 180);
      assert.equal(normalizeRotationAngle(450), 90);
      assert.equal(normalizeRotationAngle(720), 0);
    });

    it('rejects non-90-degree, fractional, or non-finite rotation values', () => {
      for (const bad of [45, -45, 91, 135, 90.5, Number.NaN, Number.POSITIVE_INFINITY]) {
        assert.throws(
          () => normalizeRotationAngle(bad),
          (err: unknown) => err instanceof BizError && err.message === 'photo.invalidRotation'
        );
      }
    });
  });

  describe('Physical Image Pixel Rotation via Sharp', () => {
    it('rotates a 120x80 image physically and regenerates swapped dimensions & updated thumbHash', async () => {
      // Top half bright coral, bottom half deep slate to verify pixel orientation flips across 180° too
      const topHalf = await sharp({
        create: { width: 120, height: 40, channels: 3, background: { r: 235, g: 95, b: 60 } },
      }).png().toBuffer();
      const baseBuffer = await sharp({
        create: { width: 120, height: 80, channels: 3, background: { r: 25, g: 30, b: 42 } },
      })
        .composite([{ input: topHalf, top: 0, left: 0 }])
        .png()
        .toBuffer();

      const originalProcessed = await processPhotoImages(baseBuffer, 'image/png');
      assert.equal(originalProcessed.width, 120);
      assert.equal(originalProcessed.height, 80);

      const rotated90 = await rotatePhotoImages(baseBuffer, 90, 'image/png');
      assert.equal(rotated90.width, 80);
      assert.equal(rotated90.height, 120);
      assert.ok(rotated90.previewBuffer.length > 0);
      assert.ok(rotated90.thumbnailBuffer.length > 0);
      assert.notEqual(rotated90.thumbHash, originalProcessed.thumbHash);

      const previewMeta90 = await sharp(rotated90.previewBuffer).metadata();
      assert.equal(previewMeta90.width, 80);
      assert.equal(previewMeta90.height, 120);

      const rotated180 = await rotatePhotoImages(baseBuffer, 180, 'image/png');
      assert.equal(rotated180.width, 120);
      assert.equal(rotated180.height, 80);
      assert.notEqual(rotated180.thumbHash, originalProcessed.thumbHash);

      const rotated270 = await rotatePhotoImages(baseBuffer, 270, 'image/png');
      assert.equal(rotated270.width, 80);
      assert.equal(rotated270.height, 120);
    });
  });

  describe('Frontend Video & Media Orientation Helpers', () => {
    it('normalizes degrees and detects quarter-turn axis swaps', () => {
      assert.equal(normalizeRotationDegrees(undefined), 0);
      assert.equal(normalizeRotationDegrees(450), 90);
      assert.equal(normalizeRotationDegrees(-90), 270);
      assert.equal(isQuarterTurnRotation(90), true);
      assert.equal(isQuarterTurnRotation(270), true);
      assert.equal(isQuarterTurnRotation(180), false);
      assert.equal(isQuarterTurnRotation(0), false);
    });

    it('swaps visual dimensions and aspect ratio only for 90/270-degree rotated videos', () => {
      const videoLandscapeRotated = getEffectiveMediaDimensions({
        width: 1920,
        height: 1080,
        type: 'video/mp4',
        rotation: 90,
      });
      assert.equal(videoLandscapeRotated.width, 1080);
      assert.equal(videoLandscapeRotated.height, 1920);
      assert.ok(Math.abs(videoLandscapeRotated.ratio - 1920 / 1080) < 1e-6);

      const videoFlipped180 = getEffectiveMediaDimensions({
        width: 1920,
        height: 1080,
        type: 'video/mp4',
        rotation: 180,
      });
      assert.equal(videoFlipped180.width, 1920);
      assert.equal(videoFlipped180.height, 1080);

      const imageItem = getEffectiveMediaDimensions({
        width: 1600,
        height: 1200,
        type: 'image/jpeg',
        rotation: 90,
      });
      assert.equal(imageItem.width, 1600);
      assert.equal(imageItem.height, 1200);
    });

    it('builds exact CSS container-size rotation styles for 90, 180, and 270 degrees', () => {
      assert.deepEqual(getRotatedMediaWrapperProps(0), { deg: 0 });

      const rot180 = getRotatedMediaWrapperProps(180);
      assert.equal(rot180.deg, 180);
      assert.equal(rot180.innerStyle?.transform, 'rotate(180deg)');

      const rot90 = getRotatedMediaWrapperProps(90);
      assert.equal(rot90.deg, 90);
      assert.equal(rot90.parentStyle?.containerType, 'size');
      assert.equal(rot90.innerStyle?.width, '100cqh');
      assert.equal(rot90.innerStyle?.height, '100cqw');
      assert.equal(rot90.innerStyle?.transform, 'translate(-50%, -50%) rotate(90deg)');
    });
  });
});
