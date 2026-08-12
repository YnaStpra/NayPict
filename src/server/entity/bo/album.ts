// This module defines the photo album business input parameter object.

interface AlbumAddBo {
  name: string;
}

interface AlbumAddPhotoBo {
  albumIds: string[];
  photoIds: string[];
}

interface AlbumRemovePhotoBo {
  albumId: string;
  photoIds: string[];
}

interface AlbumDeleteBo {
  albumId: string;
}

interface AlbumSetNameBo {
  albumId: string;
  name: string;
}

interface AlbumSetCoverBo {
  albumId: string;
  photoId?: string | null;
  autoSelect?: boolean;
}

interface AlbumSetTopBo {
  albumId: string;
}

export type { AlbumAddBo, AlbumAddPhotoBo, AlbumDeleteBo, AlbumRemovePhotoBo, AlbumSetCoverBo, AlbumSetNameBo, AlbumSetTopBo };
