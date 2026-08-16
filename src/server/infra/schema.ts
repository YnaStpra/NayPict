import { albumTab } from '@/server/entity/album';
import { albumPhotoTab } from '@/server/entity/album-photo';
import { cacheTab } from '@/server/entity/cache';
import { commentTab } from '@/server/entity/comment';
import { exifTab } from '@/server/entity/exif';
import { fileTab } from '@/server/entity/file';
import { photoTab } from '@/server/entity/photo';
import { photoViewTab } from '@/server/entity/insights';
import { settingTab } from '@/server/entity/setting';
import { storageTab } from '@/server/entity/storage';
import { userTab } from '@/server/entity/user';

// This module exports uniformly Drizzle Database table structure.

const schema = {
  albumPhotoTab,
  albumTab,
  cacheTab,
  commentTab,
  exifTab,
  fileTab,
  photoTab,
  photoViewTab,
  settingTab,
  storageTab,
  userTab
};

export { schema };
