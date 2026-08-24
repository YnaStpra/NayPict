import { type Storage } from '@/server/entity/storage';
import { StorageStatusEnum } from '@/server/enums/storage-enum';
import BizError from '@/server/error/biz-error';
import { storageService } from '@/server/service/storage-service';
import '@/server/storage/s3-storage';
import { resolveStorageStrategy } from '@/server/storage/storage-registry';
import { type StorageObject, type StorageStrategy, type StorageUploadObject } from '@/server/storage/storage-types';

// This module selects storage implementations based on policy (Cloudflare R2 via S3-compatible API).

// According to storage id Query available storage configurations.
async function getStorage(storageId: string): Promise<Storage> {
  const storageList = await storageService.getStorageList();
  const fileStorage = storageList.find((item) => item.storageId === storageId);

  if (!fileStorage) {
    throw new BizError('storage.notFound');
  }

  return fileStorage;
}

// Verify storage is available; throw if disabled.
function assertStorageEnabled(fileStorage: Storage) {
  if (fileStorage.status === StorageStatusEnum.DISABLE) {
    throw new BizError('storage.disabled');
  }
}

// Create a storage strategy instance based on storage type; return null for invalid types in delete scenarios.
function createStorageStrategy(storage: Storage, skipInvalid = false): StorageStrategy | null {
  const strategy = resolveStorageStrategy(storage.type);

  if (!strategy) {
    if (skipInvalid) {
      return null;
    }

    throw new Error('Invalid storage type');
  }

  return strategy();
}

const storage = {

  // According to storage id, query configuration, select strategy, and save multiple files.
  async put(files: StorageUploadObject[], storageId: string): Promise<void> {
    const fileStorage = await getStorage(storageId);
    assertStorageEnabled(fileStorage);
    return createStorageStrategy(fileStorage)!.put(files, fileStorage);
  },

  // According to storage id, query configuration, select strategy, and read the file.
  async get(key: string, storageId: string): Promise<StorageObject> {
    const fileStorage = await getStorage(storageId);
    return createStorageStrategy(fileStorage)!.get(key, fileStorage);
  },

  // According to storage id, query configuration, choose strategy, and delete files; invalid types are skipped.
  async delete(key: string | string[], storageId: string): Promise<void> {
    const fileStorage = await getStorage(storageId);
    const strategy = createStorageStrategy(fileStorage, true);

    if (!strategy) {
      return;
    }

    return strategy.delete(key, fileStorage);
  },

  // According to storage id, query configuration, and generate presigned PutObject URL.
  async getPresignedPutUrl(key: string, contentType: string, storageId: string): Promise<string> {
    const fileStorage = await getStorage(storageId);
    assertStorageEnabled(fileStorage);
    const strategy = createStorageStrategy(fileStorage)!;

    if (strategy.getPresignedPutUrl) {
      return strategy.getPresignedPutUrl(key, contentType, fileStorage);
    }

    throw new BizError('storage.presignNotSupported');
  }
};

export { storage };
export { registerStorageStrategy } from '@/server/storage/storage-registry';
export type { ReadBody, StorageObject, StorageStrategy, StorageUploadObject } from '@/server/storage/storage-types';
