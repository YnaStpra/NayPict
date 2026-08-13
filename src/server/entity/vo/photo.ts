// This module defines the photo interface return object。

import { type Photo } from '@/server/entity/photo';

type PhotoVo = Photo & {
  key: string | null;
  preview: string;
  thumbnail: string;
  exif: string | null;
  latitude: number | null;
  longitude: number | null;
  altitude: number | null;
  storageName: string | null;
  storageTypeDesc: string | null;
  albums?: { albumId: string; name: string }[];
};

interface PhotoTakenDateVo {
  date: string;
  count: number;
}

interface PhotoAddResultVo {
  photo: PhotoVo | null;
  duplicate: boolean;
}

interface PhotoExistsVo {
  duplicate: boolean;
  photoId?: string | null;
}

interface PhotoDuplicateGroupVo {
  groupId: string;
  similarityType: 'visual' | 'checksum';
  photos: PhotoVo[];
}

export type { PhotoVo, PhotoTakenDateVo, PhotoAddResultVo, PhotoExistsVo, PhotoDuplicateGroupVo };
