import { http } from "@/request/request";
import { type Storage, type StorageInto } from "@/server/entity/storage";
import { type StorageDeleteBo, type StorageSetTopBo, type StorageToggleStatusBo } from "@/server/entity/bo/storage";
import { type PageVo } from "@/server/entity/vo/common";
import { type StorageSelectVo, type StorageVo } from "@/server/entity/vo/storage";

// This module encapsulates storage configuration related interface requests.

// Query the list of all storage configurations.
export function storageList() {
  return http.post<PageVo<StorageVo>>('/storage/list');
}

// Query normal storage configuration options.
export function storageSelect() {
  return http.post<StorageSelectVo[]>('/storage/select');
}

// Add storage configuration.
export function storageAdd(params: StorageInto) {
  return http.post<void>('/storage/add', params);
}

// Modify storage configuration.
export function storageSet(params: Storage) {
  return http.post<void>('/storage/set', params);
}

// Top storage configuration.
export function storageSetTop(params: StorageSetTopBo) {
  return http.post<void>('/storage/setTop', params);
}

// Toggle storage enabled state.
export function storageToggleStatus(params: StorageToggleStatusBo) {
  return http.post<void>('/storage/toggleStatus', params);
}

// Delete storage configuration.
export function storageDelete(storageId: string) {
  return http.post<void>('/storage/delete', { storageId } satisfies StorageDeleteBo);
}
