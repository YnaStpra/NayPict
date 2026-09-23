import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// Replicate CSRF validation logic to test boundary and attack vectors
function getHostname(urlOrHost: string): string {
  try {
    if (urlOrHost.includes('://')) {
      return new URL(urlOrHost).hostname.toLowerCase();
    }
    return urlOrHost.split(':')[0].trim().toLowerCase();
  } catch {
    return '';
  }
}

function isOriginAllowed(originOrReferer: string, expectedHost: string, appUrl?: string): boolean {
  if (!originOrReferer) return false;

  const sourceHost = getHostname(originOrReferer);
  const targetHost = getHostname(expectedHost);

  if (!sourceHost || !targetHost) return false;

  if (sourceHost === targetHost) return true;

  const isLocalSource = sourceHost === 'localhost' || sourceHost === '127.0.0.1' || sourceHost === '::1';
  const isLocalTarget = targetHost === 'localhost' || targetHost === '127.0.0.1' || targetHost === '::1';
  if (isLocalSource && isLocalTarget) return true;

  if (appUrl) {
    const appHost = getHostname(appUrl);
    if (appHost && sourceHost === appHost) return true;
  }

  return false;
}

describe('CSRF & Cross-Origin Defense Test Suite', () => {
  const HOST = 'gallery.example.com';

  it('allows same-origin mutations', () => {
    assert.strictEqual(
      isOriginAllowed('https://gallery.example.com', HOST),
      true
    );
    assert.strictEqual(
      isOriginAllowed('https://gallery.example.com:443/albums', HOST),
      true
    );
  });

  it('allows localhost/127.0.0.1 during local development', () => {
    assert.strictEqual(
      isOriginAllowed('http://localhost:3000', 'localhost:3000'),
      true
    );
    assert.strictEqual(
      isOriginAllowed('http://127.0.0.1:3000', '127.0.0.1:3000'),
      true
    );
  });

  it('strictly blocks cross-origin spoofing and malicious attacker origins', () => {
    const maliciousOrigins = [
      'https://evil-attacker.com',
      'https://gallery.example.com.attacker.com',
      'http://attacker-gallery.example.com',
      'http://localhost.attacker.com',
      'https://phishing-gallery.com',
      'http://192.168.1.100'
    ];

    for (const origin of maliciousOrigins) {
      assert.strictEqual(
        isOriginAllowed(origin, HOST),
        false,
        `Origin "${origin}" should be rejected!`
      );
    }
  });

  it('rejects null or empty origin (sandboxed iframe / data: URI attacks)', () => {
    assert.strictEqual(isOriginAllowed('', HOST), false);
    assert.strictEqual(isOriginAllowed('null', HOST), false);
  });

  it('rejects attacker hostname prefix/suffix confusion tricks', () => {
    // Attack: attacker tries prefix like gallery.example.com.attacker.net
    assert.strictEqual(
      isOriginAllowed('https://gallery.example.com.attacker.net', 'gallery.example.com'),
      false
    );
    // Attack: attacker tries username spoofing in URL
    assert.strictEqual(
      isOriginAllowed('https://gallery.example.com@attacker.com', 'gallery.example.com'),
      false
    );
  });
});
