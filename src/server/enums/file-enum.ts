// This module defines file-related enumeration values。

// File type：Original picture / HD pictures / Thumbnail
const FileTypeEnum = {
  ORIGINAL: 1,
  PREVIEW: 2,
  THUMBNAIL: 3
} as const;

type FileType = (typeof FileTypeEnum)[keyof typeof FileTypeEnum];

export { FileTypeEnum };
export type { FileType };
