import { http } from "@/request/request";
import { type Storage, type StorageInto } from "@/server/entity/storage";
import { type StorageDeleteBo, type StorageSetTopBo, type StorageToggleStatusBo } from "@/server/entity/bo/storage";
import { type PageVo } from "@/server/entity/vo/common";
import { type StorageSelectVo, type StorageVo } from "@/server/entity/vo/storage";

// This module encapsulates storage configuration related interface requests.

let cachedStorageSelect: StorageSelectVo[] | null = null;
let cachedStorageTimestamp = 0;
let inFlightStoragePromise: Promise<StorageSelectVo[]> | null = null;

// Invalidate in-memory storage cache on mutation
export function invalidateStorageCache() {
  cachedStorageSelect = null;
  cachedStorageTimestamp = 0;
}

// Query the list of all storage configurations.
export function storageList() {
  return http.post<PageVo<StorageVo>>('/storage/list');
}

// Query normal storage configuration options with SWR in-memory caching (60s stale window).
export function storageSelect(forceRefresh: boolean = false): Promise<StorageSelectVo[]> {
  const now = Date.now();
  if (!forceRefresh && cachedStorageSelect && now - cachedStorageTimestamp < 60000) {
    return Promise.resolve(cachedStorageSelect);
  }

  if (inFlightStoragePromise) {
    return inFlightStoragePromise;
  }

  inFlightStoragePromise = http
    .post<StorageSelectVo[]>('/storage/select')
    .then((storages) => {
      cachedStorageSelect = storages;
      cachedStorageTimestamp = Date.now();
      return storages;
    })
    .finally(() => {
      inFlightStoragePromise = null;
    });

  return inFlightStoragePromise;
}

// Add storage configuration.
export function storageAdd(params: StorageInto) {
  invalidateStorageCache();
  return http.post<void>('/storage/add', params);
}

// Modify storage configuration.
export function storageSet(params: Storage) {
  invalidateStorageCache();
  return http.post<void>('/storage/set', params);
}

// Top storage configuration.
export function storageSetTop(params: StorageSetTopBo) {
  invalidateStorageCache();
  return http.post<void>('/storage/setTop', params);
}

// Toggle storage enabled state.
export function storageToggleStatus(params: StorageToggleStatusBo) {
  invalidateStorageCache();
  return http.post<void>('/storage/toggleStatus', params);
}

// Delete storage configuration.
export function storageDelete(storageId: string) {
  invalidateStorageCache();
  return http.post<void>('/storage/delete', { storageId } satisfies StorageDeleteBo);
}
