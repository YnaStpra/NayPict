import { type Readable } from 'node:stream';
import { type Storage } from '@/server/entity/storage';

// This module defines storage policy related types.

interface StorageListItem {
  key: string;
  size: number;
  lastModified?: Date;
  etag?: string;
}

interface StorageMultipartItem {
  key: string;
  uploadId: string;
  initiated?: Date;
}

interface StorageListResult {
  items: StorageListItem[];
  nextContinuationToken?: string;
  isTruncated: boolean;
}

interface StorageStrategy {
  put(files: StorageUploadObject[], storage: Storage): Promise<void>;
  get(key: string, storage: Storage, range?: string): Promise<StorageObject>;
  delete(key: string | string[], storage: Storage): Promise<void>;
  getPresignedPutUrl?(key: string, contentType: string, storage: Storage, expiresIn?: number): Promise<string>;
  createMultipartUpload?(key: string, contentType: string, storage: Storage): Promise<string>;
  getPresignedPartUrl?(key: string, uploadId: string, partNumber: number, storage: Storage, expiresIn?: number): Promise<string>;
  completeMultipartUpload?(key: string, uploadId: string, parts: { PartNumber: number; ETag: string }[], storage: Storage): Promise<void>;
  abortMultipartUpload?(key: string, uploadId: string, storage: Storage): Promise<void>;
  listObjects?(storage: Storage, prefix?: string, continuationToken?: string, maxKeys?: number): Promise<StorageListResult>;
  listMultipartUploads?(storage: Storage): Promise<StorageMultipartItem[]>;
  head?(key: string, storage: Storage): Promise<{ exists: boolean; size?: number; contentType?: string }>;
}

type ReadBody = Readable | ReadableStream;

interface StorageObject {
  body: ReadBody;
  size: number;
  type: string;
  contentRange?: string;
  statusCode?: number;
}

interface StorageUploadObject {
  key: string;
  body: Uint8Array;
  type?: string;
  metadata?: string[][];
}

export type { ReadBody, StorageObject, StorageStrategy, StorageUploadObject, StorageListItem, StorageMultipartItem, StorageListResult };

