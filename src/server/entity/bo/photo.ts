// This module defines the photo business input parameter object。

interface PhotoTakenDateListBo {
  favorite?: number | null;
  albumId?: string | null;
  // tzOffset for relative UTC offset minutes，East Eighth District is 480。
  tzOffset: number;

}

interface PhotoListBo {
  size: number;
  cursorPhotoId?: string | null;
  cursorTime?: string | null;
  startTakenTime?: string | null;
  endTakenTime?: string | null;
  favorite?: number | null;
  status?: number | null;
  albumId?: string | null;

}

interface PhotoExistsBo {
  checksum: string;
  name: string;
}

interface PhotoRecycleBo {
  photoIds: string[];
}

interface PhotoFavoriteBo {
  photoIds: string[];
  favorite: number;
}

interface PhotoRestoreBo {
  photoIds: string[];

}

interface PhotoDeleteBo {
  photoIds: string[];
}



export type { PhotoDeleteBo, PhotoExistsBo, PhotoFavoriteBo, PhotoListBo, PhotoRecycleBo, PhotoRestoreBo, PhotoTakenDateListBo };

