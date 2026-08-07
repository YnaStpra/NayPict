import { and, asc, count, desc, eq, getTableColumns, gte, inArray, isNotNull, lt, lte, or, sql } from 'drizzle-orm';
import { createId } from '@/server/lib/id';
import { type Photo, photoTab } from '@/server/entity/photo';
import { albumPhotoTab } from '@/server/entity/album-photo';
import { orm } from '@/server/infra/db';
import BizError from '@/server/error/biz-error';
import { storage } from '@/server/storage/storage';
import {
  type PhotoDeleteBo,
  type PhotoExistsBo,
  type PhotoFavoriteBo,
  type PhotoListBo,
  type PhotoRecycleBo,
  type PhotoRestoreBo,
  type PhotoSetAllowDownloadBo,
  type PhotoTakenDateListBo,
} from '@/server/entity/bo/photo';
import { PHOTO_LIST_PAGE_SIZE } from '@/server/const/global';
import { PhotoFavoriteEnum, PhotoStatusEnum } from '@/server/enums/photo-enum';
import { StorageTypeOptions } from '@/server/enums/storage-enum';
import { type PageVo } from '@/server/entity/vo/common';
import { type PhotoAddResultVo, type PhotoExistsVo, type PhotoTakenDateVo, type PhotoVo } from '@/server/entity/vo/photo';
import { type Storage } from '@/server/entity/storage';
import { storageService } from '@/server/service/storage-service';
import { buildContentDisposition, formatFileTimestamp, splitFileName } from '@/server/lib/file';
import { albumService } from '@/server/service/album-service';
import { settingService } from '@/server/service/setting-service';
import { SettingPhotoDedupEnum, SettingSyncDeleteEnum } from '@/server/enums/setting-enum';
import { formatHttpUrl, toMediaUrl } from '@/lib/url';
import { fileChecksum } from '@/server/lib/crypto';
import { processPhotoImages } from '@/server/lib/photo-process';
import { readPhotoExifFromBuffer } from '@/server/lib/photo-exif';
import { type Exif } from '@/server/entity/exif';
import { exifService } from '@/server/service/exif-service';
import { buildPhotoKey, buildPreviewKey, buildThumbnailKey } from '@/server/lib/photo-path';
import { type File as PhotoFile, fileTab } from '@/server/entity/file';
import { fileService } from '@/server/service/file-service';
import { FileTypeEnum } from '@/server/enums/file-enum';

// This module handles business related to photo data query。

const photoService = {

  // Query photos by page (publicly for guests or user-specific for logged-in admin).
  async list(params: PhotoListBo, userId?: string): Promise<PageVo<PhotoVo>> {

    const size = params.size && params.size > 0 ? params.size : PHOTO_LIST_PAGE_SIZE;
    const status = params.status ?? PhotoStatusEnum.NORMAL;
    const orderColumn = status === PhotoStatusEnum.DELETE
      ? photoTab.recycleTime
      : photoTab.takenTime;

    const whereList = [
      eq(photoTab.status, status)
    ];

    if (userId) {
      whereList.push(eq(photoTab.userId, userId));
    }

    if (params.favorite) {
      whereList.push(eq(photoTab.favorite, params.favorite));
    }

    if (params.startTakenTime) {
      whereList.push(gte(photoTab.takenTime, params.startTakenTime));
    }

    if (params.endTakenTime) {
      whereList.push(lte(photoTab.takenTime, params.endTakenTime));
    }

    if (params.cursorPhotoId && params.cursorTime) {
      const cursorWhere = or(
        lt(orderColumn, params.cursorTime),
        and(
          eq(orderColumn, params.cursorTime),
          lt(photoTab.photoId, params.cursorPhotoId)
        )
      );

      if (cursorWhere) {
        whereList.push(cursorWhere);
      }
    }

    const list = params.albumId
      ? await orm
        .select(getTableColumns(photoTab))
        .from(photoTab)
        .innerJoin(albumPhotoTab, eq(photoTab.photoId, albumPhotoTab.photoId))
        .where(and(
          ...whereList,
          eq(albumPhotoTab.albumId, params.albumId)
        ))
        .orderBy(desc(orderColumn), desc(photoTab.photoId))
        .limit(size)
      : await orm
        .select()
        .from(photoTab)
        .where(and(...whereList))
        .orderBy(desc(orderColumn), desc(photoTab.photoId))
        .limit(size);

    const fileStorageList = await storageService.getStorageList();
    const photoIds = list.map((photo: any) => photo.photoId);
    const [exifMap, fileMap] = await Promise.all([
      exifService.listByPhotoIds(photoIds),
      fileService.listByPhotoIds(photoIds),
    ]);

    const result = list.map((photo: any) => {
      const fileStorage = fileStorageList.find((item: any) => item.storageId === photo.storageId);
      const domain = formatHttpUrl(fileStorage?.domain);

      return this.toPhotoVo(photo, fileMap.get(photo.photoId) ?? [], fileStorage, domain, exifMap.get(photo.photoId) ?? null, userId);
    });

    return {
      list: result,
      total: result.length
    };
  },

  // Statistics by day of photos that have shooting time (publicly for guests or user-specific for logged-in admin).
  async takenDateList(params: PhotoTakenDateListBo, userId?: string): Promise<PhotoTakenDateVo[]> {

    const whereList = [
      eq(photoTab.status, PhotoStatusEnum.NORMAL),
      isNotNull(photoTab.takenTime),
    ];

    if (userId) {
      whereList.push(eq(photoTab.userId, userId));
    }

    if (params.favorite) {
      whereList.push(eq(photoTab.favorite, params.favorite));
    }

    const tzModifier = params.tzOffset >= 0 ? `+${params.tzOffset} minutes` : `${params.tzOffset} minutes`;
    // Group by calendar day in the time zone passed in from the front end，Consistent with list display and filter boundaries。
    const takenDate = sql<string>`date(${photoTab.takenTime}, ${tzModifier})`;
    const selectColumns = {
      date: takenDate,
      count: count(photoTab.photoId),
    };

    const list = params.albumId
      ? await orm
        .select(selectColumns)
        .from(photoTab)
        .innerJoin(albumPhotoTab, eq(photoTab.photoId, albumPhotoTab.photoId))
        .where(and(
          ...whereList,
          eq(albumPhotoTab.albumId, params.albumId)
        ))
        .groupBy(takenDate)
        .orderBy(asc(takenDate))
      : await orm
        .select(selectColumns)
        .from(photoTab)
        .where(and(...whereList))
        .groupBy(takenDate)
        .orderBy(asc(takenDate));

    return list.map((item: any) => ({
      date: item.date,
      count: Number(item.count),
    }));
  },

  // Generate storage based on original file name key，like key If it already exists, append a timestamp before the extension.。
  async resolvePhotoKey(userId: string, name: string) {

    const trimmedName = name.trim();

    if (!trimmedName) {
      throw new BizError('photo.fileNameRequired');
    }

    let key = buildPhotoKey(userId, trimmedName);
    const [existing] = await orm
      .select({ fileId: fileTab.fileId })
      .from(fileTab)
      .where(eq(fileTab.key, key))
      .limit(1);

    if (existing) {
      const { baseName, extName } = splitFileName(trimmedName);
      key = buildPhotoKey(userId, `${baseName}_${formatFileTimestamp()}${extName}`);
    }

    return key;
  },

  // According to the deduplication settings and SHA-1 Determine whether the current user already has the same file。
  async exists(params: PhotoExistsBo, userId: string): Promise<PhotoExistsVo> {
    const checksum = params.checksum?.trim();
    const name = params.name?.trim();

    if (!checksum || !name) {
      return { duplicate: false };
    }

    const setting = await settingService.get();

    if (setting.photoDedup !== SettingPhotoDedupEnum.ENABLE) {
      return { duplicate: false };
    }

    const [duplicatePhoto] = await orm
      .select({ photoId: photoTab.photoId })
      .from(photoTab)
      .where(and(
        eq(photoTab.userId, userId),
        eq(photoTab.checksum, checksum)
      ))
      .limit(1);

    return { duplicate: Boolean(duplicatePhoto) };
  },

  // Upload a single photo，Backend generation preview、thumbnail and meta information。
  async add(form: FormData, userId: string): Promise<PhotoAddResultVo> {

    const file = form.get('file') as File;
    const storageId = String(form.get('storageId') ?? '');
    const albumId = String(form.get('albumId') ?? '');
    const lastModified = Number(form.get('lastModified') ?? 0);
    const allowDownloadRaw = form.get('allowDownload');
    const allowDownload = allowDownloadRaw === 'true' || allowDownloadRaw === '1';

    if (!file) {
      throw new BizError('photo.selectRequired');
    }

    if (!storageId) {
      throw new BizError('storage.configRequired');
    }

    const fileStorageList = await storageService.getStorageList();
    const fileStorage = fileStorageList.find((item: any) => item.storageId === storageId);

    if (!fileStorage) {
      throw new BizError('storage.notFound');
    }

    const { buffer, name, size, type } = await this.readPhotoUpload(file);
    const checksum = await fileChecksum(new Blob([buffer]));

    if ((await this.exists({ checksum, name }, userId)).duplicate) {
      return { photo: null, duplicate: true };
    }

    const images = await processPhotoImages(buffer);
    const meta = await readPhotoExifFromBuffer(buffer);
    const takenTime = meta.takenTime ?? new Date(lastModified > 0 ? lastModified : Date.now()).toISOString();
    const key = await this.resolvePhotoKey(userId, name);
    const photoId = createId();
    const preview = buildPreviewKey(checksum, photoId);
    const thumbnail = buildThumbnailKey(checksum, photoId);

    const cacheMetadata = [['Cache-Control', 'private, max-age=604800']];
    const keyMetadata = [
      ...cacheMetadata,
      ['Content-Disposition', buildContentDisposition(name)]
    ];

    await storage.put([
      {
        key,
        body: buffer,
        type,
        metadata: keyMetadata,
      },
      {
        key: preview,
        body: images.previewBuffer,
        type: 'image/jpeg',
        metadata: cacheMetadata,
      },
      {
        key: thumbnail,
        body: images.thumbnailBuffer,
        type: 'image/webp',
        metadata: cacheMetadata,
      },
    ], storageId);

    const now = new Date().toISOString();

    const [photo] = await orm.insert(photoTab).values({
      photoId,
      name,
      thumbHash: images.thumbHash,
      checksum,
      type,
      typeDesc: type.split('/').pop() || type,
      size,
      width: images.width,
      height: images.height,
      takenTime,
      createTime: now,
      userId,
      status: PhotoStatusEnum.NORMAL,
      favorite: PhotoFavoriteEnum.NO,
      storageId,
      allowDownload: allowDownload ? 1 : 0
    }).returning();

    const files = await fileService.save([
      { fileId: createId(), photoId, key, type: FileTypeEnum.ORIGINAL, fileType: type, size },
      { fileId: createId(), photoId, key: preview, type: FileTypeEnum.PREVIEW, fileType: 'image/jpeg', size: images.previewBuffer.length },
      { fileId: createId(), photoId, key: thumbnail, type: FileTypeEnum.THUMBNAIL, fileType: 'image/webp', size: images.thumbnailBuffer.length },
    ]);

    await exifService.save(photoId, {
      exif: meta.exif,
      latitude: meta.latitude,
      longitude: meta.longitude,
      altitude: meta.altitude,
    });

    if (albumId) {
      await albumService.addPhoto({
        albumIds: [albumId],
        photoIds: [photo.photoId]
      }, userId);
    }

    const domain = formatHttpUrl(fileStorage.domain);

    return {
      photo: this.toPhotoVo(photo, files, fileStorage, domain, {
        photoId,
        exif: meta.exif,
        latitude: meta.latitude,
        longitude: meta.longitude,
        altitude: meta.altitude,
      }),
      duplicate: false,
    };
  },

  // Move the specified photos of the current user to the trash，And record the recycling time。
  async recycle(params: PhotoRecycleBo, userId: string): Promise<void> {
    if (!params.photoIds?.length) {
      throw new BizError('photo.selectRequired');
    }

    await orm.update(photoTab)
      .set({
        status: PhotoStatusEnum.DELETE,
        recycleTime: new Date().toISOString()
      })
      .where(and(
        eq(photoTab.userId, userId),
        inArray(photoTab.photoId, params.photoIds)
      ));
  },

  // Move all photos of the specified user to the trash，And record the recycling time。
  async recycleByUserId(userId: string): Promise<void> {

    await orm.update(photoTab)
      .set({
        status: PhotoStatusEnum.DELETE,
        recycleTime: new Date(0).toISOString()
      })
      .where(eq(photoTab.userId, userId));
  },

  // Set the collection status of photos specified by the current user。
  async favorite(params: PhotoFavoriteBo, userId: string): Promise<void> {
    if (!params.photoIds?.length) {
      throw new BizError('photo.selectRequired');
    }

    if (!params.favorite) {
      throw new BizError('photo.favoriteRequired');
    }

    await orm.update(photoTab)
      .set({
        favorite: params.favorite
      })
      .where(and(
        eq(photoTab.userId, userId),
        inArray(photoTab.photoId, params.photoIds)
      ));
  },

  // Restore the specified photos in the current user's recycle bin。
  async restore(params: PhotoRestoreBo, userId: string): Promise<void> {
    if (!params.photoIds?.length) {
      throw new BizError('photo.selectRequired');
    }

    await orm.update(photoTab)
      .set({
        status: PhotoStatusEnum.NORMAL,
        recycleTime: null
      })
      .where(and(
        eq(photoTab.userId, userId),
        inArray(photoTab.photoId, params.photoIds)
      ));
  },

  // Completely delete the specified photo files and database records of the current user。
  async delete(params: PhotoDeleteBo, userId: string): Promise<void> {
    if (!params.photoIds?.length) {
      throw new BizError('photo.selectRequired');
    }

    const fileStorageList = await storageService.list();

    const photos = await orm
      .select()
      .from(photoTab)
      .where(and(
        eq(photoTab.userId, userId),
        inArray(photoTab.photoId, params.photoIds)
      ));
    const photoIds = photos.map((photo: any) => photo.photoId);

    if (!photoIds.length) {
      return;
    }

    const fileMap = await fileService.listByPhotoIds(photoIds);

    for (const fileStorage of fileStorageList.list as any[]) {
      const keys = photos
        .filter((photo: any) => photo.storageId === fileStorage.storageId)
        .flatMap((photo: any) => (fileMap.get(photo.photoId) ?? []).map((item: any) => item.key));

      await storage.delete(keys, fileStorage.storageId);
    }

    await orm.delete(albumPhotoTab)
      .where(inArray(albumPhotoTab.photoId, photoIds));

    await fileService.deleteByPhotoIds(photoIds);

    await orm.delete(photoTab)
      .where(and(
        eq(photoTab.userId, userId),
        inArray(photoTab.photoId, photoIds)
      ));
  },

  // Clean the photo files and database records in the current user's Recycle Bin。
  async clear(userId: string): Promise<void> {

    const setting = await settingService.get();
    const syncDelete = setting.syncDelete === SettingSyncDeleteEnum.ENABLE;
    const now = new Date().toISOString();

    await this.clearDeletedPhotos({
      userId,
      recycleTime: now,
      syncDelete
    });
  },

  // Regularly clean up photo files and database records in the Recycle Bin that exceed the set retention days。
  async clearExpired(): Promise<void> {

    const setting = await settingService.get();

    const syncDelete = setting.syncDelete === SettingSyncDeleteEnum.ENABLE;
    const expireTime = new Date(Date.now() - setting.clearLast * 24 * 60 * 60 * 1000).toISOString();

    await this.clearDeletedPhotos({
      recycleTime: expireTime,
      syncDelete
    });
  },

  // Cycle through the recycle bin photo files and database records by the passed in value。
  async clearDeletedPhotos(params: { userId?: string, recycleTime: string, syncDelete: boolean }): Promise<void> {
    const fileStorageList = params.syncDelete ? await storageService.list() : null;

    while (true) {
      const whereList = [
        lte(photoTab.recycleTime, params.recycleTime),
        eq(photoTab.status, PhotoStatusEnum.DELETE)
      ];

      if (params.userId) {
        whereList.push(eq(photoTab.userId, params.userId));
      }

      // Only take each time 100 strip，Avoid clearing too many photos at once resulting in large storage deletion requests。
      const photos = await orm
        .select()
        .from(photoTab)
        .where(and(...whereList))
        .limit(100);

      if (!photos.length) {
        return;
      }

      const photoIds = photos.map((photo: any) => photo.photoId);
      const fileMap = await fileService.listByPhotoIds(photoIds);

      if (fileStorageList) {
        for (const fileStorage of fileStorageList.list as any[]) {

          const keys = photos
            .filter((photo: any) => photo.storageId === fileStorage.storageId)
            .flatMap((photo: any) => (fileMap.get(photo.photoId) ?? []).map((item: any) => item.key));
          await storage.delete(keys, fileStorage.storageId);

        }
      }

      await orm.delete(albumPhotoTab)
        .where(inArray(albumPhotoTab.photoId, photoIds));

      await fileService.deleteByPhotoIds(photoIds);

      await orm.delete(photoTab)
        .where(and(
          ...whereList,
          inArray(photoTab.photoId, photoIds)
        ));
    }
  },

  // Query single photo by ID.
  async getById(photoId: string, currentUserId?: string): Promise<PhotoVo | null> {
    const [photo] = await orm
      .select()
      .from(photoTab)
      .where(eq(photoTab.photoId, photoId))
      .limit(1);

    if (!photo) {
      return null;
    }

    const fileStorageList = await storageService.getStorageList();
    const fileStorage = fileStorageList.find((item: any) => item.storageId === photo.storageId);
    const domain = formatHttpUrl(fileStorage?.domain);
    const [exifRow, files] = await Promise.all([
      exifService.getByPhotoId(photoId),
      fileService.listByPhotoId(photoId),
    ]);

    return this.toPhotoVo(photo, files, fileStorage, domain, exifRow, currentUserId);
  },

  // Batch update photo download protection status.
  async setAllowDownload(params: PhotoSetAllowDownloadBo, userId: string): Promise<void> {
    if (!params.photoIds || !params.photoIds.length) {
      return;
    }

    await orm
      .update(photoTab)
      .set({ allowDownload: params.allowDownload ? 1 : 0 })
      .where(and(
        inArray(photoTab.photoId, params.photoIds),
        eq(photoTab.userId, userId)
      ));
  },

  // Get the specified type of storage from the file list key.
  getFileKey(files: PhotoFile[], type: number): string | null {
    return files.find((file: any) => file.type === type)?.key ?? null;
  },

  // Store information and files key Merge into photo return object.
  toPhotoVo(photo: Photo, files: PhotoFile[], fileStorage?: Storage, domain?: string, exifRow: Exif | null = null, currentUserId?: string): PhotoVo {
    const rawKey = this.getFileKey(files, FileTypeEnum.ORIGINAL) ?? '';
    const preview = this.getFileKey(files, FileTypeEnum.PREVIEW) ?? '';
    const thumbnail = this.getFileKey(files, FileTypeEnum.THUMBNAIL) ?? '';

    // If allowDownload === 0 (Protected) and requester is not authenticated Admin (currentUserId is empty/falsy),
    // mask key as null so the original file URL is NEVER leaked to public clients.
    const isAllowed = photo.allowDownload === 1 || Boolean(currentUserId);
    const key = isAllowed && rawKey ? toMediaUrl(rawKey, domain) : null;

    return {
      ...photo,
      exif: exifRow?.exif ?? null,
      latitude: exifRow?.latitude ?? null,
      longitude: exifRow?.longitude ?? null,
      altitude: exifRow?.altitude ?? null,
      key,
      preview: toMediaUrl(preview, domain) ?? '',
      thumbnail: toMediaUrl(thumbnail, domain) ?? '',
      storageName: fileStorage?.name ?? null,
      storageTypeDesc: fileStorage
        ? StorageTypeOptions.find((item: any) => item.value === fileStorage.type)?.label ?? null
        : null
    };
  },

  // Read photos from uploaded files buffer and name、size、type。
  async readPhotoUpload(file: File): Promise<{ buffer: Buffer; name: string; size: number; type: string }> {
    return {
      buffer: Buffer.from(await file.arrayBuffer()),
      name: file.name.trim(),
      size: file.size,
      type: file.type || 'application/octet-stream',
    };
  }
}

export { photoService }
