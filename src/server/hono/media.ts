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
import { cors } from 'hono/cors';
import { buildContentDisposition } from '@/server/lib/file';
import { FileTypeEnum } from '@/server/enums/file-enum';
import { PhotoStatusEnum } from '@/server/enums/photo-enum';
import BizError from '@/server/error/biz-error';
import { i18nMiddleware, t } from '@/server/i18n';
import type { HonoEnv } from './type';

// This module handles the photo media reading interface, the path is /media/{key}.

const media = new Hono<HonoEnv>();
media.use('*', cors());
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

// Query file and photo information by document key.
async function getPhotoFile(key: string) {
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

  return row;
}

media.get('*', async (c: Context, next: Next) => {

  if (!c.req.path.startsWith('/media/')) {
    return next();
  }

  const key = decodeURIComponent(c.req.path.slice('/media/'.length));

  const photoFile = await getPhotoFile(key);

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
    const userId = getUserId();
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

  const obj = await storage.get(photoFile.key, photoFile.storageId);
  const disposition = photoFile.type === FileTypeEnum.ORIGINAL ? buildContentDisposition(photoFile.name) : null;
  const isOriginal = photoFile.type === FileTypeEnum.ORIGINAL;
  const headers: Record<string, string> = {
    'Content-Type': photoFile.fileType,
    'Cache-Control': isOriginal ? 'no-cache, private' : 'public, max-age=31536000, immutable',
    'Vary': 'Accept, Accept-Encoding',
    'Accept-Ranges': 'bytes',
    'Content-Length': String(obj.size)
  };

  if (disposition) {
    headers['Content-Disposition'] = disposition;
  }

  return c.body(obj.body as unknown as ReadableStream, 200, headers);
});

export { media };
