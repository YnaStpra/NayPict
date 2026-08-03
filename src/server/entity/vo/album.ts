import { type Album } from '@/server/entity/album';

// This module defines the album interface return object。

interface AlbumVo extends Album {
  thumbnail: string | null;
  thumbHash: string | null;
  photoTotal: number;
}

export type { AlbumVo };
