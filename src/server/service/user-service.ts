import { hashPassword, verifyPasswordDetailed } from '@/server/lib/crypto';
import { createId } from '@/server/lib/id';
import { and, count, eq, inArray, ne, sql, sum } from 'drizzle-orm';
import { userTab } from '@/server/entity/user';
import { type UserAddBo, type UserSetAvatarBo, type UserSetBo, type UserPasswordBo, type UserToggleStatusBo } from '@/server/entity/bo/user';
import { photoTab } from '@/server/entity/photo';
import { type PageVo } from '@/server/entity/vo/common';
import { type UserInfoVo, type UserVo } from '@/server/entity/vo/user';
import { type AuthInfo } from '@/server/entity/vo/auth';
import { UserStatusEnum, UserTypeEnum } from '@/server/enums/user-enum';
import BizError from '@/server/error/biz-error';
import { orm } from '@/server/infra/db';
import { cache } from '@/server/infra/cache';
import { AUTH_CACHE_KEY } from '@/server/const/cache';
import { AUTH_CACHE_TTL } from '@/server/const/global';
import { albumService } from '@/server/service/album-service';
import { photoService } from '@/server/service/photo-service';
import { sessionService } from '@/server/service/session-service';
import { storage } from '@/server/storage/storage';

// This module handles user data query and writing related services.

// Blocklist of common weak passwords vulnerable to dictionary attacks (OWASP A07)
const COMMON_WEAK_PASSWORDS = new Set([
  '12345678', '123456789', '1234567890', 'password', 'password123',
  'admin123', 'admin1234', 'administrator', 'qwertyuiop', 'iloveyou',
  'naypict123', 'welcome123', 'root1234', 'changeme',
]);

// Validate password length and entropy according to OWASP guidelines (min 8 chars, max 128 chars, non-common).
function validatePasswordComplexity(password?: string, username?: string): void {
  const trimmed = password?.trim();
  if (!trimmed || trimmed.length < 8) {
    throw new BizError('user.passwordLengthInvalid');
  }
  if (trimmed.length > 128) {
    throw new BizError('user.passwordTooLong');
  }
  const lower = trimmed.toLowerCase();
  if (COMMON_WEAK_PASSWORDS.has(lower)) {
    throw new BizError('user.passwordTooCommon');
  }
  if (username && lower === username.trim().toLowerCase()) {
    throw new BizError('user.passwordMatchesUsername');
  }
}

const userService = {

  // According to environment variables ADMIN, PASSWORD initialize administrator: create if not exists, skip if exists.
  async init(): Promise<void> {
    const username = process.env.ADMIN?.trim();
    const password = process.env.PASSWORD?.trim();

    if (!process.env.DATABASE_URL) {
      console.warn('[INIT] DATABASE_URL is not set — skipping admin user initialization.');
      return;
    }

    if (!username || !password) {
      console.warn('[INIT] ADMIN or PASSWORD env var is not set — skipping admin initialization.');
      return;
    }

    try {
      const [user] = await orm
        .select()
        .from(userTab)
        .where(eq(userTab.username, username))
        .limit(1);

      if (!user) {
        await this.add({
          username,
          password,
          type: UserTypeEnum.ADMIN,
        });
        console.log(`[INIT] Initialized default admin user: ${username}`);
        return;
      }

      // If admin user already exists, preserve their customized database password.
      // (Do NOT overwrite with process.env.PASSWORD so password changes in UI persist permanently)
    } catch (err) {
      console.warn('[INIT] Failed to initialize admin user:', err);
    }
  },

  // According to user id Query user basic information.
  async getById(userId: string): Promise<UserInfoVo | null> {
    const [user] = await orm
      .select({
        userId: userTab.userId,
        username: userTab.username,
        avatar: userTab.avatar,
        type: userTab.type,
        status: userTab.status,
      })
      .from(userTab)
      .where(eq(userTab.userId, userId))
      .limit(1);

    return user ?? null;
  },

  // Query user basic information based on user name.
  async getByName(username: string): Promise<UserInfoVo> {
    const name = username?.trim();

    if (!name) {
      throw new BizError('user.usernameRequired');
    }

    const [user] = await orm
      .select({
        userId: userTab.userId,
        username: userTab.username,
        avatar: userTab.avatar,
        type: userTab.type
      })
      .from(userTab)
      .where(eq(userTab.username, name))
      .limit(1);


    return user;
  },

  // Set current user avatar, And return the latest user basic information.
  // Set current user avatar with file size limit and WebP magic byte validation.
  async setAvatar(params: UserSetAvatarBo, userId: string): Promise<UserInfoVo> {
    if (!userId) {
      throw new BizError('auth.failed', 401);
    }

    const match = params.avatar?.match(/^data:image\/webp;base64,(.+)$/);
    if (!match?.[1]) {
      throw new BizError('user.avatarInvalid');
    }

    const avatarBuffer = Buffer.from(match[1], 'base64');

    // Security: Enforce maximum avatar buffer size (2MB)
    if (avatarBuffer.length === 0 || avatarBuffer.length > 2 * 1024 * 1024) {
      throw new BizError('user.avatarInvalid');
    }

    // Security: Validate WebP magic header signature (RIFF....WEBP)
    const isWebP = avatarBuffer.length >= 12 &&
      avatarBuffer.toString('ascii', 0, 4) === 'RIFF' &&
      avatarBuffer.toString('ascii', 8, 12) === 'WEBP';

    if (!isWebP) {
      throw new BizError('user.avatarInvalid');
    }

    const [user] = await orm
      .select({
        userId: userTab.userId,
        username: userTab.username,
        avatar: userTab.avatar,
        type: userTab.type
      })
      .from(userTab)
      .where(eq(userTab.userId, userId))
      .limit(1);

    if (user?.avatar) {
      await storage.delete(`profile/${user.avatar}`, 'local');
    }

    const avatarKey = `${createId()}.webp`;

    await storage.put([{
      key: `profile/${avatarKey}`,
      body: avatarBuffer,
      type: 'image/webp',
    }], 'local');

    await orm.update(userTab)
      .set({
        avatar: avatarKey
      })
      .where(eq(userTab.userId, userId));

    return {
      userId: user?.userId || userId,
      username: user?.username || '',
      type: user?.type ?? 1,
      avatar: avatarKey
    };
  },

  // According to avatar key Read avatar file from storage with path traversal sanitization.
  async getAvatar(key?: string) {
    const cleanKey = key?.trim();
    if (!cleanKey || cleanKey.includes('..') || cleanKey.includes('/') || cleanKey.includes('\\')) {
      return null;
    }

    try {
      return await storage.get(`profile/${cleanKey}`, 'local');
    } catch {
      return null;
    }
  },

  // Query all users, And count the number of photos and used capacity of each user.
  async list(): Promise<PageVo<UserVo>> {
    const userList = await orm
      .select()
      .from(userTab);

    if (!userList.length) {
      return { list: [], total: 0 };
    }

    const userIds = userList.map((user: any) => user.userId);

    const photoStatList = await orm
      .select({
        userId: photoTab.userId,
        photoTotal: count(photoTab.photoId),
        usedCapacity: sum(photoTab.size)
      })
      .from(photoTab)
      .where(inArray(photoTab.userId, userIds))
      .groupBy(photoTab.userId);

    const list = userList.map((user: any) => {
      const photoStat = photoStatList.find((stat: any) => stat.userId === user.userId);
      const { password: _password, salt: _salt, tokenVersion: _tokenVersion, ...safeUser } = user;

      return {
        ...safeUser,
        photoTotal: Number(photoStat?.photoTotal ?? 0),
        usedCapacity: Number(photoStat?.usedCapacity ?? 0)
      };
    });

    return { list, total: list.length };
  },

  // Add user, And convert the plain text password into a salted hash and save it.
  async add(params: UserAddBo): Promise<void> {
    const username = params.username?.trim();

    if (!username || !params.password?.trim()) {
      throw new BizError('user.credentialsRequired');
    }

    // Security: Validate username format and character set (3-30 alphanumeric, underscore, hyphen)
    if (!/^[a-zA-Z0-9_-]{3,30}$/.test(username)) {
      throw new BizError('user.usernameInvalid');
    }

    validatePasswordComplexity(params.password, username);

    if (!params.type) {
      throw new BizError('user.typeRequired');
    }

    // Security: Case-insensitive uniqueness check to prevent duplicate / homograph accounts
    const [user] = await orm
      .select({ userId: userTab.userId })
      .from(userTab)
      .where(sql`lower(${userTab.username}) = ${username.toLowerCase()}`)
      .limit(1);

    if (user) {
      throw new BizError('user.usernameExists');
    }

    const password = await hashPassword(params.password);
    const userId = createId();
    const now = new Date().toISOString();

    await orm.insert(userTab).values({
      userId,
      username,
      password: password.hash,
      salt: password.salt,
      type: params.type,
      createTime: now,
    });

  },

  // Modify user information with demotion safeguards.
  async set(params: UserSetBo, currentUserId?: string): Promise<void> {
    const userId = params.userId?.trim();
    const username = params.username?.trim();

    if (!userId) {
      throw new BizError('user.selectRequired');
    }

    if (!username) {
      throw new BizError('user.usernameRequired');
    }

    // Security: Validate username format and character set (3-30 alphanumeric, underscore, hyphen)
    if (!/^[a-zA-Z0-9_-]{3,30}$/.test(username)) {
      throw new BizError('user.usernameInvalid');
    }

    if (!params.type) {
      throw new BizError('user.typeRequired');
    }

    const [user] = await orm
      .select({
        userId: userTab.userId,
        type: userTab.type,
      })
      .from(userTab)
      .where(eq(userTab.userId, userId))
      .limit(1);

    if (!user) {
      throw new BizError('user.notFound');
    }

    // Demotion safeguards: prevent removing the last admin or demoting self
    if (user.type === UserTypeEnum.ADMIN && params.type !== UserTypeEnum.ADMIN) {
      if (currentUserId && userId === currentUserId) {
        throw new BizError('user.selfDemoteForbidden');
      }

      const adminCount = await orm
        .select({ count: count() })
        .from(userTab)
        .where(
          and(
            eq(userTab.type, UserTypeEnum.ADMIN),
            ne(userTab.userId, userId),
            ne(userTab.status, UserStatusEnum.DISABLE)
          )
        );

      const remainingAdmins = Number(adminCount[0]?.count || 0);
      if (remainingAdmins === 0) {
        throw new BizError('user.lastAdminForbidden');
      }
    }

    // Security: Case-insensitive uniqueness check to prevent duplicate / homograph accounts
    const [existsUser] = await orm
      .select({
        userId: userTab.userId
      })
      .from(userTab)
      .where(sql`lower(${userTab.username}) = ${username.toLowerCase()}`)
      .limit(1);

    if (existsUser && existsUser.userId !== userId) {
      throw new BizError('user.usernameExists');
    }

    const nextPassword = params.password?.trim();
    const isTypeChanged = params.type !== user.type;

    if (nextPassword) {
      validatePasswordComplexity(nextPassword, username);
      const password = await hashPassword(nextPassword);
      await orm.update(userTab)
        .set({
          username,
          type: params.type,
          password: password.hash,
          salt: password.salt,
          tokenVersion: sql`${userTab.tokenVersion} + 1`,
        })
        .where(eq(userTab.userId, userId));

      await cache.delete(AUTH_CACHE_KEY + userId);
      return;
    }

    await orm.update(userTab)
      .set({
        username,
        type: params.type,
        ...(isTypeChanged ? { tokenVersion: sql`${userTab.tokenVersion} + 1` } : {}),
      })
      .where(eq(userTab.userId, userId));

    if (isTypeChanged) {
      // Security: Invalidate active login session cache across all devices when role changes
      await cache.delete(AUTH_CACHE_KEY + userId);
    } else {
      // If there is a login cache, Synchronously update the user types and username in it.
      const authInfo = await cache.get<AuthInfo>(AUTH_CACHE_KEY + userId);
      if (authInfo) {
        await cache.set(AUTH_CACHE_KEY + userId, {
          ...authInfo,
          username,
          type: params.type,
        }, { ttl: AUTH_CACHE_TTL });
      }
    }
  },

  // Modify the current login user password, and regenerate salt and password hashes.
  async setUserPassword(params: UserPasswordBo, userId: string): Promise<void> {
    if (!userId) {
      throw new BizError('auth.failed', 401);
    }

    if (!params.oldPassword?.trim()) {
      throw new BizError('user.oldPasswordRequired');
    }

    if (!params.password?.trim()) {
      throw new BizError('user.passwordRequired');
    }

    const [user] = await orm
      .select({
        userId: userTab.userId,
        username: userTab.username,
        password: userTab.password,
        salt: userTab.salt,
      })
      .from(userTab)
      .where(eq(userTab.userId, userId))
      .limit(1);

    if (!user) {
      throw new BizError('user.notFound', 404);
    }

    const { valid: isOldPasswordValid } = await verifyPasswordDetailed(
      params.oldPassword.trim(),
      user.salt,
      user.password
    );

    if (!isOldPasswordValid) {
      throw new BizError('user.oldPasswordIncorrect');
    }

    validatePasswordComplexity(params.password, user.username);

    const password = await hashPassword(params.password.trim());

    await orm.update(userTab)
      .set({
        password: password.hash,
        salt: password.salt,
        tokenVersion: sql`${userTab.tokenVersion} + 1`,
      })
      .where(eq(userTab.userId, userId));

    // Invalidate active login cache sessions across all devices for security
    await cache.delete(AUTH_CACHE_KEY + userId);
  },

  // Toggle the enabled status of a specified user with self-protection and last-admin safeguard.
  async toggleStatus(params: UserToggleStatusBo, currentUserId?: string): Promise<void> {
    if (!params.userId) {
      throw new BizError('user.selectRequired');
    }

    const [user] = await orm
      .select({
        status: userTab.status,
        type: userTab.type,
      })
      .from(userTab)
      .where(eq(userTab.userId, params.userId))
      .limit(1);

    if (!user) {
      throw new BizError('user.notFound');
    }

    // If currently enabled and attempting to disable:
    if (user.status !== UserStatusEnum.DISABLE) {
      if (currentUserId && params.userId === currentUserId) {
        throw new BizError('user.selfDisableForbidden');
      }

      if (user.type === UserTypeEnum.ADMIN) {
        const adminCount = await orm
          .select({ count: count() })
          .from(userTab)
          .where(
            and(
              eq(userTab.type, UserTypeEnum.ADMIN),
              ne(userTab.userId, params.userId),
              ne(userTab.status, UserStatusEnum.DISABLE)
            )
          );

        const remainingAdmins = Number(adminCount[0]?.count || 0);
        if (remainingAdmins === 0) {
          throw new BizError('user.lastAdminForbidden');
        }
      }
    }

    const nextStatus = user.status === UserStatusEnum.DISABLE
      ? UserStatusEnum.NORMAL
      : UserStatusEnum.DISABLE;

    await orm.update(userTab)
      .set({
        status: nextStatus,
        tokenVersion: sql`${userTab.tokenVersion} + 1`,
      })
      .where(eq(userTab.userId, params.userId));

    // Clear login cache after switching status.
    await cache.delete(AUTH_CACHE_KEY + params.userId);

    // If disabled, revoke all active sessions immediately across all devices
    if (nextStatus === UserStatusEnum.DISABLE) {
      await sessionService.revokeAllSessions(params.userId).catch(() => {});
    }
  },

  // Delete the specified user and their associated albums, with self-deletion and last-admin safeguard.
  async delete(deleteUserId: string, currentUserId?: string): Promise<void> {
    if (!deleteUserId) {
      throw new BizError('user.selectRequired');
    }

    if (currentUserId && deleteUserId === currentUserId) {
      throw new BizError('user.selfDeletionForbidden');
    }

    const [user] = await orm
      .select({
        avatar: userTab.avatar,
        type: userTab.type,
      })
      .from(userTab)
      .where(eq(userTab.userId, deleteUserId))
      .limit(1);

    if (!user) {
      throw new BizError('user.notFound');
    }

    // Ensure the last admin cannot be deleted
    if (user.type === UserTypeEnum.ADMIN) {
      const adminCount = await orm
        .select({ count: count() })
        .from(userTab)
        .where(
          and(
            eq(userTab.type, UserTypeEnum.ADMIN),
            ne(userTab.userId, deleteUserId),
            ne(userTab.status, UserStatusEnum.DISABLE)
          )
        );

      const remainingAdmins = Number(adminCount[0]?.count || 0);
      if (remainingAdmins === 0) {
        throw new BizError('user.lastAdminForbidden');
      }
    }

    if (user?.avatar) {
      await storage.delete(`profile/${user.avatar}`, 'local');
    }

    await photoService.recycleByUserId(deleteUserId);
    await albumService.deleteByUserId(deleteUserId);

    await orm.delete(userTab)
      .where(eq(userTab.userId, deleteUserId));

    // Clear login cache after deleting user.
    await cache.delete(AUTH_CACHE_KEY + deleteUserId);
  },
}

export { userService }
