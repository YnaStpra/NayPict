import { eq, inArray } from 'drizzle-orm';
import { type ExifSaveBo } from '@/server/entity/bo/exif';
import { type Exif, exifTab } from '@/server/entity/exif';
import { orm, readOrm } from '@/server/infra/db';

// This module processes photo Exif reading and writing.

const exifService = {

  // Query single photo Exif record by photo ID.
  async getByPhotoId(photoId: string): Promise<Exif | null> {
    const map = await this.listByPhotoIds([photoId]);
    return map.get(photoId) ?? null;
  },

  // Batch query Exif records by multiple photo IDs.
  async listByPhotoIds(photoIds: string[]): Promise<Map<string, Exif>> {
    if (!photoIds.length) {
      return new Map();
    }

    const rows = await readOrm
      .select()
      .from(exifTab)
      .where(inArray(exifTab.photoId, photoIds));

    return new Map(rows.map((row) => [row.photoId, row]));
  },

  // Save photo Exif JSON and GPS location metadata.
  async save(photoId: string, params: ExifSaveBo): Promise<void> {
    const { exif, latitude, longitude, altitude } = params;

    if (!exif && latitude == null && longitude == null && altitude == null) {
      return;
    }

    await orm.insert(exifTab).values({
      photoId,
      exif,
      latitude,
      longitude,
      altitude
    });
  },

  // Batch update or upsert GPS location coordinates for multiple photos (optimized bulk queries).
  async updateLocation(
    photoIds: string[],
    latitude: number | null,
    longitude: number | null,
    altitude?: number | null
  ): Promise<void> {
    if (!photoIds.length) return;

    // 1. Fetch all existing records in a single query (eliminates N+1 loop)
    const existingMap = await this.listByPhotoIds(photoIds);
    const existingPhotoIds = photoIds.filter((id) => existingMap.has(id));
    const newPhotoIds = photoIds.filter((id) => !existingMap.has(id));

    const updates: Record<string, any> = { latitude, longitude };
    if (altitude !== undefined) {
      updates.altitude = altitude;
    }

    // 2. Bulk update existing records in chunks of 100
    const CHUNK_SIZE = 100;
    for (let i = 0; i < existingPhotoIds.length; i += CHUNK_SIZE) {
      const chunk = existingPhotoIds.slice(i, i + CHUNK_SIZE);
      await orm
        .update(exifTab)
        .set(updates)
        .where(inArray(exifTab.photoId, chunk));
    }

    // 3. Bulk insert new records if coordinates or altitude are present
    if (newPhotoIds.length && (latitude != null || longitude != null || altitude != null)) {
      const rows = newPhotoIds.map((photoId) => ({
        photoId,
        latitude,
        longitude,
        altitude: altitude ?? null,
        exif: null,
      }));
      for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
        const chunk = rows.slice(i, i + CHUNK_SIZE);
        await orm.insert(exifTab).values(chunk);
      }
    }
  },

  // Batch delete Exif records by multiple photo IDs.
  async deleteByPhotoIds(photoIds: string[]): Promise<void> {
    if (!photoIds.length) {
      return;
    }
    await orm.delete(exifTab).where(inArray(exifTab.photoId, photoIds));
  },
};

export { exifService };
