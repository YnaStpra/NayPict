import { sign, verify } from 'hono/jwt';
import { type JWTPayload } from 'hono/utils/jwt/types';
import BizError from "@/server/error/biz-error";

// This module is responsible for logging in JWT Generation and verification of。

interface LoginTokenPayload extends JWTPayload {
  userId: string;
  uuid: string;
}

// Generate and return to the front end after successful login JWT。
async function createLoginToken(userId: string, uuid: string): Promise<string> {
  const secret = process.env.JWT_SECRET;

  if (!secret) {
    throw new BizError('system.jwtSecretMissing');
  }

  const now = Math.floor(Date.now() / 1000);
  const payload: LoginTokenPayload = {
    userId,
    uuid,
    iat: now,
    exp: now + 60 * 60 * 24 * 30
  };

  return sign(payload, secret);
}

// Verify login JWT，Returns empty if verification fails。
async function verifyLoginToken(token: string | undefined): Promise<LoginTokenPayload | null> {
  const secret = process.env.JWT_SECRET;

  if (!secret) {
    throw new BizError('system.jwtSecretMissing');
  }

  try {
    const payload = await verify(token as string, secret, 'HS256');
    return payload as LoginTokenPayload;
  } catch {
    return null;
  }
}

export { createLoginToken, verifyLoginToken };
export type { LoginTokenPayload };
