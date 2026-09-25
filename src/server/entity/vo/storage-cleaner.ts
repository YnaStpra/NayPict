export interface StorageOrphanFileVo {
  key: string;
  size: number;
  lastModified?: string;
  probableType: 'original' | 'preview' | 'thumbnail' | 'other';
}

export interface StorageIncompleteUploadVo {
  key: string;
  uploadId: string;
  initiated?: string;
}

export interface StorageBrokenRecordVo {
  photoId: string;
  fileId: string;
  key: string;
  name: string;
  size: number;
  reason: 'missing_in_r2' | 'empty_file';
}

export interface StorageScanStorageSummaryVo {
  storageId: string;
  storageName: string;
  bucket: string;
  endpoint?: string;
  totalBucketObjects: number;
  totalBucketBytes: number;
  totalDbFiles: number;
  orphanFiles: StorageOrphanFileVo[];
  orphanTotalBytes: number;
  incompleteUploads: StorageIncompleteUploadVo[];
  brokenRecords: StorageBrokenRecordVo[];
}

export interface StorageScanReportVo {
  scannedAt: string;
  storages: StorageScanStorageSummaryVo[];
  totals: {
    totalObjects: number;
    totalBytes: number;
    totalOrphans: number;
    totalOrphanBytes: number;
    totalIncompleteUploads: number;
    totalBrokenRecords: number;
  };
}

export interface StorageCleanerDeleteOrphansBo {
  storageId: string;
  keys: string[];
}

export interface StorageCleanerAbortUploadsBo {
  storageId: string;
  uploads: { key: string; uploadId: string }[];
}

export interface StorageCleanerFixBrokenBo {
  photoIds: string[];
}
