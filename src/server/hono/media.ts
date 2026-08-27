import { Hono } from 'hono';
import type { Context, Next } from 'hono';
import { storage } from '@/server/storage/storage';
import { orm } from '@/server/infra/db';
import { photoTab } from '@/server/entity/photo';
import { fileTab } from '@/server/entity/file';
import { eq } from 'drizzle-orm';
import { contextStorage } from 'hono/context-storage';
import { security } from '../security/security';
import { getUserId } from '@/server/security/context';
import { mediaCors } from '@/server/security/cors';
import { buildContentDisposition } from '@/server/lib/file';
import { FileTypeEnum } from '@/server/enums/file-enum';
import { PhotoStatusEnum } from '@/server/enums/photo-enum';
import BizError from '@/server/error/biz-error';
import { i18nMiddleware, t } from '@/server/i18n';
import type { HonoEnv } from './type';

// This module handles the photo media reading interface, the path is /media/{key}.

const media = new Hono<HonoEnv>();
media.use('*', mediaCors);
media.use('*', contextStorage());
media.use('*', i18nMiddleware);
media.use('*', security);
media.onError((err, c) => {
  if (err instanceof BizError) {
    return c.text(t(err.message), 500);
  }
  console.error(err);
  return c.text(err.message, 500);
});

// Query file and photo information by document key with in-memory LRU cache.
const photoFileCache = new Map<string, { data: any; exp: number }>();

async function getPhotoFile(key: string) {
  const now = Date.now();
  const cached = photoFileCache.get(key);
  if (cached && cached.exp > now && cached.data.type !== FileTypeEnum.ORIGINAL) {
    return cached.data;
  }

  // Original authorization fields are mutable, so never reuse a cached permission decision.
  if (cached?.data.type === FileTypeEnum.ORIGINAL) {
    photoFileCache.delete(key);
  }

  const [row] = await orm
    .select({
      key: fileTab.key,
      type: fileTab.type,
      fileType: fileTab.fileType,
      name: photoTab.name,
      photoId: photoTab.photoId,
      storageId: photoTab.storageId,
      allowDownload: photoTab.allowDownload,
      status: photoTab.status
    })
    .from(fileTab)
    .innerJoin(photoTab, eq(fileTab.photoId, photoTab.photoId))
    .where(eq(fileTab.key, key))
    .limit(1);

  if (row && row.type !== FileTypeEnum.ORIGINAL) {
    if (photoFileCache.size > 2000) {
      const oldestKey = photoFileCache.keys().next().value;
      if (oldestKey) photoFileCache.delete(oldestKey);
    }
    photoFileCache.set(key, { data: row, exp: now + 1000 * 60 * 60 }); // 1 hour memory cache
  }

  return row;
}

media.get('*', async (c: Context, next: Next) => {

  if (!c.req.path.startsWith('/media/')) {
    return next();
  }

  const rawKey = c.req.path.slice('/media/'.length);
  let key = rawKey;
  try {
    key = decodeURIComponent(rawKey);
  } catch {
    key = rawKey;
  }

  let photoFile = await getPhotoFile(key);
  if (!photoFile?.key && rawKey !== key) {
    photoFile = await getPhotoFile(rawKey);
  }

  if (!photoFile?.key || !photoFile?.storageId) {
    return next();
  }

  const userId = getUserId();

  // If photo is in trash / recycled, only allow authenticated user/admin to view
  if (photoFile.status === PhotoStatusEnum.DELETE && !userId) {
    return next();
  }

  // Server-side Download Protection for ORIGINAL file requests
  if (photoFile.type === FileTypeEnum.ORIGINAL) {
    const isAllowed = photoFile.allowDownload === 1 || Boolean(userId);

    if (!isAllowed) {
      return c.json({
        code: 403,
        error: "DOWNLOAD_PROTECTED",
        message: "This photo is protected from download."
      }, 403, {
        'Cache-Control': 'no-store, private'
      });
    }
  }

  const isOriginal = photoFile.type === FileTypeEnum.ORIGINAL;
  const etag = `W/"${photoFile.key}"`;
  const ifNoneMatch = c.req.header('if-none-match');

  // Fast-path HTTP 304 Not Modified: instantly revalidate cached images with 0 bytes transferred
  if (ifNoneMatch && (ifNoneMatch === etag || ifNoneMatch === `"${photoFile.key}"`)) {
    return c.body(null, 304, {
      'ETag': etag,
      'Cache-Control': isOriginal ? 'no-cache, private' : 'public, max-age=31536000, immutable',
    });
  }

  const obj = await storage.get(photoFile.key, photoFile.storageId);
  const disposition = photoFile.type === FileTypeEnum.ORIGINAL ? buildContentDisposition(photoFile.name) : null;
  const headers: Record<string, string> = {
    'Content-Type': photoFile.fileType || 'image/webp',
    'Cache-Control': isOriginal ? 'no-cache, private' : 'public, max-age=31536000, immutable',
    'ETag': etag,
    'Vary': 'Accept, Accept-Encoding',
    'Accept-Ranges': 'bytes',
  };

  if (disposition) {
    headers['Content-Disposition'] = disposition;
  }

  let responseBody: any = obj.body;
  if (obj.body && typeof (obj.body as any).transformToByteArray === 'function') {
    try {
      const bytes = await (obj.body as any).transformToByteArray();
      responseBody = bytes;
      headers['Content-Length'] = String(bytes.byteLength);
    } catch {
      responseBody = obj.body;
      if (obj.size > 0) {
        headers['Content-Length'] = String(obj.size);
      }
    }
  } else if (obj.body && typeof (obj.body as any).transformToWebStream === 'function') {
    responseBody = (obj.body as any).transformToWebStream();
    if (obj.size > 0) {
      headers['Content-Length'] = String(obj.size);
    }
  } else if (obj.size > 0) {
    headers['Content-Length'] = String(obj.size);
  }

  return c.body(responseBody, 200, headers);
});

export { media };
