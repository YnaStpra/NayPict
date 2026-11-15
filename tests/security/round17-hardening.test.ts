/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { exifService } from '@/server/service/exif-service';
import { photoService, invalidatePhotoFastPathCache } from '@/server/service/photo-service';
import { photoReactionTab } from '@/server/entity/reaction';
import { exifTab } from '@/server/entity/exif';
import { orm, readOrm } from '@/server/infra/db';
import { getTableConfig } from 'drizzle-orm/pg-core';

describe('Round 17 Security & Performance Suite', () => {

  describe('Task 1: EXIF Metadata Sanitization & Stored XSS Neutralization', () => {
    it('strips HTML tags, script injections, and control characters on EXIF save', async () => {
      let insertedRow: any = null;
      const origInsert = orm.insert;

      orm.insert = ((table: any) => {
        return {
          values: async (values: any) => {
            insertedRow = values;
            return [];
          },
        } as any;
      }) as any;

      try {
        const dirtyExifJson = JSON.stringify({
          Make: 'Canon<script>alert("xss")</script>',
          Model: 'EOS R5 <svg/onload=alert(1)>',
          LensModel: 'RF 24-70mm\x00\x1f\t',
          FocalLength: 50,
        });

        await exifService.save('test-photo-xss-1', {
          exif: dirtyExifJson,
          latitude: -8.3405,
          longitude: 115.092,
          altitude: 100,
        });

        assert.ok(insertedRow);
        assert.equal(insertedRow.photoId, 'test-photo-xss-1');

        const sanitized = JSON.parse(insertedRow.exif);
        assert.equal(sanitized.Make, 'Canon');
        assert.equal(sanitized.Model, 'EOS R5');
        assert.equal(sanitized.LensModel, 'RF 24-70mm');
        assert.ok(!insertedRow.exif.includes('<script>'));
        assert.ok(!insertedRow.exif.includes('<svg'));
        assert.ok(!insertedRow.exif.includes('\x00'));
      } finally {
        orm.insert = origInsert;
      }
    });

    it('neutralizes non-JSON malformed string payloads in EXIF', async () => {
      let insertedRow: any = null;
      const origInsert = orm.insert;

      orm.insert = ((table: any) => {
        return {
          values: async (values: any) => {
            insertedRow = values;
            return [];
          },
        } as any;
      }) as any;

      try {
        const malformedPayload = '<iframe src="evil.com"></iframe>Plain Text\x00Payload';

        await exifService.save('test-photo-xss-2', {
          exif: malformedPayload,
          latitude: null,
          longitude: null,
          altitude: null,
        });

        assert.ok(insertedRow);
        assert.equal(insertedRow.exif, 'Plain TextPayload');
        assert.ok(!insertedRow.exif.includes('<iframe'));
      } finally {
        orm.insert = origInsert;
      }
    });
  });

  describe('Task 2: Duplicate Photo Finder IDOR Protection & Fast-Path Caching', () => {
    it('returns empty array when albumId does not belong to the requesting user (IDOR prevention)', async () => {
      const origSelect = readOrm.select;

      readOrm.select = (() => {
        return {
          from: () => ({
            where: () => ({
              limit: async () => [], // No album matching userId
            }),
          }),
        } as any;
      }) as any;

      try {
        const result = await photoService.findDuplicateGroups('victim-user', 'attacker-album-id');
        assert.deepEqual(result, []);
      } finally {
        readOrm.select = origSelect;
      }
    });

    it('caches duplicate results and purges on invalidatePhotoFastPathCache', async () => {
      let queryCount = 0;
      const origSelect = readOrm.select;

      readOrm.select = (() => {
        return {
          from: () => ({
            where: () => ({
              orderBy: () => ({
                limit: async () => {
                  queryCount++;
                  return [];
                },
              }),
            }),
          }),
        } as any;
      }) as any;

      try {
        invalidatePhotoFastPathCache();

        // 1. First call: executes query
        await photoService.findDuplicateGroups('user-cache-test');
        assert.equal(queryCount, 1);

        // 2. Second call within 60s: returns fast-path cached data without re-querying
        await photoService.findDuplicateGroups('user-cache-test');
        assert.equal(queryCount, 1);

        // 3. Invalidate fast-path cache
        invalidatePhotoFastPathCache();

        // 4. Third call: cache was cleared, so re-queries
        await photoService.findDuplicateGroups('user-cache-test');
        assert.equal(queryCount, 2);
      } finally {
        readOrm.select = origSelect;
        invalidatePhotoFastPathCache();
      }
    });
  });

  describe('Task 3: Photo Reaction Table Composite Indexes', () => {
    it('declares composite indexes for high-concurrency reaction lookup and aggregation', () => {
      const config = getTableConfig(photoReactionTab);
      const indexNames = config.indexes.map((idx: any) => idx.config.name);

      assert.ok(indexNames.includes('idx_photo_reaction_lookup'), 'idx_photo_reaction_lookup must be defined');
      assert.ok(indexNames.includes('idx_photo_reaction_type'), 'idx_photo_reaction_type must be defined');
      assert.ok(indexNames.includes('idx_photo_reaction_photo_id'), 'idx_photo_reaction_photo_id must be defined');
    });
  });
});
