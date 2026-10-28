import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { settingService } from '@/server/service/setting-service';
import { buildContentDisposition } from '@/server/lib/file';
import { totpVerifyRateLimiter, backupExportRateLimiter } from '@/server/lib/rate-limiter';
import { SettingSyncDeleteEnum, SettingWatermarkEnum, SettingPhotoDedupEnum, SettingOnThisDayEnum, SettingRightClickGuardEnum } from '@/server/enums/setting-enum';

describe('Round 3 Security Hardening Test Suite', () => {
  describe('System Setting Boundary & Sanitization', () => {
    it('strictly clamps clearLast to [1, 365] days and sanitizes watermarkText', async () => {
      // Test negative clearLast clamp
      await settingService.set({
        syncDelete: SettingSyncDeleteEnum.ENABLE,
        clearLast: -50,
        photoDedup: SettingPhotoDedupEnum.ENABLE,
        onThisDay: SettingOnThisDayEnum.ENABLE,
        watermarkEnabled: SettingWatermarkEnum.ENABLE,
        watermarkText: 'A'.repeat(200),
        rightClickGuard: SettingRightClickGuardEnum.DISABLE,
      });

      let updated = await settingService.get();
      assert.equal(updated.clearLast, 1, 'clearLast should be clamped to minimum 1 day');
      assert.equal(updated.watermarkText?.length, 100, 'watermarkText should be clamped to maximum 100 characters');

      // Test excessively high clearLast clamp
      await settingService.set({
        syncDelete: SettingSyncDeleteEnum.ENABLE,
        clearLast: 9999,
        photoDedup: SettingPhotoDedupEnum.ENABLE,
        onThisDay: SettingOnThisDayEnum.ENABLE,
        watermarkEnabled: SettingWatermarkEnum.ENABLE,
        watermarkText: '© NayPict',
        rightClickGuard: SettingRightClickGuardEnum.DISABLE,
      });

      updated = await settingService.get();
      assert.equal(updated.clearLast, 365, 'clearLast should be clamped to maximum 365 days');
      assert.equal(updated.watermarkText, '© NayPict');
    });
  });

  describe('RFC 6266 & RFC 5987 Content-Disposition Compliance', () => {
    it('generates standard compliant headers for attachment with unicode characters and spaces', () => {
      const header = buildContentDisposition('Foto Liburan Pantai 2026 📸.jpg', 'attachment');
      assert.ok(header.startsWith('attachment;'), 'Should specify attachment disposition');
      assert.ok(header.includes('filename="'), 'Should include ASCII fallback filename');
      assert.ok(header.includes("filename*=UTF-8''"), 'Should include UTF-8 RFC 5987 parameter');
      assert.ok(!header.includes('\n'), 'Must not contain header injection newlines');
    });

    it('generates standard compliant headers for inline viewing', () => {
      const header = buildContentDisposition('document.pdf');
      assert.ok(header.startsWith('inline;'), 'Should default to inline disposition');
      assert.ok(header.includes('filename="document.pdf"'));
    });
  });

  describe('Rate Limiter Protection on High-Risk Endpoints', () => {
    it('enforces 2FA OTP verification rate limit', async () => {
      const testKey = `test-totp-ratelimit-${Date.now()}`;
      for (let i = 0; i < 5; i++) {
        const res = await totpVerifyRateLimiter.consume(testKey);
        assert.equal(res.allowed, true, `Attempt ${i + 1} should be allowed`);
      }
      const blocked = await totpVerifyRateLimiter.consume(testKey);
      assert.equal(blocked.allowed, false, '6th attempt must be blocked');
    });

    it('enforces database backup export rate limit', async () => {
      const testKey = `test-backup-ratelimit-${Date.now()}`;
      for (let i = 0; i < 3; i++) {
        const res = await backupExportRateLimiter.consume(testKey);
        assert.equal(res.allowed, true, `Export ${i + 1} should be allowed`);
      }
      const blocked = await backupExportRateLimiter.consume(testKey);
      assert.equal(blocked.allowed, false, '4th export attempt must be blocked');
    });
  });
});
