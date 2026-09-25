import { http } from '@/request/request';
import {
  type StorageScanReportVo,
  type StorageCleanerDeleteOrphansBo,
  type StorageCleanerAbortUploadsBo,
  type StorageCleanerFixBrokenBo,
} from '@/server/entity/vo/storage-cleaner';

// Run deep scan across storage buckets and database to find orphans, incomplete uploads, and broken records
export function storageCleanerScan(storageId?: string): Promise<StorageScanReportVo> {
  return http.post<StorageScanReportVo>('/storage/cleaner/scan', { storageId });
}

// Delete selected orphan files from storage
export function storageCleanerDeleteOrphans(params: StorageCleanerDeleteOrphansBo): Promise<{ deleted: number; freedBytes: number }> {
  return http.post<{ deleted: number; freedBytes: number }>('/storage/cleaner/delete-orphans', params);
}

// Abort incomplete / pending multipart uploads in storage
export function storageCleanerAbortUploads(params: StorageCleanerAbortUploadsBo): Promise<{ aborted: number }> {
  return http.post<{ aborted: number }>('/storage/cleaner/abort-uploads', params);
}

// Fix broken records from database
export function storageCleanerFixBroken(params: StorageCleanerFixBrokenBo): Promise<{ fixed: number }> {
  return http.post<{ fixed: number }>('/storage/cleaner/fix-broken', params);
}
