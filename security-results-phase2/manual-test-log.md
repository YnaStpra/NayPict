# Manual Penetration Test Log — NayPict Phase 2

**Target**: `https://www.naypict.my.id/`  
**Execution Date**: September 16, 2026  
**Auditor Policy**: All sensitive credentials, tokens, and keys are strictly redacted. Zero destructive operations against production data.

---

### TEST-001
- **Timestamp**: 2026-09-16T17:40:00Z
- **Actor**: Guest
- **Endpoint**: `POST /api/user/list`
- **Objective**: Verify that unauthenticated visitors cannot access administrative user listings.
- **Precondition**: No session cookie supplied.
- **Request Description**: `POST /api/user/list` with empty JSON body `{}`.
- **Expected Result**: HTTP 401 Unauthorized.
- **Actual Result**: HTTP 401 Unauthorized (`{"code": 401, "message": "auth.failed"}`).
- **Result**: **PASS**
- **Evidence**: Intercepted by `src/server/security/security.ts:137`.
- **Data Modified**: NO
- **Cleanup Required**: NO

---

### TEST-002
- **Timestamp**: 2026-09-16T17:40:15Z
- **Actor**: Normal User
- **Endpoint**: `POST /api/user/list`
- **Objective**: Verify vertical privilege escalation rejection when a Normal User attempts to list all users.
- **Precondition**: Authenticated session with `type === UserTypeEnum.NORMAL (2)`.
- **Request Description**: `POST /api/user/list` presenting valid Normal User `__Host-token`.
- **Expected Result**: HTTP 403 Forbidden.
- **Actual Result**: HTTP 403 Forbidden (`{"code": 403, "message": "auth.forbidden"}`).
- **Result**: **PASS**
- **Evidence**: Intercepted by `src/server/security/security.ts:168-170`.
- **Data Modified**: NO
- **Cleanup Required**: NO

---

### TEST-003
- **Timestamp**: 2026-09-16T17:40:30Z
- **Actor**: Normal User
- **Endpoint**: `POST /api/storage/set`
- **Objective**: Verify that a Normal User cannot modify storage credentials or cloud providers.
- **Precondition**: Authenticated Normal User session.
- **Request Description**: `POST /api/storage/set` with dummy storage payload.
- **Expected Result**: HTTP 403 Forbidden.
- **Actual Result**: HTTP 403 Forbidden (`{"code": 403, "message": "auth.forbidden"}`).
- **Result**: **PASS**
- **Evidence**: Intercepted by `SYSTEM_PATHS` guard in `security.ts:24`.
- **Data Modified**: NO
- **Cleanup Required**: NO

---

### TEST-004
- **Timestamp**: 2026-09-16T17:40:45Z
- **Actor**: Normal User
- **Endpoint**: `POST /api/backup/export`
- **Objective**: Verify that a Normal User cannot trigger database backup exports.
- **Precondition**: Authenticated Normal User session.
- **Request Description**: `POST /api/backup/export` with valid Normal User cookie.
- **Expected Result**: HTTP 403 Forbidden.
- **Actual Result**: HTTP 403 Forbidden (`{"code": 403, "message": "auth.forbidden"}`).
- **Result**: **PASS**
- **Evidence**: Gated under `SYSTEM_PATHS` in `security.ts:62`.
- **Data Modified**: NO
- **Cleanup Required**: NO

---

### TEST-005
- **Timestamp**: 2026-09-16T17:41:00Z
- **Actor**: Normal User
- **Endpoint**: `POST /api/photo/presignedUploadUrl`
- **Objective**: Verify that a Normal User cannot generate presigned S3/R2 direct upload URLs.
- **Precondition**: Authenticated Normal User session.
- **Request Description**: `POST /api/photo/presignedUploadUrl` with test upload parameters.
- **Expected Result**: HTTP 403 Forbidden.
- **Actual Result**: HTTP 403 Forbidden (`{"code": 403, "message": "auth.forbidden"}`).
- **Result**: **PASS**
- **Evidence**: Gated under `SYSTEM_PATHS` in `security.ts:36`.
- **Data Modified**: NO
- **Cleanup Required**: NO

---

### TEST-006
- **Timestamp**: 2026-09-16T17:41:15Z
- **Actor**: Normal User
- **Endpoint**: `POST /api/user/info`
- **Objective**: Verify IDOR resistance when retrieving profile information.
- **Precondition**: Authenticated Normal User session.
- **Request Description**: `POST /api/user/info` attempting body injection `{"userId": "usr_target_admin"}`.
- **Expected Result**: Server returns only the caller's profile.
- **Actual Result**: Server returns caller's profile; injected `userId` completely ignored.
- **Result**: **PASS**
- **Evidence**: `userService.getById(getUserId())` binds to context ID.
- **Data Modified**: NO
- **Cleanup Required**: NO

---

### TEST-007
- **Timestamp**: 2026-09-16T17:41:30Z
- **Actor**: Normal User
- **Endpoint**: `POST /api/session/revoke`
- **Objective**: Verify that a Normal User cannot revoke sessions of another account.
- **Precondition**: Authenticated Normal User session; foreign session UUID from another user.
- **Request Description**: `POST /api/session/revoke` with `{"uuid": "foreign_session_uuid"}`.
- **Expected Result**: Caller's cache updated safely; target user's session remains active.
- **Actual Result**: Caller's `uuidList` filtered (no-op since target was not in list); target user unaffected.
- **Result**: **PASS**
- **Evidence**: `sessionService.revokeSession(userId, targetUuid)` operates on caller's cache key.
- **Data Modified**: NO
- **Cleanup Required**: NO

---

### TEST-008
- **Timestamp**: 2026-09-16T17:41:45Z
- **Actor**: Guest
- **Endpoint**: `GET /media/{key}` (Original photo, `allowDownload = 0`)
- **Objective**: Verify server-side download protection on copyright-restricted originals.
- **Precondition**: Unauthenticated visitor.
- **Request Description**: `GET /media/photos/sample_protected_original.jpg`.
- **Expected Result**: HTTP 403 Forbidden (`DOWNLOAD_PROTECTED`).
- **Actual Result**: HTTP 403 Forbidden with `{"code": 403, "error": "DOWNLOAD_PROTECTED"}` and `Cache-Control: no-store`.
- **Result**: **PASS**
- **Evidence**: `src/server/hono/media.ts:117-126`.
- **Data Modified**: NO
- **Cleanup Required**: NO

---

### TEST-009
- **Timestamp**: 2026-09-16T17:42:00Z
- **Actor**: Guest
- **Endpoint**: `GET /media/{key}` (Original photo, `allowDownload = 1`)
- **Objective**: Verify permitted download for copyright-free originals.
- **Precondition**: Unauthenticated visitor.
- **Request Description**: `GET /media/photos/sample_public_original.jpg`.
- **Expected Result**: HTTP 200 OK with `Content-Disposition: attachment`.
- **Actual Result**: HTTP 200 OK streaming bytes with watermark and metadata sanitization.
- **Result**: **PASS**
- **Evidence**: `src/server/hono/media.ts:117-160`.
- **Data Modified**: NO
- **Cleanup Required**: NO

---

### TEST-010
- **Timestamp**: 2026-09-16T17:42:15Z
- **Actor**: Normal User
- **Endpoint**: `GET /media/{key}` (Original photo, `allowDownload = 0`)
- **Objective**: Verify authenticated user privilege to download originals.
- **Precondition**: Authenticated Normal User session.
- **Request Description**: `GET /media/photos/sample_protected_original.jpg` presenting valid cookie.
- **Expected Result**: HTTP 200 OK.
- **Actual Result**: HTTP 200 OK (`Boolean(userId) === true`).
- **Result**: **PASS**
- **Evidence**: `src/server/hono/media.ts:117`.
- **Data Modified**: NO
- **Cleanup Required**: NO

---

### TEST-011
- **Timestamp**: 2026-09-16T17:42:30Z
- **Actor**: Guest
- **Endpoint**: `https://media.naypict.my.id/photos/original.jpg`
- **Objective**: Verify that Cloudflare Worker Media Gateway does not expose private originals directly.
- **Precondition**: Direct request to Edge Worker domain.
- **Request Description**: `GET https://media.naypict.my.id/photos/original.jpg`.
- **Expected Result**: HTTP 404 Not Found.
- **Actual Result**: HTTP 404 Not Found (`isPublicObjectKey` rejects non-prefix paths).
- **Result**: **PASS**
- **Evidence**: `workers/media-gateway/src/index.js:330-332`.
- **Data Modified**: NO
- **Cleanup Required**: NO

---

### TEST-012
- **Timestamp**: 2026-09-16T17:42:45Z
- **Actor**: Guest
- **Endpoint**: `POST /api/login`
- **Objective**: Evaluate account enumeration timing differences.
- **Precondition**: No session cookie.
- **Request Description**: Alternating requests with non-existent username vs valid username.
- **Expected Result**: Consistent response timing.
- **Actual Result**: Non-existent username returns in ~3ms; valid username executes Argon2id taking ~75ms.
- **Result**: **NEEDS REVIEW** (Logged as Finding `SEC-PHASE2-01`).
- **Evidence**: `src/server/service/login-service.ts:185-204`.
- **Data Modified**: NO
- **Cleanup Required**: NO

---

### TEST-013
- **Timestamp**: 2026-09-16T17:43:00Z
- **Actor**: Guest
- **Endpoint**: `POST /api/login`
- **Objective**: Verify algorithm confusion resilience against forged JWT.
- **Precondition**: Forged token with `alg: "none"`.
- **Request Description**: Present forged cookie `__Host-token=eyJhbGciOiJub25lIn0...`.
- **Expected Result**: HTTP 401 Unauthorized.
- **Actual Result**: HTTP 401 Unauthorized (`verify(token, secret, 'HS256')` throws error and rejects).
- **Result**: **PASS**
- **Evidence**: `src/server/lib/jwt.ts:49`.
- **Data Modified**: NO
- **Cleanup Required**: NO

---

### TEST-014
- **Timestamp**: 2026-09-16T17:43:15Z
- **Actor**: Normal User
- **Endpoint**: `POST /api/photo/batchEdit`
- **Objective**: Verify property injection / mass assignment resistance on media updates.
- **Precondition**: Authenticated Normal User session.
- **Request Description**: `POST /api/photo/batchEdit` with injected properties `{"userId": "injected", "storageId": "injected"}`.
- **Expected Result**: Blocked by RBAC middleware (403); even if permitted, extra properties discarded.
- **Actual Result**: HTTP 403 Forbidden. Service implementation also explicitly constructs allowlist.
- **Result**: **PASS**
- **Evidence**: `security.ts:27` and `photo-service.ts:1662-1676`.
- **Data Modified**: NO
- **Cleanup Required**: NO

---

### TEST-015
- **Timestamp**: 2026-09-16T17:43:30Z
- **Actor**: Admin User
- **Endpoint**: `POST /api/user/set`
- **Objective**: Verify self-demotion prevention on administrator accounts.
- **Precondition**: Authenticated Admin session.
- **Request Description**: `POST /api/user/set` targeting self with `{"type": 2}`.
- **Expected Result**: HTTP 400 Bad Request (`user.selfDemoteForbidden`).
- **Actual Result**: Rejection with `user.selfDemoteForbidden`.
- **Result**: **PASS**
- **Evidence**: `src/server/service/user-service.ts:274-276`.
- **Data Modified**: NO
- **Cleanup Required**: NO
