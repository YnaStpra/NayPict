import { http } from "@/request/request";
import { type Album } from "@/server/entity/album";
import { type AlbumAddBo, type AlbumAddPhotoBo, type AlbumDeleteBo, type AlbumRemovePhotoBo, type AlbumSetNameBo, type AlbumSetTopBo } from "@/server/entity/bo/album";
import { type AlbumVo } from "@/server/entity/vo/album";

// This module encapsulates album related interface requests。

// Query the list of all albums。
export function albumList() {
  return http.post<AlbumVo[]>('/album/list');
}

// Add album。
export function albumAdd(params: AlbumAddBo) {
  return http.post<Album>('/album/add', params);
}

// Add photos to album。
export function albumAddPhoto(params: AlbumAddPhotoBo) {
  return http.post<void>('/album/addPhoto', params);
}

// Remove photos from album。
export function albumRemovePhoto(params: AlbumRemovePhotoBo) {
  return http.post<void>('/album/removePhoto', params);
}

// Delete album。
export function albumDelete(params: AlbumDeleteBo) {
  return http.post<void>('/album/delete', params);
}

// Modify album name。
export function albumSetName(params: AlbumSetNameBo) {
  return http.post<void>('/album/setName', params);
}

// Pinned photo album。
export function albumSetTop(params: AlbumSetTopBo) {
  return http.post<void>('/album/setTop', params);
}

// Query the virtual photo album in the recycle bin。
export function albumTrash() {
  return http.post<AlbumVo>('/album/trash');
}
