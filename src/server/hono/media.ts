import { Hono } from 'hono';
import type { Context, Next } from 'hono';
import { storage } from '@/server/storage/storage';
import { readOrm } from '@/server/infra/db';
import { photoTab } from '@/server/entity/photo';
import { fileTab } from '@/server/entity/file';
import { albumPhotoTab } from '@/server/entity/album-photo';
import { albumTab } from '@/server/entity/album';
import { and, eq } from 'drizzle-orm';
import { contextStorage } from 'hono/context-storage';
import { security } from '../security/security';
import { getUserId } from '@/server/security/context';
import { mediaCors } from '@/server/security/cors';
import { buildContentDisposition } from '@/server/lib/file';
import { FileTypeEnum } from '@/server/enums/file-enum';
import { PhotoStatusEnum, PhotoVisibilityEnum } from '@/server/enums/photo-enum';
import BizError from '@/server/error/biz-error';
import { i18nMiddleware, t } from '@/server/i18n';
import { antiHotlink } from '@/server/security/hotlink';
import { botBlocker } from '@/server/security/bot-blocker';
import { userService } from '@/server/service/user-service';
import { UserTypeEnum } from '@/server/enums/user-enum';
import type { HonoEnv } from './type';

// This module handles the photo media reading interface, the path is /media/{key}.

const media = new Hono<HonoEnv>();
media.use('*', mediaCors);
media.use('*', botBlocker);
media.use('*', antiHotlink);
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

  const [row] = await readOrm
    .select({
      key: fileTab.key,
      type: fileTab.type,
      fileType: fileTab.fileType,
      name: photoTab.name,
      photoId: photoTab.photoId,
      storageId: photoTab.storageId,
      allowDownload: photoTab.allowDownload,
      status: photoTab.status,
      visibility: photoTab.visibility
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

  // If photo is archived, only allow authenticated user/admin to view
  if (photoFile.visibility === PhotoVisibilityEnum.ARCHIVED && !userId) {
    return next();
  }

  // If photo is ALBUM_ONLY, only allow unauthenticated visitors if it belongs to an active public album
  if (photoFile.visibility === PhotoVisibilityEnum.ALBUM_ONLY && !userId) {
    const [archivedAlbumRel] = await readOrm
      .select({ id: albumPhotoTab.id })
      .from(albumPhotoTab)
      .innerJoin(albumTab, eq(albumTab.albumId, albumPhotoTab.albumId))
      .where(and(eq(albumPhotoTab.photoId, photoFile.photoId), eq(albumTab.isArchived, 1)))
      .limit(1);

    if (archivedAlbumRel) {
      return next();
    }
  }

  // Detect if the requested resource is a video
  const isVideo = Boolean(
    photoFile.fileType?.startsWith('video/') ||
    photoFile.name?.match(/\.(mp4|webm|mov|m4v|mkv)$/i) ||
    photoFile.key?.match(/\.(mp4|webm|mov|m4v|mkv)$/i)
  );

  const isDownloadRequested = c.req.query('download') === '1' || c.req.query('download') === 'true';

  // Server-side Download Protection for ORIGINAL photo requests and explicit original video download requests
  if (photoFile.type === FileTypeEnum.ORIGINAL && (!isVideo || isDownloadRequested)) {
    const isPublicDownloadAllowed = photoFile.allowDownload === 1;
    let isAdmin = false;

    if (userId) {
      try {
        const user = await userService.getById(userId);
        isAdmin = user?.type === UserTypeEnum.ADMIN;
      } catch {
        isAdmin = false;
      }
    }

    if (!isPublicDownloadAllowed && !isAdmin) {
      return c.json({
        code: 403,
        error: "DOWNLOAD_PROTECTED",
        message: "Media download is restricted to administrators only."
      }, 403, {
        'Cache-Control': 'no-store, private'
      });
    }
  }

  const isOriginal = photoFile.type === FileTypeEnum.ORIGINAL;
  // Derivatives and public gallery videos are safe to cache on global CDN edge
  const isCacheable = !isOriginal || isVideo;

  // Offload public derivatives and videos to Cloudflare Worker Media Gateway if configured, unless direct streaming is requested.
  // Returning an instant 307 redirect reduces Vercel serverless execution to ~5ms and consumes 0 bytes of Fast Origin Transfer.
  const isDirectRequested = c.req.query('direct') === '1' || c.req.header('x-direct-media') === '1';
  const gatewayBase = (process.env.NEXT_PUBLIC_MEDIA_GATEWAY_URL || process.env.R2_MEDIA_GATEWAY_URL || '').replace(/\/+$/, '');
  if (isCacheable && gatewayBase && !isDirectRequested) {
    const encodedKey = photoFile.key.split('/').map((segment: string) => encodeURIComponent(segment)).join('/');
    return c.redirect(`${gatewayBase}/${encodedKey}`, 307);
  }

  const etag = `W/"${photoFile.key}"`;
  const ifNoneMatch = c.req.header('if-none-match');

  // Fast-path HTTP 304 Not Modified: instantly revalidate cached images/videos with 0 bytes transferred
  if (ifNoneMatch && (ifNoneMatch === etag || ifNoneMatch === `"${photoFile.key}"`)) {
    const notModifiedHeaders: Record<string, string> = {
      'ETag': etag,
      'Cache-Control': isCacheable ? 'public, max-age=31536000, immutable' : 'no-cache, private',
      'X-Content-Type-Options': 'nosniff',
    };
    if (isCacheable) {
      notModifiedHeaders['CDN-Cache-Control'] = 'public, max-age=31536000, immutable';
      notModifiedHeaders['Cloudflare-CDN-Cache-Control'] = 'public, max-age=31536000, immutable';
    }
    return c.body(null, 304, notModifiedHeaders);
  }

  const rangeHeader = c.req.header('range');
  const obj = await storage.get(photoFile.key, photoFile.storageId, rangeHeader);
  const disposition = photoFile.type === FileTypeEnum.ORIGINAL ? buildContentDisposition(photoFile.name) : null;
  const isPartial = Boolean(rangeHeader && obj.statusCode === 206 && obj.contentRange);

  const headers: Record<string, string> = {
    'Content-Type': photoFile.fileType || (isVideo ? 'video/mp4' : 'image/webp'),
    'Cache-Control': isCacheable ? 'public, max-age=31536000, immutable' : 'private, max-age=86400, immutable',
    'ETag': etag,
    'Vary': 'Accept, Accept-Encoding',
    'Accept-Ranges': 'bytes',
    'X-Content-Type-Options': 'nosniff',
  };

  if (isPartial && obj.contentRange) {
    headers['Content-Range'] = obj.contentRange;
  }

  if (isCacheable) {
    // Explicitly instruct Cloudflare Edge CDN to cache derivatives and videos for 1 year so repeat visits bypass Vercel completely
    headers['CDN-Cache-Control'] = 'public, max-age=31536000, immutable';
    headers['Cloudflare-CDN-Cache-Control'] = 'public, max-age=31536000, immutable';
  }

  // Only attach download disposition for non-video files or when not a partial stream
  if (disposition && !isPartial && !isVideo) {
    headers['Content-Disposition'] = disposition;
  }

  let responseBody: any = obj.body;
  // Prioritize streaming via web stream for videos and large media to prevent serverless memory bloat
  if (obj.body && typeof (obj.body as any).transformToWebStream === 'function') {
    responseBody = (obj.body as any).transformToWebStream();
    if (obj.size > 0) {
      headers['Content-Length'] = String(obj.size);
    }
  } else if (obj.body && typeof (obj.body as any).transformToByteArray === 'function') {
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
  } else if (obj.size > 0) {
    headers['Content-Length'] = String(obj.size);
  }

  const statusCode = isPartial ? 206 : 200;
  return c.body(responseBody, statusCode as any, headers);
});

export { media };
