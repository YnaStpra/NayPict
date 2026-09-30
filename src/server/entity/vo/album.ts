import { type Album } from '@/server/entity/album';

// This module defines the album interface return object.

interface AlbumVo extends Omit<Album, 'isManualCover'> {
  thumbnail: string | null;
  thumbHash: string | null;
  photoTotal: number;
  coverPhotoId: string | null;
  suggestedCoverPhotoId: string | null;
  isManualCover: boolean;
}

export interface AlbumAddPhotoResultVo {
  addedCount: number;
  alreadyInAlbumCount: number;
}

export type { AlbumVo };

