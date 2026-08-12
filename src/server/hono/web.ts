import { createHonoApp } from './hono';
import { registerAlbumApi } from '../api/album-api';
import { registerPhotoApi } from '../api/photo-api';
import { registerStorageApi } from '../api/storage-api';
import { registerUserApi } from '../api/user-api';
import { registerLoginApi } from '../api/login-api';
import { registerSettingApi } from '../api/setting-api';

// This module creates a fresh Hono application instance with all API routes attached per request handler.

export function getApp() {
  const instance = createHonoApp();
  registerAlbumApi(instance);
  registerPhotoApi(instance);
  registerStorageApi(instance);
  registerUserApi(instance);
  registerLoginApi(instance);
  registerSettingApi(instance);
  return instance;
}

export const app = getApp();
