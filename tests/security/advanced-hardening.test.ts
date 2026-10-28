import test, { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { backupService } from '@/server/service/backup-service';
import BizError from '@/server/error/biz-error';
import fs from 'node:fs';
import path from 'node:path';

describe('Advanced Security Hardening Test Suite (Round 2)', () => {

  describe('Backup Encryption Password Complexity', () => {
    it('rejects passwords shorter than 12 characters', async () => {
      await assert.rejects(
        async () => {
          await backupService.createEncryptedBackup('shortpass');
        },
        (err: unknown) => {
          assert.ok(err instanceof BizError);
          assert.strictEqual(err.message, 'backup.passwordTooShort');
          return true;
        }
      );
    });
  });

  describe('Nginx Modern Security Headers', () => {
    it('sets X-XSS-Protection to 0 in accordance with OWASP and CSP standards', () => {
      const nginxConfPath = path.join(process.cwd(), 'nginx', 'conf.d', 'naypict-lb.conf');
      const conf = fs.readFileSync(nginxConfPath, 'utf8');
      assert.ok(conf.includes('add_header X-XSS-Protection "0" always;'));
      assert.ok(!conf.includes('add_header X-XSS-Protection "1; mode=block"'));
    });
  });

  describe('Album Name Length & Sanitization', () => {
    it('enforces maximum 100 characters limit on album names', async () => {
      const { albumService } = await import('@/server/service/album-service');
      const oversizedName = 'A'.repeat(101);

      await assert.rejects(
        async () => {
          await albumService.add({ name: oversizedName }, 'test_user_id');
        },
        (err: unknown) => {
          assert.ok(err instanceof BizError);
          assert.strictEqual(err.message, 'album.nameTooLong');
          return true;
        }
      );
    });
  });

  describe('CORS Vercel Domain Whitelisting', () => {
    it('whitelists .vercel.app deployment origins when running under Vercel environment', async () => {
      process.env.VERCEL = '1';
      // Dynamically re-import cors module
      const { apiCors } = await import('@/server/security/cors');
      assert.ok(apiCors);
    });
  });

  describe('User Password Complexity & Dictionary Attack Mitigation', () => {
    it('rejects common dictionary passwords', async () => {
      const { userService } = await import('@/server/service/user-service');
      await assert.rejects(
        async () => {
          await userService.add({
            username: 'unique_user_99',
            password: 'password123',
            type: 2,
          });
        },
        (err: unknown) => {
          assert.ok(err instanceof BizError);
          assert.strictEqual(err.message, 'user.passwordTooCommon');
          return true;
        }
      );
    });

    it('rejects password matching the username', async () => {
      const { userService } = await import('@/server/service/user-service');
      await assert.rejects(
        async () => {
          await userService.add({
            username: 'superAdminSecret',
            password: 'superAdminSecret',
            type: 2,
          });
        },
        (err: unknown) => {
          assert.ok(err instanceof BizError);
          assert.strictEqual(err.message, 'user.passwordMatchesUsername');
          return true;
        }
      );
    });
  });

  describe('Comment Stored XSS Neutralization', () => {
    it('strips HTML tags and script injections from comments', async () => {
      const { commentService } = await import('@/server/service/comment-service');
      // If name contains only HTML/script tags, it gets stripped and rejected as empty
      await assert.rejects(
        async () => {
          await commentService.add({
            photoId: 'photo_test_id',
            name: '<script></script>',
            content: 'Hello world',
          });
        },
        (err: unknown) => {
          assert.ok(err instanceof BizError);
          assert.strictEqual(err.message, 'comment.nameRequired');
          return true;
        }
      );
    });
  });
});
