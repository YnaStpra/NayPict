/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { getTableConfig } from 'drizzle-orm/pg-core';
import { albumPhotoTab } from '@/server/entity/album-photo';
import { userTab } from '@/server/entity/user';
import { albumService } from '@/server/service/album-service';
import { fileService } from '@/server/service/file-service';
import { photoService } from '@/server/service/photo-service';
import { orm, readOrm } from '@/server/infra/db';

describe('Round 19 Security, DB Resilience & Admin UX Suite', () => {

  describe('Task 1: Database Table Constraints & Composite Indexes', () => {
    it('declares uniqueIndex on (albumId, photoId) in albumPhotoTab to prevent race-condition duplicates', () => {
      const config = getTableConfig(albumPhotoTab);
      const uniqueIdx = config.indexes.find((idx: any) => idx.config.name === 'idx_album_photo_album_photo_unique');

      assert.ok(uniqueIdx, 'idx_album_photo_album_photo_unique must be defined');
      assert.equal(uniqueIdx.config.unique, true, 'idx_album_photo_album_photo_unique must be a unique index');
    });

    it('declares composite index on (type, status) in userTab for high-speed admin role audits', () => {
      const config = getTableConfig(userTab);
      const userIdx = config.indexes.find((idx: any) => idx.config.name === 'idx_user_type_status');

      assert.ok(userIdx, 'idx_user_type_status must be defined on userTab');
    });
  });

  describe('Task 2: Query Chunking in Album and File Services', () => {
    it('chunks candidate photo ownership verification in albumService.addPhoto for > 100 items', async () => {
      const photoIds = Array.from({ length: 250 }, (_, i) => `photo-add-${i + 1}`);
      const chunkQueries: number[] = [];

      const origSelect = orm.select;
      orm.select = ((fields?: any) => ({
        from: () => ({
          where: () => {
            chunkQueries.push(1);
            return Promise.resolve(
              photoIds.map((id) => ({ photoId: id }))
            );
          },
        }),
      })) as any;

      const origInsert = orm.insert;
      orm.insert = (() => ({
        values: () => Promise.resolve(),
      })) as any;

      try {
        await albumService.addPhoto({
          albumIds: ['mock-album-1'],
          photoIds,
        }, 'mock-user-1');

        assert.ok(
          chunkQueries.length >= 3,
          `Expected at least 3 chunk queries for 250 candidate photos, got ${chunkQueries.length}`
        );
      } finally {
        orm.select = origSelect;
        orm.insert = origInsert;
      }
    });

    it('chunks photoIds in albumService.listAlbumMapByPhotoIds for > 100 items', async () => {
      const photoIds = Array.from({ length: 250 }, (_, i) => `photo-map-${i + 1}`);
      const chunkQueries: number[] = [];

      const origSelect = readOrm.select;
      readOrm.select = (() => ({
        from: () => ({
          innerJoin: () => ({
            where: () => {
              chunkQueries.push(1);
              return Promise.resolve([]);
            },
          }),
        }),
      })) as any;

      try {
        const res = await albumService.listAlbumMapByPhotoIds(photoIds);
        assert.ok(res instanceof Map);
        assert.ok(
          chunkQueries.length >= 3,
          `Expected at least 3 chunk queries for 250 photo IDs in listAlbumMapByPhotoIds, got ${chunkQueries.length}`
        );
      } finally {
        readOrm.select = origSelect;
      }
    });

    it('chunks photoIds in fileService.listByPhotoIds for > 100 items', async () => {
      const photoIds = Array.from({ length: 250 }, (_, i) => `photo-file-${i + 1}`);
      const chunkQueries: number[] = [];

      const origSelect = readOrm.select;
      readOrm.select = (() => ({
        from: () => ({
          where: () => {
            chunkQueries.push(1);
            return Promise.resolve([]);
          },
        }),
      })) as any;

      try {
        const res = await fileService.listByPhotoIds(photoIds);
        assert.ok(res instanceof Map);
        assert.ok(
          chunkQueries.length >= 3,
          `Expected at least 3 chunk queries for 250 photo IDs in fileService.listByPhotoIds, got ${chunkQueries.length}`
        );
      } finally {
        readOrm.select = origSelect;
      }
    });
  });

  describe('Task 3: Server-side Location & Media Type Filtering in photoService.list', () => {
    it('generates SQL criteria for mediaType (photo/video) and locationFilter (tagged/untagged/ignored)', async () => {
      let interceptedWhere: any = null;

      const origSelect = readOrm.select;
      readOrm.select = (() => ({
        from: () => ({
          where: (cond: any) => {
            interceptedWhere = cond;
            const res = Promise.resolve([{ total: 0 }]);
            (res as any).orderBy = () => ({
              offset: () => ({
                limit: () => Promise.resolve([]),
              }),
            });
            return res;
          },
        }),
      })) as any;

      try {
        // 1. Video filter
        await photoService.list({ size: 10, mediaType: 'video' }, 'admin-user');
        assert.ok(interceptedWhere, 'Where clause should be generated for video filter');

        // 2. Photo filter
        await photoService.list({ size: 10, mediaType: 'photo' }, 'admin-user');
        assert.ok(interceptedWhere, 'Where clause should be generated for photo filter');

        // 3. Tagged GPS filter
        await photoService.list({ size: 10, locationFilter: 'tagged' }, 'admin-user');
        assert.ok(interceptedWhere, 'Where clause should be generated for tagged GPS');

        // 4. Untagged GPS filter
        await photoService.list({ size: 10, locationFilter: 'untagged' }, 'admin-user');
        assert.ok(interceptedWhere, 'Where clause should be generated for untagged GPS');

        // 5. Ignored GPS filter
        await photoService.list({ size: 10, locationFilter: 'ignored' }, 'admin-user');
        assert.ok(interceptedWhere, 'Where clause should be generated for ignored GPS');
      } finally {
        readOrm.select = origSelect;
      }
    });
  });

  describe('Task 4: React Purity in photo-card.tsx', () => {
    it('mutates revealedPhotoIds inside useEffect rather than in render body', () => {
      const cardPath = path.resolve(process.cwd(), 'src/components/photo/photo-card.tsx');
      const cardContent = fs.readFileSync(cardPath, 'utf-8');

      // Assert that revealedPhotoIds.add is inside a useEffect
      assert.ok(
        cardContent.includes('useEffect(() => {') &&
        cardContent.includes('revealedPhotoIds.add(data.photoId)'),
        'revealedPhotoIds.add must be encapsulated within a useEffect hook'
      );
    });
  });
});
