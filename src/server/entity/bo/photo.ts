// This module defines the photo business input parameter object.

interface PhotoTakenDateListBo {
  albumId?: string | null;
  // tzOffset for relative UTC offset minutes, East Eighth District is 480.
  tzOffset: number;
}

interface PhotoListBo {
  size: number;
  offset?: number | null;
  cursorPhotoId?: string | null;
  cursorTime?: string | null;
  startTakenTime?: string | null;
  endTakenTime?: string | null;
  status?: number | null;
  albumId?: string | null;
  visibility?: number | null;
  shuffle?: boolean;
  // Filter by specific photo IDs (used for random-order pagination)
  photoIds?: string[] | null;
  sortBy?: 'takenTime' | 'createTime' | 'size' | 'name' | null;
  sortOrder?: 'asc' | 'desc' | null;
  keyword?: string | null;
  allowAllVisibility?: boolean | null;
  allowDownload?: boolean | null;
}

// Input params for fetching all photo IDs in random order.
interface PhotoRandomIdListBo {
  status?: number | null;
  albumId?: string | null;
  visibility?: number | null;
  startTakenTime?: string | null;
  endTakenTime?: string | null;
}

interface PhotoExistsBo {
  checksum: string;
  name: string;
  size?: number;
  width?: number;
  height?: number;
  thumbHash?: string;
}

interface PhotoRecycleBo {
  photoIds: string[];
}

interface PhotoRestoreBo {
  photoIds: string[];
}

interface PhotoDeleteBo {
  photoIds: string[];
}

interface PhotoSetAllowDownloadBo {
  photoIds: string[];
  allowDownload: boolean;
}

interface PhotoSetVisibilityBo {
  photoIds: string[];
  visibility: number;
}

interface PhotoOnThisDayBo {
  month?: number | null;
  day?: number | null;
  year?: number | null;
  tzOffset?: number | null;
}

interface PhotoBatchEditBo {
  photoIds: string[];
  visibility?: number | null;
  allowDownload?: boolean | null;
  takenTime?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}

export type {
  PhotoBatchEditBo,
  PhotoDeleteBo,
  PhotoExistsBo,
  PhotoListBo,
  PhotoOnThisDayBo,
  PhotoRandomIdListBo,
  PhotoRecycleBo,
  PhotoRestoreBo,
  PhotoSetAllowDownloadBo,
  PhotoSetVisibilityBo,
  PhotoTakenDateListBo,
};

