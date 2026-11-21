import crypto from 'node:crypto';

/**
 * Short-Lived HMAC Signed Download Token Utility.
 * Prevents hotlinking, scraping, and link leeching of full-resolution media downloads.
 */

function getDownloadSigningSecret(): string {
  return process.env.JWT_SECRET || process.env.MEDIA_GATEWAY_SECRET || 'naypict-download-signing-key-production';
}

/**
 * Creates a signed HMAC-SHA256 download token valid for the specified duration (default 15 minutes / 900 seconds).
 */
export function createSignedDownloadToken(
  key: string,
  expiresInSeconds: number = 900
): { token: string; exp: number } {
  const exp = Math.floor(Date.now() / 1000) + Math.max(60, expiresInSeconds);
  const secret = getDownloadSigningSecret();
  const payload = `${key}:${exp}`;
  const token = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  return { token, exp };
}

/**
 * Validates a signed HMAC-SHA256 download token against expiration and key matching.
 * Performs constant-time timing-safe comparison to prevent timing side-channel attacks.
 */
export function verifySignedDownloadToken(
  key: string,
  token: string | undefined,
  exp: number | string | undefined
): boolean {
  if (!key || !token || !exp) {
    return false;
  }

  const numericExp = typeof exp === 'string' ? Number.parseInt(exp, 10) : exp;
  if (!numericExp || Number.isNaN(numericExp)) {
    return false;
  }

  const nowSec = Math.floor(Date.now() / 1000);
  // Expired token check (allow 30-second clock skew buffer)
  if (nowSec > numericExp + 30) {
    return false;
  }

  const secret = getDownloadSigningSecret();
  const payload = `${key}:${numericExp}`;
  const expectedToken = crypto.createHmac('sha256', secret).update(payload).digest('hex');

  const givenBuffer = Buffer.from(token, 'hex');
  const expectedBuffer = Buffer.from(expectedToken, 'hex');

  if (givenBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(givenBuffer, expectedBuffer);
}

/**
 * Constructs a full signed download URL with query parameters.
 */
export function buildSignedDownloadUrl(
  key: string,
  expiresInSeconds: number = 900,
  baseUrl: string = '/media/'
): string {
  const { token, exp } = createSignedDownloadToken(key, expiresInSeconds);
  const encodedKey = encodeURIComponent(key);
  const cleanBase = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  return `${cleanBase}${encodedKey}?download=1&token=${token}&exp=${exp}`;
}
