import { http } from "@/request/request";
import {
  type PhotoBatchEditBo,
  type PhotoDeleteBo,
  type PhotoExistsBo,
  type PhotoFavoriteBo,
  type PhotoListBo,
  type PhotoOnThisDayBo,
  type PhotoRandomIdListBo,
  type PhotoRecycleBo,
  type PhotoRestoreBo,
  type PhotoSetAllowDownloadBo,
  type PhotoSetVisibilityBo,
  type PhotoTakenDateListBo,
} from "@/server/entity/bo/photo";
import { type PageVo } from "@/server/entity/vo/common";
import {
  type PhotoAddResultVo,
  type PhotoDuplicateGroupVo,
  type PhotoExistsVo,
  type PhotoOnThisDayVo,
  type PhotoTakenDateVo,
  type PhotoVo,
} from "@/server/entity/vo/photo";

// This module encapsulates photo-related interface requests.

// Batch edit photo metadata (visibility, allowDownload, takenTime, favorite).
export function photoBatchEdit(params: PhotoBatchEditBo) {
  return http.post<void>('/photo/batchEdit', params);
}

// Update photo display scope / visibility (Both, Gallery Only, Album Only, Archived).
export function photoSetVisibility(params: PhotoSetVisibilityBo) {
  return http.post<void>('/photo/setVisibility', params);
}

// Query the photo list by pagination and conditions.
export function photoList(params: PhotoListBo) {
  return http.post<PageVo<PhotoVo>>('/photo/list', params);
}

// Query photos taken on this day in previous years.
export function photoOnThisDay(params: PhotoOnThisDayBo = {}) {
  return http.post<PhotoOnThisDayVo>('/photo/onThisDay', params);
}

// Fetch all photo IDs in random order for client-side random pagination.
export function photoRandomIdList(params: PhotoRandomIdListBo) {
  return http.post<string[]>('/photo/randomIdList', params);
}

// Query the shooting date and number of existing photos by day.
export function photoTakenDateList(params: PhotoTakenDateListBo) {
  return http.post<PhotoTakenDateVo[]>('/photo/takenDateList', params);
}

// Upload a single photo.
export function photoAdd(params: FormData) {
  return http.post<PhotoAddResultVo>('/photo/add', params);
}

// Check if the file already exists before uploading.
export function photoExists(params: PhotoExistsBo) {
  return http.post<PhotoExistsVo>('/photo/exists', params);
}

// Batch update photo download protection permission.
export function photoSetAllowDownload(params: PhotoSetAllowDownloadBo) {
  return http.post<void>('/photo/setAllowDownload', params);
}

// Request photo download URL with server-side protection check.
export function photoDownload(photoId: string) {
  return http.post<{ url: string }>('/photo/download', { photoId });
}

// Move photos to recycle bin.
export function photoRecycle(params: PhotoRecycleBo) {
  return http.post<void>('/photo/recycle', params);
}

// Set photo favorite status.
export function photoFavorite(params: PhotoFavoriteBo) {
  return http.post<void>('/photo/favorite', params);
}

// Recover Recycle Bin Photos.
export function photoRestore(params: PhotoRestoreBo) {
  return http.post<void>('/photo/restore', params);
}

// Completely delete photos from Recycle Bin.
export function photoDelete(params: PhotoDeleteBo) {
  return http.post<void>('/photo/delete', params);
}

// Empty Recycle Bin Photos.
export function photoClear() {
  return http.post<void>('/photo/clear');
}

// Auto-detect duplicate photo groups (Admin only).
export function photoGetDuplicates(params?: { albumId?: string }) {
  return http.post<PhotoDuplicateGroupVo[]>('/photo/duplicates', params ?? {});
}
