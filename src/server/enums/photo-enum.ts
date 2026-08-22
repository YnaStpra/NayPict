const PhotoStatusEnum = {
  NORMAL: 1,
  DELETE: 2
} as const;

const PhotoVisibilityEnum = {
  BOTH: 1,         // Visible in both Main Gallery and Albums (Default)
  GALLERY_ONLY: 2, // Visible only in Main Gallery, hidden from Albums
  ALBUM_ONLY: 3,   // Visible only in Albums, hidden from Main Gallery
  ARCHIVED: 4,     // Archived / Hidden from both Main Gallery and Albums
} as const;

export { PhotoStatusEnum, PhotoVisibilityEnum };
