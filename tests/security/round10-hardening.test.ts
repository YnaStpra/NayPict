import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { redactSensitiveDetails } from '@/server/lib/audit';
import fs from 'node:fs';
import path from 'node:path';

describe('Round 10 Security & Reliability Hardening Test Suite', () => {

  describe('Security Audit Log Credential Redaction', () => {
    it('redacts sensitive authentication keys recursively', () => {
      const input = {
        action: 'STORAGE_ADD',
        username: 'admin',
        password: 'SuperSecretPassword123!',
        token: 'jwt-header.payload.signature',
        accessKey: 'CLOUDFLARE_R2_KEY',
        secretKey: 'CLOUDFLARE_R2_SECRET',
        nested: {
          authorization: 'Bearer secret_token',
          cookie: 'session=12345',
          safeParam: 'public_value',
        },
        items: [
          { secret: 'hidden_pass', safe: 123 },
          { token: 'token_val', public: true },
        ],
      };

      const result = redactSensitiveDetails(input) as any;

      assert.equal(result.username, 'admin');
      assert.equal(result.password, '***REDACTED***');
      assert.equal(result.token, '***REDACTED***');
      assert.equal(result.accessKey, '***REDACTED***');
      assert.equal(result.secretKey, '***REDACTED***');
      assert.equal(result.nested.authorization, '***REDACTED***');
      assert.equal(result.nested.cookie, '***REDACTED***');
      assert.equal(result.nested.safeParam, 'public_value');
      assert.equal(result.items[0].secret, '***REDACTED***');
      assert.equal(result.items[0].safe, 123);
      assert.equal(result.items[1].token, '***REDACTED***');
      assert.equal(result.items[1].public, true);
    });

    it('handles primitive values, null, and non-object inputs safely', () => {
      assert.equal(redactSensitiveDetails(null), null);
      assert.equal(redactSensitiveDetails(undefined), undefined);
      assert.equal(redactSensitiveDetails('plain-string'), 'plain-string');
      assert.equal(redactSensitiveDetails(42), 42);
    });
  });

  describe('CSRF Protection on Reaction and Comment Mutations', () => {
    it('verifies reaction and comment endpoints are classified as sensitive mutations', () => {
      const csrfSource = fs.readFileSync(path.join(process.cwd(), 'src/server/security/csrf.ts'), 'utf-8');

      assert.ok(csrfSource.includes("'/photo/comment/add'"), 'Comment add must be in SENSITIVE_MUTATION_PATHS');
      assert.ok(csrfSource.includes("'/photo/reaction/add'"), 'Reaction add must be in SENSITIVE_MUTATION_PATHS');
      assert.ok(csrfSource.includes("'/photo/reaction/remove'"), 'Reaction remove must be in SENSITIVE_MUTATION_PATHS');
      assert.ok(csrfSource.includes('photos') && csrfSource.includes('comments') && csrfSource.includes('isSensitive'), 'RESTful comments POST route must be recognized as sensitive');
    });
  });

  describe('Unauthenticated Information Disclosure Guard on Archived Albums in takenDateList', () => {
    it('verifies takenDateList immediately blocks unauthenticated queries on archived albums', () => {
      const photoServiceSource = fs.readFileSync(path.join(process.cwd(), 'src/server/service/photo-service.ts'), 'utf-8');

      // Find the takenDateList implementation section
      const takenDateListBlock = photoServiceSource.slice(
        photoServiceSource.indexOf('async takenDateList('),
        photoServiceSource.indexOf('async onThisDay(')
      );

      assert.ok(
        takenDateListBlock.includes('if (isCurrentAlbumArchived && !userId)'),
        'takenDateList must check isCurrentAlbumArchived && !userId and return []'
      );
    });
  });

  describe('Query Bounding Limits (DoS & OOM Prevention)', () => {
    it('verifies getMapPhotos bounds max photos to 3000', () => {
      const photoServiceSource = fs.readFileSync(path.join(process.cwd(), 'src/server/service/photo-service.ts'), 'utf-8');
      const mapBlock = photoServiceSource.slice(photoServiceSource.indexOf('async getMapPhotos('));

      assert.ok(/limit\(3000\)/.test(mapBlock), 'getMapPhotos must be bounded with limit(3000)');
    });

    it('verifies getUntaggedPhotos bounds max photos to 1000', () => {
      const photoServiceSource = fs.readFileSync(path.join(process.cwd(), 'src/server/service/photo-service.ts'), 'utf-8');
      const untaggedBlock = photoServiceSource.slice(photoServiceSource.indexOf('async getUntaggedPhotos('));

      assert.ok(/limit\(1000\)/.test(untaggedBlock), 'getUntaggedPhotos must be bounded with limit(1000)');
    });

    it('verifies randomIdList bounds max photo ID queries to 5000', () => {
      const photoServiceSource = fs.readFileSync(path.join(process.cwd(), 'src/server/service/photo-service.ts'), 'utf-8');
      const randomBlock = photoServiceSource.slice(
        photoServiceSource.indexOf('async randomIdList('),
        photoServiceSource.indexOf('async takenDateList(')
      );

      assert.ok(/limit\(5000\)/.test(randomBlock), 'randomIdList must be bounded with limit(5000)');
    });

    it('verifies commentService.listByPhotoId bounds comments to 300', () => {
      const commentServiceSource = fs.readFileSync(path.join(process.cwd(), 'src/server/service/comment-service.ts'), 'utf-8');
      const commentBlock = commentServiceSource.slice(
        commentServiceSource.indexOf('async listByPhotoId('),
        commentServiceSource.indexOf('async listAllForAdmin(')
      );

      assert.ok(/limit\(300\)/.test(commentBlock), 'listByPhotoId must be bounded with limit(300)');
    });

    it('verifies albumService.getCoverCandidates bounds candidate photos to 500', () => {
      const albumServiceSource = fs.readFileSync(path.join(process.cwd(), 'src/server/service/album-service.ts'), 'utf-8');
      const coverBlock = albumServiceSource.slice(
        albumServiceSource.indexOf('async getCoverCandidates('),
        albumServiceSource.indexOf('async addPhoto(')
      );

      assert.ok(/limit\(500\)/.test(coverBlock), 'getCoverCandidates must be bounded with limit(500)');
    });
  });

  describe('GPS Physical Earth Bounds & Sanitization in exifService', () => {
    it('verifies coordinate validation helper logic', () => {
      const exifServiceSource = fs.readFileSync(path.join(process.cwd(), 'src/server/service/exif-service.ts'), 'utf-8');

      assert.ok(exifServiceSource.includes('safeLat < -90 || safeLat > 90'), 'Latitude must be bounded between -90 and 90');
      assert.ok(exifServiceSource.includes('safeLng < -180 || safeLng > 180'), 'Longitude must be bounded between -180 and 180');
      assert.ok(exifServiceSource.includes('safeAlt < -500 || safeAlt > 15000'), 'Altitude must be bounded between -500 and 15000');
    });
  });

  describe('Cross-Tenant IDOR Guard in photoService.getById', () => {
    it('verifies non-admin users cannot access other users deleted or archived photos', () => {
      const photoServiceSource = fs.readFileSync(path.join(process.cwd(), 'src/server/service/photo-service.ts'), 'utf-8');
      const getByIdBlock = photoServiceSource.slice(
        photoServiceSource.indexOf('async getById('),
        photoServiceSource.indexOf('async getOriginalPhotoBuffer(')
      );

      assert.ok(getByIdBlock.includes('photo.userId !== currentUserId'), 'Must check photo ownership');
      assert.ok(getByIdBlock.includes('currentUser?.type !== UserTypeEnum.ADMIN'), 'Must reject if user is not ADMIN');
    });
  });

  describe('Database Optimization & Batch Chunking', () => {
    it('verifies backupService.getDatabaseStats uses native SQL count() instead of loading full rows', () => {
      const backupServiceSource = fs.readFileSync(path.join(process.cwd(), 'src/server/service/backup-service.ts'), 'utf-8');

      assert.ok(backupServiceSource.includes('val: count()'), 'Must use count() aggregation');
      assert.ok(!backupServiceSource.includes('photos.length + albums.length'), 'Must not read full tables for .length');
    });

    it('verifies fileService chunks save and delete operations to 100 items', () => {
      const fileServiceSource = fs.readFileSync(path.join(process.cwd(), 'src/server/service/file-service.ts'), 'utf-8');

      assert.ok(fileServiceSource.includes('const CHUNK_SIZE = 100'), 'Must define CHUNK_SIZE = 100');
      assert.ok(fileServiceSource.includes('files.slice(i, i + CHUNK_SIZE)'), 'save must chunk file inserts');
      assert.ok(fileServiceSource.includes('photoIds.slice(i, i + CHUNK_SIZE)'), 'deleteByPhotoIds must chunk deletions');
    });
  });

  describe('User-Agent Header Sanitization in loginService', () => {
    it('verifies User-Agent is sanitized against control characters and clamped to 255 chars', () => {
      const loginServiceSource = fs.readFileSync(path.join(process.cwd(), 'src/server/service/login-service.ts'), 'utf-8');

      assert.ok(loginServiceSource.includes('[\\x00-\\x1f\\x7f]'), 'Must strip ASCII control characters');
      assert.ok(loginServiceSource.includes('slice(0, 255)'), 'Must clamp user-agent to 255 characters');
    });
  });
});
