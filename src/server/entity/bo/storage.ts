// This module defines the storage configuration interface input parameter object。

interface StorageSetTopBo {
  storageId: string;
}

interface StorageToggleStatusBo {
  storageId: string;
}

interface StorageDeleteBo {
  storageId: string;
}

export type { StorageDeleteBo, StorageSetTopBo, StorageToggleStatusBo };
