import { argon2id, argon2Verify } from 'hash-wasm';

const encoder = new TextEncoder();

export interface HashResult {
  salt: string;
  hash: string;
}

export interface PasswordVerificationResult {
  valid: boolean;
  needsRehash: boolean;
}

// Random salt used to generate password hashes.
export function generateSalt(length: number = 16): string {
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return btoa(String.fromCharCode(...array));
}

// Detect if a stored hash is using the modern Argon2id format.
export function isArgon2Hash(hash: string | null | undefined): boolean {
  return Boolean(hash && (hash.startsWith('$argon2id$') || hash.startsWith('$argon2')));
}

// Generate salted Argon2id password hash using recommended memory and iteration parameters.
export async function hashPassword(password: string): Promise<HashResult> {
  const saltBytes = new Uint8Array(16);
  crypto.getRandomValues(saltBytes);
  const salt = btoa(String.fromCharCode(...saltBytes));

  const hash = await argon2id({
    password,
    salt: saltBytes,
    parallelism: 1,
    iterations: 3,
    memorySize: 65536, // 64 MB
    hashLength: 32,
    outputType: 'encoded',
  });

  return { salt, hash };
}

// Legacy SHA-256 hash generator for backward compatibility during gradual migration.
export async function genLegacySha256(password: string, salt: string): Promise<string> {
  const data = encoder.encode(salt + password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return btoa(String.fromCharCode(...hashArray));
}

// Alias for legacy calls
export const genHashPassword = genLegacySha256;

// Convert hash binary to hex string.
function hashToHex(buffer: ArrayBuffer) {
  return Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

// Calculate file SHA-1 checksum.
export async function fileChecksum(file: Blob) {
  const hashBuffer = await crypto.subtle.digest('SHA-1', await file.arrayBuffer());
  return hashToHex(hashBuffer);
}

// Constant-time string equality comparison to prevent timing attacks.
export function timingSafeEqual(a: string, b: string): boolean {
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

// Verify entered password with support for both Argon2id and legacy SHA-256.
export async function verifyPasswordDetailed(
  inputPassword: string,
  salt: string,
  storedHash: string
): Promise<PasswordVerificationResult> {
  if (!inputPassword || !storedHash) {
    return { valid: false, needsRehash: false };
  }

  // 1. If stored hash is Argon2id
  if (isArgon2Hash(storedHash)) {
    try {
      const valid = await argon2Verify({
        password: inputPassword,
        hash: storedHash,
      });
      return { valid, needsRehash: false };
    } catch {
      return { valid: false, needsRehash: false };
    }
  }

  // 2. Otherwise, check legacy SHA-256
  const legacyHash = await genLegacySha256(inputPassword, salt);
  const valid = timingSafeEqual(legacyHash, storedHash);

  // If valid with legacy hash, signal that this user needs automatic rehash to Argon2id
  return { valid, needsRehash: valid };
}

// Simple boolean verification function using constant-time comparison.
export async function verifyPassword(
  inputPassword: string,
  salt: string,
  storedHash: string
): Promise<boolean> {
  const result = await verifyPasswordDetailed(inputPassword, salt, storedHash);
  return result.valid;
}
