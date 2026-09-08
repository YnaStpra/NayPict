import { type Readable } from 'node:stream';
import { type Storage } from '@/server/entity/storage';

// This module defines storage policy related types.

interface StorageStrategy {
  put(files: StorageUploadObject[], storage: Storage): Promise<void>;
  get(key: string, storage: Storage, range?: string): Promise<StorageObject>;
  delete(key: string | string[], storage: Storage): Promise<void>;
  getPresignedPutUrl?(key: string, contentType: string, storage: Storage, expiresIn?: number): Promise<string>;
  createMultipartUpload?(key: string, contentType: string, storage: Storage): Promise<string>;
  getPresignedPartUrl?(key: string, uploadId: string, partNumber: number, storage: Storage, expiresIn?: number): Promise<string>;
  completeMultipartUpload?(key: string, uploadId: string, parts: { PartNumber: number; ETag: string }[], storage: Storage): Promise<void>;
  abortMultipartUpload?(key: string, uploadId: string, storage: Storage): Promise<void>;
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

export type { ReadBody, StorageObject, StorageStrategy, StorageUploadObject };
