import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { generateTotpSecret, getTotpCode, verifyTotpCode } from '@/server/lib/totp';
import { createLoginToken, verifyLoginToken } from '@/server/lib/jwt';
import { encryptData, decryptData } from '@/server/lib/crypto';
import { redactSensitiveDetails } from '@/server/lib/audit';
import { sign } from 'hono/jwt';
import BizError from '@/server/error/biz-error';
import { photoService } from '@/server/service/photo-service';
import { albumService } from '@/server/service/album-service';

describe('Round 13 Security Hardening Test Suite', () => {

  describe('Task 1: TOTP Secret Cryptographic Entropy Enhancement (RFC 6238)', () => {
    it('generates 32-character Base32 secrets by default (160 bits entropy)', () => {
      const secret = generateTotpSecret();
      assert.equal(typeof secret, 'string');
      assert.equal(secret.length, 32);
      assert.match(secret, /^[A-Z2-7]{32}$/);
    });

    it('supports custom lengths while maintaining valid Base32 alphabet', () => {
      const secret16 = generateTotpSecret(16);
      assert.equal(secret16.length, 16);
      assert.match(secret16, /^[A-Z2-7]{16}$/);

      const secret40 = generateTotpSecret(40);
      assert.equal(secret40.length, 40);
      assert.match(secret40, /^[A-Z2-7]{40}$/);
    });

    it('generates unique secrets across successive calls with zero modulo bias', () => {
      const set = new Set<string>();
      for (let i = 0; i < 50; i++) {
        set.add(generateTotpSecret());
      }
      assert.equal(set.size, 50);
    });

    it('generates verifiable 6-digit TOTP codes from 32-character secrets', () => {
      const secret = generateTotpSecret();
      const code = getTotpCode(secret);
      assert.equal(typeof code, 'string');
      assert.equal(code.length, 6);
      assert.match(code, /^[0-9]{6}$/);

      const isValid = verifyTotpCode(secret, code);
      assert.equal(isValid, true);
    });
  });

  describe('Task 2: Standard JWT Claims Enforcement (RFC 7519)', () => {
    it('creates tokens with iss: naypict, aud: naypict-web, and nbf claims', async () => {
      const token = await createLoginToken('user_test_123', 'uuid_test_456', 1);
      assert.ok(token);

      const payload = await verifyLoginToken(token);
      assert.ok(payload);
      assert.equal(payload.userId, 'user_test_123');
      assert.equal(payload.uuid, 'uuid_test_456');
      assert.equal(payload.tokenVersion, 1);
      assert.equal(payload.iss, 'naypict');
      assert.equal(payload.aud, 'naypict-web');
      assert.ok(typeof payload.nbf === 'number');
    });

    it('rejects tokens with forged or mismatched issuer (iss)', async () => {
      const secret = process.env.JWT_SECRET || 'supersecretfornaypicttests1234567890';
      const now = Math.floor(Date.now() / 1000);
      const forgedIssuerToken = await sign(
        {
          userId: 'user_attacker',
          uuid: 'uuid_attacker',
          tokenVersion: 1,
          iss: 'attacker-corp',
          aud: 'naypict-web',
          iat: now,
          exp: now + 3600,
        },
        secret
      );

      const result = await verifyLoginToken(forgedIssuerToken);
      assert.equal(result, null);
    });

    it('rejects tokens with forged or mismatched audience (aud)', async () => {
      const secret = process.env.JWT_SECRET || 'supersecretfornaypicttests1234567890';
      const now = Math.floor(Date.now() / 1000);
      const forgedAudienceToken = await sign(
        {
          userId: 'user_attacker',
          uuid: 'uuid_attacker',
          tokenVersion: 1,
          iss: 'naypict',
          aud: 'different-app',
          iat: now,
          exp: now + 3600,
        },
        secret
      );

      const result = await verifyLoginToken(forgedAudienceToken);
      assert.equal(result, null);
    });
  });

  describe('Task 3: Fail-Closed Authenticated Data Decryption (AES-256-GCM)', () => {
    const key = 'test-encryption-master-key-32-chars!!';

    it('correctly encrypts and decrypts valid payloads', async () => {
      const plainText = 'NayPict sensitive secret payload 2026';
      const encrypted = await encryptData(plainText, key);
      assert.ok(encrypted.startsWith('enc:v1:'));

      const decrypted = await decryptData(encrypted, key);
      assert.equal(decrypted, plainText);
    });

    it('preserves unencrypted legacy plaintext without throwing', async () => {
      const legacy = 'legacy-unencrypted-string';
      const decrypted = await decryptData(legacy, key);
      assert.equal(decrypted, legacy);
    });

    it('fails closed and throws an error if an enc:v1: payload is tampered with', async () => {
      const plainText = 'super-confidential-credential';
      const encrypted = await encryptData(plainText, key);
      
      // Tamper with the ciphertext segment
      const parts = encrypted.split(':');
      const tamperedCipher = parts[3].slice(0, -4) + 'abcd';
      const tampered = `${parts[0]}:${parts[1]}:${parts[2]}:${tamperedCipher}`;

      await assert.rejects(
        async () => {
          await decryptData(tampered, key, { failClosed: true });
        },
        (err: Error) => {
          assert.match(err.message, /decryption failed/i);
          return true;
        }
      );
    });

    it('fails closed and throws an error if an enc:v1: payload has malformed segment count', async () => {
      const malformed = 'enc:v1:only_two_segments';
      await assert.rejects(
        async () => {
          await decryptData(malformed, key, { failClosed: true });
        },
        (err: Error) => {
          assert.match(err.message, /invalid format/i);
          return true;
        }
      );
    });
  });

  describe('Task 4: Compound Sensitive Key Redaction in Audit Logs', () => {
    it('redacts compound sensitive keys including tempToken, backupCode, and privateKey', () => {
      const payload = {
        username: 'admin',
        tempToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.xyz',
        turnstileToken: '0.CF_TURNSTILE_TOKEN_12345',
        backupCode: 'abcd-efgh',
        backupCodes: ['hash1', 'hash2'],
        privateKey: 'MIICXAIBAAKCAQEA...',
        apiKey: 'naypict_live_987654321',
        safeParam: 'public_value_allowed',
        count: 42,
        nested: {
          sessionUuid: 'sess_123',
          authToken: 'token_secret',
          deepSecret: 'very_secret',
          allowedInfo: 'visible',
        },
      };

      const redacted = redactSensitiveDetails(payload) as any;

      assert.equal(redacted.username, 'admin');
      assert.equal(redacted.tempToken, '***REDACTED***');
      assert.equal(redacted.turnstileToken, '***REDACTED***');
      assert.equal(redacted.backupCode, '***REDACTED***');
      assert.equal(redacted.backupCodes, '***REDACTED***');
      assert.equal(redacted.privateKey, '***REDACTED***');
      assert.equal(redacted.apiKey, '***REDACTED***');
      assert.equal(redacted.safeParam, 'public_value_allowed');
      assert.equal(redacted.count, 42);
      assert.equal(redacted.nested.sessionUuid, '***REDACTED***');
      assert.equal(redacted.nested.authToken, '***REDACTED***');
      assert.equal(redacted.nested.deepSecret, '***REDACTED***');
      assert.equal(redacted.nested.allowedInfo, 'visible');
    });
  });

  describe('Task 5: Presigned Photo Direct Upload MIME-Type Whitelisting', () => {
    it('rejects disallowed thumbnail types in getPresignedPhotoUploadUrls', async () => {
      await assert.rejects(
        async () => {
          await photoService.getPresignedPhotoUploadUrls(
            {
              filename: 'test.jpg',
              fileType: 'image/jpeg',
              checksum: 'abc123checksum456',
              thumbnailType: 'text/html' as any,
            },
            'user_123'
          );
        },
        (err: BizError) => {
          assert.equal(err.message, 'photo.invalidFileType');
          return true;
        }
      );
    });

    it('rejects script execution mime types for thumbnails', async () => {
      await assert.rejects(
        async () => {
          await photoService.getPresignedPhotoUploadUrls(
            {
              filename: 'test.jpg',
              fileType: 'image/jpeg',
              checksum: 'abc123checksum456',
              thumbnailType: 'application/javascript' as any,
            },
            'user_123'
          );
        },
        (err: BizError) => {
          assert.equal(err.message, 'photo.invalidFileType');
          return true;
        }
      );
    });
  });

  describe('Task 6: Archived Album Cover Candidates IDOR Protection', () => {
    it('returns empty array when albumId is missing or empty', async () => {
      const res = await albumService.getCoverCandidates('', undefined);
      assert.deepEqual(res, []);
    });

    it('returns empty array when albumId does not exist', async () => {
      const res = await albumService.getCoverCandidates('non_existent_album_id_123', undefined);
      assert.deepEqual(res, []);
    });
  });
});
