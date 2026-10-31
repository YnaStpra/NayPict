import { inArray } from 'drizzle-orm';
import { type File, type FileInto, fileTab } from '@/server/entity/file';
import { orm, readOrm } from '@/server/infra/db';

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

    const list = await readOrm
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

  // Write photo file records in batches (chunked to 100 to prevent parameter limits).
  async save(files: FileInto[]): Promise<File[]> {
    if (!files.length) {
      return [];
    }

    const CHUNK_SIZE = 100;
    const results: File[] = [];
    for (let i = 0; i < files.length; i += CHUNK_SIZE) {
      const chunk = files.slice(i, i + CHUNK_SIZE);
      const inserted = await orm.insert(fileTab).values(chunk).returning();
      results.push(...inserted);
    }
    return results;
  },

  // Delete file records by photo ID list (chunked to 100 to prevent parameter limits).
  async deleteByPhotoIds(photoIds: string[]): Promise<void> {
    if (!photoIds.length) {
      return;
    }

    const CHUNK_SIZE = 100;
    for (let i = 0; i < photoIds.length; i += CHUNK_SIZE) {
      const chunk = photoIds.slice(i, i + CHUNK_SIZE);
      await orm.delete(fileTab)
        .where(inArray(fileTab.photoId, chunk));
    }
  }
};

export { fileService };
