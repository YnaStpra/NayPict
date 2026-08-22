// This module defines the photo interface return object。

import { type Photo } from '@/server/entity/photo';

type PhotoVo = Omit<Photo, 'favorite'> & {
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
  isPinned?: boolean;
  isLocationIgnored?: boolean;
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

type PhotoOnThisDayItemVo = PhotoVo & {
  year: number;
  yearsAgo: number;
  locationName?: string | null;
};

interface PhotoOnThisDayVo {
  date: string;
  list: PhotoOnThisDayItemVo[];
  total: number;
}

export type {
  PhotoVo,
  PhotoTakenDateVo,
  PhotoAddResultVo,
  PhotoExistsVo,
  PhotoDuplicateGroupVo,
  PhotoOnThisDayItemVo,
  PhotoOnThisDayVo,
};

