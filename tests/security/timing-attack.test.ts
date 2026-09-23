import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const encoder = new TextEncoder();

// Constant-time string equality comparison to prevent timing attacks.
function timingSafeEqual(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') {
    return false;
  }

  const bufA = encoder.encode(a);
  const bufB = encoder.encode(b);

  if (bufA.length !== bufB.length) {
    return false;
  }

  let result = 0;
  for (let i = 0; i < bufA.length; i++) {
    result |= bufA[i] ^ bufB[i];
  }

  return result === 0;
}

describe('Cryptographic Timing-Attack Defense Test Suite', () => {
  it('correctly matches identical secret strings', () => {
    assert.strictEqual(
      timingSafeEqual('Bearer secret-token-12345', 'Bearer secret-token-12345'),
      true
    );
    assert.strictEqual(
      timingSafeEqual('super-secure-cron-secret-key-xyz', 'super-secure-cron-secret-key-xyz'),
      true
    );
  });

  it('rejects different strings of same length without throwing exceptions', () => {
    assert.strictEqual(
      timingSafeEqual('Bearer secret-token-12345', 'Bearer secret-token-12349'),
      false
    );
    assert.strictEqual(
      timingSafeEqual('A'.repeat(32), 'B'.repeat(32)),
      false
    );
  });

  it('rejects strings of different length immediately and safely', () => {
    assert.strictEqual(
      timingSafeEqual('Bearer secret', 'Bearer secret-extended'),
      false
    );
    assert.strictEqual(
      timingSafeEqual('', 'Bearer 123'),
      false
    );
  });

  it('safely handles non-string and malformed inputs', () => {
    // @ts-expect-error Testing runtime invalid types
    assert.strictEqual(timingSafeEqual(null, 'secret'), false);
    // @ts-expect-error Testing runtime invalid types
    assert.strictEqual(timingSafeEqual(undefined, 'secret'), false);
    // @ts-expect-error Testing runtime invalid types
    assert.strictEqual(timingSafeEqual({}, {}), false);
  });
});
