import { http } from "@/request/request";
import { type Album } from "@/server/entity/album";
import {
  type AlbumAddBo,
  type AlbumAddPhotoBo,
  type AlbumDeleteBo,
  type AlbumRemovePhotoBo,
  type AlbumSetCoverBo,
  type AlbumSetNameBo,
  type AlbumSetTopBo,
  type AlbumTogglePinPhotoBo,
} from "@/server/entity/bo/album";
import { type AlbumVo } from "@/server/entity/vo/album";

export interface AlbumCoverCandidate {
  photoId: string;
  name: string;
  width: number | null;
  height: number | null;
  size: number;
  score: number;
  thumbnail: string | null;
  preview: string | null;
}

let cachedAlbums: AlbumVo[] | null = null;
let cachedAlbumsTimestamp = 0;
let inFlightAlbumPromise: Promise<AlbumVo[]> | null = null;

// Invalidate in-memory album cache when mutations occur
export function invalidateAlbumCache() {
  cachedAlbums = null;
  cachedAlbumsTimestamp = 0;
}

// Query the list of all albums with SWR in-memory caching (30s stale window) & request deduplication.
export function albumList(forceRefresh: boolean = false): Promise<AlbumVo[]> {
  const now = Date.now();
  if (!forceRefresh && cachedAlbums && now - cachedAlbumsTimestamp < 30000) {
    return Promise.resolve(cachedAlbums);
  }

  if (inFlightAlbumPromise) {
    return inFlightAlbumPromise;
  }

  inFlightAlbumPromise = http
    .post<AlbumVo[]>('/album/list')
    .then((albums) => {
      cachedAlbums = albums;
      cachedAlbumsTimestamp = Date.now();
      return albums;
    })
    .finally(() => {
      inFlightAlbumPromise = null;
    });

  return inFlightAlbumPromise;
}

// Add album.
export function albumAdd(params: AlbumAddBo) {
  invalidateAlbumCache();
  return http.post<Album>('/album/add', params);
}

// Set or auto-select album cover.
export function albumSetCover(params: AlbumSetCoverBo) {
  invalidateAlbumCache();
  return http.post<void>('/album/setCover', params);
}

// Query cover photo candidates for an album.
export function albumGetCoverCandidates(albumId: string) {
  return http.post<AlbumCoverCandidate[]>('/album/coverCandidates', { albumId });
}

// Add photos to album.
export function albumAddPhoto(params: AlbumAddPhotoBo) {
  invalidateAlbumCache();
  return http.post<void>('/album/addPhoto', params);
}

// Remove photos from album.
export function albumRemovePhoto(params: AlbumRemovePhotoBo) {
  invalidateAlbumCache();
  return http.post<void>('/album/removePhoto', params);
}

// Toggle pinned status of a photo in an album (Max 3 pinned photos per album).
export function albumTogglePinPhoto(params: AlbumTogglePinPhotoBo) {
  invalidateAlbumCache();
  return http.post<{ isPinned: boolean }>('/album/togglePinPhoto', params);
}

// Delete album.
export function albumDelete(params: AlbumDeleteBo) {
  return http.post<void>('/album/delete', params);
}

// Modify album name.
export function albumSetName(params: AlbumSetNameBo) {
  return http.post<void>('/album/setName', params);
}

// Pin photo album.
export function albumSetTop(params: AlbumSetTopBo) {
  return http.post<void>('/album/setTop', params);
}

// Query the virtual photo album in the recycle bin.
export function albumTrash() {
  return http.post<AlbumVo>('/album/trash');
}
