import { inArray } from 'drizzle-orm';
import { type File, type FileInto, fileTab } from '@/server/entity/file';
import { orm } from '@/server/infra/db';

// This module handles photo file data query and writing.

const fileService = {

  // Query file records for a single photo ID.
  async listByPhotoId(photoId: string): Promise<File[]> {
    const map = await this.listByPhotoIds([photoId]);
    return map.get(photoId) ?? [];
  },

  // Query file records for multiple photo IDs, grouped by photoId.
  async listByPhotoIds(photoIds: string[]): Promise<Map<string, File[]>> {

    const map = new Map<string, File[]>();

    if (!photoIds.length) {
      return map;
    }

    const list = await orm
      .select()
      .from(fileTab)
      .where(inArray(fileTab.photoId, photoIds));

    for (const file of list) {
      const files = map.get(file.photoId);

      if (files) {
        files.push(file);
      } else {
        map.set(file.photoId, [file]);
      }
    }

    return map;
  },

  // Write photo file records in batches.
  async save(files: FileInto[]): Promise<File[]> {
    if (!files.length) {
      return [];
    }

    return orm.insert(fileTab).values(files).returning();
  },

  // Delete file records by photo ID list.
  async deleteByPhotoIds(photoIds: string[]): Promise<void> {
    if (!photoIds.length) {
      return;
    }

    await orm.delete(fileTab)
      .where(inArray(fileTab.photoId, photoIds));
  }
};

export { fileService };
