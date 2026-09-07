import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import BizError from '@/server/error/biz-error';
import { orm } from '@/server/infra/db';
import { userTab } from '@/server/entity/user';
import { photoTab } from '@/server/entity/photo';
import { fileTab } from '@/server/entity/file';
import { exifTab } from '@/server/entity/exif';
import { albumTab } from '@/server/entity/album';
import { albumPhotoTab } from '@/server/entity/album-photo';
import { commentTab } from '@/server/entity/comment';
import { photoReactionTab } from '@/server/entity/reaction';
import { settingTab } from '@/server/entity/setting';
import { storageTab } from '@/server/entity/storage';

// This module handles database snapshot creation, gzip compression, and AES-256-GCM encryption for disaster recovery backups supporting both Neon PostgreSQL and SQLite.

export interface DatabaseStatsVo {
  sizeBytes: number;
  sizeFormatted: string;
  lastModified: number;
  exists: boolean;
}

export interface BackupResultVo {
  buffer: Buffer;
  fileName: string;
  sizeBytes: number;
}

const DB_PATH = path.join(process.cwd(), 'data', 'naypict.sqlite');
const MAGIC_HEADER = Buffer.from('NAYPICT_BAK_V1\0', 'utf-8'); // 15 bytes identifier

const backupService = {
  // Retrieve database metrics including record counts or SQLite file size.
  async getDatabaseStats(): Promise<DatabaseStatsVo> {
    try {
      if (process.env.DATABASE_URL) {
        const [photos, albums, comments, users] = await Promise.all([
          orm.select().from(photoTab),
          orm.select().from(albumTab),
          orm.select().from(commentTab),
          orm.select().from(userTab),
        ]);

        return {
          sizeBytes: (photos.length + albums.length + comments.length + users.length) * 1024,
          sizeFormatted: `${photos.length} photos, ${albums.length} albums, ${comments.length} comments`,
          lastModified: Date.now(),
          exists: false,
        };
      }

      if (!fs.existsSync(DB_PATH)) {
        return {
          sizeBytes: 0,
          sizeFormatted: '0 B',
          lastModified: 0,
          exists: false,
        };
      }

      const stat = fs.statSync(DB_PATH);
      const mb = (stat.size / (1024 * 1024)).toFixed(2);

      return {
        sizeBytes: stat.size,
        sizeFormatted: `${mb} MB`,
        lastModified: stat.mtimeMs,
        exists: true,
      };
    } catch (err) {
      console.warn('[BACKUP] Error retrieving database stats:', err);
      return {
        sizeBytes: 0,
        sizeFormatted: 'Unknown',
        lastModified: 0,
        exists: false,
      };
    }
  },

  // Create a gzip-compressed, AES-256-GCM encrypted binary snapshot of the database.
  async createEncryptedBackup(password?: string): Promise<BackupResultVo> {
    let rawPayloadBuffer: Buffer;

    if (process.env.DATABASE_URL) {
      // 1. Export all tables from Neon PostgreSQL
      const [
        users,
        photos,
        files,
        exifs,
        albums,
        albumPhotos,
        comments,
        reactions,
        settings,
        storages
      ] = await Promise.all([
        orm.select().from(userTab),
        orm.select().from(photoTab),
        orm.select().from(fileTab),
        orm.select().from(exifTab),
        orm.select().from(albumTab),
        orm.select().from(albumPhotoTab),
        orm.select().from(commentTab),
        orm.select().from(photoReactionTab).catch(() => []),
        orm.select().from(settingTab),
        orm.select().from(storageTab),
      ]);

      const dump = {
        meta: {
          version: 1,
          engine: 'neon-postgresql',
          exportedAt: new Date().toISOString(),
        },
        data: {
          users,
          photos,
          files,
          exifs,
          albums,
          albumPhotos,
          comments,
          reactions,
          settings,
          storages,
        },
      };

      rawPayloadBuffer = Buffer.from(JSON.stringify(dump, null, 2), 'utf-8');
    } else {
      // Fallback for local SQLite instances
      if (!fs.existsSync(DB_PATH)) {
        throw new BizError('system.internalError');
      }

      try {
        rawPayloadBuffer = fs.readFileSync(DB_PATH);
      } catch (err) {
        console.error('[BACKUP] Failed to read SQLite database file:', err);
        throw new BizError('system.internalError');
      }
    }

    // 2. Compress with gzip for compact transfer
    const compressedBuffer = zlib.gzipSync(rawPayloadBuffer, { level: 9 });

    // 3. Derive 256-bit encryption key using scrypt
    const salt = crypto.randomBytes(16);
    const iv = crypto.randomBytes(12);
    const secret = password && password.trim() ? password.trim() : (process.env.JWT_SECRET || 'naypict-secure-backup-salt');
    const key = crypto.scryptSync(secret, salt, 32);

    // 4. Encrypt with AES-256-GCM
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const encryptedPayload = Buffer.concat([cipher.update(compressedBuffer), cipher.final()]);
    const authTag = cipher.getAuthTag(); // 16 bytes authentication tag

    // 5. Package into unified binary file: Header + Salt(16) + IV(12) + AuthTag(16) + EncryptedPayload
    const finalBuffer = Buffer.concat([
      MAGIC_HEADER,
      salt,
      iv,
      authTag,
      encryptedPayload,
    ]);

    const dateStr = new Date().toISOString().slice(0, 10);
    const fileName = `naypict-backup-${dateStr}.bak`;

    return {
      buffer: finalBuffer,
      fileName,
      sizeBytes: finalBuffer.length,
    };
  },
};

export { backupService };
