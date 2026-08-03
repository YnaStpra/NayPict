import { type Storage } from '@/server/entity/storage';
import { StorageStatusEnum } from '@/server/enums/storage-enum';
import BizError from '@/server/error/biz-error';
import { storageService } from '@/server/service/storage-service';
import '@/server/storage/local-storage';
import '@/server/storage/s3-storage';
import { resolveStorageStrategy } from '@/server/storage/storage-registry';
import { type StorageObject, type StorageStrategy, type StorageUploadObject } from '@/server/storage/storage-types';

// This module selects storage implementations based on policy。

// According to storage id Query available storage configurations。
async function getStorage(storageId: string): Promise<Storage> {
  const storageList = await storageService.getStorageList();
  const fileStorage = storageList.find((item) => item.storageId === storageId);

  if (!fileStorage) {
    throw new BizError('storage.notFound');
  }

  return fileStorage;
}

// Verify storage is available，If disabled, an exception will be thrown.。
function assertStorageEnabled(fileStorage: Storage) {
  if (fileStorage.status === StorageStatusEnum.DISABLE) {
    throw new BizError('storage.disabled');
  }
}

// Create a storage policy based on the incoming storage configuration type，Invalid type return in deletion scenario null。
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

  // According to storage id Query configuration、Select a strategy and save multiple files。
  async put(files: StorageUploadObject[], storageId: string): Promise<void> {
    const fileStorage = await getStorage(storageId);
    assertStorageEnabled(fileStorage);
    return createStorageStrategy(fileStorage)!.put(files, fileStorage);
  },

  // According to storage id Query configuration、Select a policy and read the file。
  async get(key: string, storageId: string): Promise<StorageObject> {
    const fileStorage = await getStorage(storageId);
    return createStorageStrategy(fileStorage)!.get(key, fileStorage);
  },

  // According to storage id Query configuration、Choose a policy and delete files，Invalid types are skipped directly。
  async delete(key: string | string[], storageId: string): Promise<void> {
    const fileStorage = await getStorage(storageId);
    const strategy = createStorageStrategy(fileStorage, true);

    if (!strategy) {
      return;
    }

    return strategy.delete(key, fileStorage);
  }
};

export { storage };
export { registerStorageStrategy } from '@/server/storage/storage-registry';
export type { ReadBody, StorageObject, StorageStrategy, StorageUploadObject } from '@/server/storage/storage-types';
