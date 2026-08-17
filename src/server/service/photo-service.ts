import { and, asc, count, desc, eq, getTableColumns, gt, gte, inArray, isNotNull, lt, lte, or, sql } from 'drizzle-orm';
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
  type PhotoRandomIdListBo,
  type PhotoRecycleBo,
  type PhotoRestoreBo,
  type PhotoSetAllowDownloadBo,
  type PhotoTakenDateListBo,
} from '@/server/entity/bo/photo';
import { PHOTO_LIST_PAGE_SIZE } from '@/server/const/global';
import { PhotoFavoriteEnum, PhotoStatusEnum } from '@/server/enums/photo-enum';
import { StorageStatusEnum, StorageTypeOptions } from '@/server/enums/storage-enum';
import { type PageVo } from '@/server/entity/vo/common';
import { type PhotoAddResultVo, type PhotoDuplicateGroupVo, type PhotoExistsVo, type PhotoTakenDateVo, type PhotoVo } from '@/server/entity/vo/photo';
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
import { commentService } from '@/server/service/comment-service';
import { FileTypeEnum } from '@/server/enums/file-enum';

// This module handles business related to photo data query。

const photoService = {

  // Query photos by page (publicly for guests or user-specific for logged-in admin).
  async list(params: PhotoListBo, userId?: string): Promise<PageVo<PhotoVo>> {

    const size = params.size && params.size > 0 ? params.size : PHOTO_LIST_PAGE_SIZE;
    const status = params.status ?? PhotoStatusEnum.NORMAL;

    // Determine target sort column
    let orderColumn: any = photoTab.takenTime;
    if (params.sortBy === 'createTime') {
      orderColumn = photoTab.createTime;
    } else if (params.sortBy === 'size') {
      orderColumn = photoTab.size;
    } else if (params.sortBy === 'name') {
      orderColumn = photoTab.name;
    } else if (status === PhotoStatusEnum.DELETE) {
      orderColumn = photoTab.recycleTime;
    }

    // Determine sort direction (asc / desc)
    const isAsc = params.sortOrder === 'asc';
    const sortFn = isAsc ? asc : desc;
    const compFn = isAsc ? gt : lt;

    const baseWhereList = [
      eq(photoTab.status, status)
    ];

    if (params.favorite) {
      baseWhereList.push(eq(photoTab.favorite, params.favorite));
    }

    if (params.startTakenTime) {
      baseWhereList.push(gte(photoTab.takenTime, params.startTakenTime));
    }

    if (params.endTakenTime) {
      baseWhereList.push(lte(photoTab.takenTime, params.endTakenTime));
    }

    const whereList = [...baseWhereList];

    // When specific photoIds are provided, skip cursor/time filters and use IN clause instead
    if (params.photoIds && params.photoIds.length > 0) {
      whereList.push(inArray(photoTab.photoId, params.photoIds));
    } else if (params.cursorPhotoId && params.cursorTime !== undefined && params.cursorTime !== null) {
      const cursorVal = params.sortBy === 'size' ? Number(params.cursorTime) : params.cursorTime;
      const cursorWhere = or(
        compFn(orderColumn, cursorVal as any),
        and(
          eq(orderColumn, cursorVal as any),
          compFn(photoTab.photoId, params.cursorPhotoId)
        )
      );

      if (cursorWhere) {
        whereList.push(cursorWhere);
      }
    }

    const list = params.albumId
      ? await orm
        .select({
          ...getTableColumns(photoTab),
          isPinned: albumPhotoTab.isPinned,
          pinnedAt: albumPhotoTab.pinnedAt,
        })
        .from(photoTab)
        .innerJoin(albumPhotoTab, eq(photoTab.photoId, albumPhotoTab.photoId))
        .where(and(
          ...whereList,
          eq(albumPhotoTab.albumId, params.albumId)
        ))
        .orderBy(
          desc(albumPhotoTab.isPinned),
          desc(albumPhotoTab.pinnedAt),
          params.photoIds?.length
            ? sql`CASE ${photoTab.photoId} ${params.photoIds.map((id, i) => sql`WHEN ${id} THEN ${i}`).reduce((a, b) => sql`${a} ${b}`)} END`
            : (params.shuffle && !params.sortBy && !params.cursorPhotoId ? sql`RANDOM()` : sortFn(orderColumn)),
          sortFn(photoTab.photoId)
        )
        .limit(size)
      : await orm
        .select()
        .from(photoTab)
        .where(and(...whereList))
        .orderBy(
          params.photoIds?.length
            ? sql`CASE ${photoTab.photoId} ${params.photoIds.map((id, i) => sql`WHEN ${id} THEN ${i}`).reduce((a, b) => sql`${a} ${b}`)} END`
            : (params.shuffle && !params.sortBy && !params.cursorPhotoId ? sql`RANDOM()` : sortFn(orderColumn)),
          sortFn(photoTab.photoId)
        )
        .limit(size);

    const fileStorageList = await storageService.getStorageList();
    const photoIds = list.map((photo: any) => photo.photoId);
    const [exifMap, fileMap, albumMap] = await Promise.all([
      exifService.listByPhotoIds(photoIds),
      fileService.listByPhotoIds(photoIds),
      albumService.listAlbumMapByPhotoIds(photoIds),
    ]);

    const result = list.map((photo: any) => {
      const fileStorage = fileStorageList.find((item: any) => item.storageId === photo.storageId);
      const domain = formatHttpUrl(fileStorage?.domain);

      return this.toPhotoVo(
        photo,
        fileMap.get(photo.photoId) ?? [],
        fileStorage,
        domain,
        exifMap.get(photo.photoId) ?? null,
        userId,
        albumMap.get(photo.photoId) ?? [],
        Boolean(photo.isPinned === 1)
      );
    });

    const [totalRow] = params.albumId
      ? await orm
        .select({ total: count() })
        .from(photoTab)
        .innerJoin(albumPhotoTab, eq(photoTab.photoId, albumPhotoTab.photoId))
        .where(and(...baseWhereList, eq(albumPhotoTab.albumId, params.albumId)))
      : await orm
        .select({ total: count() })
        .from(photoTab)
        .where(and(...baseWhereList));

    const totalCount = Number(totalRow?.total ?? 0);

    return {
      list: result,
      total: totalCount
    };
  },

  // Return all photo IDs in random order for client-side random pagination.
  async randomIdList(params: PhotoRandomIdListBo, userId?: string): Promise<string[]> {
    const status = params.status ?? PhotoStatusEnum.NORMAL;

    const whereList = [
      eq(photoTab.status, status)
    ];

    if (params.favorite) {
      whereList.push(eq(photoTab.favorite, params.favorite));
    }

    if (params.startTakenTime) {
      whereList.push(gte(photoTab.takenTime, params.startTakenTime));
    }

    if (params.endTakenTime) {
      whereList.push(lte(photoTab.takenTime, params.endTakenTime));
    }

    const rows = params.albumId
      ? await orm
        .select({ photoId: photoTab.photoId })
        .from(photoTab)
        .innerJoin(albumPhotoTab, eq(photoTab.photoId, albumPhotoTab.photoId))
        .where(and(...whereList, eq(albumPhotoTab.albumId, params.albumId)))
        .orderBy(
          desc(albumPhotoTab.isPinned),
          desc(albumPhotoTab.pinnedAt),
          sql`RANDOM()`
        )
      : await orm
        .select({ photoId: photoTab.photoId })
        .from(photoTab)
        .where(and(...whereList))
        .orderBy(sql`RANDOM()`);

    return rows.map((row: any) => row.photoId);
  },

  // Statistics by day of photos that have shooting time (publicly for guests or user-specific for logged-in admin).
  async takenDateList(params: PhotoTakenDateListBo, userId?: string): Promise<PhotoTakenDateVo[]> {

    const whereList = [
      eq(photoTab.status, PhotoStatusEnum.NORMAL),
      isNotNull(photoTab.takenTime),
    ];

    if (params.favorite) {
      whereList.push(eq(photoTab.favorite, params.favorite));
    }

    // Group by calendar day (YYYY-MM-DD) from takenTime ISO timestamp string.
    const takenDate = sql<string>`substr(${photoTab.takenTime}, 1, 10)`;
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

  // According to the deduplication settings, SHA-1, visual thumbHash, and dimensions, determine whether duplicate photo exists.
  async exists(params: PhotoExistsBo, userId?: string): Promise<PhotoExistsVo> {
    const checksum = params.checksum?.trim();
    const name = params.name?.trim();
    const size = params.size;
    const width = params.width;
    const height = params.height;
    const thumbHash = params.thumbHash?.trim();

    if (!checksum && !name && !thumbHash) {
      return { duplicate: false };
    }

    const setting = await settingService.get();

    if (setting.photoDedup !== SettingPhotoDedupEnum.ENABLE) {
      return { duplicate: false };
    }

    const baseConditions = [
      eq(photoTab.status, PhotoStatusEnum.NORMAL),
    ];
    if (userId) {
      baseConditions.push(eq(photoTab.userId, userId));
    }

    const matchOrList: any[] = [];
    if (checksum) {
      matchOrList.push(eq(photoTab.checksum, checksum));
    }
    if (thumbHash) {
      matchOrList.push(eq(photoTab.thumbHash, thumbHash));
    }
    if (width && height && size) {
      matchOrList.push(
        and(
          eq(photoTab.width, width),
          eq(photoTab.height, height),
          gte(photoTab.size, Math.floor(size * 0.95)),
          lte(photoTab.size, Math.ceil(size * 1.05))
        )
      );
    }

    if (matchOrList.length > 0) {
      const [duplicatePhoto] = await orm
        .select({ photoId: photoTab.photoId })
        .from(photoTab)
        .where(and(...baseConditions, or(...matchOrList)!))
        .limit(1);

      if (duplicatePhoto) {
        return { duplicate: true, photoId: duplicatePhoto.photoId };
      }
    }

    // Normalized name + dimension or size matching fallback
    if (name) {
      const cleanName = name.toLowerCase().trim().replace(/\.[^/.]+$/, '').replace(/[\s_–-]+(copy|salinan|\d+)/gi, '').replace(/\(\d+\)/g, '').replace(/[^a-z0-9]/g, '');
      if (cleanName.length >= 3) {
        const candidates = await orm
          .select({ photoId: photoTab.photoId, name: photoTab.name, size: photoTab.size, width: photoTab.width, height: photoTab.height })
          .from(photoTab)
          .where(and(...baseConditions))
          .limit(100);

        const matched = candidates.find((c) => {
          const cClean = c.name.toLowerCase().trim().replace(/\.[^/.]+$/, '').replace(/[\s_–-]+(copy|salinan|\d+)/gi, '').replace(/\(\d+\)/g, '').replace(/[^a-z0-9]/g, '');
          if (cClean !== cleanName) return false;
          if (width && height && c.width === width && c.height === height) return true;
          if (size && c.size && Math.abs(c.size - size) <= Math.max(1024, size * 0.08)) return true;
          return false;
        });

        if (matched) {
          return { duplicate: true, photoId: matched.photoId };
        }
      }
    }

    return { duplicate: false };
  },

  // Upload a single photo, Backend generation preview, thumbnail and meta information.
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

    const fileStorageList = await storageService.getStorageList();
    const activeStorage = fileStorageList.find((item: any) => item.status === StorageStatusEnum.NORMAL);
    const targetStorageId = storageId || activeStorage?.storageId;

    if (!targetStorageId) {
      throw new BizError('storage.configRequired');
    }

    const fileStorage = fileStorageList.find((item: any) => item.storageId === targetStorageId);

    if (!fileStorage) {
      throw new BizError('storage.notFound');
    }

    // Assign final targetStorageId
    const activeStorageId = targetStorageId;

    const { buffer, name, size, type } = await this.readPhotoUpload(file);
    const checksum = await fileChecksum(new Blob([new Uint8Array(buffer)]));
    const images = await processPhotoImages(buffer);

    // Multi-Tiered Smart Deduplication Check (Checksum, Visual ThumbHash, Resolution & Size, Normalized Filename)
    const existingCheck = await this.exists({
      checksum,
      name,
      size,
      width: images.width,
      height: images.height,
      thumbHash: images.thumbHash,
    }, userId);

    if (existingCheck.duplicate && existingCheck.photoId) {
      if (albumId) {
        await albumService.addPhoto({ albumIds: [albumId], photoIds: [existingCheck.photoId] }, userId);
      }
      const existingPhotoVo = await this.getById(existingCheck.photoId, userId);
      return { photo: existingPhotoVo, duplicate: true };
    }

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
    ], activeStorageId);

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
      storageId: activeStorageId,
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

  // Move the specified photos of the current user to the trash, And record the recycling time.
  async recycle(params: PhotoRecycleBo, userId?: string): Promise<void> {
    if (!params.photoIds?.length) {
      throw new BizError('photo.selectRequired');
    }

    const whereList = [inArray(photoTab.photoId, params.photoIds)];
    if (userId) {
      whereList.push(eq(photoTab.userId, userId));
    }

    await orm.update(photoTab)
      .set({
        status: PhotoStatusEnum.DELETE,
        recycleTime: new Date().toISOString()
      })
      .where(and(...whereList));
  },

  // Move all photos of the specified user to the trash, And record the recycling time.
  async recycleByUserId(userId: string): Promise<void> {
    const whereList = [];
    if (userId) {
      whereList.push(eq(photoTab.userId, userId));
    }

    await orm.update(photoTab)
      .set({
        status: PhotoStatusEnum.DELETE,
        recycleTime: new Date(0).toISOString()
      })
      .where(whereList.length ? and(...whereList) : undefined);
  },

  // Set the collection status of photos specified by the current user.
  async favorite(params: PhotoFavoriteBo, userId?: string): Promise<void> {
    if (!params.photoIds?.length) {
      throw new BizError('photo.selectRequired');
    }

    if (!params.favorite) {
      throw new BizError('photo.favoriteRequired');
    }

    const whereList = [inArray(photoTab.photoId, params.photoIds)];
    if (userId) {
      whereList.push(eq(photoTab.userId, userId));
    }

    await orm.update(photoTab)
      .set({
        favorite: params.favorite
      })
      .where(and(...whereList));
  },

  // Restore the specified photos in the current user's recycle bin.
  async restore(params: PhotoRestoreBo, userId?: string): Promise<void> {
    if (!params.photoIds?.length) {
      throw new BizError('photo.selectRequired');
    }

    const whereList = [inArray(photoTab.photoId, params.photoIds)];
    if (userId) {
      whereList.push(eq(photoTab.userId, userId));
    }

    await orm.update(photoTab)
      .set({
        status: PhotoStatusEnum.NORMAL,
        recycleTime: null
      })
      .where(and(...whereList));
  },

  // Completely delete the specified photo files and database records of the current user.
  async delete(params: PhotoDeleteBo, userId?: string): Promise<void> {
    if (!params.photoIds?.length) {
      throw new BizError('photo.selectRequired');
    }

    const fileStorageList = await storageService.list();

    const selectWhere = [inArray(photoTab.photoId, params.photoIds)];
    if (userId) {
      selectWhere.push(eq(photoTab.userId, userId));
    }

    const photos = await orm
      .select()
      .from(photoTab)
      .where(and(...selectWhere));
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
    await commentService.deleteByPhotoIds(photoIds);

    await orm.delete(photoTab)
      .where(inArray(photoTab.photoId, photoIds));
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
      await commentService.deleteByPhotoIds(photoIds);

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
    const [exifRow, files, albumMap] = await Promise.all([
      exifService.getByPhotoId(photoId),
      fileService.listByPhotoId(photoId),
      albumService.listAlbumMapByPhotoIds([photoId]),
    ]);

    return this.toPhotoVo(photo, files, fileStorage, domain, exifRow, currentUserId, albumMap.get(photoId) ?? []);
  },

  // Batch update photo download protection status.
  async setAllowDownload(params: PhotoSetAllowDownloadBo, userId?: string): Promise<void> {
    if (!params.photoIds || !params.photoIds.length) {
      return;
    }

    const whereList = [inArray(photoTab.photoId, params.photoIds)];
    if (userId) {
      whereList.push(eq(photoTab.userId, userId));
    }

    await orm
      .update(photoTab)
      .set({ allowDownload: params.allowDownload ? 1 : 0 })
      .where(and(...whereList));
  },

  // Get the specified type of storage from the file list key.
  getFileKey(files: PhotoFile[], type: number): string | null {
    return files.find((file: any) => file.type === type)?.key ?? null;
  },

  // Store information and files key Merge into photo return object.
  toPhotoVo(
    photo: Photo,
    files: PhotoFile[],
    fileStorage?: Storage,
    domain?: string,
    exifRow: Exif | null = null,
    currentUserId?: string,
    albums?: { albumId: string; name: string }[],
    isPinned?: boolean
  ): PhotoVo {
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
        : null,
      albums: albums ?? [],
      isPinned: isPinned ?? Boolean((photo as any).isPinned === 1 || (photo as any).isPinned === true),
    };
  },

  // Read photos from uploaded files buffer and name, size, type.
  async readPhotoUpload(file: File): Promise<{ buffer: Buffer; name: string; size: number; type: string }> {
    // Enforce file size limit to prevent DoS via oversized uploads (MED-02)
    const MAX_FILE_SIZE = 200 * 1024 * 1024; // 200MB
    if (file.size > MAX_FILE_SIZE) {
      throw new BizError('photo.fileTooLarge');
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    // Allowed MIME types (server-side allowlist — do not trust client Content-Type)
    const ALLOWED_MIME_TYPES = new Set([
      'image/jpeg', 'image/jpg', 'image/png', 'image/gif',
      'image/webp', 'image/avif', 'image/heic', 'image/heif',
      'image/tiff', 'image/bmp',
    ]);

    // Magic byte signatures for supported image types (CRIT-02)
    const MAGIC_SIGNATURES: [number[], string][] = [
      [[0xFF, 0xD8], 'image/jpeg'],
      [[0x89, 0x50, 0x4E, 0x47], 'image/png'],
      [[0x47, 0x49, 0x46], 'image/gif'],
      [[0x52, 0x49, 0x46, 0x46], 'image/webp'], // RIFF....WEBP
      [[0x00, 0x00, 0x00], 'image/heic'],         // ftyp box (loose check)
      [[0x49, 0x49, 0x2A, 0x00], 'image/tiff'],   // TIFF little-endian
      [[0x4D, 0x4D, 0x00, 0x2A], 'image/tiff'],   // TIFF big-endian
      [[0x42, 0x4D], 'image/bmp'],
    ];

    // Detect MIME type from magic bytes
    let detectedMime = MAGIC_SIGNATURES.find(([sig]) =>
      sig.every((byte, i) => buffer[i] === byte)
    )?.[1] ?? null;

    // Check for AVIF ftyp header
    if (!detectedMime && buffer.length >= 12 && buffer.toString('ascii', 4, 12).includes('ftyp')) {
      detectedMime = 'image/avif';
    }

    // Special check for WebP: must have WEBP marker at offset 8
    const isWebP = detectedMime === 'image/webp' &&
      buffer.length >= 12 &&
      buffer.toString('ascii', 8, 12) === 'WEBP';

    const isValidMagic = detectedMime !== null && (detectedMime !== 'image/webp' || isWebP);

    if (!isValidMagic) {
      throw new BizError('photo.invalidFileType');
    }

    // Also reject if client-declared MIME is not in allowlist (defense in depth)
    const declaredMime = (file.type || '').toLowerCase().split(';')[0].trim();
    if (declaredMime && !ALLOWED_MIME_TYPES.has(declaredMime)) {
      throw new BizError('photo.invalidFileType');
    }

    return {
      buffer,
      name: file.name.trim(),
      size: file.size,
      type: detectedMime || declaredMime || 'application/octet-stream',
    };
  },

  // Auto-detect duplicate photos based on visual similarity (thumbHash), checksum, or dimensions+size (optionally within an album).
  async findDuplicateGroups(userId?: string, albumId?: string): Promise<PhotoDuplicateGroupVo[]> {
    const whereList = [eq(photoTab.status, PhotoStatusEnum.NORMAL)];
    if (userId) {
      whereList.push(eq(photoTab.userId, userId));
    }

    let list: Photo[] = [];
    if (albumId) {
      const rows = await orm
        .select({ photo: photoTab })
        .from(photoTab)
        .innerJoin(albumPhotoTab, eq(photoTab.photoId, albumPhotoTab.photoId))
        .where(and(eq(albumPhotoTab.albumId, albumId), ...whereList))
        .orderBy(desc(photoTab.takenTime), desc(photoTab.photoId));
      list = rows.map((r: any) => r.photo);
    } else {
      list = await orm
        .select()
        .from(photoTab)
        .where(and(...whereList))
        .orderBy(desc(photoTab.takenTime), desc(photoTab.photoId));
    }

    if (!list.length) return [];

    const fileStorageList = await storageService.getStorageList();
    const photoIds = list.map((p: any) => p.photoId);
    const [exifMap, fileMap, albumMap] = await Promise.all([
      exifService.listByPhotoIds(photoIds),
      fileService.listByPhotoIds(photoIds),
      albumService.listAlbumMapByPhotoIds(photoIds),
    ]);

    const photoVoMap = new Map<string, PhotoVo>();
    for (const photo of list) {
      const fileStorage = fileStorageList.find((item: any) => item.storageId === photo.storageId);
      const domain = formatHttpUrl(fileStorage?.domain);
      const vo = this.toPhotoVo(
        photo,
        fileMap.get(photo.photoId) ?? [],
        fileStorage,
        domain,
        exifMap.get(photo.photoId) ?? null,
        userId,
        albumMap.get(photo.photoId) ?? []
      );
      photoVoMap.set(photo.photoId, vo);
    }

    // Initialize Disjoint-Set Union (DSU) for multi-criteria grouping
    const parentMap = new Map<string, string>();
    function find(id: string): string {
      if (!parentMap.has(id)) parentMap.set(id, id);
      if (parentMap.get(id) !== id) {
        parentMap.set(id, find(parentMap.get(id)!));
      }
      return parentMap.get(id)!;
    }

    function union(id1: string, id2: string) {
      const root1 = find(id1);
      const root2 = find(id2);
      if (root1 !== root2) {
        parentMap.set(root1, root2);
      }
    }

    const matchReasonsMap = new Map<string, Set<string>>();
    function addReason(photoId: string, reason: string) {
      const set = matchReasonsMap.get(photoId) ?? new Set<string>();
      set.add(reason);
      matchReasonsMap.set(photoId, set);
    }

    // 1. Group by Checksum
    const checksumMap = new Map<string, string[]>();
    // 2. Group by ThumbHash
    const thumbHashMap = new Map<string, string[]>();
    // 3. Group by Dimensions + Size (width x height x size)
    const dimSizeMap = new Map<string, string[]>();
    // 4. Group by Normalized Name + Dimensions (width x height)
    const nameDimMap = new Map<string, string[]>();
    // 5. Group by Normalized Name + Approximate Size (tolerance 5%)
    const nameApproxSizeMap = new Map<string, string[]>();
    // 6. Group by EXIF Taken Time + Dimensions
    const takenTimeDimMap = new Map<string, string[]>();

    for (const p of list) {
      find(p.photoId); // Register node in DSU

      if (p.checksum) {
        const arr = checksumMap.get(p.checksum) ?? [];
        arr.push(p.photoId);
        checksumMap.set(p.checksum, arr);
      }

      if (p.thumbHash) {
        const arr = thumbHashMap.get(p.thumbHash) ?? [];
        arr.push(p.photoId);
        thumbHashMap.set(p.thumbHash, arr);
      }

      if (p.width && p.height && p.size) {
        const dimKey = `${p.width}x${p.height}:${p.size}`;
        const arr = dimSizeMap.get(dimKey) ?? [];
        arr.push(p.photoId);
        dimSizeMap.set(dimKey, arr);
      }

      if (p.name) {
        const cleanName = p.name.toLowerCase().trim().replace(/\.[^/.]+$/, '').replace(/[\s_–-]+(copy|salinan|\d+)/gi, '').replace(/\(\d+\)/g, '').replace(/[^a-z0-9]/g, '');
        if (cleanName.length >= 3) {
          if (p.width && p.height) {
            const key = `${cleanName}:${p.width}x${p.height}`;
            const arr = nameDimMap.get(key) ?? [];
            arr.push(p.photoId);
            nameDimMap.set(key, arr);
          }
          if (p.size) {
            const bucketSize = Math.round(p.size / 10240); // 10KB bucket tolerance
            const key = `${cleanName}:${bucketSize}`;
            const arr = nameApproxSizeMap.get(key) ?? [];
            arr.push(p.photoId);
            nameApproxSizeMap.set(key, arr);
          }
        }
      }

      if (p.takenTime && p.width && p.height) {
        const timeSec = p.takenTime.substring(0, 19); // YYYY-MM-DDTHH:mm:ss
        const key = `${timeSec}:${p.width}x${p.height}`;
        const arr = takenTimeDimMap.get(key) ?? [];
        arr.push(p.photoId);
        takenTimeDimMap.set(key, arr);
      }
    }

    // Perform Union operations
    for (const [, pIds] of checksumMap.entries()) {
      if (pIds.length >= 2) {
        for (let i = 1; i < pIds.length; i++) {
          union(pIds[0], pIds[i]);
          addReason(pIds[i], 'Checksum Identik');
        }
        addReason(pIds[0], 'Checksum Identik');
      }
    }

    for (const [, pIds] of thumbHashMap.entries()) {
      if (pIds.length >= 2) {
        for (let i = 1; i < pIds.length; i++) {
          union(pIds[0], pIds[i]);
          addReason(pIds[i], 'Tampilan Visual Identik');
        }
        addReason(pIds[0], 'Tampilan Visual Identik');
      }
    }

    for (const [, pIds] of dimSizeMap.entries()) {
      if (pIds.length >= 2) {
        for (let i = 1; i < pIds.length; i++) {
          union(pIds[0], pIds[i]);
          addReason(pIds[i], 'Resolusi & Ukuran Sama');
        }
        addReason(pIds[0], 'Resolusi & Ukuran Sama');
      }
    }

    for (const [, pIds] of nameDimMap.entries()) {
      if (pIds.length >= 2) {
        for (let i = 1; i < pIds.length; i++) {
          union(pIds[0], pIds[i]);
          addReason(pIds[i], 'Nama & Resolusi Sama');
        }
        addReason(pIds[0], 'Nama & Resolusi Sama');
      }
    }

    for (const [, pIds] of nameApproxSizeMap.entries()) {
      if (pIds.length >= 2) {
        for (let i = 1; i < pIds.length; i++) {
          union(pIds[0], pIds[i]);
          addReason(pIds[i], 'Nama & Ukuran Mirip');
        }
        addReason(pIds[0], 'Nama & Ukuran Mirip');
      }
    }

    for (const [, pIds] of takenTimeDimMap.entries()) {
      if (pIds.length >= 2) {
        for (let i = 1; i < pIds.length; i++) {
          union(pIds[0], pIds[i]);
          addReason(pIds[i], 'Waktu Foto & Resolusi Sama');
        }
        addReason(pIds[0], 'Waktu Foto & Resolusi Sama');
      }
    }

    // Collect DSU root groups
    const rootGroupsMap = new Map<string, string[]>();
    for (const p of list) {
      const root = find(p.photoId);
      const arr = rootGroupsMap.get(root) ?? [];
      arr.push(p.photoId);
      rootGroupsMap.set(root, arr);
    }

    const resultGroups: PhotoDuplicateGroupVo[] = [];
    let groupCounter = 1;

    for (const [, pIds] of rootGroupsMap.entries()) {
      if (pIds.length >= 2) {
        const photos = pIds
          .map((id) => photoVoMap.get(id))
          .filter((p): p is PhotoVo => Boolean(p));

        if (photos.length >= 2) {
          const reasons = new Set<string>();
          for (const id of pIds) {
            matchReasonsMap.get(id)?.forEach((r) => reasons.add(r));
          }
          const simType: 'checksum' | 'visual' = reasons.has('Checksum Identik') ? 'checksum' : 'visual';

          resultGroups.push({
            groupId: `dup-group-${groupCounter++}`,
            similarityType: simType,
            photos,
          });
        }
      }
    }

    return resultGroups;
  }
}

export { photoService }
