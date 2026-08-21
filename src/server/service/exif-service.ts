import { eq, inArray } from 'drizzle-orm';
import { type ExifSaveBo } from '@/server/entity/bo/exif';
import { type Exif, exifTab } from '@/server/entity/exif';
import { orm } from '@/server/infra/db';

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

    const rows = await orm
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

  // Batch update or upsert GPS location coordinates for multiple photos.
  async updateLocation(photoIds: string[], latitude: number | null, longitude: number | null): Promise<void> {
    if (!photoIds.length) return;

    for (const photoId of photoIds) {
      const existing = await this.getByPhotoId(photoId);
      if (existing) {
        await orm
          .update(exifTab)
          .set({ latitude, longitude })
          .where(eq(exifTab.photoId, photoId));
      } else if (latitude != null || longitude != null) {
        await orm.insert(exifTab).values({
          photoId,
          latitude,
          longitude,
          exif: null,
          altitude: null,
        });
      }
    }
  },
};

export { exifService };
