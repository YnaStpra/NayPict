import { count, desc, eq, inArray, sum } from 'drizzle-orm';
import { createId } from '@/server/lib/id';
import { photoTab } from '@/server/entity/photo';
import { type Storage, type StorageInto, storageTab } from '@/server/entity/storage';
import { type StorageSetTopBo, type StorageToggleStatusBo } from '@/server/entity/bo/storage';
import { type PageVo } from '@/server/entity/vo/common';
import { type StorageSelectVo, type StorageVo } from '@/server/entity/vo/storage';
import { StorageStatusEnum, StorageTypeEnum } from '@/server/enums/storage-enum';
import BizError from '@/server/error/biz-error';
import { STORAGE_LIST_CACHE_KEY } from '@/server/const/cache';
import { cache } from '@/server/infra/cache';
import { orm } from '@/server/infra/db';

// This module handles the data query and writing business of storage configuration。

const storageService = {

  // Query all normal storage configurations，Return to the drop-down and select the required fields。
  async select(): Promise<StorageSelectVo[]> {
    return orm
      .select({
        storageId: storageTab.storageId,
        name: storageTab.name,
        type: storageTab.type,
      })
      .from(storageTab)
      .where(eq(storageTab.status, StorageStatusEnum.NORMAL))
      .orderBy(desc(storageTab.sort));
  },

  // Query all storage configurations，And count the number of photos and used capacity under each storage。
  async list(): Promise<PageVo<StorageVo>> {

    const storageList = await orm
      .select()
      .from(storageTab)
      .orderBy(desc(storageTab.sort));

    if (!storageList.length) {
      return { list: [], total: 0 };
    }

    const storageIds = storageList.map((storage: any) => storage.storageId).filter(Boolean) as string[];

    const photoStatList = await orm
      .select({
        storageId: photoTab.storageId,
        photoTotal: count(photoTab.photoId),
        usedCapacity: sum(photoTab.size)
      })
      .from(photoTab)
      .where(inArray(photoTab.storageId, storageIds))
      .groupBy(photoTab.storageId);

    const list = storageList.map((storage: any) => {
      const photoStat = photoStatList.find((stat: any) => stat.storageId === storage.storageId);

      // Strip sensitive cloud credentials — never expose to client (CRIT-03)
      const safeStorage = { ...storage };
      delete safeStorage.accessKey;
      delete safeStorage.secretKey;

      return {
        ...safeStorage,
        photoTotal: Number(photoStat?.photoTotal ?? 0),
        usedCapacity: Number(photoStat?.usedCapacity ?? 0)
      };
    });

    return { list, total: list.length };
  },

  // Add the current user's storage configuration，and prevent duplicate names from being created。
  async add(params: StorageInto, userId: string): Promise<void> {
    const name = params.name?.trim();

    if (!name) {
      throw new BizError('storage.nameRequired');
    }

    if (!params.type) {
      throw new BizError('storage.typeRequired');
    }

    const [existsStorage] = await orm
      .select()
      .from(storageTab)
      .where(eq(storageTab.name, name))
      .limit(1);

    if (existsStorage) {
      throw new BizError('storage.nameExists');
    }

    await orm.insert(storageTab).values({
      ...params,
      storageId: createId(),
      name,
      userId,
      sort: 0
    });

    await this.refreshStorageCache();
  },

  // Pin the specified storage configuration to the top。
  async setTop(params: StorageSetTopBo): Promise<void> {
    if (!params.storageId) {
      throw new BizError('storage.selectRequired');
    }

    await orm.update(storageTab)
      .set({
        sort: Date.now()
      })
      .where(eq(storageTab.storageId, params.storageId));

    await this.refreshStorageCache();
  },

  // Toggles the enabled state of a specified storage configuration。
  async toggleStatus(params: StorageToggleStatusBo): Promise<void> {
    if (!params.storageId) {
      throw new BizError('storage.selectRequired');
    }

    const [storage] = await orm
      .select({
        status: storageTab.status
      })
      .from(storageTab)
      .where(eq(storageTab.storageId, params.storageId))
      .limit(1);

    if (!storage) {
      throw new BizError('storage.notFound');
    }

    await orm.update(storageTab)
      .set({
        status: storage.status === StorageStatusEnum.NORMAL
          ? StorageStatusEnum.DISABLE
          : StorageStatusEnum.NORMAL
      })
      .where(eq(storageTab.storageId, params.storageId));

    await this.refreshStorageCache();
  },

  // Modify the specified storage configuration。
  async set(params: Storage): Promise<void> {
    const name = params.name?.trim();

    if (!params.storageId) {
      throw new BizError('storage.selectRequired');
    }

    if (!name) {
      throw new BizError('storage.nameRequired');
    }

    if (!params.type) {
      throw new BizError('storage.typeRequired');
    }

    await orm.update(storageTab)
      .set({
        name,
        type: params.type,
        domain: params.domain?.trim() || null,
        bucket: params.bucket?.trim() || null,
        region: params.region?.trim() || null,
        endpoint: params.endpoint?.trim() || null,
        accessKey: params.accessKey?.trim() || null,
        secretKey: params.secretKey?.trim() || null,
        status: params.status ?? StorageStatusEnum.NORMAL
      })
      .where(eq(storageTab.storageId, params.storageId));

    await this.refreshStorageCache();
  },

  // Delete the specified storage configuration，And leave the storage tags of all associated photos blank.。
  async delete(storageId: string): Promise<void> {
    if (!storageId) {
      throw new BizError('storage.selectRequired');
    }

    await orm.update(photoTab)
      .set({
        storageId: 'none'
      })
      .where(eq(photoTab.storageId, storageId));

    await orm.delete(storageTab)
      .where(eq(storageTab.storageId, storageId));

    await this.refreshStorageCache();
  },

  // Query all storage configurations, read-first cache.
  async getStorageList(): Promise<Storage[]> {
    let storageList = await cache.get<Storage[]>(STORAGE_LIST_CACHE_KEY);

    if (!storageList) {
      storageList = await orm
        .select()
        .from(storageTab)
        .orderBy(desc(storageTab.sort));

      if (!storageList.length && process.env.R2_BUCKET_NAME && process.env.R2_ACCESS_KEY_ID) {
        const defaultR2: Storage = {
          storageId: 'r2_default',
          name: 'Cloudflare R2',
          type: StorageTypeEnum.S3,
          domain: process.env.R2_PUBLIC_URL || (process.env.R2_ACCOUNT_ID ? `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com` : null),
          bucket: process.env.R2_BUCKET_NAME,
          region: 'auto',
          endpoint: process.env.R2_ACCOUNT_ID ? `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com` : null,
          accessKey: process.env.R2_ACCESS_KEY_ID,
          secretKey: process.env.R2_SECRET_ACCESS_KEY || '',
          userId: null,
          sort: 0,
          status: StorageStatusEnum.NORMAL,
        };

        try {
          await orm.insert(storageTab).values(defaultR2);
          storageList = [defaultR2];
        } catch {
          // If already inserted concurrently
          storageList = await orm.select().from(storageTab).orderBy(desc(storageTab.sort));
        }
      }

      await cache.set(STORAGE_LIST_CACHE_KEY, (storageList ?? []) as unknown as Record<string, unknown>);
    }

    return (storageList ?? []) as Storage[];
  },

  // Flush storage configuration cache。
  async refreshStorageCache(): Promise<void> {
    const storageList = await orm
      .select()
      .from(storageTab)
      .orderBy(desc(storageTab.sort));

    await cache.set(STORAGE_LIST_CACHE_KEY, storageList as any);
  }
}

export { storageService };
