import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import BizError from '@/server/error/biz-error';

// This module handles database snapshot creation, gzip compression, and AES-256-GCM encryption for disaster recovery backups.

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
  // Retrieve SQLite database file metrics including size on disk and last modified timestamp.
  async getDatabaseStats(): Promise<DatabaseStatsVo> {
    try {
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
    if (!fs.existsSync(DB_PATH)) {
      throw new BizError('system.internalError');
    }

    // 1. Read SQLite database file
    let dbBuffer: Buffer;
    try {
      dbBuffer = fs.readFileSync(DB_PATH);
    } catch (err) {
      console.error('[BACKUP] Failed to read SQLite database file:', err);
      throw new BizError('system.internalError');
    }

    // 2. Compress with gzip for compact transfer
    const compressedBuffer = zlib.gzipSync(dbBuffer, { level: 9 });

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
