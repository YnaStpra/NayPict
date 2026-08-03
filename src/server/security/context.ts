import { getContext } from 'hono/context-storage';
import type { HonoEnv } from '@/server/hono/type';

// This module reads and writes the currently requested logged-in user id。

// Put the current request to log in the user id write Hono request context。
function setUserId(userId: string) {
  getContext<HonoEnv>().set('userId', userId);
}

// from Hono The request context reads the currently requested logged-in user id。
function getUserId(): string {
  return getContext<HonoEnv>().get('userId') ?? '';
}

export { getUserId, setUserId };
