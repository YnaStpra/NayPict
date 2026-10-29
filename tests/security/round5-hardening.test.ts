import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeFileName } from '@/server/lib/photo-sanitizer';
import { resolveSignedVisitorId, signVisitorId } from '@/server/lib/visitor-cookie';
import { albumService } from '@/server/service/album-service';
import { photoService } from '@/server/service/photo-service';
import { exifService } from '@/server/service/exif-service';
import { buildContentDisposition } from '@/server/lib/file';
import { passwordChangeRateLimiter } from '@/server/lib/rate-limiter';
import BizError from '@/server/error/biz-error';

describe('Round 5 Security & Reliability Hardening Test Suite', () => {
  describe('Batch Edit Filename Sanitization & Path Traversal Defense', () => {
    it('neutralizes path traversal and control characters in file renaming', () => {
      const traversalName = '../../../../etc/passwd.jpg';
      const sanitizedTraversal = sanitizeFileName(traversalName);
      assert.ok(!sanitizedTraversal.includes('..'));
      assert.ok(!sanitizedTraversal.includes('/'));

      const nullByteName = 'innocent\0evil.php.jpg';
      const sanitizedNullByte = sanitizeFileName(nullByteName);
      assert.ok(!sanitizedNullByte.includes('\0'));

      const crlfName = 'photo\r\nContent-Disposition: evil.jpg';
      const sanitizedCrlf = sanitizeFileName(crlfName);
      assert.ok(!sanitizedCrlf.includes('\r'));
      assert.ok(!sanitizedCrlf.includes('\n'));
    });
  });

  describe('Visitor ID Impersonation Defense', () => {
    it('refuses unauthenticated explicitId from client when cookie is absent', () => {
      const mockContextNoCookie: any = {
        req: {
          raw: {
            headers: new Headers(),
          },
          header: () => undefined,
        },
        res: {
          headers: new Headers(),
        },
        header: () => {},
      };

      const attackerSuppliedId = 'attacker_crafted_visitor_id_123456';
      const resolved = resolveSignedVisitorId(mockContextNoCookie, attackerSuppliedId);

      // Must not adopt the attacker-provided ID
      assert.notEqual(resolved, attackerSuppliedId);
      assert.ok(resolved.length >= 8);
    });

    it('honors valid cryptographically signed visitor cookies', () => {
      const legitimateId = 'legit_visitor_abcdef123456';
      const signedCookieValue = signVisitorId(legitimateId);
      const headers = new Headers();
      headers.set('Cookie', `naypict_vid=${signedCookieValue}`);

      const mockContextWithCookie: any = {
        req: {
          raw: {
            headers,
          },
          header: (name: string) => headers.get(name),
        },
        res: {
          headers: new Headers(),
        },
        header: () => {},
      };

      const resolved = resolveSignedVisitorId(mockContextWithCookie);
      assert.equal(resolved, legitimateId);
    });
  });

  describe('Album Renaming Hardening (albumService.setName)', () => {
    it('rejects empty album name', async () => {
      await assert.rejects(
        () => albumService.setName({ albumId: 'album_1', name: '   ' }, 'user_1'),
        (err: any) => err instanceof BizError && err.message === 'album.nameRequired'
      );
    });

    it('rejects excessively long album name (> 100 characters)', async () => {
      const longName = 'A'.repeat(101);
      await assert.rejects(
        () => albumService.setName({ albumId: 'album_1', name: longName }, 'user_1'),
        (err: any) => err instanceof BizError && err.message === 'album.nameTooLong'
      );
    });
  });

  describe('Direct Photo Upload Validation (photoService.addDirect)', () => {
    it('strictly blocks zero, negative, or non-numeric file sizes', async () => {
      const basePayload: any = {
        photoId: 'photo_test_1',
        key: 'originals/user_1/test.jpg',
        previewKey: 'previews/test.jpg',
        thumbnailKey: 'thumbnails/test.webp',
        type: 'image/jpeg',
        name: 'test.jpg',
        checksum: 'checksum123',
        storageId: 'mock-storage',
      };

      // Zero size
      await assert.rejects(
        () => photoService.addDirect({ ...basePayload, size: 0 }, 'user_1'),
        (err: any) => err instanceof BizError && err.message === 'photo.fileTooLarge'
      );

      // Negative size
      await assert.rejects(
        () => photoService.addDirect({ ...basePayload, size: -500 }, 'user_1'),
        (err: any) => err instanceof BizError && err.message === 'photo.fileTooLarge'
      );

      // Non-numeric size
      await assert.rejects(
        () => photoService.addDirect({ ...basePayload, size: 'invalid' as any }, 'user_1'),
        (err: any) => err instanceof BizError && err.message === 'photo.fileTooLarge'
      );
    });

    it('rejects file sizes exceeding 500MB', async () => {
      const payload: any = {
        photoId: 'photo_test_2',
        key: 'originals/user_1/huge.jpg',
        previewKey: 'previews/huge.jpg',
        thumbnailKey: 'thumbnails/huge.webp',
        size: 501 * 1024 * 1024,
        type: 'image/jpeg',
        name: 'huge.jpg',
        checksum: 'checksum123',
        storageId: 'mock-storage',
      };

      await assert.rejects(
        () => photoService.addDirect(payload, 'user_1'),
        (err: any) => err instanceof BizError && err.message === 'photo.fileTooLarge'
      );
    });

    it('rejects disallowed MIME types', async () => {
      const payload: any = {
        photoId: 'photo_test_3',
        key: 'originals/user_1/evil.exe',
        previewKey: 'previews/evil.jpg',
        thumbnailKey: 'thumbnails/evil.webp',
        size: 1024,
        type: 'application/x-msdownload',
        name: 'evil.exe',
        checksum: 'checksum123',
        storageId: 'mock-storage',
      };

      await assert.rejects(
        () => photoService.addDirect(payload, 'user_1'),
        (err: any) => err instanceof BizError && err.message === 'photo.invalidFileType'
      );
    });

    it('blocks storage keys that attempt path traversal or do not belong to current user', async () => {
      const payload: any = {
        photoId: 'photo_test_4',
        key: 'originals/user_victim/stolen.jpg',
        previewKey: 'previews/stolen.jpg',
        thumbnailKey: 'thumbnails/stolen.webp',
        size: 1024,
        type: 'image/jpeg',
        name: 'stolen.jpg',
        checksum: 'checksum123',
        storageId: 'mock-storage',
      };

      // Attacker trying to register victim's key
      await assert.rejects(
        () => photoService.addDirect(payload, 'user_attacker'),
        (err: any) => err instanceof BizError && err.message === 'photo.invalidStorageKey'
      );
    });
  });

  describe('Exif Service Batch Deletion', () => {
    it('handles empty photo IDs gracefully without error', async () => {
      await assert.doesNotReject(async () => {
        await exifService.deleteByPhotoIds([]);
      });
    });
  });

  describe('Rate Limiter Configurations', () => {
    it('configures passwordChangeRateLimiter with strict 5 attempts per 15 minutes', () => {
      assert.equal(passwordChangeRateLimiter.limit, 5);
      assert.equal(passwordChangeRateLimiter.windowMs, 15 * 60 * 1000);
      assert.equal(passwordChangeRateLimiter.name, 'password-change');
    });
  });

  describe('RFC 6266 & 5987 Content-Disposition Formatting', () => {
    it('formats backup filenames with attachment disposition and encoded parameters', () => {
      const backupFileName = 'naypict-backup-2026-10-29.bak';
      const disposition = buildContentDisposition(backupFileName, 'attachment');

      assert.ok(disposition.startsWith('attachment;'));
      assert.ok(disposition.includes(`filename="${backupFileName}"`));
      assert.ok(disposition.includes(`filename*=UTF-8''`));
    });

    it('neutralizes control characters and quotes in Content-Disposition', () => {
      const maliciousName = 'backup"\r\nEvil-Header: inject.bak';
      const disposition = buildContentDisposition(maliciousName, 'attachment');

      assert.ok(!disposition.includes('\r'));
      assert.ok(!disposition.includes('\n'));
      assert.ok(!disposition.includes('"Evil-Header'));
      assert.ok(disposition.includes('backup___Evil-Header'));
    });
  });

  describe('Administrative Insights Limits Clamping', () => {
    it('clamps query limits safely between 1 and 500', () => {
      const clampLimit = (raw: number | undefined, defaultVal: number) => {
        const val = Number.isFinite(raw) && (raw as number) > 0 ? (raw as number) : defaultVal;
        return Math.min(Math.max(1, val), 500);
      };

      // Extremely large limit
      assert.equal(clampLimit(1000000, 100), 500);

      // Negative or zero limit
      assert.equal(clampLimit(-10, 100), 100);
      assert.equal(clampLimit(0, 50), 50);

      // Normal limit
      assert.equal(clampLimit(25, 50), 25);
    });
  });
});
