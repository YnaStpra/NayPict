import { Hono, Context } from "hono";
import result from '@/server/model/result';
import { photoService } from '@/server/service/photo-service';
import { getUserId } from "@/server/security/context";
import {
  type PhotoAddDirectBo,
  type PhotoAddVideoBo,
  type PhotoBatchEditBo,
  type PhotoDeleteBo,
  type PhotoExistsBo,
  type PhotoListBo,
  type PhotoMultipartAbortBo,
  type PhotoMultipartCompleteBo,
  type PhotoMultipartInitiateBo,
  type PhotoMultipartPartUrlBo,
  type PhotoOnThisDayBo,
  type PhotoPresignedPhotoUploadUrlsBo,
  type PhotoRandomIdListBo,
  type PhotoRecycleBo,
  type PhotoRestoreBo,
  type PhotoSetAllowDownloadBo,
  type PhotoSetVisibilityBo,
  type PhotoTakenDateListBo,
} from '@/server/entity/bo/photo';
import { downloadRateLimiter, photoListRateLimiter, uploadRateLimiter } from '@/server/lib/rate-limiter';
import { getClientIp } from '@/server/lib/ip';
import { logSecurityAudit } from '@/server/lib/audit';
import { settingService } from '@/server/service/setting-service';
import { SettingWatermarkEnum } from '@/server/enums/setting-enum';
import { applyWatermark } from '@/server/lib/photo-watermark';
import sharp from 'sharp';
import { SHARP_SECURITY_OPTIONS } from '@/server/lib/photo-process';
import type { HonoEnv } from '../hono/type';

// This module registers photo-related interfaces.

// Helper to apply Edge CDN Caching & Stale-While-Revalidate headers for public visitors
function applyPublicCacheHeaders(c: Context, userId?: string) {
  if (userId) {
    c.header('Cache-Control', 'no-store, private');
  } else {
    c.header('Cache-Control', 'public, max-age=30, s-maxage=60, stale-while-revalidate=86400, stale-if-error=604800');
    c.header('CDN-Cache-Control', 'public, s-maxage=60, stale-while-revalidate=86400');
    c.header('Vary', 'Accept-Encoding');
  }
}

export function registerPhotoApi(app: Hono<HonoEnv>) {
  // Generate presigned PUT URL for direct-to-storage upload (S3 / Cloudflare R2).
  app.post('/photo/presignedUploadUrl', async (c: Context) => {
    const clientIp = getClientIp(c);
    const rateLimit = await uploadRateLimiter.consume(clientIp);
    if (!rateLimit.allowed) {
      c.header('Retry-After', String(Math.ceil(rateLimit.resetMs / 1000)));
      return c.json(result.fail('Upload rate limit exceeded. Please try again later.', 429), 429);
    }

    const body = await c.req.json<{ filename: string; fileType: string; storageId?: string }>();
    const data = await photoService.getPresignedUploadUrl(body, getUserId());
    return c.json(result.ok(data));
  });

  // Generate presigned PUT URLs for direct-to-storage photo upload (original, preview, thumbnail).
  app.post('/photo/presignedPhotoUploadUrls', async (c: Context) => {
    const clientIp = getClientIp(c);
    const rateLimit = await uploadRateLimiter.consume(clientIp);
    if (!rateLimit.allowed) {
      c.header('Retry-After', String(Math.ceil(rateLimit.resetMs / 1000)));
      return c.json(result.fail('Upload rate limit exceeded. Please try again later.', 429), 429);
    }

    const body = await c.req.json<PhotoPresignedPhotoUploadUrlsBo>();
    const data = await photoService.getPresignedPhotoUploadUrls(body, getUserId());
    return c.json(result.ok(data));
  });

  // Initiate direct S3 / Cloudflare R2 multipart upload session for large video files.
  app.post('/photo/multipart/initiate', async (c: Context) => {
    const clientIp = getClientIp(c);
    const rateLimit = await uploadRateLimiter.consume(clientIp);
    if (!rateLimit.allowed) {
      c.header('Retry-After', String(Math.ceil(rateLimit.resetMs / 1000)));
      return c.json(result.fail('Upload rate limit exceeded. Please try again later.', 429), 429);
    }

    const body = await c.req.json<PhotoMultipartInitiateBo>();
    const data = await photoService.initiateMultipartUpload(body, getUserId());
    return c.json(result.ok(data));
  });

  // Generate presigned PUT URL for a specific part chunk in multipart upload.
  app.post('/photo/multipart/partUrl', async (c: Context) => {
    const body = await c.req.json<PhotoMultipartPartUrlBo>();
    const data = await photoService.getMultipartPartUrl(body, getUserId());
    return c.json(result.ok(data));
  });

  // Complete an S3 / Cloudflare R2 multipart upload session.
  app.post('/photo/multipart/complete', async (c: Context) => {
    const body = await c.req.json<PhotoMultipartCompleteBo>();
    const data = await photoService.completeMultipartUpload(body, getUserId());
    return c.json(result.ok(data));
  });

  // Abort an S3 / Cloudflare R2 multipart upload session.
  app.post('/photo/multipart/abort', async (c: Context) => {
    const body = await c.req.json<PhotoMultipartAbortBo>();
    const data = await photoService.abortMultipartUpload(body, getUserId());
    return c.json(result.ok(data));
  });

  // Batch edit photo metadata (visibility, allowDownload, takenTime, GPS location).
  app.post('/photo/batchEdit', async (c: Context) => {
    const body = await c.req.json<PhotoBatchEditBo>();
    await photoService.batchEdit(body, getUserId());
    return c.json(result.ok());
  });

  // Streaming batch edit photo metadata with real-time SSE progress events.
  app.post('/photo/batchEdit/stream', async (c: Context) => {
    const { streamSSE } = await import('hono/streaming');
    const userId = getUserId();
    const body = await c.req.json<PhotoBatchEditBo>();

    return streamSSE(c, async (stream) => {
      const total = body.photoIds.length;
      await stream.writeSSE({
        data: JSON.stringify({ type: 'start', total }),
      });

      await photoService.batchEdit(body, userId);

      await stream.writeSSE({
        data: JSON.stringify({ type: 'complete', total, successCount: total }),
      });
    });
  });

  // Set photo display scope / visibility (Both, Gallery Only, Album Only, Archived).
  app.post('/photo/setVisibility', async (c: Context) => {
    const body = await c.req.json<PhotoSetVisibilityBo>();
    await photoService.setVisibility(body, getUserId());
    return c.json(result.ok());
  });
  // Query all geotagged photos for the interactive map explorer (RESTful route).
  app.get('/photos/map', async (c: Context) => {
    const userId = getUserId();
    applyPublicCacheHeaders(c, userId);
    const data = await photoService.getMapPhotos(userId);
    return c.json(result.ok(data));
  });

  // Query all geotagged photos for the interactive map explorer (POST route).
  app.post('/photo/map/list', async (c: Context) => {
    const userId = getUserId();
    applyPublicCacheHeaders(c, userId);
    const data = await photoService.getMapPhotos(userId);
    return c.json(result.ok(data));
  });

  // Query all photos without GPS coordinates for Admin geotagging (RESTful route).
  app.get('/photos/untagged', async (c: Context) => {
    const data = await photoService.getUntaggedPhotos(getUserId());
    return c.json(result.ok(data));
  });

  // Query all photos without GPS coordinates for Admin geotagging (POST route).
  app.post('/photo/untagged/list', async (c: Context) => {
    const data = await photoService.getUntaggedPhotos(getUserId());
    return c.json(result.ok(data));
  });

  // Parse query parameters or JSON body into PhotoListBo
  const parsePhotoListParams = async (c: Context): Promise<PhotoListBo> => {
    if (c.req.method === 'GET') {
      const q = c.req.query();
      return {
        size: Number(q.size) || 30,
        offset: q.offset ? Number(q.offset) : null,
        cursorPhotoId: q.cursorPhotoId || null,
        cursorTime: q.cursorTime || null,
        startTakenTime: q.startTakenTime || null,
        endTakenTime: q.endTakenTime || null,
        status: q.status !== undefined && q.status !== '' ? Number(q.status) : null,
        albumId: q.albumId || null,
        visibility: q.visibility !== undefined && q.visibility !== '' ? Number(q.visibility) : null,
        shuffle: q.shuffle === 'true',
        sortBy: (q.sortBy as PhotoListBo['sortBy']) || null,
        sortOrder: (q.sortOrder as PhotoListBo['sortOrder']) || null,
        keyword: q.keyword || null,
        allowAllVisibility: q.allowAllVisibility === 'true',
        allowDownload: q.allowDownload !== undefined && q.allowDownload !== '' ? (q.allowDownload === 'true' || q.allowDownload === '1') : null,
        photoIds: q.photoIds ? (Array.isArray(q.photoIds) ? q.photoIds : q.photoIds.split(',')) : null,
      };
    }
    return c.req.json<PhotoListBo>().catch(() => ({ size: 30 }));
  };

  // Query the photo list by pagination and conditions (supports GET for edge caching).
  const handlePhotoList = async (c: Context) => {
    const userId = getUserId();
    if (!userId) {
      const clientIp = getClientIp(c);
      const rateLimit = await photoListRateLimiter.consume(clientIp);
      if (!rateLimit.allowed) {
        return c.json(result.fail("Rate limit exceeded. Please wait a moment before loading more photos.", 429), 429);
      }
    }

    applyPublicCacheHeaders(c, userId);
    const body = await parsePhotoListParams(c);
    const data = await photoService.list(body, userId);
    return c.json(result.ok(data));
  };

  app.get('/photo/list', handlePhotoList);
  app.post('/photo/list', handlePhotoList);

  // Return all photo IDs in random order for client-side random pagination (supports GET for edge caching).
  const handlePhotoRandomIdList = async (c: Context) => {
    const userId = getUserId();
    applyPublicCacheHeaders(c, userId);
    let params: PhotoRandomIdListBo = {};
    if (c.req.method === 'GET') {
      const q = c.req.query();
      params = {
        albumId: q.albumId || null,
        status: q.status !== undefined && q.status !== '' ? Number(q.status) : null,
        visibility: q.visibility !== undefined && q.visibility !== '' ? Number(q.visibility) : null,
        startTakenTime: q.startTakenTime || null,
        endTakenTime: q.endTakenTime || null,
      };
    } else {
      params = await c.req.json<PhotoRandomIdListBo>().catch(() => ({} as PhotoRandomIdListBo));
    }
    const data = await photoService.randomIdList(params, userId);
    return c.json(result.ok(data));
  };

  app.get('/photo/randomIdList', handlePhotoRandomIdList);
  app.post('/photo/randomIdList', handlePhotoRandomIdList);

  // Query photos taken on this day in previous years.
  app.post('/photo/onThisDay', async (c: Context) => {
    const userId = getUserId();
    applyPublicCacheHeaders(c, userId);
    const body = await c.req.json<PhotoOnThisDayBo>().catch(() => ({} as PhotoOnThisDayBo));
    const data = await photoService.onThisDay(body, userId);
    return c.json(result.ok(data));
  });

  app.get('/photo/onThisDay', async (c: Context) => {
    const userId = getUserId();
    applyPublicCacheHeaders(c, userId);
    const month = Number(c.req.query('month')) || undefined;
    const day = Number(c.req.query('day')) || undefined;
    const year = Number(c.req.query('year')) || undefined;
    const tzOffset = Number(c.req.query('tzOffset')) || undefined;
    const data = await photoService.onThisDay({ month, day, year, tzOffset }, userId);
    return c.json(result.ok(data));
  });

  // Count the shooting dates of existing photos by day (supports GET for edge caching and POST for backwards compatibility).
  const handlePhotoTakenDateList = async (c: Context) => {
    const userId = getUserId();
    applyPublicCacheHeaders(c, userId);
    let body: PhotoTakenDateListBo;
    if (c.req.method === 'GET') {
      const q = c.req.query();
      body = {
        albumId: q.albumId || undefined,
        tzOffset: Number(q.tzOffset) || 0,
      };
    } else {
      const parsed = await c.req.json<Partial<PhotoTakenDateListBo>>().catch(() => ({} as Partial<PhotoTakenDateListBo>));
      body = {
        albumId: parsed.albumId,
        tzOffset: typeof parsed.tzOffset === 'number' ? parsed.tzOffset : 0,
      };
    }
    const data = await photoService.takenDateList(body, userId);
    return c.json(result.ok(data));
  };

  app.get('/photo/takenDateList', handlePhotoTakenDateList);
  app.post('/photo/takenDateList', handlePhotoTakenDateList);

  // Download original photo file with full EXIF metadata and original quality (Admin only).
  app.get('/photo/download/:id', async (c: Context) => {
    const photoId = c.req.param('id') ?? '';
    const userId = getUserId();

    // STRICT: Only authenticated Admin can download media!
    if (!userId) {
      return c.json({
        code: 403,
        error: "FORBIDDEN",
        message: "Media download is restricted to administrators only."
      }, 403, {
        'Cache-Control': 'no-store, private'
      });
    }

    const photo = await photoService.getById(photoId, userId);

    if (!photo) {
      return c.json({ code: 404, error: "NOT_FOUND", message: "Photo not found" }, 404);
    }

    // Serve original uncompressed buffer with complete EXIF metadata and proper filename attachment
    const photoData = await photoService.getOriginalPhotoBuffer(photoId);
    if (photoData) {
      c.header('Content-Type', photoData.contentType || 'application/octet-stream');
      c.header('Content-Disposition', `attachment; filename="${encodeURIComponent(photoData.fileName || photo.name)}"`);
      c.header('Content-Length', String(photoData.buffer.length));
      c.header('Cache-Control', 'private, no-cache');
      return c.body(new Uint8Array(photoData.buffer));
    }

    if (photo.key) {
      return c.redirect(photo.key);
    }

    return c.json({ code: 404, error: "NOT_FOUND", message: "Media file not found" }, 404);
  });

  app.post('/photo/download', async (c: Context) => {
    const { photoId } = await c.req.json<{ photoId: string }>();
    const userId = getUserId();

    if (!userId) {
      return c.json({
        code: 403,
        error: "FORBIDDEN",
        message: "Media download is restricted to administrators only."
      }, 403, {
        'Cache-Control': 'no-store, private'
      });
    }

    const photo = await photoService.getById(photoId, userId);

    if (!photo) {
      return c.json({ code: 404, error: "NOT_FOUND", message: "Photo not found" }, 404);
    }

    // Authenticated admin downloads via the download endpoint with complete metadata & filename
    return c.json(result.ok({ url: `/api/photo/download/${photoId}` }));
  });

  // Batch update photo download protection status (Admin only).
  app.post('/photo/setAllowDownload', async (c: Context) => {
    const body = await c.req.json<PhotoSetAllowDownloadBo>();
    await photoService.setAllowDownload(body, getUserId());
    return c.json(result.ok());
  });

  // Upload a single photo.
  app.post('/photo/add', async (c: Context) => {
    const clientIp = getClientIp(c);
    const rateLimit = await uploadRateLimiter.consume(clientIp);
    if (!rateLimit.allowed) {
      c.header('Retry-After', String(Math.ceil(rateLimit.resetMs / 1000)));
      return c.json(result.fail('Upload rate limit exceeded. Please try again later.', 429), 429);
    }

    const data = await photoService.add(await c.req.formData(), getUserId());
    return c.json(result.ok(data));
  });

  // Register a video uploaded via presigned URL with poster derivatives and metadata.
  app.post('/photo/addVideo', async (c: Context) => {
    const clientIp = getClientIp(c);
    const rateLimit = await uploadRateLimiter.consume(clientIp);
    if (!rateLimit.allowed) {
      c.header('Retry-After', String(Math.ceil(rateLimit.resetMs / 1000)));
      return c.json(result.fail('Upload rate limit exceeded. Please try again later.', 429), 429);
    }

    const body = await c.req.json<PhotoAddVideoBo>();
    const data = await photoService.addVideo(body, getUserId());
    return c.json(result.ok(data));
  });

  // Register a photo uploaded via direct presigned URLs with derivatives and metadata.
  app.post('/photo/addDirect', async (c: Context) => {
    const clientIp = getClientIp(c);
    const rateLimit = await uploadRateLimiter.consume(clientIp);
    if (!rateLimit.allowed) {
      c.header('Retry-After', String(Math.ceil(rateLimit.resetMs / 1000)));
      return c.json(result.fail('Upload rate limit exceeded. Please try again later.', 429), 429);
    }

    const body = await c.req.json<PhotoAddDirectBo>();
    const data = await photoService.addDirect(body, getUserId());
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
    const userId = getUserId();
    await photoService.clear(userId);
    logSecurityAudit({
      action: 'RECYCLE_BIN_CLEAR',
      userId,
      clientIp: getClientIp(c),
    });
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
