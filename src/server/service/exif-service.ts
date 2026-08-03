import { inArray } from 'drizzle-orm';
import { type ExifSaveBo } from '@/server/entity/bo/exif';
import { type Exif, exifTab } from '@/server/entity/exif';
import { orm } from '@/server/infra/db';

// This module processes photos Exif reading and writing。

const exifService = {

  // Press multiple photos id Batch query exif Record。
  async listByPhotoIds(photoIds: string[]): Promise<Map<string, Exif>> {
    if (!photoIds.length) {
      return new Map();
    }

    const rows = await orm
      .select()
      .from(exifTab)
      .where(inArray(exifTab.photoId, photoIds));

    return new Map(rows.map((row: any) => [row.photoId, row]));
  },

  // save photo exif JSON and location information。
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
  }
};

export { exifService };
