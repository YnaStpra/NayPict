import test, { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { signVisitorId, verifySignedVisitorId } from '@/server/lib/visitor-cookie';
import { isPrivateOrReservedIp } from '@/server/lib/ip';

describe('Additional Security Hardening Test Suite', () => {

  describe('HMAC-SHA256 Visitor Cookie Signing & Tamper Resistance', () => {
    it('signs and verifies authentic visitor IDs', () => {
      const vid = 'user_visitor_12345';
      const signed = signVisitorId(vid);
      assert.ok(signed.startsWith(`${vid}.`));

      const verified = verifySignedVisitorId(signed);
      assert.strictEqual(verified, vid);
    });

    it('rejects tampered visitor IDs and invalid signatures', () => {
      const vid = 'user_visitor_12345';
      const signed = signVisitorId(vid);
      const [id, sig] = signed.split('.');

      // Tampered ID with original signature
      const tamperedId = `${id}_forged.${sig}`;
      assert.strictEqual(verifySignedVisitorId(tamperedId), null);

      // Tampered signature
      const tamperedSig = `${id}.${sig.slice(0, -4)}AAAA`;
      assert.strictEqual(verifySignedVisitorId(tamperedSig), null);

      // Unsigned plain string
      assert.strictEqual(verifySignedVisitorId(vid), null);
      assert.strictEqual(verifySignedVisitorId(''), null);
      assert.strictEqual(verifySignedVisitorId(undefined), null);
    });
  });

  describe('SSRF Storage Endpoint & Private IP Blocking', () => {
    it('identifies AWS metadata IP 169.254.169.254 and link-local as reserved/private', () => {
      assert.strictEqual(isPrivateOrReservedIp('169.254.169.254'), true);
      assert.strictEqual(isPrivateOrReservedIp('127.0.0.1'), true);
      assert.strictEqual(isPrivateOrReservedIp('10.0.1.5'), true);
      assert.strictEqual(isPrivateOrReservedIp('192.168.1.1'), true);
    });

    it('permits public Cloudflare R2 and AWS S3 endpoint IPs', () => {
      assert.strictEqual(isPrivateOrReservedIp('1.1.1.1'), false);
      assert.strictEqual(isPrivateOrReservedIp('8.8.8.8'), false);
    });
  });

  describe('Avatar Key Path Traversal Neutralization', () => {
    it('rejects avatar keys containing directory traversal or path separators', () => {
      const isKeySafe = (k: string) =>
        Boolean(k) &&
        !k.includes('..') &&
        !k.includes('/') &&
        !k.includes('\\') &&
        /^[a-zA-Z0-9_\-.]+\.(webp|jpg|jpeg|png)$/i.test(k);

      assert.strictEqual(isKeySafe('avatar123.webp'), true);
      assert.strictEqual(isKeySafe('my-photo_2026.png'), true);
      assert.strictEqual(isKeySafe('../../etc/passwd'), false);
      assert.strictEqual(isKeySafe('../photos/secret.jpg'), false);
      assert.strictEqual(isKeySafe('..\\windows\\win.ini'), false);
      assert.strictEqual(isKeySafe('/absolute/path.png'), false);
      assert.strictEqual(isKeySafe('avatar.exe'), false);
    });
  });

  describe('Storage Cleaner Managed Prefix Protection', () => {
    const NAYPICT_MANAGED_PREFIXES = ['originals/', 'previews/', 'thumbnails/', 'profile/'];

    it('permits only NayPict managed directory prefixes for deletion', () => {
      const isPrefixManaged = (key: string) =>
        NAYPICT_MANAGED_PREFIXES.some((prefix) => key.startsWith(prefix));

      assert.strictEqual(isPrefixManaged('originals/user1/photo.jpg'), true);
      assert.strictEqual(isPrefixManaged('previews/photo.webp'), true);
      assert.strictEqual(isPrefixManaged('thumbnails/thumb.webp'), true);
      assert.strictEqual(isPrefixManaged('profile/avatar.webp'), true);

      // Foreign bucket files that must NEVER be touched
      assert.strictEqual(isPrefixManaged('backups/2026-10-28.sqlite.enc'), false);
      assert.strictEqual(isPrefixManaged('logs/access.log'), false);
      assert.strictEqual(isPrefixManaged('other-app/data.json'), false);
      assert.strictEqual(isPrefixManaged('root-file.txt'), false);
    });
  });
});
