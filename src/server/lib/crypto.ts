const encoder = new TextEncoder();

interface HashResult {
  salt: string;
  hash: string;
}

// Random salt used to generate password hashes。
export function generateSalt(length: number = 16): string {
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return btoa(String.fromCharCode(...array));
}

// Generate salted password hash。
export async function hashPassword(password: string): Promise<HashResult> {
  const salt = generateSalt();
  const hash = await genHashPassword(password, salt);
  return { salt, hash };
}

// Generated based on password and salt SHA-256 Hash。
export async function genHashPassword(password: string, salt: string): Promise<string> {
  const data = encoder.encode(salt + password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return btoa(String.fromCharCode(...hashArray));
}

// Convert hash binary to hex string。
function hashToHex(buffer: ArrayBuffer) {
  return Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

// calculation file SHA-1 Checksum。
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

// Verify that the entered password matches the saved hash using constant-time comparison.
export async function verifyPassword(inputPassword: string, salt: string, storedHash: string): Promise<boolean> {
  const hash = await genHashPassword(inputPassword, salt);
  return timingSafeEqual(hash, storedHash);
}
