import { http } from "@/request/request";
import {
  type PhotoAddVideoBo,
  type PhotoBatchEditBo,
  type PhotoDeleteBo,
  type PhotoExistsBo,
  type PhotoListBo,
  type PhotoMultipartAbortBo,
  type PhotoMultipartCompleteBo,
  type PhotoMultipartInitiateBo,
  type PhotoMultipartPartUrlBo,
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
  type PhotoMultipartCompleteVo,
  type PhotoMultipartInitiateVo,
  type PhotoMultipartPartUrlVo,
  type PhotoOnThisDayVo,
  type PhotoTakenDateVo,
  type PhotoVo,
} from "@/server/entity/vo/photo";

// This module encapsulates photo-related interface requests.

// Batch edit photo metadata (visibility, allowDownload, takenTime, GPS location).
export function photoBatchEdit(params: PhotoBatchEditBo) {
  return http.post<void>('/photo/batchEdit', params);
}

// Update photo display scope / visibility (Both, Gallery Only, Album Only, Archived).
export function photoSetVisibility(params: PhotoSetVisibilityBo) {
  return http.post<void>('/photo/setVisibility', params);
}

// Query all geotagged photos for the interactive map explorer.
export function photoMapList() {
  return http.get<PhotoVo[]>('/photos/map');
}

// Query all photos without GPS coordinates for Admin geotagging.
export function photoUntaggedList() {
  return http.get<PhotoVo[]>('/photos/untagged');
}

// Query the photo list by pagination and conditions (GET allows edge CDN caching).
export function photoList(params: PhotoListBo) {
  return http.get<PageVo<PhotoVo>>('/photo/list', params as unknown as Record<string, unknown>);
}

// Query photos taken on this day in previous years.
export function photoOnThisDay(params: PhotoOnThisDayBo = {}) {
  return http.post<PhotoOnThisDayVo>('/photo/onThisDay', params);
}

// Fetch all photo IDs in random order for client-side random pagination (GET allows edge CDN caching).
export function photoRandomIdList(params: PhotoRandomIdListBo) {
  return http.get<string[]>('/photo/randomIdList', params as unknown as Record<string, unknown>);
}

// Query the shooting date and number of existing photos by day.
export function photoTakenDateList(params: PhotoTakenDateListBo) {
  return http.post<PhotoTakenDateVo[]>('/photo/takenDateList', params);
}

// Upload a single photo.
export function photoAdd(params: FormData) {
  return http.post<PhotoAddResultVo>('/photo/add', params);
}

// Request presigned PUT URL for direct storage upload (S3 / Cloudflare R2).
export function photoGetPresignedUploadUrl(params: { filename: string; fileType: string; storageId?: string }) {
  return http.post<{ uploadUrl: string; key: string; storageId: string }>('/photo/presignedUploadUrl', params);
}

// Initiate direct S3 / Cloudflare R2 multipart upload session.
export function photoMultipartInitiate(params: PhotoMultipartInitiateBo) {
  return http.post<PhotoMultipartInitiateVo>('/photo/multipart/initiate', params);
}

// Request presigned PUT URL for a specific part chunk in multipart upload.
export function photoMultipartPartUrl(params: PhotoMultipartPartUrlBo) {
  return http.post<PhotoMultipartPartUrlVo>('/photo/multipart/partUrl', params);
}

// Complete an S3 / Cloudflare R2 multipart upload session.
export function photoMultipartComplete(params: PhotoMultipartCompleteBo) {
  return http.post<PhotoMultipartCompleteVo>('/photo/multipart/complete', params);
}

// Abort an S3 / Cloudflare R2 multipart upload session.
export function photoMultipartAbort(params: PhotoMultipartAbortBo) {
  return http.post<{ success: boolean }>('/photo/multipart/abort', params);
}

// Register a video directly uploaded via presigned URL with poster derivatives and metadata.
export function photoAddVideo(params: PhotoAddVideoBo) {
  return http.post<PhotoAddResultVo>('/photo/addVideo', params);
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
