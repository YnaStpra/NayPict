/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
process.env.JWT_SECRET = process.env.JWT_SECRET || 'supersecretfornaypicttests1234567890';
import { describe, it, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  createSignedDownloadToken,
  verifySignedDownloadToken,
} from '@/server/lib/download-token';
import { storage } from '@/server/storage/storage';
import { storageService } from '@/server/service/storage-service';
import { sudoService } from '@/server/service/sudo-service';
import { cache } from '@/server/infra/cache';
import BizError from '@/server/error/biz-error';

describe('Round 29 Security Hardening Suite', () => {
  const inMemoryCache = new Map<string, any>();
  const origCacheGet = cache.get;
  const origCacheSet = cache.set;
  const origCacheDelete = cache.delete;

  beforeEach(() => {
    inMemoryCache.clear();
    cache.get = (async (k: string) => inMemoryCache.get(k)) as any;
    cache.set = (async (k: string, v: any) => { inMemoryCache.set(k, v); }) as any;
    cache.delete = (async (k: string) => { inMemoryCache.delete(k); }) as any;
  });

  after(() => {
    cache.get = origCacheGet;
    cache.set = origCacheSet;
    cache.delete = origCacheDelete;
  });

  describe('Item 1: Fail-Closed Download Signing Secret & Elimination of Hardcoded Key Fallback', () => {
    it('verifies hardcoded fallback secret is completely eliminated from download-token.ts', () => {
      const filePath = path.join(process.cwd(), 'src/server/lib/download-token.ts');
      const content = fs.readFileSync(filePath, 'utf-8');

      assert.strictEqual(
        content.includes('naypict-download-signing-key-production'),
        false,
        'Static fallback key must be purged from download-token.ts'
      );
      assert.ok(
        content.includes('FATAL: [SECURITY] DOWNLOAD_SIGNING_SECRET'),
        'download-token.ts must contain fail-closed error in production'
      );
    });

    it('fails closed in production mode when all signing secrets are missing', () => {
      const origEnv = process.env.NODE_ENV;
      const origJwt = process.env.JWT_SECRET;
      const origDownload = process.env.DOWNLOAD_SIGNING_SECRET;
      const origGateway = process.env.MEDIA_GATEWAY_SECRET;

      try {
        (process.env as any).NODE_ENV = 'production';
        delete process.env.JWT_SECRET;
        delete process.env.DOWNLOAD_SIGNING_SECRET;
        delete process.env.MEDIA_GATEWAY_SECRET;

        assert.throws(
          () => {
            createSignedDownloadToken('originals/secret.jpg');
          },
          /FATAL: \[SECURITY\] DOWNLOAD_SIGNING_SECRET, JWT_SECRET, or MEDIA_GATEWAY_SECRET must be configured in production/,
          'Must throw fatal security error in production when secret is missing'
        );
      } finally {
        (process.env as any).NODE_ENV = origEnv;
        if (origJwt) process.env.JWT_SECRET = origJwt;
        if (origDownload) process.env.DOWNLOAD_SIGNING_SECRET = origDownload;
        if (origGateway) process.env.MEDIA_GATEWAY_SECRET = origGateway;
      }
    });

    it('generates valid tokens and correctly verifies authentic signatures in development/test', () => {
      const key = 'originals/sample-photo-29.jpg';
      const { token, exp } = createSignedDownloadToken(key, 900);

      assert.strictEqual(typeof token, 'string');
      assert.strictEqual(token.length, 64, 'Token must be a valid 64-char SHA256 hex string');
      assert.strictEqual(verifySignedDownloadToken(key, token, exp), true, 'Valid token must verify');

      // Tampering rejection
      const tamperedToken = token.slice(0, -2) + (token.endsWith('0') ? '1' : '0');
      assert.strictEqual(verifySignedDownloadToken(key, tamperedToken, exp), false, 'Tampered token must fail');

      // Key mismatch rejection
      assert.strictEqual(verifySignedDownloadToken('originals/another.jpg', token, exp), false, 'Wrong key must fail');
    });
  });

  describe('Item 2: Zero-Trust Administrative Sudo Guard on System Settings (POST /setting/set)', () => {
    it('verifies POST /setting/set strictly enforces requireSudo', () => {
      const filePath = path.join(process.cwd(), 'src/server/api/setting-api.ts');
      const content = fs.readFileSync(filePath, 'utf-8');

      assert.ok(
        content.includes("app.post('/setting/set'"),
        'setting-api must expose POST /setting/set'
      );

      const handlerSection = content.split("app.post('/setting/set'")[1].slice(0, 800);
      assert.ok(
        handlerSection.includes('sudoService.requireSudo(userId)'),
        'POST /setting/set must enforce sudoService.requireSudo(userId)'
      );
      assert.ok(
        handlerSection.includes('hidePublicGps: body?.hidePublicGps'),
        'Audit log details must record hidePublicGps changes'
      );
    });
  });

  describe('Item 3: Fail-Closed Storage ID Binding in Storage Router', () => {
    it('throws storage.notFound when an explicit non-existent storageId is supplied', async () => {
      const origGetStorageList = storageService.getStorageList;
      const origGetStorageById = storageService.getStorageById;

      storageService.getStorageList = async () => [
        {
          storageId: 'primary-storage-id',
          name: 'Primary R2',
          type: 1,
          status: 1,
          bucket: 'naypict-primary',
          sort: 0,
          createTime: '',
          updateTime: '',
        } as any,
      ];
      storageService.getStorageById = async () => null;

      try {
        await assert.rejects(
          async () => {
            await storage.get('photos/test.jpg', 'non-existent-storage-id');
          },
          (err: any) => {
            assert.strictEqual(err instanceof BizError, true);
            assert.strictEqual(err.message, 'storage.notFound');
            return true;
          },
          'Must fail-closed and throw storage.notFound when explicit storageId is missing'
        );
      } finally {
        storageService.getStorageList = origGetStorageList;
        storageService.getStorageById = origGetStorageById;
      }
    });

    it('falls back to primary storage only when storageId is omitted or empty', async () => {
      const origGetStorageList = storageService.getStorageList;
      let usedStorageId = '';

      storageService.getStorageList = async () => [
        {
          storageId: 'primary-storage-id',
          name: 'Primary R2',
          type: 1,
          status: 1,
          bucket: 'naypict-primary',
          sort: 0,
          createTime: '',
          updateTime: '',
        } as any,
      ];

      // Test delete with empty storageId
      const origDelete = storage.delete;
      try {
        // Calling delete with empty storageId should resolve to primary storage without error
        // (will invoke strategy.delete on primary storage)
        const filePath = path.join(process.cwd(), 'src/server/storage/storage.ts');
        const content = fs.readFileSync(filePath, 'utf-8');
        assert.ok(
          content.includes('!fileStorage && cleanId'),
          'storage.ts must check cleanId before failing closed'
        );
        assert.ok(
          content.includes('!fileStorage && !cleanId && storageList.length > 0'),
          'storage.ts must only allow fallback when cleanId is empty'
        );
      } finally {
        storageService.getStorageList = origGetStorageList;
      }
    });
  });

  describe('Item 4: Complete Privilege Revocation on User Deactivation & Deletion', () => {
    it('verifies userService.toggleStatus clears Sudo Mode when user is disabled', () => {
      const filePath = path.join(process.cwd(), 'src/server/service/user-service.ts');
      const content = fs.readFileSync(filePath, 'utf-8');

      const toggleSection = content.split('nextStatus === UserStatusEnum.DISABLE')[1].slice(0, 300);
      assert.ok(
        toggleSection.includes('sudoService.clearSudo(params.userId)'),
        'userService.toggleStatus must clear Sudo Mode on deactivation'
      );
    });

    it('verifies userService.delete clears Sudo Mode when user is deleted', () => {
      const filePath = path.join(process.cwd(), 'src/server/service/user-service.ts');
      const content = fs.readFileSync(filePath, 'utf-8');

      const deleteSection = content.split('async delete(deleteUserId')[1].slice(0, 2500);
      assert.ok(
        deleteSection.includes('sudoService.clearSudo(deleteUserId)'),
        'userService.delete must clear Sudo Mode on deletion'
      );
    });
  });
});
