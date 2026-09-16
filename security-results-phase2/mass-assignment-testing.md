# Mass Assignment & Property Injection Testing — NayPict Phase 2

This document details the evaluation of Mass Assignment vulnerabilities (OWASP API Security Top 10 - API6:2023 / CWE-915) across mutating endpoints in NayPict.

---

## 1. Threat Model & Methodology

Mass Assignment occurs when an application automatically binds client-provided HTTP request parameters to internal domain models or database update queries without strict property whitelisting. An attacker can exploit this to overwrite privileged attributes (such as `type`, `role`, `status`, `tokenVersion`, or ownership foreign keys).

In NayPict, all persistence operations utilize **Drizzle ORM** with explicitly defined schemas in `src/server/entity/*`.

---

## 2. In-Depth Endpoint Analysis

### Test MA-01: User Management (`POST /api/user/set`)
- **Target Endpoint**: `/api/user/set`
- **Supported Parameters**: `userId`, `username`, `password`, `type`.
- **Injected Properties**:
  ```json
  {
    "userId": "usr_target_id",
    "username": "updated_user",
    "type": 2,
    "tokenVersion": 999999,
    "createTime": "1970-01-01T00:00:00.000Z",
    "salt": "malicious_injected_salt",
    "status": 0
  }
  ```
- **Service Implementation**:
  In [`user-service.ts:311-331`](file:///Users/yansaputra/Naypict/src/server/service/user-service.ts#L311-L331):
  ```typescript
  await orm.update(userTab)
    .set({
      username,
      type: params.type,
      // If password changed:
      password: password.hash,
      salt: password.salt,
      tokenVersion: sql`${userTab.tokenVersion} + 1`,
    })
    .where(eq(userTab.userId, userId));
  ```
- **Evaluation**: The update object explicitly constructs the keys to update (`username`, `type`, and optionally computed `password`/`salt`). Extra fields such as `createTime`, injected `salt`, or arbitrary `tokenVersion` are never passed to the ORM query builder.
- **Result**: **PASS** (Protected by explicit attribute mapping).

---

### Test MA-02: Media Batch Update (`POST /api/photo/batchEdit`)
- **Target Endpoint**: `/api/photo/batchEdit`
- **Supported Parameters**: `photoIds`, `visibility`, `allowDownload`, `takenTime`.
- **Injected Properties**:
  ```json
  {
    "photoIds": ["pht_sample1"],
    "visibility": 1,
    "userId": "usr_attacker",
    "storageId": "str_malicious",
    "status": 1,
    "rating": 5,
    "views": 1000000
  }
  ```
- **Service Implementation**:
  In [`photo-service.ts:1662-1676`](file:///Users/yansaputra/Naypict/src/server/service/photo-service.ts#L1662-L1676):
  ```typescript
  const updates: Record<string, any> = {};

  if (params.visibility !== undefined && params.visibility !== null) {
    updates.visibility = params.visibility;
  }
  if (params.allowDownload !== undefined && params.allowDownload !== null) {
    updates.allowDownload = params.allowDownload ? 1 : 0;
  }
  if (params.takenTime !== undefined) {
    updates.takenTime = params.takenTime ? params.takenTime : null;
  }

  if (Object.keys(updates).length > 0) {
    await orm.update(photoTab).set(updates).where(inArray(photoTab.photoId, verifiedPhotoIds));
  }
  ```
- **Evaluation**: The `updates` object is an explicit allowlist. Any unapproved property (e.g. `userId`, `storageId`, `status`) is discarded.
- **Result**: **PASS** (Protected by explicit property construction).

---

### Test MA-03: Storage Configuration (`POST /api/storage/set`)
- **Target Endpoint**: `/api/storage/set`
- **Supported Parameters**: `storageId`, `name`, `type`, `domain`, `bucket`, `region`, `endpoint`, `accessKey`, `secretKey`, `status`.
- **Injected Properties**:
  ```json
  {
    "storageId": "str_123",
    "name": "Cloudflare R2",
    "type": 1,
    "isAdminStorage": true,
    "createTime": "2020-01-01",
    "unknownProperty": "injected"
  }
  ```
- **Service Implementation**:
  In [`storage-service.ts:173-185`](file:///Users/yansaputra/Naypict/src/server/service/storage-service.ts#L173-L185):
  ```typescript
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
  ```
- **Evaluation**: The fields are strictly enumerated. Injected fields do not alter database state.
- **Result**: **PASS** (Protected by explicit field mapping).

---

## 3. Self-Demotion & Last Admin Safeguards

A critical boundary in user administration is preventing administrative lockout through privilege manipulation.

In [`user-service.ts:273-293`](file:///Users/yansaputra/Naypict/src/server/service/user-service.ts#L273-L293):
1. **Self-Demotion Guard**: An Administrator cannot demote their own account to `NORMAL`:
   ```typescript
   if (currentUserId && userId === currentUserId) {
     throw new BizError('user.selfDemoteForbidden');
   }
   ```
2. **Last Admin Guard**: An Administrator cannot demote the last remaining active Administrator in the system:
   ```typescript
   if (remainingAdmins === 0) {
     throw new BizError('user.lastAdminForbidden');
   }
   ```
- **Result**: **PASS** (Prevents administrative denial-of-service).

---

## Conclusion
NayPict is fully resilient against Mass Assignment and Property Injection attacks due to its architectural pattern of explicit field extraction and typed ORM parameterization.
