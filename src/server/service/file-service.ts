import { inArray } from 'drizzle-orm';
import { type File, type FileInto, fileTab } from '@/server/entity/file';
import { orm } from '@/server/infra/db';

// This module handles photo file data query and writing。

const fileService = {

  // Press multiple photos id Query file records，according to photoId Group。
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

  // Write photo file records in batches。
  async save(files: FileInto[]): Promise<File[]> {
    if (!files.length) {
      return [];
    }

    return orm.insert(fileTab).values(files).returning();
  },

  // press photo id Delete file records from list。
  async deleteByPhotoIds(photoIds: string[]): Promise<void> {
    if (!photoIds.length) {
      return;
    }

    await orm.delete(fileTab)
      .where(inArray(fileTab.photoId, photoIds));
  }
};

export { fileService };
