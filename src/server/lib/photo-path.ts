// This module provides a method for generating photo storage paths.

// Format the shooting time into YYYY-MM-DD directory name.
function formatPhotoDate(takenTime: string): string {
  return takenTime.slice(0, 10);
}

// Generate an original image key under the private-only originals prefix.
function buildPhotoKey(userId: string, fileName: string): string {
  return `originals/${userId}/${fileName}`;
}

// according to checksum First four shards, For file name photoId, Avoid the same content key conflict.
function buildChecksumImageKey(prefix: 'previews' | 'thumbnails', checksum: string, photoId: string, ext: string): string {
  return `${prefix}/${checksum.slice(0, 2)}/${checksum.slice(2, 4)}/${photoId}${ext}`;
}

// Generate HD image storage path.
function buildPreviewKey(checksum: string, photoId: string): string {
  return buildChecksumImageKey('previews', checksum, photoId, '.jpg');
}

// Generate thumbnail storage path.
function buildThumbnailKey(checksum: string, photoId: string): string {
  return buildChecksumImageKey('thumbnails', checksum, photoId, '.webp');
}

// Generate thumbnail video (360p) storage path under public previews prefix.
function buildThumbnailVideoKey(checksum: string, photoId: string): string {
  return `previews/video/${checksum.slice(0, 2)}/${checksum.slice(2, 4)}/${photoId}.mp4`;
}

export { buildPhotoKey, buildPreviewKey, buildThumbnailKey, buildThumbnailVideoKey, formatPhotoDate };
