import { createHonoApp } from './hono';
import { registerAlbumApi } from '../api/album-api';
import { registerPhotoApi } from '../api/photo-api';
import { registerStorageApi } from '../api/storage-api';
import { registerUserApi } from '../api/user-api';
import { registerLoginApi } from '../api/login-api';
import { registerSettingApi } from '../api/setting-api';
import { registerTotpApi } from '../api/totp-api';
import { registerCommentApi } from '../api/comment-api';
import { registerInsightsApi } from '../api/insights-api';
import { registerLocationApi } from '../api/location-api';
import { registerCspApi } from '../api/csp-api';
import { registerHealthApi } from '../api/health-api';
import { registerBackupApi } from '../api/backup-api';
import { registerSessionApi } from '../api/session-api';

// This module creates a fresh Hono application instance with all API routes attached per request handler.

export function getApp() {
  const instance = createHonoApp();
  registerHealthApi(instance);
  registerAlbumApi(instance);
  registerPhotoApi(instance);
  registerStorageApi(instance);
  registerUserApi(instance);
  registerLoginApi(instance);
  registerSettingApi(instance);
  registerTotpApi(instance);
  registerCommentApi(instance);
  registerInsightsApi(instance);
  registerLocationApi(instance);
  registerCspApi(instance);
  registerBackupApi(instance);
  registerSessionApi(instance);
  return instance;
}

export const app = getApp();
