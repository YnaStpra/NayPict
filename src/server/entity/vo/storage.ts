import { type Storage } from '@/server/entity/storage';

// This module defines the storage configuration interface return object.

interface StorageVo extends Storage {
  photoTotal: number;
  usedCapacity: number;
}

type StorageSelectVo = Pick<Storage, 'storageId' | 'name' | 'type'>;

export type { StorageSelectVo, StorageVo };
