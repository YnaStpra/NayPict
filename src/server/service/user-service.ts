/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
import { hashPassword } from '@/server/lib/crypto';
import { createId } from '@/server/lib/id';
import { count, eq, inArray, sum } from 'drizzle-orm';
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
import { storage } from '@/server/storage/storage';

// This module handles user data query and writing related services。

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
      return;
    }

    const { verifyPassword } = await import('@/server/lib/crypto');
    const isValid = await verifyPassword(password, user.salt, user.password);
    if (!isValid) {
      const newHash = await hashPassword(password);
      await orm
        .update(userTab)
        .set({
          password: newHash.hash,
          salt: newHash.salt,
        })
        .where(eq(userTab.userId, user.userId));
    }
  } catch (err) {
    console.warn('[INIT] Failed to initialize admin user:', err);
  }
},

  // According to user id Query user basic information。
  async getById(userId: string): Promise<UserInfoVo | null> {
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

    return user ?? null;
  },

  // Query user basic information based on user name。
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

  // Set current user avatar，And return the latest user basic information。
  async setAvatar(params: UserSetAvatarBo, userId: string): Promise<UserInfoVo> {

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
    const match = params.avatar.match(/^data:image\/webp;base64,(.+)$/);

    if (!match?.[1]) {
      throw new BizError('user.avatarInvalid');
    }

    await storage.put([{
      key: `profile/${avatarKey}`,
      body: Buffer.from(match[1], 'base64'),
      type: 'image/webp',
    }], 'local');

    await orm.update(userTab)
      .set({
        avatar: avatarKey
      })
      .where(eq(userTab.userId, userId));

    return {
      ...user,
      avatar: avatarKey
    };
  },

  // According to avatar key Read avatar file from storage。
  async getAvatar(key?: string) {

    if (!key) {
      return null;
    }

    try {
      return await storage.get(`profile/${key}`, 'local');
    } catch {
      return null;
    }
  },

  // Query all users，And count the number of photos and used capacity of each user。
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
      const { password: _password, salt: _salt, ...safeUser } = user;

      return {
        ...safeUser,
        photoTotal: Number(photoStat?.photoTotal ?? 0),
        usedCapacity: Number(photoStat?.usedCapacity ?? 0)
      };
    });

    return { list, total: list.length };
  },

  // Add user，And convert the plain text password into a salted hash and save it。
  async add(params: UserAddBo): Promise<void> {
    const username = params.username?.trim();

    if (!username || !params.password?.trim()) {
      throw new BizError('user.credentialsRequired');
    }

    if (!params.type) {
      throw new BizError('user.typeRequired');
    }

    const [user] = await orm.select().from(userTab).where(eq(userTab.username, username)).limit(1);

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

  // Modify user information。
  async set(params: UserSetBo): Promise<void> {
    const userId = params.userId?.trim();
    const username = params.username?.trim();

    if (!userId) {
      throw new BizError('user.selectRequired');
    }

    if (!username) {
      throw new BizError('user.usernameRequired');
    }

    if (!params.type) {
      throw new BizError('user.typeRequired');
    }

    const [user] = await orm
      .select({
        userId: userTab.userId
      })
      .from(userTab)
      .where(eq(userTab.userId, userId))
      .limit(1);

    if (!user) {
      throw new BizError('user.notFound');
    }

    const [existsUser] = await orm
      .select({
        userId: userTab.userId
      })
      .from(userTab)
      .where(eq(userTab.username, username))
      .limit(1);

    if (existsUser && existsUser.userId !== userId) {
      throw new BizError('user.usernameExists');
    }

    const nextPassword = params.password?.trim();
    const updateData: {
      username: string;
      type: number;
      password?: string;
      salt?: string;
    } = {
      username,
      type: params.type,
    };

    if (nextPassword) {
      const password = await hashPassword(nextPassword);
      updateData.password = password.hash;
      updateData.salt = password.salt;
    }

    await orm.update(userTab)
      .set(updateData)
      .where(eq(userTab.userId, userId));

    // If there is a login cache，Synchronously update the user types in it。
    const authInfo = await cache.get<AuthInfo>(AUTH_CACHE_KEY + userId);

    if (authInfo) {
      await cache.set(AUTH_CACHE_KEY + userId, {
        ...authInfo,
        type: params.type,
      }, { ttl: AUTH_CACHE_TTL });
    }
  },

  // Modify the current login user password，and regenerate salt and password hashes。
  async setUserPassword(params: UserPasswordBo, userId: string): Promise<void> {

    if (!params.password?.trim()) {
      throw new BizError('user.passwordRequired');
    }

    const password = await hashPassword(params.password.trim());

    await orm.update(userTab)
      .set({
        password: password.hash,
        salt: password.salt
      })
      .where(eq(userTab.userId, userId));

    // Invalidate active login cache sessions across all devices for security
    await cache.delete(AUTH_CACHE_KEY + userId);
  },

  // Toggle the enabled status of a specified user。
  async toggleStatus(params: UserToggleStatusBo): Promise<void> {
    if (!params.userId) {
      throw new BizError('user.selectRequired');
    }

    const [user] = await orm
      .select({
        status: userTab.status
      })
      .from(userTab)
      .where(eq(userTab.userId, params.userId))
      .limit(1);

    if (!user) {
      throw new BizError('user.notFound');
    }

    await orm.update(userTab)
      .set({
        status: user.status === UserStatusEnum.DISABLE
          ? UserStatusEnum.NORMAL
          : UserStatusEnum.DISABLE
      })
      .where(eq(userTab.userId, params.userId));

    // Clear login cache after switching status。
    await cache.delete(AUTH_CACHE_KEY + params.userId);
  },

  // Delete the specified user and their associated albums，and move the photo to the recycle bin。
  async delete(deleteUserId: string): Promise<void> {

    const [user] = await orm
      .select({
        avatar: userTab.avatar
      })
      .from(userTab)
      .where(eq(userTab.userId, deleteUserId))
      .limit(1);

    if (user?.avatar) {
      await storage.delete(`profile/${user.avatar}`, 'local');
    }

    await photoService.recycleByUserId(deleteUserId);
    await albumService.deleteByUserId(deleteUserId);

    await orm.delete(userTab)
      .where(eq(userTab.userId, deleteUserId));

    // Clear login cache after deleting user。
    await cache.delete(AUTH_CACHE_KEY + deleteUserId);
  },
}

export { userService }
