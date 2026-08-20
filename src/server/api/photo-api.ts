import { Hono, Context } from "hono";
import result from '@/server/model/result';
import { photoService } from '@/server/service/photo-service';
import { getUserId } from "@/server/security/context";
import {
  type PhotoDeleteBo,
  type PhotoExistsBo,
  type PhotoFavoriteBo,
  type PhotoListBo,
  type PhotoOnThisDayBo,
  type PhotoRandomIdListBo,
  type PhotoRecycleBo,
  type PhotoRestoreBo,
  type PhotoSetAllowDownloadBo,
  type PhotoSetVisibilityBo,
  type PhotoTakenDateListBo,
} from '@/server/entity/bo/photo';
import type { HonoEnv } from '../hono/type';

// This module registers photo-related interfaces.

export function registerPhotoApi(app: Hono<HonoEnv>) {
  // Set photo display scope / visibility (Both, Gallery Only, Album Only, Archived).
  app.post('/photo/setVisibility', async (c: Context) => {
    const body = await c.req.json<PhotoSetVisibilityBo>();
    await photoService.setVisibility(body, getUserId());
    return c.json(result.ok());
  });
  // Query the photo list by pagination and conditions.
  app.post('/photo/list', async (c: Context) => {
    const body = await c.req.json<PhotoListBo>();
    const data = await photoService.list(body, getUserId());
    return c.json(result.ok(data));
  });

  // Return all photo IDs in random order for client-side random pagination.
  app.post('/photo/randomIdList', async (c: Context) => {
    const body = await c.req.json<PhotoRandomIdListBo>();
    const data = await photoService.randomIdList(body, getUserId());
    return c.json(result.ok(data));
  });

  // Query photos taken on this day in previous years.
  app.post('/photo/onThisDay', async (c: Context) => {
    const body = await c.req.json<PhotoOnThisDayBo>().catch(() => ({} as PhotoOnThisDayBo));
    const data = await photoService.onThisDay(body, getUserId());
    return c.json(result.ok(data));
  });

  app.get('/photo/onThisDay', async (c: Context) => {
    const month = Number(c.req.query('month')) || undefined;
    const day = Number(c.req.query('day')) || undefined;
    const year = Number(c.req.query('year')) || undefined;
    const tzOffset = Number(c.req.query('tzOffset')) || undefined;
    const data = await photoService.onThisDay({ month, day, year, tzOffset }, getUserId());
    return c.json(result.ok(data));
  });

  // Count the shooting dates of existing photos by day.
  app.post('/photo/takenDateList', async (c: Context) => {
    const body = await c.req.json<PhotoTakenDateListBo>();
    const data = await photoService.takenDateList(body, getUserId());
    return c.json(result.ok(data));
  });

  // Download original photo file with server-side protection validation.
  app.get('/photo/download/:id', async (c: Context) => {
    const photoId = c.req.param('id') ?? '';
    const userId = getUserId();
    const photo = await photoService.getById(photoId, userId);

    if (!photo) {
      return c.json({ code: 404, error: "NOT_FOUND", message: "Photo not found" }, 404);
    }

    const isAllowed = photo.allowDownload || Boolean(userId);

    if (!isAllowed || !photo.key) {
      return c.json({
        code: 403,
        error: "DOWNLOAD_PROTECTED",
        message: "This photo is protected from download."
      }, 403, {
        'Cache-Control': 'no-store, private'
      });
    }

    return c.redirect(photo.key);
  });

  app.post('/photo/download', async (c: Context) => {
    const { photoId } = await c.req.json<{ photoId: string }>();
    const userId = getUserId();
    const photo = await photoService.getById(photoId, userId);

    if (!photo) {
      return c.json({ code: 404, error: "NOT_FOUND", message: "Photo not found" }, 404);
    }

    const isAllowed = photo.allowDownload || Boolean(userId);

    if (!isAllowed || !photo.key) {
      return c.json({
        code: 403,
        error: "DOWNLOAD_PROTECTED",
        message: "This photo is protected from download."
      }, 403, {
        'Cache-Control': 'no-store, private'
      });
    }

    return c.json(result.ok({ url: photo.key }));
  });

  // Batch update photo download protection status (Admin only).
  app.post('/photo/setAllowDownload', async (c: Context) => {
    const body = await c.req.json<PhotoSetAllowDownloadBo>();
    await photoService.setAllowDownload(body, getUserId());
    return c.json(result.ok());
  });

  // Upload a single photo.
  app.post('/photo/add', async (c: Context) => {
    const data = await photoService.add(await c.req.formData(), getUserId());
    return c.json(result.ok(data));
  });

  // Check whether file already exists before uploading.
  app.post('/photo/exists', async (c: Context) => {
    const body = await c.req.json<PhotoExistsBo>();
    const data = await photoService.exists(body, getUserId());
    return c.json(result.ok(data));
  });

  // Move photos to recycle bin.
  app.post('/photo/recycle', async (c: Context) => {
    const body = await c.req.json<PhotoRecycleBo>();
    await photoService.recycle(body, getUserId());
    return c.json(result.ok());
  });

  // Set favorite status of photos.
  app.post('/photo/favorite', async (c: Context) => {
    const body = await c.req.json<PhotoFavoriteBo>();
    await photoService.favorite(body, getUserId());
    return c.json(result.ok());
  });

  // Restore photos from recycle bin.
  app.post('/photo/restore', async (c: Context) => {
    const body = await c.req.json<PhotoRestoreBo>();
    await photoService.restore(body, getUserId());
    return c.json(result.ok());
  });

  // Completely delete photo files and records.
  app.post('/photo/delete', async (c: Context) => {
    const body = await c.req.json<PhotoDeleteBo>();
    await photoService.delete(body, getUserId());
    return c.json(result.ok());
  });

  // Clean up photo files in recycle bin.
  app.post('/photo/clear', async (c: Context) => {
    await photoService.clear(getUserId());
    return c.json(result.ok());
  });

  // Auto-detect duplicate photo groups based on visual content / checksum / album (Admin only).
  app.post('/photo/duplicates', async (c: Context) => {
    const { albumId } = await c.req.json<{ albumId?: string }>().catch(() => ({ albumId: undefined }));
    const data = await photoService.findDuplicateGroups(getUserId(), albumId);
    return c.json(result.ok(data));
  });
  app.get('/photo/duplicates', async (c: Context) => {
    const albumId = c.req.query('albumId');
    const data = await photoService.findDuplicateGroups(getUserId(), albumId);
    return c.json(result.ok(data));
  });
}
