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
import { orm, readOrm } from '@/server/infra/db';
import { formatHttpUrl } from '@/lib/url';
import { encryptData, decryptData } from '@/server/lib/crypto';
import { isPrivateOrReservedIp } from '@/server/lib/ip';

// Validate custom endpoint and domain to strictly prevent SSRF (Server-Side Request Forgery) attacks
function validateStorageUrl(rawUrl?: string | null): void {
  if (!rawUrl?.trim()) return;
  try {
    const trimmed = rawUrl.trim();
    const parsed = new URL(trimmed.startsWith('http://') || trimmed.startsWith('https://') ? trimmed : `https://${trimmed}`);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new BizError('storage.invalidUrlProtocol');
    }

    const host = parsed.hostname.toLowerCase();
    // Block cloud metadata service IP explicitly
    if (host === '169.254.169.254' || host === 'metadata.google.internal' || host === 'instance-data') {
      throw new BizError('storage.ssrfBlocked');
    }

    // In production, strictly reject local loopback and private network ranges
    if (process.env.NODE_ENV === 'production') {
      if (host === 'localhost' || isPrivateOrReservedIp(host)) {
        throw new BizError('storage.ssrfBlocked');
      }
    }
  } catch (err) {
    if (err instanceof BizError) throw err;
    throw new BizError('storage.invalidUrlFormat');
  }
}

// This module handles the data query and writing business of storage configuration.

// Retrieve master encryption key for cloud storage credentials at rest.
function getStorageMasterKey(): string {
  const key = process.env.STORAGE_ENCRYPTION_KEY?.trim() || process.env.JWT_SECRET?.trim();
  if (!key && process.env.NODE_ENV === 'production') {
    console.warn('[SECURITY WARNING] STORAGE_ENCRYPTION_KEY or JWT_SECRET is not configured. Using default storage key in production is strongly discouraged.');
  }
  return key || 'naypict-storage-master-key';
}

// Transparently decrypt stored S3/R2 access credentials while supporting unencrypted legacy format.
async function decryptStorageCredentials(storage: Storage): Promise<Storage> {
  const masterKey = getStorageMasterKey();
  const accessKey = storage.accessKey ? await decryptData(storage.accessKey, masterKey).catch(() => storage.accessKey) : storage.accessKey;
  const secretKey = storage.secretKey ? await decryptData(storage.secretKey, masterKey).catch(() => storage.secretKey) : storage.secretKey;
  return {
    ...storage,
    accessKey,
    secretKey,
    domain: formatMediaDomain(storage.domain),
  };
}

// Format a media domain for direct CDN acceleration, returning null if empty.
function formatMediaDomain(domain?: string | null): string | null {
  return formatHttpUrl(domain) || null;
}

// In-process L1 memory cache for zero-latency storage resolution (60s TTL)
let l1StorageCache: { list: Storage[]; expiresAt: number } | null = null;

const storageService = {

  // Query all normal storage configurations, Return to the drop-down and select the required fields.
  async select(): Promise<StorageSelectVo[]> {
    return readOrm
      .select({
        storageId: storageTab.storageId,
        name: storageTab.name,
        type: storageTab.type,
      })
      .from(storageTab)
      .where(eq(storageTab.status, StorageStatusEnum.NORMAL))
      .orderBy(desc(storageTab.sort));
  },

  // Query all storage configurations, And count the number of photos and used capacity under each storage.
  async list(): Promise<PageVo<StorageVo>> {

    const storageList = await readOrm
      .select()
      .from(storageTab)
      .orderBy(desc(storageTab.sort));

    if (!storageList.length) {
      return { list: [], total: 0 };
    }

    const storageIds = storageList.map((storage: any) => storage.storageId).filter(Boolean) as string[];

    const photoStatList = await readOrm
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
      safeStorage.domain = formatMediaDomain(safeStorage.domain);

      return {
        ...safeStorage,
        photoTotal: Number(photoStat?.photoTotal ?? 0),
        usedCapacity: Number(photoStat?.usedCapacity ?? 0)
      };
    });

    return { list, total: list.length };
  },

  // Add the current user's storage configuration, and prevent duplicate names from being created.
  async add(params: StorageInto, userId: string): Promise<void> {
    const name = params.name?.trim();

    if (!name) {
      throw new BizError('storage.nameRequired');
    }

    if (!params.type) {
      throw new BizError('storage.typeRequired');
    }

    validateStorageUrl(params.endpoint);
    validateStorageUrl(params.domain);

    const [existsStorage] = await orm
      .select()
      .from(storageTab)
      .where(eq(storageTab.name, name))
      .limit(1);

    if (existsStorage) {
      throw new BizError('storage.nameExists');
    }

    const masterKey = getStorageMasterKey();
    const accessKey = params.accessKey?.trim() ? await encryptData(params.accessKey.trim(), masterKey) : (params.accessKey ?? null);
    const secretKey = params.secretKey?.trim() ? await encryptData(params.secretKey.trim(), masterKey) : (params.secretKey ?? null);

    await orm.insert(storageTab).values({
      ...params,
      accessKey,
      secretKey,
      storageId: createId(),
      name,
      userId,
      sort: 0
    });

    await this.refreshStorageCache();
  },

  // Pin the specified storage configuration to the top.
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

  // Toggles the enabled state of a specified storage configuration.
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

  // Modify the specified storage configuration.
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

    validateStorageUrl(params.endpoint);
    validateStorageUrl(params.domain);

    const masterKey = getStorageMasterKey();
    const updateValues: Record<string, unknown> = {
      name,
      type: params.type,
      domain: params.domain?.trim() || null,
      bucket: params.bucket?.trim() || null,
      region: params.region?.trim() || null,
      endpoint: params.endpoint?.trim() || null,
      status: params.status ?? StorageStatusEnum.NORMAL,
    };

    if (params.accessKey !== undefined) {
      updateValues.accessKey = params.accessKey?.trim() ? await encryptData(params.accessKey.trim(), masterKey) : null;
    }

    const cleanSecretKey = params.secretKey?.trim();
    if (cleanSecretKey) {
      updateValues.secretKey = await encryptData(cleanSecretKey, masterKey);
    }

    await orm.update(storageTab)
      .set(updateValues)
      .where(eq(storageTab.storageId, params.storageId));

    await this.refreshStorageCache();
  },

  // Delete the specified storage configuration, And leave the storage tags of all associated photos blank..
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

  // Query all storage configurations, read-first cache with auto-expiry and force-refresh.
  async getStorageList(forceRefresh = false): Promise<Storage[]> {
    if (!forceRefresh && l1StorageCache && Date.now() < l1StorageCache.expiresAt) {
      return l1StorageCache.list;
    }

    let storageList = forceRefresh ? null : await cache.get<Storage[]>(STORAGE_LIST_CACHE_KEY);

    // Re-query database when cache is missing, empty array, or forceRefresh requested
    if (!storageList || !Array.isArray(storageList) || storageList.length === 0) {
      storageList = await readOrm
        .select()
        .from(storageTab)
        .orderBy(desc(storageTab.sort));

      if (!storageList.length && process.env.R2_BUCKET_NAME && process.env.R2_ACCESS_KEY_ID) {
        const mediaGatewayUrl = process.env.R2_MEDIA_GATEWAY_URL || process.env.R2_PUBLIC_URL;
        const defaultR2: Storage = {
          storageId: 'r2_default',
          name: 'Cloudflare R2',
          type: StorageTypeEnum.S3,
          domain: formatMediaDomain(mediaGatewayUrl),
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
          storageList = await readOrm.select().from(storageTab).orderBy(desc(storageTab.sort));
        }
      }

      if (storageList && storageList.length > 0) {
        // Cache for 60 seconds with TTL to ensure rapid sync across serverless instances and direct DB edits
        await cache.set(STORAGE_LIST_CACHE_KEY, storageList as unknown as Record<string, unknown>, { ttl: 60 });
      }
    }

    const decryptedList = await Promise.all((storageList ?? []).map(decryptStorageCredentials));

    l1StorageCache = {
      list: decryptedList,
      expiresAt: Date.now() + 60 * 1000,
    };

    return decryptedList;
  },

  // Query storage by ID with direct database fallback.
  async getStorageById(storageId: string): Promise<Storage | null> {
    if (!storageId) return null;
    const [row] = await orm
      .select()
      .from(storageTab)
      .where(eq(storageTab.storageId, storageId))
      .limit(1);

    if (!row) return null;
    return decryptStorageCredentials(row);
  },

  // Flush storage configuration cache across distributed instances.
  async refreshStorageCache(): Promise<void> {
    l1StorageCache = null;
    await cache.delete(STORAGE_LIST_CACHE_KEY);
  }
}

export { storageService };
