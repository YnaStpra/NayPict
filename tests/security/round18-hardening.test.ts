/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { photoService } from '@/server/service/photo-service';
import { storageService } from '@/server/service/storage-service';
import { orm } from '@/server/infra/db';
import BizError from '@/server/error/biz-error';

describe('Round 18 Security & Performance Suite', () => {

  describe('Task 1: Checksum Cryptographic Validation on Presigned Upload', () => {
    it('throws photo.checksumRequired when checksum is missing or empty', async () => {
      await assert.rejects(
        async () => {
          await photoService.getPresignedPhotoUploadUrls({
            filename: 'photo.jpg',
            checksum: '',
            fileType: 'image/jpeg',
          }, 'test-user-id');
        },
        (err: any) => {
          assert.ok(err instanceof BizError);
          assert.equal(err.message, 'photo.checksumRequired');
          return true;
        }
      );
    });

    it('rejects invalid checksum formats (XSS, path traversal, non-hex, invalid length)', async () => {
      const invalidChecksums = [
        'not-a-hex-checksum',
        '../../../etc/passwd',
        '<script>alert("xss")</script>',
        'abcd', // too short (4 chars)
        'a'.repeat(20), // 20 chars
        'g'.repeat(40), // 'g' is not hex
        'z'.repeat(64), // 'z' is not hex
        'a'.repeat(120), // 120 chars
      ];

      for (const invalid of invalidChecksums) {
        await assert.rejects(
          async () => {
            await photoService.getPresignedPhotoUploadUrls({
              filename: 'photo.jpg',
              checksum: invalid,
              fileType: 'image/jpeg',
            }, 'test-user-id');
          },
          (err: any) => {
            assert.ok(err instanceof BizError, `Expected BizError for: ${invalid}`);
            assert.equal(err.message, 'photo.checksumInvalid');
            return true;
          }
        );
      }
    });

    it('accepts valid 40-char (SHA-1) and 64-char (SHA-256) hexadecimal checksums', async () => {
      const origGetStorageList = storageService.getStorageList;
      storageService.getStorageList = async () => [
        {
          storageId: 'mock-storage-1',
          name: 'Mock Storage',
          type: 2,
          domain: 'https://cdn.example.com',
          bucket: 'mock-bucket',
          region: 'us-east-1',
          endpoint: 'https://s3.amazonaws.com',
          accessKey: 'mock',
          secretKey: 'mock',
          userId: 'test-user-id',
          sort: 0,
          status: 0,
        },
      ];

      // Mock storage getPresignedPutUrl and DB readOrm select
      const { storage } = await import('@/server/storage/storage');
      const origGetPresigned = storage.getPresignedPutUrl;
      storage.getPresignedPutUrl = async (key: string) => `https://mock-storage.example.com/${key}`;

      const { readOrm } = await import('@/server/infra/db');
      const origSelect = readOrm.select;
      readOrm.select = (() => ({
        from: () => ({
          where: () => ({
            limit: async () => [],
          }),
        }),
      })) as any;

      try {
        // Valid 40-character SHA-1 checksum
        const sha1Checksum = 'a1b2c3d4e5f678901234567890abcdef12345678';
        const resSha1 = await photoService.getPresignedPhotoUploadUrls({
          filename: 'photo1.jpg',
          checksum: sha1Checksum,
          fileType: 'image/jpeg',
        }, 'test-user-id');

        assert.ok(resSha1.originalUploadUrl);
        assert.ok(resSha1.originalKey);

        // Valid 64-character SHA-256 checksum
        const sha256Checksum = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
        const resSha256 = await photoService.getPresignedPhotoUploadUrls({
          filename: 'photo2.jpg',
          checksum: sha256Checksum,
          fileType: 'image/jpeg',
        }, 'test-user-id');

        assert.ok(resSha256.originalUploadUrl);
        assert.ok(resSha256.originalKey);
      } finally {
        storageService.getStorageList = origGetStorageList;
        storage.getPresignedPutUrl = origGetPresigned;
        readOrm.select = origSelect;
      }
    });
  });

  describe('Task 2: Query Chunking Across Batch Photo Mutations', () => {
    it('chunks photo mutations into <= 100 batches to prevent SQL parameter limits', async () => {
      // Generate 250 mock photo IDs
      const photoIds = Array.from({ length: 250 }, (_, i) => `photo-batch-${i + 1}`);

      const chunkBatches: { operation: string; size: number }[] = [];
      const origSelect = orm.select;
      const origUpdate = orm.update;
      const origDelete = orm.delete;

      // Intercept select
      orm.select = ((fields?: any) => {
        return {
          from: () => ({
            where: (condition: any) => {
              // Extract chunk size from condition if applicable
              return Promise.resolve(
                photoIds.map((id) => ({
                  photoId: id,
                  name: `IMG_${id}.jpg`,
                  storageId: 'mock-storage-1',
                  userId: 'test-batch-user',
                }))
              );
            },
          }),
        } as any;
      }) as any;

      // Intercept update
      orm.update = ((table: any) => {
        return {
          set: (vals: any) => ({
            where: (cond: any) => {
              // Record update chunk
              chunkBatches.push({ operation: 'update', size: 100 });
              return Promise.resolve();
            },
          }),
        } as any;
      }) as any;

      // Intercept delete
      orm.delete = ((table: any) => {
        return {
          where: (cond: any) => {
            chunkBatches.push({ operation: 'delete', size: 100 });
            return Promise.resolve();
          },
        } as any;
      }) as any;

      try {
        // 1. Recycle: 250 items should execute in chunks
        chunkBatches.length = 0;
        await photoService.recycle({ photoIds }, 'test-batch-user');
        assert.ok(chunkBatches.length >= 3, `Expected at least 3 chunk batches for 250 items, got ${chunkBatches.length}`);

        // 2. Restore: 250 items should execute in chunks
        chunkBatches.length = 0;
        await photoService.restore({ photoIds }, 'test-batch-user');
        assert.ok(chunkBatches.length >= 3, `Expected at least 3 chunk batches for 250 items, got ${chunkBatches.length}`);

        // 3. SetAllowDownload: 250 items should execute in chunks
        chunkBatches.length = 0;
        await photoService.setAllowDownload({ photoIds, allowDownload: true }, 'test-batch-user');
        assert.ok(chunkBatches.length >= 3, `Expected at least 3 chunk batches for 250 items, got ${chunkBatches.length}`);

        // 4. BatchEdit: 250 items should execute in chunks
        chunkBatches.length = 0;
        await photoService.batchEdit({ photoIds, allowDownload: true }, 'test-batch-user');
        assert.ok(chunkBatches.length >= 3, `Expected at least 3 chunk batches for 250 items, got ${chunkBatches.length}`);
      } finally {
        orm.select = origSelect;
        orm.update = origUpdate;
        orm.delete = origDelete;
      }
    });
  });

  describe('Task 3: Responsive Thumbnail sizes Optimization in UI', () => {
    it('declares responsive sizes attribute in photo-card.tsx for cellular data savings', () => {
      const photoCardPath = path.resolve(process.cwd(), 'src/components/photo/photo-card.tsx');
      const photoCardContent = fs.readFileSync(photoCardPath, 'utf-8');

      // Assert sizes attribute is present
      const expectedSizes = 'sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33.3vw, 25vw"';
      assert.ok(
        photoCardContent.includes(expectedSizes),
        'photo-card.tsx must include responsive sizes attribute'
      );

      // Verify it is defined on both regular and video overlay img elements
      const matches = photoCardContent.match(/sizes="\(max-width: 640px\) 50vw, \(max-width: 1024px\) 33\.3vw, 25vw"/g);
      assert.ok(matches && matches.length >= 2, `Expected at least 2 occurrences in photo-card.tsx, found ${matches?.length}`);
    });
  });

  describe('Task 4: Edge CDN & Media Immutable Cache Headers', () => {
    it('configures aggressive 1-year immutable caching on public derivatives in media.ts', () => {
      const mediaPath = path.resolve(process.cwd(), 'src/server/hono/media.ts');
      const mediaContent = fs.readFileSync(mediaPath, 'utf-8');

      assert.ok(
        mediaContent.includes("public, max-age=31536000, immutable"),
        'media.ts must set public, max-age=31536000, immutable Cache-Control header'
      );
      assert.ok(
        mediaContent.includes("'CDN-Cache-Control'] = 'public, max-age=31536000, immutable'"),
        'media.ts must set CDN-Cache-Control header for Cloudflare edge'
      );
      assert.ok(
        mediaContent.includes("'Cloudflare-CDN-Cache-Control'] = 'public, max-age=31536000, immutable'"),
        'media.ts must set Cloudflare-CDN-Cache-Control header'
      );
    });
  });
});
