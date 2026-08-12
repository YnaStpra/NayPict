import { sign, verify } from 'hono/jwt';
import { type JWTPayload } from 'hono/utils/jwt/types';
import BizError from "@/server/error/biz-error";

// This module handles JWT Generation and verification for login sessions.

interface LoginTokenPayload extends JWTPayload {
  userId: string;
  uuid: string;
}

// Generate and return JWT token after successful login.
async function createLoginToken(userId: string, uuid: string): Promise<string> {
  const secret = process.env.JWT_SECRET || 'naypict_default_secret_key';

  const now = Math.floor(Date.now() / 1000);
  const payload: LoginTokenPayload = {
    userId,
    uuid,
    iat: now,
    exp: now + 60 * 60 * 24 * 30
  };

  return sign(payload, secret);
}

// Verify login JWT safely without throwing uncaught exceptions.
async function verifyLoginToken(token: string | undefined): Promise<LoginTokenPayload | null> {
  const secret = process.env.JWT_SECRET || 'naypict_default_secret_key';

  if (!token) {
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
