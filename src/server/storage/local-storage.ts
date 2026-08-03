import { createReadStream } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { type StorageObject, type StorageStrategy, type StorageUploadObject } from '@/server/storage/storage-types';
import { registerStorageStrategy } from '@/server/storage/storage-registry';
import { type Storage } from '@/server/entity/storage';
import { StorageTypeEnum } from '@/server/enums/storage-enum';

// This module implements the local storage strategy。

class LocalStorageStrategy implements StorageStrategy {

  // Generate absolute path to local file。
  private getLocalPath(key: string) {
    const root = path.resolve(process.cwd(), 'data');
    const normalizedKey = key.replace(/^\/+/, '');
    const filePath = path.resolve(root, normalizedKey);
    const relativePath = path.relative(root, filePath);

    if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
      throw new Error('Invalid file path');
    }

    return filePath;
  }

  // Save multiple files locally。
  async put(files: StorageUploadObject[], storage: Storage): Promise<void> {

    void storage;

    await Promise.all(files.map(async (file) => {
      const filePath = this.getLocalPath(file.key);
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, file.body);
    }));
  }

  // Read files from local and return as stream。
  async get(key: string, storage: Storage): Promise<StorageObject> {
    void storage;
    const filePath = this.getLocalPath(key);
    const { size } = await fs.stat(filePath);

    return {
      body: createReadStream(filePath),
      size,
      type: 'application/octet-stream'
    };
  }

  // Delete one or more files from local。
  async delete(key: string | string[], storage: Storage) {
    void storage;
    const keys = Array.isArray(key) ? key : [key];
    await Promise.all(keys.map((item) => fs.rm(this.getLocalPath(item), { force: true })));
  }
}

registerStorageStrategy(StorageTypeEnum.LOCAL, () => new LocalStorageStrategy());

export { LocalStorageStrategy };
