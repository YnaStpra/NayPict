import crypto from 'crypto';

// Base32 Alphabet for RFC 6238 TOTP (Google Authenticator)
const BASE32_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

// Decode Base32 string to Buffer
function base32Decode(base32: string): Buffer {
  const clean = base32.toUpperCase().replace(/=+$/, '').replace(/[^A-Z2-7]/g, '');
  const bits: number[] = [];
  for (let i = 0; i < clean.length; i++) {
    const val = BASE32_CHARS.indexOf(clean[i]);
    if (val === -1) continue;
    for (let b = 4; b >= 0; b--) {
      bits.push((val >> b) & 1);
    }
  }

  const bytes: number[] = [];
  for (let i = 0; i + 7 < bits.length; i += 8) {
    let byte = 0;
    for (let b = 0; b < 8; b++) {
      byte = (byte << 1) | bits[i + b];
    }
    bytes.push(byte);
  }
  return Buffer.from(bytes);
}

// Generate random 16-character Base32 Secret Key for TOTP
export function generateTotpSecret(length: number = 16): string {
  const randomBytes = crypto.randomBytes(length);
  let secret = '';
  for (let i = 0; i < length; i++) {
    secret += BASE32_CHARS[randomBytes[i] % 32];
  }
  return secret;
}

// Generate single 6-digit TOTP code for given secret and timestamp step
export function getTotpCode(secret: string, timeStep: number = Math.floor(Date.now() / 1000 / 30)): string {
  const key = base32Decode(secret);
  const buffer = Buffer.alloc(8);
  // Write counter as 64-bit big endian integer
  buffer.writeUInt32BE(0, 0);
  buffer.writeUInt32BE(timeStep, 4);

  const hmac = crypto.createHmac('sha1', key).update(buffer).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);

  const otp = (binary % 1000000).toString().padStart(6, '0');
  return otp;
}

// Verify TOTP code with time drift window (+-1 step = 90s margin)
export function verifyTotpCode(secret: string, code: string, window: number = 1): boolean {
  if (!secret || !code || code.length !== 6) return false;
  const cleanCode = code.trim();
  const currentStep = Math.floor(Date.now() / 1000 / 30);

  for (let stepOffset = -window; stepOffset <= window; stepOffset++) {
    const validCode = getTotpCode(secret, currentStep + stepOffset);
    if (validCode === cleanCode) {
      return true;
    }
  }
  return false;
}

// Generate otpauth:// URI for Google Authenticator QR Code
export function generateOtpAuthUrl(secret: string, accountName: string = 'admin', issuer: string = 'NayPict'): string {
  return `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(accountName)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}`;
}

// Generate QR Code image URL via QuickChart QR API
export function getQrCodeImageUrl(otpauthUrl: string): string {
  return `https://quickchart.io/qr?text=${encodeURIComponent(otpauthUrl)}&size=220&margin=1`;
}
