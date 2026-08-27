import { eq } from 'drizzle-orm';
import { userTab } from '@/server/entity/user';
import { orm } from '@/server/infra/db';

// This module reads persistent session-revocation state used to validate login tokens.

const sessionService = {
  // Read the current persisted token version for a user.
  async getTokenVersion(userId: string): Promise<number | null> {
    const [user] = await orm
      .select({ tokenVersion: userTab.tokenVersion })
      .from(userTab)
      .where(eq(userTab.userId, userId))
      .limit(1);

    return user?.tokenVersion ?? null;
  },
};

export { sessionService };
