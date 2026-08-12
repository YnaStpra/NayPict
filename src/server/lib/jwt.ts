import { sign, verify } from 'hono/jwt';
import { type JWTPayload } from 'hono/utils/jwt/types';

// This module handles JWT generation and verification for login sessions.

interface LoginTokenPayload extends JWTPayload {
  userId: string;
  uuid: string;
}

// Retrieve JWT secret from environment and fail fast if missing in production.
function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET environment variable is required but not set.');
  }
  return secret;
}

// Generate and return a JWT token after successful login.
async function createLoginToken(userId: string, uuid: string): Promise<string> {
  const secret = getJwtSecret();
  const now = Math.floor(Date.now() / 1000);
  const payload: LoginTokenPayload = {
    userId,
    uuid,
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

  const secret = process.env.JWT_SECRET;
  if (!secret) {
    console.error('[AUTH] JWT_SECRET is not set — cannot verify token.');
    return null;
  }

  try {
    const payload = await verify(token, secret, 'HS256');
    return payload as LoginTokenPayload;
  } catch {
    return null;
  }
}

export { createLoginToken, verifyLoginToken };
export type { LoginTokenPayload };
