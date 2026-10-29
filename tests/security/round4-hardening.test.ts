import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { photoService } from '@/server/service/photo-service';
import { albumService } from '@/server/service/album-service';
import { userService } from '@/server/service/user-service';
import { verifyTurnstileToken } from '@/server/lib/turnstile';
import BizError from '@/server/error/biz-error';

describe('Round 4 Security Hardening Test Suite', () => {
  describe('S3 / R2 Multipart Upload Key & Part Hardening', () => {
    it('strictly blocks unauthorized S3 key tampering in getMultipartPartUrl', async () => {
      const victimKey = 'originals/victim_user_123/private_photo.jpg';
      const attackerUserId = 'attacker_456';

      await assert.rejects(
        () =>
          photoService.getMultipartPartUrl(
            {
              key: victimKey,
              uploadId: 'mock-upload-id',
              partNumber: 1,
              storageId: 'mock-storage-id',
            },
            attackerUserId
          ),
        (err: any) => {
          assert.ok(err instanceof BizError);
          assert.equal(err.message, 'param.invalid');
          return true;
        }
      );
    });

    it('rejects invalid, floating point, or out-of-range part numbers in getMultipartPartUrl', async () => {
      const validKey = 'originals/user_123/file.jpg';
      const userId = 'user_123';

      // Out of range (> 10000)
      await assert.rejects(
        () =>
          photoService.getMultipartPartUrl(
            {
              key: validKey,
              uploadId: 'mock-upload-id',
              partNumber: 10001,
              storageId: 'mock-storage-id',
            },
            userId
          ),
        (err: any) => err instanceof BizError && err.message === 'param.invalid'
      );

      // Non-integer (floating point)
      await assert.rejects(
        () =>
          photoService.getMultipartPartUrl(
            {
              key: validKey,
              uploadId: 'mock-upload-id',
              partNumber: 1.5 as any,
              storageId: 'mock-storage-id',
            },
            userId
          ),
        (err: any) => err instanceof BizError && err.message === 'param.invalid'
      );
    });

    it('strictly blocks unauthorized S3 key tampering in completeMultipartUpload', async () => {
      const victimKey = 'originals/victim_user_123/private_photo.jpg';
      const attackerUserId = 'attacker_456';

      await assert.rejects(
        () =>
          photoService.completeMultipartUpload(
            {
              key: victimKey,
              uploadId: 'mock-upload-id',
              parts: [{ PartNumber: 1, ETag: '"mock"' }],
              storageId: 'mock-storage-id',
            },
            attackerUserId
          ),
        (err: any) => err instanceof BizError && err.message === 'param.invalid'
      );
    });

    it('strictly blocks unauthorized S3 key tampering in abortMultipartUpload', async () => {
      const victimKey = 'originals/victim_user_123/private_photo.jpg';
      const attackerUserId = 'attacker_456';

      await assert.rejects(
        () =>
          photoService.abortMultipartUpload(
            {
              key: victimKey,
              uploadId: 'mock-upload-id',
              storageId: 'mock-storage-id',
            },
            attackerUserId
          ),
        (err: any) => err instanceof BizError && err.message === 'param.invalid'
      );
    });
  });

  describe('Video Upload Registration Hardening (addVideo)', () => {
    it('blocks foreign storage key injection in addVideo', async () => {
      const victimKey = 'originals/victim_user_123/secret_video.mp4';
      const attackerUserId = 'attacker_456';

      await assert.rejects(
        () =>
          photoService.addVideo(
            {
              key: victimKey,
              name: 'video.mp4',
              size: 1024 * 1024,
              type: 'video/mp4',
              checksum: 'mock-checksum',
              storageId: 'mock-storage-id',
              width: 1920,
              height: 1080,
            },
            attackerUserId
          ),
        (err: any) => err instanceof BizError && err.message === 'param.invalid'
      );
    });

    it('rejects negative, zero, or non-finite video sizes', async () => {
      const userId = 'user_123';
      const validKey = `originals/${userId}/video.mp4`;

      // Zero size
      await assert.rejects(
        () =>
          photoService.addVideo(
            {
              key: validKey,
              name: 'video.mp4',
              size: 0,
              type: 'video/mp4',
              checksum: 'mock-checksum',
              storageId: 'mock-storage-id',
              width: 1920,
              height: 1080,
            },
            userId
          ),
        (err: any) => err instanceof BizError && err.message === 'param.invalid'
      );

      // Negative size
      await assert.rejects(
        () =>
          photoService.addVideo(
            {
              key: validKey,
              name: 'video.mp4',
              size: -500,
              type: 'video/mp4',
              checksum: 'mock-checksum',
              storageId: 'mock-storage-id',
              width: 1920,
              height: 1080,
            },
            userId
          ),
        (err: any) => err instanceof BizError && err.message === 'param.invalid'
      );
    });
  });

  describe('Album Reordering Safety Caps', () => {
    it('rejects album reordering arrays exceeding 500 items', async () => {
      const fakeAlbumIds = Array.from({ length: 501 }, (_, i) => `album_${i}`);

      await assert.rejects(
        () =>
          albumService.reorder(
            {
              albumIds: fakeAlbumIds,
            },
            'user_123'
          ),
        (err: any) => err instanceof BizError && err.message === 'param.invalid'
      );
    });
  });

  describe('User Avatar Upload & Username Hardening', () => {
    it('rejects non-WebP magic bytes in setAvatar', async () => {
      // Fake non-webp data (e.g. text/html payload base64)
      const fakeBase64 = Buffer.from('<html><script>alert(1)</script></html>').toString('base64');

      await assert.rejects(
        () =>
          userService.setAvatar(
            {
              avatar: `data:image/webp;base64,${fakeBase64}`,
            },
            'user_123'
          ),
        (err: any) => err instanceof BizError && err.message === 'user.avatarInvalid'
      );
    });

    it('rejects usernames with invalid characters or out-of-range length in userService.add', async () => {
      // Too short
      await assert.rejects(
        () =>
          userService.add({
            username: 'ab',
            password: 'ValidPassword123!',
            type: 1,
          }),
        (err: any) => err instanceof BizError && err.message === 'user.usernameInvalid'
      );

      // Illegal characters (spaces, script tags)
      await assert.rejects(
        () =>
          userService.add({
            username: '<script>admin</script>',
            password: 'ValidPassword123!',
            type: 1,
          }),
        (err: any) => err instanceof BizError && err.message === 'user.usernameInvalid'
      );
    });
  });
});
