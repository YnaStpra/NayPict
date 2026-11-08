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

  // Write photo file records in batches (chunked to 100 and executed in parallel).
  async save(files: FileInto[]): Promise<File[]> {
    if (!files.length) {
      return [];
    }

    const CHUNK_SIZE = 100;
    const chunks: FileInto[][] = [];
    for (let i = 0; i < files.length; i += CHUNK_SIZE) {
      chunks.push(files.slice(i, i + CHUNK_SIZE));
    }

    const chunkResults = await Promise.all(
      chunks.map((chunk) => orm.insert(fileTab).values(chunk).returning())
    );
    return chunkResults.flat();
  },

  // Delete file records by photo ID list (chunked to 100 and executed in parallel).
  async deleteByPhotoIds(photoIds: string[]): Promise<void> {
    if (!photoIds.length) {
      return;
    }

    const CHUNK_SIZE = 100;
    const chunks: string[][] = [];
    for (let i = 0; i < photoIds.length; i += CHUNK_SIZE) {
      chunks.push(photoIds.slice(i, i + CHUNK_SIZE));
    }

    await Promise.all(
      chunks.map((chunk) => orm.delete(fileTab).where(inArray(fileTab.photoId, chunk)))
    );
  }
};

export { fileService };
