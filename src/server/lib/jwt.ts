import { sign, verify } from 'hono/jwt';
import { type JWTPayload } from 'hono/utils/jwt/types';

// This module handles JWT generation and verification for login sessions.

interface LoginTokenPayload extends JWTPayload {
  userId: string;
  uuid: string;
  tokenVersion?: number;
}

// Retrieve JWT secret from environment and fail fast if missing.
function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET?.trim();
  if (!secret) {
    throw new Error('FATAL: [SECURITY] JWT_SECRET environment variable is required for authentication but not set in environment.');
  }
  return secret;
}

// Generate and return a JWT token after successful login.
async function createLoginToken(userId: string, uuid: string, tokenVersion: number): Promise<string> {
  const secret = getJwtSecret();
  const now = Math.floor(Date.now() / 1000);
  const payload: LoginTokenPayload = {
    userId,
    uuid,
    tokenVersion,
    iat: now,
    exp: now + 60 * 60 * 24 * 30,
  };

  return sign(payload, secret);
}

// Verify login JWT safely without throwing uncaught exceptions.
async function verifyLoginToken(token: string | undefined): Promise<LoginTokenPayload | null> {
  if (!token) {
    return null;
  }

  const secret = process.env.JWT_SECRET?.trim();
  if (!secret) {
    console.error('FATAL: [SECURITY] JWT_SECRET is not configured — token verification rejected.');
    return null;
  }

  try {
    const payload = await verify(token, secret, 'HS256');

    if (
      typeof payload.userId !== 'string'
      || typeof payload.uuid !== 'string'
      || (payload.tokenVersion !== undefined
        && (!Number.isInteger(payload.tokenVersion) || Number(payload.tokenVersion) < 1))
    ) {
      return null;
    }

    return payload as LoginTokenPayload;
  } catch {
    return null;
  }
}

export { createLoginToken, verifyLoginToken };
export type { LoginTokenPayload };
