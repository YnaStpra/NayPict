import { type Readable } from 'node:stream';
import { type Storage } from '@/server/entity/storage';

// This module defines storage policy related types。

interface StorageStrategy {
  put(files: StorageUploadObject[], storage: Storage): Promise<void>;
  get(key: string, storage: Storage): Promise<StorageObject>;
  delete(key: string | string[], storage: Storage): Promise<void>;
  getPresignedPutUrl?(key: string, contentType: string, storage: Storage, expiresIn?: number): Promise<string>;
}

type ReadBody = Readable | ReadableStream;

interface StorageObject {
  body: ReadBody;
  size: number;
  type: string;
}

interface StorageUploadObject {
  key: string;
  body: Uint8Array;
  type?: string;
  metadata?: string[][];
}

export type { ReadBody, StorageObject, StorageStrategy, StorageUploadObject };
