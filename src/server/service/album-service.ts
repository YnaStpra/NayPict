import { and, count, desc, eq, inArray, max } from 'drizzle-orm';
import { createId } from '@/server/lib/id';
import { type Album, albumTab } from '@/server/entity/album';
import { albumPhotoTab } from '@/server/entity/album-photo';
import { photoTab } from '@/server/entity/photo';
import { orm } from '@/server/infra/db';
import BizError from '@/server/error/biz-error';
import { type AlbumAddBo, type AlbumAddPhotoBo, type AlbumDeleteBo, type AlbumRemovePhotoBo, type AlbumSetCoverBo, type AlbumSetNameBo, type AlbumSetTopBo } from '@/server/entity/bo/album';
import { PhotoFavoriteEnum, PhotoStatusEnum } from '@/server/enums/photo-enum';
import { type AlbumVo } from '@/server/entity/vo/album';
import { storageService } from '@/server/service/storage-service';
import { formatHttpUrl, toMediaUrl } from '@/lib/url';
import { fileService } from '@/server/service/file-service';
import { FileTypeEnum } from '@/server/enums/file-enum';
import { type File } from '@/server/entity/file';

// Calculate cover score for a photo based on metadata.
function calculateAlbumCoverScore(photo: {
  width: number | null;
  height: number | null;
  size: number;
  favorite?: number | null;
  thumbHash?: string | null;
}): number {
  let score = 0;
  const width = photo.width ?? 0;
  const height = photo.height ?? 0;

  // 1. Orientation score (Landscape preference)
  if (width > 0 && height > 0) {
    if (width > height) {
      score += 30; // Landscape preferred!
    } else if (width === height) {
      score += 15; // Square
    } else {
      score += 5;  // Portrait
    }

    // 2. Aspect Ratio score (16:9, 3:2, 4:3 preferred)
    const ratio = width / height;
    if (ratio >= 1.3 && ratio <= 1.8) {
      score += 20; // Ideal aspect ratio for cover!
    } else if (ratio >= 1.2 && ratio <= 2.0) {
      score += 10;
    }

    // 3. Resolution & Dimensions score
    const pixels = width * height;
    if (pixels >= 8_000_000) {
      score += 20;
    } else if (pixels >= 2_000_000) {
      score += 10;
    }

    if (width >= 1920 || height >= 1080) {
      score += 15;
    }
  }

  // 4. Favorite bonus
  if (photo.favorite === PhotoFavoriteEnum.YES) {
    score += 15;
  }

  // 5. Valid thumbnail hash
  if (photo.thumbHash) {
    score += 5;
  }

  return score;
}

const albumService = {

  // Query the list of photo albums with automatic cover resolution.
  async list(userId?: string): Promise<AlbumVo[]> {

    const albumList = await orm
      .select()
      .from(albumTab)
      .orderBy(desc(albumTab.sort));

    if (!albumList.length) {
      return [];
    }

    const fileStorageList = await storageService.list();

    const wherePhotoList = [
      eq(photoTab.status, PhotoStatusEnum.NORMAL)
    ];
    if (userId) {
      wherePhotoList.push(eq(photoTab.userId, userId));
    }

    const allAlbumPhotos = await orm
      .select({
        albumId: albumPhotoTab.albumId,
        photoId: photoTab.photoId,
        name: photoTab.name,
        width: photoTab.width,
        height: photoTab.height,
        size: photoTab.size,
        favorite: photoTab.favorite,
        thumbHash: photoTab.thumbHash,
        storageId: photoTab.storageId,
        takenTime: photoTab.takenTime
      })
      .from(albumPhotoTab)
      .innerJoin(photoTab, eq(albumPhotoTab.photoId, photoTab.photoId))
      .where(and(...wherePhotoList));

    const photosByAlbum = new Map<string, typeof allAlbumPhotos>();
    for (const row of allAlbumPhotos) {
      const existing = photosByAlbum.get(row.albumId) ?? [];
      existing.push(row);
      photosByAlbum.set(row.albumId, existing);
    }

    const referencedPhotoIds = Array.from(new Set(allAlbumPhotos.map((p) => p.photoId)));
    const fileMap = referencedPhotoIds.length
      ? await fileService.listByPhotoIds(referencedPhotoIds)
      : new Map<string, File[]>();

    const list = albumList.map((album) => {
      const albumPhotos = photosByAlbum.get(album.albumId) ?? [];

      let suggestedCoverPhoto: (typeof albumPhotos)[0] | null = null;
      if (albumPhotos.length) {
        const sorted = albumPhotos.slice().sort((a, b) => calculateAlbumCoverScore(b) - calculateAlbumCoverScore(a));
        suggestedCoverPhoto = sorted[0] ?? null;
      }

      let selectedCoverPhoto: (typeof albumPhotos)[0] | null = null;
      if (album.isManualCover === 1 && album.coverPhotoId) {
        selectedCoverPhoto = albumPhotos.find((p) => p.photoId === album.coverPhotoId) ?? suggestedCoverPhoto;
      } else {
        selectedCoverPhoto = suggestedCoverPhoto;
      }

      const fileStorage = fileStorageList.list.find((item: any) => item.storageId === selectedCoverPhoto?.storageId);
      const domain = formatHttpUrl(fileStorage?.domain);

      let thumbnail: string | null = null;
      if (selectedCoverPhoto?.photoId) {
        const file = (fileMap.get(selectedCoverPhoto.photoId) ?? []).find((item: any) => item.type === FileTypeEnum.THUMBNAIL);
        thumbnail = file?.key ?? null;
      }

      return {
        ...album,
        thumbnail: thumbnail ? toMediaUrl(thumbnail, domain) : null,
        thumbHash: selectedCoverPhoto?.thumbHash ?? null,
        photoTotal: albumPhotos.length,
        coverPhotoId: selectedCoverPhoto?.photoId ?? null,
        suggestedCoverPhotoId: suggestedCoverPhoto?.photoId ?? null,
        isManualCover: album.isManualCover === 1
      };
    });

    return list;
  },

  // Add the current user's photo album.
  async add(params: AlbumAddBo, userId: string): Promise<Album> {

    const name = params.name?.trim();

    if (!name) {
      throw new BizError('album.nameRequired');
    }

    const [existsAlbum] = await orm
      .select()
      .from(albumTab)
      .where(and(
        eq(albumTab.userId, userId),
        eq(albumTab.name, name)
      ))
      .limit(1);

    if (existsAlbum) {
      throw new BizError('album.nameExists');
    }

    const now = new Date().toISOString();

    const [album] = await orm.insert(albumTab).values({
      albumId: createId(),
      name,
      userId,
      sort: 0,
      createTime: now,
      updateTime: now,
    }).returning();

    return album;
  },

  // Set or auto-select album cover.
  async setCover(params: AlbumSetCoverBo, userId: string): Promise<void> {
    if (!params.albumId) {
      throw new BizError('album.selectRequired');
    }

    const [album] = await orm
      .select()
      .from(albumTab)
      .where(and(
        eq(albumTab.albumId, params.albumId),
        eq(albumTab.userId, userId)
      ))
      .limit(1);

    if (!album) {
      throw new BizError('album.notFound');
    }

    if (params.autoSelect) {
      const albumPhotos = await orm
        .select({
          photoId: photoTab.photoId,
          width: photoTab.width,
          height: photoTab.height,
          size: photoTab.size,
          favorite: photoTab.favorite,
          thumbHash: photoTab.thumbHash
        })
        .from(albumPhotoTab)
        .innerJoin(photoTab, eq(albumPhotoTab.photoId, photoTab.photoId))
        .where(and(
          eq(albumPhotoTab.albumId, params.albumId),
          eq(photoTab.status, PhotoStatusEnum.NORMAL)
        ));

      const sorted = albumPhotos.slice().sort((a, b) => calculateAlbumCoverScore(b) - calculateAlbumCoverScore(a));
      const best = sorted[0] ?? null;

      await orm
        .update(albumTab)
        .set({
          coverPhotoId: best?.photoId ?? null,
          isManualCover: 0,
          updateTime: new Date().toISOString()
        })
        .where(eq(albumTab.albumId, params.albumId));
      return;
    }

    if (params.photoId !== undefined) {
      await orm
        .update(albumTab)
        .set({
          coverPhotoId: params.photoId,
          isManualCover: 1,
          updateTime: new Date().toISOString()
        })
        .where(eq(albumTab.albumId, params.albumId));
    }
  },

  // Get photo candidates in album sorted by cover score.
  async getCoverCandidates(albumId: string, userId?: string) {
    const wherePhotoList = [
      eq(albumPhotoTab.albumId, albumId),
      eq(photoTab.status, PhotoStatusEnum.NORMAL)
    ];
    if (userId) {
      wherePhotoList.push(eq(photoTab.userId, userId));
    }

    const albumPhotos = await orm
      .select({
        photoId: photoTab.photoId,
        name: photoTab.name,
        width: photoTab.width,
        height: photoTab.height,
        size: photoTab.size,
        favorite: photoTab.favorite,
        thumbHash: photoTab.thumbHash,
        storageId: photoTab.storageId
      })
      .from(albumPhotoTab)
      .innerJoin(photoTab, eq(albumPhotoTab.photoId, photoTab.photoId))
      .where(and(...wherePhotoList));

    const photoIds = albumPhotos.map((p) => p.photoId);
    const fileStorageList = await storageService.list();
    const fileMap = photoIds.length
      ? await fileService.listByPhotoIds(photoIds)
      : new Map<string, File[]>();

    const scored = albumPhotos.map((photo) => {
      const score = calculateAlbumCoverScore(photo);
      const fileStorage = fileStorageList.list.find((item: any) => item.storageId === photo.storageId);
      const domain = formatHttpUrl(fileStorage?.domain);
      const thumbnailFile = (fileMap.get(photo.photoId) ?? []).find((item: any) => item.type === FileTypeEnum.THUMBNAIL);
      const previewFile = (fileMap.get(photo.photoId) ?? []).find((item: any) => item.type === FileTypeEnum.PREVIEW);

      return {
        ...photo,
        score,
        thumbnail: thumbnailFile?.key ? toMediaUrl(thumbnailFile.key, domain) : null,
        preview: previewFile?.key ? toMediaUrl(previewFile.key, domain) : null,
      };
    }).sort((a, b) => b.score - a.score);

    return scored;
  },

  // Add photo associations, preventing duplicate photos (by ID, checksum, thumbHash, or resolution+size) in target albums.
  async addPhoto(params: AlbumAddPhotoBo, userId: string): Promise<void> {
    if (!params.photoIds?.length) {
      throw new BizError('photo.selectRequired');
    }

    if (!params.albumIds?.length) {
      throw new BizError('album.selectRequired');
    }

    const candidatePhotos = await orm
      .select()
      .from(photoTab)
      .where(and(
        eq(photoTab.userId, userId),
        inArray(photoTab.photoId, params.photoIds)
      ));

    if (!candidatePhotos.length) {
      return;
    }

    for (const albumId of params.albumIds) {
      // Query all existing photos in this album to check for duplicates
      const existingRows = await orm
        .select({
          photoId: photoTab.photoId,
          checksum: photoTab.checksum,
          thumbHash: photoTab.thumbHash,
          width: photoTab.width,
          height: photoTab.height,
          size: photoTab.size,
        })
        .from(albumPhotoTab)
        .innerJoin(photoTab, eq(albumPhotoTab.photoId, photoTab.photoId))
        .where(eq(albumPhotoTab.albumId, albumId));

      const existingPhotoIds = new Set(existingRows.map((r: any) => r.photoId));
      const existingChecksums = new Set(existingRows.map((r: any) => r.checksum).filter(Boolean));
      const existingThumbHashes = new Set(existingRows.map((r: any) => r.thumbHash).filter(Boolean));
      const existingDimSizes = new Set(
        existingRows
          .filter((r: any) => r.width && r.height && r.size)
          .map((r: any) => `${r.width}x${r.height}:${r.size}`)
      );

      // Filter candidate photos that are NOT duplicates of any photo already in albumId
      const newPhotosToAdd = candidatePhotos.filter((cp: any) => {
        if (existingPhotoIds.has(cp.photoId)) return false;
        if (cp.checksum && existingChecksums.has(cp.checksum)) return false;
        if (cp.thumbHash && existingThumbHashes.has(cp.thumbHash)) return false;
        if (cp.width && cp.height && cp.size && existingDimSizes.has(`${cp.width}x${cp.height}:${cp.size}`)) return false;
        return true;
      });

      if (newPhotosToAdd.length) {
        const rows = newPhotosToAdd.map((cp: any) => ({
          id: createId(),
          photoId: cp.photoId,
          albumId,
        }));
        await orm.insert(albumPhotoTab).values(rows);
      }
    }
  },

  // Remove photo associations.
  async removePhoto(params: AlbumRemovePhotoBo, userId: string): Promise<void> {

    if (!params.albumId) {
      throw new BizError('album.selectRequired');
    }

    if (!params.photoIds?.length) {
      throw new BizError('photo.selectRequired');
    }

    const [album] = await orm
      .select({
        albumId: albumTab.albumId
      })
      .from(albumTab)
      .where(and(
        eq(albumTab.albumId, params.albumId),
        eq(albumTab.userId, userId)
      ))
      .limit(1);

    if (!album) {
      return;
    }

    await orm.delete(albumPhotoTab)
      .where(and(
        eq(albumPhotoTab.albumId, params.albumId),
        inArray(albumPhotoTab.photoId, params.photoIds)
      ));
  },

  // Modify album name.
  async setName(params: AlbumSetNameBo, userId: string): Promise<void> {
    const name = params.name?.trim();

    if (!name) {
      throw new BizError('album.nameRequired');
    }

    await orm.update(albumTab)
      .set({
        name,
        updateTime: new Date().toISOString()
      })
      .where(and(
        eq(albumTab.albumId, params.albumId),
        eq(albumTab.userId, userId)
      ));
  },

  // Pin album to top.
  async setTop(params: AlbumSetTopBo, userId: string): Promise<void> {
    await orm.update(albumTab)
      .set({
        sort: Date.now(),
        updateTime: new Date().toISOString()
      })
      .where(and(
        eq(albumTab.albumId, params.albumId),
        eq(albumTab.userId, userId)
      ));
  },

  // Delete album.
  async delete(params: AlbumDeleteBo, userId: string): Promise<void> {

    await orm.delete(albumPhotoTab)
      .where(eq(albumPhotoTab.albumId, params.albumId));

    await orm.delete(albumTab)
      .where(and(
        eq(albumTab.albumId, params.albumId),
        eq(albumTab.userId, userId)
      ));

  },

  // Delete all albums by user ID.
  async deleteByUserId(userId: string): Promise<void> {

    const albumList = await orm
      .select({
        albumId: albumTab.albumId
      })
      .from(albumTab)
      .where(eq(albumTab.userId, userId));

    const albumIds = albumList.map((album: any) => album.albumId);

    for (let index = 0; index < albumIds.length; index += 95) {

      const deleteAlbumIds = albumIds.slice(index, index + 95);
      await orm.delete(albumPhotoTab)
        .where(inArray(albumPhotoTab.albumId, deleteAlbumIds));
    }

    await orm.delete(albumTab)
      .where(eq(albumTab.userId, userId));
  },

  // Virtual trash album.
  async trash(userId: string): Promise<AlbumVo> {
    const fileStorageList = await storageService.list();
    const photoList = await orm
      .select()
      .from(photoTab)
      .where(and(
        eq(photoTab.userId, userId),
        eq(photoTab.status, PhotoStatusEnum.DELETE)
      ))
      .orderBy(desc(photoTab.recycleTime))
    const coverPhoto = photoList[0];
    const fileStorage = fileStorageList.list.find((item: any) => item.storageId === coverPhoto?.storageId);
    const domain = formatHttpUrl(fileStorage?.domain);

    const fileMap = coverPhoto
      ? await fileService.listByPhotoIds([coverPhoto.photoId])
      : new Map<string, File[]>();

    const thumbnail = coverPhoto
      ? (fileMap.get(coverPhoto.photoId) ?? []).find((file: any) => file.type === FileTypeEnum.THUMBNAIL)?.key ?? null
      : null;

    const now = new Date().toISOString();

    return {
      albumId: 'trash',
      name: 'trash.title',
      description: '',
      sort: 0,
      createTime: now,
      updateTime: now,
      userId,
      thumbnail: thumbnail ? toMediaUrl(thumbnail, domain) : null,
      thumbHash: coverPhoto?.thumbHash ?? null,
      photoTotal: photoList.length,
      coverPhotoId: coverPhoto?.photoId ?? null,
      suggestedCoverPhotoId: coverPhoto?.photoId ?? null,
      isManualCover: false
    };
  },

  // Return album map for a list of photoIds: Map<photoId, { albumId: string; name: string }[]>
  async listAlbumMapByPhotoIds(photoIds: string[]): Promise<Map<string, { albumId: string; name: string }[]>> {
    const map = new Map<string, { albumId: string; name: string }[]>();
    if (!photoIds || !photoIds.length) return map;

    const rows = await orm
      .select({
        photoId: albumPhotoTab.photoId,
        albumId: albumTab.albumId,
        name: albumTab.name,
      })
      .from(albumPhotoTab)
      .innerJoin(albumTab, eq(albumPhotoTab.albumId, albumTab.albumId))
      .where(inArray(albumPhotoTab.photoId, photoIds));

    for (const row of rows) {
      const existing = map.get(row.photoId) ?? [];
      existing.push({ albumId: row.albumId, name: row.name });
      map.set(row.photoId, existing);
    }

    return map;
  }
}

export { albumService };
