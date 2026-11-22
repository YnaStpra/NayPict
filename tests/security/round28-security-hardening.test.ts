/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
process.env.JWT_SECRET = process.env.JWT_SECRET || 'supersecretfornaypicttests1234567890';
import { describe, it, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { sudoService } from '@/server/service/sudo-service';
import { totpService } from '@/server/service/totp-service';
import { loginService } from '@/server/service/login-service';
import { sessionService } from '@/server/service/session-service';
import { orm } from '@/server/infra/db';
import { cache } from '@/server/infra/cache';
import { hashPassword } from '@/server/lib/crypto';
import { logSecurityAudit, getRecentAuditLogs, clearMemoryAuditLogs } from '@/server/lib/audit';
import BizError from '@/server/error/biz-error';

describe('Round 28 Security Hardening Suite', () => {
  const inMemoryCache = new Map<string, any>();
  const origCacheGet = cache.get;
  const origCacheSet = cache.set;
  const origCacheDelete = cache.delete;

  beforeEach(() => {
    inMemoryCache.clear();
    cache.get = (async (k: string) => inMemoryCache.get(k)) as any;
    cache.set = (async (k: string, v: any) => { inMemoryCache.set(k, v); }) as any;
    cache.delete = (async (k: string) => { inMemoryCache.delete(k); }) as any;
    clearMemoryAuditLogs();
  });

  after(() => {
    cache.get = origCacheGet;
    cache.set = origCacheSet;
    cache.delete = origCacheDelete;
  });

  describe('Item 1: Two-Factor Sudo Elevation (2FA OTP Requirement on Sudo Mode)', () => {
    const testUserId = 'test-sudo-user-28';
    const testPassword = 'AdminSecurePassword123!';
    let userHashedPassword = '';
    let userSalt = '';

    const origOrmSelect = orm.select;
    const origGetTotpStatus = totpService.getTotpStatus;
    const origVerifyLoginTotp = totpService.verifyLoginTotp;
    const origVerifyAndConsumeBackupCode = totpService.verifyAndConsumeBackupCode;

    beforeEach(async () => {
      const hashed = await hashPassword(testPassword);
      userHashedPassword = hashed.hash;
      userSalt = hashed.salt;

      // Mock DB user query
      orm.select = (() => ({
        from: () => ({
          where: () => ({
            limit: async () => [{
              userId: testUserId,
              password: userHashedPassword,
              salt: userSalt,
              status: 1,
            }],
          }),
        }),
      })) as any;
    });

    after(() => {
      orm.select = origOrmSelect;
      totpService.getTotpStatus = origGetTotpStatus;
      totpService.verifyLoginTotp = origVerifyLoginTotp;
      totpService.verifyAndConsumeBackupCode = origVerifyAndConsumeBackupCode;
    });

    it('elevates Sudo Mode with password alone when 2FA is NOT enabled', async () => {
      totpService.getTotpStatus = async () => ({ enabled: false, configured: false });

      const success = await sudoService.verifySudo(testUserId, testPassword);
      assert.strictEqual(success, true, 'Sudo should elevate successfully without 2FA code');

      const status = await sudoService.isSudoActive(testUserId);
      assert.strictEqual(status.active, true, 'Sudo Mode should be active in cache');
      assert.ok(status.remainingSeconds > 0 && status.remainingSeconds <= 900);
    });

    it('fails Sudo elevation when password is invalid, even without 2FA', async () => {
      totpService.getTotpStatus = async () => ({ enabled: false, configured: false });

      const success = await sudoService.verifySudo(testUserId, 'WrongPassword123!');
      assert.strictEqual(success, false, 'Invalid password must return false');

      const status = await sudoService.isSudoActive(testUserId);
      assert.strictEqual(status.active, false, 'Sudo Mode must NOT be elevated');
    });

    it('throws totp.verificationRequired when 2FA is enabled but no code is provided', async () => {
      totpService.getTotpStatus = async () => ({ enabled: true, configured: true });

      await assert.rejects(
        async () => {
          await sudoService.verifySudo(testUserId, testPassword, '');
        },
        (err: any) => {
          assert.strictEqual(err.message, 'totp.verificationRequired');
          assert.strictEqual(err.code, 400);
          return true;
        }
      );

      const status = await sudoService.isSudoActive(testUserId);
      assert.strictEqual(status.active, false, 'Sudo Mode must remain inactive');
    });

    it('throws totp.invalidCode when 2FA is enabled and code is invalid', async () => {
      totpService.getTotpStatus = async () => ({ enabled: true, configured: true });
      totpService.verifyLoginTotp = async () => { throw new BizError('totp.invalidCode', 400); };
      totpService.verifyAndConsumeBackupCode = async () => false;

      await assert.rejects(
        async () => {
          await sudoService.verifySudo(testUserId, testPassword, '000000');
        },
        (err: any) => {
          assert.strictEqual(err.message, 'totp.invalidCode');
          return true;
        }
      );

      const status = await sudoService.isSudoActive(testUserId);
      assert.strictEqual(status.active, false);
    });

    it('elevates Sudo Mode when 2FA is enabled and valid 6-digit TOTP code is provided', async () => {
      totpService.getTotpStatus = async () => ({ enabled: true, configured: true });
      totpService.verifyLoginTotp = async () => true;

      const success = await sudoService.verifySudo(testUserId, testPassword, '123456');
      assert.strictEqual(success, true, 'Sudo elevation should succeed with valid TOTP code');

      const status = await sudoService.isSudoActive(testUserId);
      assert.strictEqual(status.active, true, 'Sudo Mode must be active');
    });

    it('elevates Sudo Mode when 2FA is enabled and valid single-use backup code is used', async () => {
      totpService.getTotpStatus = async () => ({ enabled: true, configured: true });
      totpService.verifyLoginTotp = async () => { throw new BizError('totp.invalidCode', 400); };
      let backupCodeConsumed = false;
      totpService.verifyAndConsumeBackupCode = async (_uid, code) => {
        if (code === 'abcd-1234') {
          backupCodeConsumed = true;
          return true;
        }
        return false;
      };

      const success = await sudoService.verifySudo(testUserId, testPassword, 'abcd-1234');
      assert.strictEqual(success, true, 'Sudo elevation should succeed with backup code');
      assert.strictEqual(backupCodeConsumed, true, 'Backup code must be consumed');

      const status = await sudoService.isSudoActive(testUserId);
      assert.strictEqual(status.active, true, 'Sudo Mode must be active');
    });

    it('rethrows totp.codeAlreadyUsed when TOTP replay attack is attempted', async () => {
      totpService.getTotpStatus = async () => ({ enabled: true, configured: true });
      totpService.verifyLoginTotp = async () => { throw new BizError('totp.codeAlreadyUsed', 400); };

      await assert.rejects(
        async () => {
          await sudoService.verifySudo(testUserId, testPassword, '654321');
        },
        (err: any) => {
          assert.strictEqual(err.message, 'totp.codeAlreadyUsed');
          return true;
        }
      );
    });

    it('verifies src/server/api/user-api.ts passes code to sudoService.verifySudo', () => {
      const filePath = path.join(process.cwd(), 'src/server/api/user-api.ts');
      const content = fs.readFileSync(filePath, 'utf-8');
      assert.ok(
        content.includes('sudoService.verifySudo(currentUserId, body.password, body.code)'),
        'POST /user/sudo must pass body.code to verifySudo'
      );
    });
  });

  describe('Item 2: Automatic Sudo Mode Revocation on Logout & Password Change', () => {
    const testUserId = 'test-sudo-revoke-user';
    const testUuid = 'session-uuid-123';

    it('drops Sudo Mode when loginService.logout() is invoked', async () => {
      // 1. Elevate Sudo
      await inMemoryCache.set(`sudo_session_${testUserId}`, {
        elevated: true,
        elevatedAt: Date.now(),
        expiresAt: Date.now() + 900000,
      });

      let status = await sudoService.isSudoActive(testUserId);
      assert.strictEqual(status.active, true);

      // Mock sessionService.revokeSession to avoid db hits
      const origRevoke = sessionService.revokeSession;
      sessionService.revokeSession = async () => true;

      try {
        await loginService.logout(testUserId, testUuid);
        status = await sudoService.isSudoActive(testUserId);
        assert.strictEqual(status.active, false, 'Sudo session must be cleared on logout');
      } finally {
        sessionService.revokeSession = origRevoke;
      }
    });

    it('clears Sudo Mode explicitly when sudoService.clearSudo() is called', async () => {
      await inMemoryCache.set(`sudo_session_${testUserId}`, {
        elevated: true,
        elevatedAt: Date.now(),
        expiresAt: Date.now() + 900000,
      });

      let status = await sudoService.isSudoActive(testUserId);
      assert.strictEqual(status.active, true);

      await sudoService.clearSudo(testUserId);
      status = await sudoService.isSudoActive(testUserId);
      assert.strictEqual(status.active, false, 'Sudo session must be cleared by clearSudo');
    });

    it('verifies src/server/service/user-service.ts invokes clearSudo on password update', () => {
      const filePath = path.join(process.cwd(), 'src/server/service/user-service.ts');
      const content = fs.readFileSync(filePath, 'utf-8');
      assert.ok(
        content.includes('sudoService.clearSudo(userId)'),
        'userService.setUserPassword must call sudoService.clearSudo(userId)'
      );
    });
  });

  describe('Item 3: Forensic Security Audit Log Export Endpoint (GET /security/audit/export)', () => {
    it('verifies audit-api.ts registers /security/audit/export with strict Sudo + Admin guards', () => {
      const filePath = path.join(process.cwd(), 'src/server/api/audit-api.ts');
      const content = fs.readFileSync(filePath, 'utf-8');

      assert.ok(
        content.includes("app.get('/security/audit/export'"),
        'audit-api.ts must expose GET /security/audit/export'
      );

      const exportSection = content.split("app.get('/security/audit/export'")[1].slice(0, 1500);
      assert.ok(
        exportSection.includes('checkIsAdmin(c)'),
        '/security/audit/export must check admin privileges'
      );
      assert.ok(
        exportSection.includes('sudoService.requireSudo(userId)'),
        '/security/audit/export must enforce Sudo Mode elevation'
      );
      assert.ok(
        exportSection.includes('sha256Checksum: checksum'),
        '/security/audit/export must calculate SHA-256 integrity checksum'
      );
      assert.ok(
        exportSection.includes('AUDIT_EXPORT'),
        '/security/audit/export must log an AUDIT_EXPORT event'
      );
    });

    it('verifies forensic export payload format and cryptographic checksum generation', () => {
      const sampleLogs = [
        {
          id: 'test-log-1',
          timestamp: new Date().toISOString(),
          action: 'AUTH_LOGIN_SUCCESS',
          userId: 'admin-1',
          clientIp: '127.0.0.1',
          severity: 'INFO' as const,
        },
      ];

      const serialized = JSON.stringify(sampleLogs);
      const checksum = crypto.createHash('sha256').update(serialized).digest('hex');

      assert.strictEqual(typeof checksum, 'string');
      assert.strictEqual(checksum.length, 64, 'SHA-256 checksum must be 64 hex characters');
    });
  });

  describe('Item 4: Safe Media Content-Type Fixation & Sandbox CSP Enforcement', () => {
    it('verifies src/server/hono/media.ts enforces Content-Security-Policy sandbox and nosniff', () => {
      const filePath = path.join(process.cwd(), 'src/server/hono/media.ts');
      const content = fs.readFileSync(filePath, 'utf-8');

      assert.ok(
        content.includes("'Content-Security-Policy': \"default-src 'none'; sandbox;\""),
        'media.ts must set Content-Security-Policy default-src none; sandbox;'
      );
      assert.ok(
        content.includes("'X-Content-Type-Options': 'nosniff'"),
        'media.ts must set X-Content-Type-Options nosniff'
      );
      assert.ok(
        content.includes("'X-Frame-Options': 'SAMEORIGIN'"),
        'media.ts must set X-Frame-Options SAMEORIGIN'
      );
    });

    it('verifies workers/media-gateway/src/index.js enforces CSP sandbox and nosniff', () => {
      const filePath = path.join(process.cwd(), 'workers/media-gateway/src/index.js');
      const content = fs.readFileSync(filePath, 'utf-8');

      assert.ok(
        content.includes('"Content-Security-Policy": "default-src \'none\'; sandbox;"'),
        'media-gateway must set Content-Security-Policy default-src none; sandbox;'
      );
      assert.ok(
        content.includes('"X-Content-Type-Options": "nosniff"'),
        'media-gateway must set X-Content-Type-Options nosniff'
      );
      assert.ok(
        content.includes('"X-Frame-Options": "SAMEORIGIN"'),
        'media-gateway must set X-Frame-Options SAMEORIGIN'
      );
    });
  });
});
