import { eq, inArray } from 'drizzle-orm';
import { orm } from '@/server/infra/db';
import { fileTab } from '@/server/entity/file';
import { photoTab } from '@/server/entity/photo';
import { userTab } from '@/server/entity/user';
import { storage } from '@/server/storage/storage';
import { storageService } from '@/server/service/storage-service';
import { photoService } from '@/server/service/photo-service';
import BizError from '@/server/error/biz-error';
import {
  type StorageScanReportVo,
  type StorageScanStorageSummaryVo,
  type StorageOrphanFileVo,
  type StorageIncompleteUploadVo,
  type StorageBrokenRecordVo,
  type StorageCleanerDeleteOrphansBo,
  type StorageCleanerAbortUploadsBo,
  type StorageCleanerFixBrokenBo,
} from '@/server/entity/vo/storage-cleaner';

class StorageCleanerService {
  // Scans storage buckets (Cloudflare R2 / S3) and correlates with DB records.
  async scan(targetStorageId?: string): Promise<StorageScanReportVo> {
    const allStorages = await storageService.getStorageList();
    const storagesToScan = targetStorageId
      ? allStorages.filter((s) => s.storageId === targetStorageId)
      : allStorages;

    if (!storagesToScan.length) {
      throw new BizError('storage.notFound');
    }

    // 1. Fetch all DB file records joined with photo info
    const dbFiles = await orm
      .select({
        key: fileTab.key,
        fileId: fileTab.fileId,
        photoId: fileTab.photoId,
        size: fileTab.size,
        storageId: photoTab.storageId,
        name: photoTab.name,
      })
      .from(fileTab)
      .leftJoin(photoTab, eq(fileTab.photoId, photoTab.photoId));

    // 2. Fetch all active user avatars to protect profile images from being marked as orphans
    const users = await orm
      .select({ avatar: userTab.avatar })
      .from(userTab);

    const safeAvatarKeys = new Set(
      users.filter((u) => !!u.avatar).map((u) => `profile/${u.avatar}`)
    );

    // Global set of all registered DB keys
    const dbKeySet = new Set<string>();
    for (const file of dbFiles) {
      if (file.key) dbKeySet.add(file.key);
    }
    for (const avatarKey of safeAvatarKeys) {
      dbKeySet.add(avatarKey);
    }

    const storageSummaries: StorageScanStorageSummaryVo[] = [];

    for (const st of storagesToScan) {
      let continuationToken: string | undefined = undefined;
      let totalBucketObjects = 0;
      let totalBucketBytes = 0;
      const orphanFiles: StorageOrphanFileVo[] = [];
      const r2KeyMap = new Map<string, number>();

      // A. Paginate through all objects in bucket
      try {
        while (true) {
          const listRes = await storage.listObjects(st.storageId, '', continuationToken, 1000);

          for (const item of listRes.items) {
            totalBucketObjects++;
            totalBucketBytes += item.size;
            r2KeyMap.set(item.key, item.size);

            if (!dbKeySet.has(item.key)) {
              let probableType: StorageOrphanFileVo['probableType'] = 'other';
              if (item.key.startsWith('originals/')) probableType = 'original';
              else if (item.key.startsWith('previews/')) probableType = 'preview';
              else if (item.key.startsWith('thumbnails/')) probableType = 'thumbnail';

              orphanFiles.push({
                key: item.key,
                size: item.size,
                lastModified: item.lastModified ? item.lastModified.toISOString() : undefined,
                probableType,
              });
            }
          }

          if (!listRes.isTruncated || !listRes.nextContinuationToken) {
            break;
          }
          continuationToken = listRes.nextContinuationToken;
        }
      } catch (err) {
        console.error(`[StorageCleaner] Failed to list objects for storage ${st.name} (${st.storageId}):`, err);
      }

      // B. Fetch incomplete / pending multipart uploads
      const incompleteUploads: StorageIncompleteUploadVo[] = [];
      try {
        const mpList = await storage.listMultipartUploads(st.storageId);
        for (const u of mpList) {
          incompleteUploads.push({
            key: u.key,
            uploadId: u.uploadId,
            initiated: u.initiated ? u.initiated.toISOString() : undefined,
          });
        }
      } catch (err) {
        console.warn(`[StorageCleaner] Failed to list multipart uploads for ${st.name}:`, err);
      }

      // C. Reverse check: DB files assigned to this storage that are missing in R2 or 0-bytes
      const brokenRecords: StorageBrokenRecordVo[] = [];
      const stDbFiles = dbFiles.filter(
        (f) => f.storageId === st.storageId || (!f.storageId && st === allStorages[0])
      );

      for (const f of stDbFiles) {
        if (!r2KeyMap.has(f.key)) {
          brokenRecords.push({
            photoId: f.photoId,
            fileId: f.fileId,
            key: f.key,
            name: f.name || 'Unnamed',
            size: f.size || 0,
            reason: 'missing_in_r2',
          });
        } else if (r2KeyMap.get(f.key) === 0) {
          brokenRecords.push({
            photoId: f.photoId,
            fileId: f.fileId,
            key: f.key,
            name: f.name || 'Unnamed',
            size: f.size || 0,
            reason: 'empty_file',
          });
        }
      }

      const orphanTotalBytes = orphanFiles.reduce((acc, curr) => acc + curr.size, 0);

      storageSummaries.push({
        storageId: st.storageId,
        storageName: st.name,
        bucket: st.bucket ?? '',
        endpoint: st.endpoint ?? undefined,
        totalBucketObjects,
        totalBucketBytes,
        totalDbFiles: stDbFiles.length,
        orphanFiles,
        orphanTotalBytes,
        incompleteUploads,
        brokenRecords,
      });
    }

    // Totals across all scanned storages
    const totals = {
      totalObjects: storageSummaries.reduce((a, s) => a + s.totalBucketObjects, 0),
      totalBytes: storageSummaries.reduce((a, s) => a + s.totalBucketBytes, 0),
      totalOrphans: storageSummaries.reduce((a, s) => a + s.orphanFiles.length, 0),
      totalOrphanBytes: storageSummaries.reduce((a, s) => a + s.orphanTotalBytes, 0),
      totalIncompleteUploads: storageSummaries.reduce((a, s) => a + s.incompleteUploads.length, 0),
      totalBrokenRecords: storageSummaries.reduce((a, s) => a + s.brokenRecords.length, 0),
    };

    return {
      scannedAt: new Date().toISOString(),
      storages: storageSummaries,
      totals,
    };
  }

  // Deletes orphan files from storage with strict safeguard validation.
  async deleteOrphans(params: StorageCleanerDeleteOrphansBo): Promise<{ deleted: number; freedBytes: number }> {
    if (!params.storageId) {
      throw new BizError('storage.notFound');
    }
    if (!params.keys || !params.keys.length) {
      return { deleted: 0, freedBytes: 0 };
    }

    // Critical Safeguard: Verify none of the keys exist in DB
    const existingDbFiles = await orm
      .select({ key: fileTab.key })
      .from(fileTab)
      .where(inArray(fileTab.key, params.keys));

    const existingDbKeySet = new Set(existingDbFiles.map((f) => f.key));

    const users = await orm
      .select({ avatar: userTab.avatar })
      .from(userTab);
    for (const u of users) {
      if (u.avatar) existingDbKeySet.add(`profile/${u.avatar}`);
    }

    const safeKeysToDelete = params.keys.filter((k) => !existingDbKeySet.has(k));

    if (!safeKeysToDelete.length) {
      return { deleted: 0, freedBytes: 0 };
    }

    // Perform deletion in chunks of 500
    let deletedCount = 0;
    const chunkSize = 500;
    for (let i = 0; i < safeKeysToDelete.length; i += chunkSize) {
      const chunk = safeKeysToDelete.slice(i, i + chunkSize);
      await storage.delete(chunk, params.storageId);
      deletedCount += chunk.length;
    }

    return {
      deleted: deletedCount,
      freedBytes: 0, // Storage deletion succeeded
    };
  }

  // Aborts incomplete multipart uploads in storage.
  async abortIncompleteUploads(params: StorageCleanerAbortUploadsBo): Promise<{ aborted: number }> {
    if (!params.storageId) {
      throw new BizError('storage.notFound');
    }
    if (!params.uploads || !params.uploads.length) {
      return { aborted: 0 };
    }

    let abortedCount = 0;
    for (const u of params.uploads) {
      if (!u.key || !u.uploadId) continue;
      try {
        await storage.abortMultipartUpload(u.key, u.uploadId, params.storageId);
        abortedCount++;
      } catch (err) {
        console.warn(`[StorageCleaner] Failed to abort upload ${u.uploadId} for key ${u.key}:`, err);
      }
    }

    return { aborted: abortedCount };
  }

  // Purges broken ghost records from the database so gallery stays consistent.
  async fixBrokenRecords(params: StorageCleanerFixBrokenBo, userId?: string): Promise<{ fixed: number }> {
    if (!params.photoIds || !params.photoIds.length) {
      return { fixed: 0 };
    }

    // Use photoService.delete to cleanly remove photos and all their relations
    await photoService.delete({ photoIds: params.photoIds }, userId);

    return { fixed: params.photoIds.length };
  }
}

export const storageCleanerService = new StorageCleanerService();
