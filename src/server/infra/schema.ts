import { albumTab } from '@/server/entity/album';
import { albumPhotoTab } from '@/server/entity/album-photo';
import { cacheTab } from '@/server/entity/cache';
import { exifTab } from '@/server/entity/exif';
import { fileTab } from '@/server/entity/file';
import { photoTab } from '@/server/entity/photo';
import { settingTab } from '@/server/entity/setting';
import { storageTab } from '@/server/entity/storage';
import { userTab } from '@/server/entity/user';
import { loginLogTab } from '@/server/entity/login-log';

// This module exports uniformly Drizzle Database table structure.

const schema = {
  albumPhotoTab,
  albumTab,
  cacheTab,
  exifTab,
  fileTab,
  loginLogTab,
  photoTab,
  settingTab,
  storageTab,
  userTab
};

export { schema };
