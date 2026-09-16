# Session Security & Lifecycle Testing — NayPict Phase 2

This document details the assessment of session management, device tracking, revocation mechanisms, and session isolation.

---

## 1. Session Architecture & Cookie Configuration

NayPict uses an HMAC-SHA256 signed stateless JWT stored inside a hardened HTTP cookie.

| Parameter | Configuration | Security Assessment |
| :--- | :--- | :--- |
| **Cookie Name** | `__Host-token` (Production) / `token` (Dev) | **PASS**: Conforms to RFC 6265bis prefix requirements. Prevents cookie poisoning and subdomain overwrites. |
| **HttpOnly Flag** | `true` | **PASS**: Completely inaccessible to client-side JavaScript (`document.cookie`), mitigating XSS session theft. |
| **Secure Flag** | `true` | **PASS**: Browser enforces HTTPS-only transmission. |
| **SameSite Policy** | `Lax` | **PASS**: Blocks cross-origin CSRF state-changing requests while permitting top-level navigations. |
| **Path Attribute** | `/` | **PASS**: Scoped to the entire origin. |
| **Domain Attribute**| *Omitted* | **PASS**: Required for `__Host-` cookies; restricts cookie strictly to `www.naypict.my.id`. |
| **Max-Age** | `2592000` (30 days) | **PASS**: Standard for portfolio/gallery administrative access with server-side revocation validation. |

---

## 2. Multi-Device Session Management Tests

### Test 2.1: Session Listing (`GET /api/session/list`)
- **Objective**: Verify that `GET /api/session/list` returns only active sessions belonging to the authenticated user.
- **Verification**: In [`session-api.ts:13`](file:///Users/yansaputra/Naypict/src/server/api/session-api.ts#L13), `userId` is extracted from `getUserId()` (context populated by `security` middleware). `sessionService.listActiveSessions(userId, uuid)` queries `AUTH_CACHE_KEY + userId`.
- **Result**: **PASS**. No parameter exists to supply an arbitrary `userId`. A Normal user cannot view sessions belonging to another user or Administrator.

### Test 2.2: Cross-Account Session Revocation (`POST /api/session/revoke`)
- **Objective**: Attempt to revoke a target session UUID belonging to another account (IDOR test).
- **Verification**:
  ```typescript
  // src/server/api/session-api.ts:37
  const success = await sessionService.revokeSession(userId, body.uuid.trim());
  ```
  Inside [`session-service.ts:73`](file:///Users/yansaputra/Naypict/src/server/service/session-service.ts#L73):
  ```typescript
  const authInfo = await cache.get<AuthInfo>(AUTH_CACHE_KEY + userId);
  const updatedUuidList = authInfo.uuidList.filter((id) => id !== targetUuid);
  ```
  The revocation targets only the caller's session list in `AUTH_CACHE_KEY + userId`. Supplying an external UUID has no effect on any other user's session cache.
- **Result**: **PASS**. Cross-user session manipulation is completely blocked.

### Test 2.3: Revoke Other Sessions (`POST /api/session/revoke-others`)
- **Objective**: Invalidate all sessions except the caller's current session.
- **Verification**: In [`session-service.ts:93`](file:///Users/yansaputra/Naypict/src/server/service/session-service.ts#L93), `updatedUuidList` filters to retain only `currentUuid`. All previously issued tokens on other devices fail the `authInfo.uuidList.includes(uuid)` check on their next request and receive HTTP 401.
- **Result**: **PASS**.

---

## 3. Session Revocation & Invalidation Guarantees

### Test 3.1: Password Modification Token Invalidation
- **Objective**: Ensure that changing a password invalidates all previously active tokens on all devices.
- **Mechanism**:
  1. User updates password via `POST /api/user/setUserPassword` or Admin updates password via `POST /api/user/set`.
  2. Database executes:
     ```sql
     UPDATE "user" SET "password" = $1, "salt" = $2, "tokenVersion" = "tokenVersion" + 1 WHERE "userId" = $3;
     ```
  3. Cache entry `AUTH_CACHE_KEY + userId` is purged.
  4. On subsequent requests presenting the old token, `getLoginInfo` queries the persisted version via `sessionService.getTokenVersion(payload.userId)`.
  5. Because `persistedVersion !== tokenVersion`, the token is rejected immediately, clearing cookies and returning HTTP 401.
- **Result**: **PASS**. Instantaneous global token invalidation across all devices.

### Test 3.2: Logout Revocation (`POST /api/logout`)
- **Objective**: Confirm that logging out purges the session server-side.
- **Mechanism**: [`loginService.logout`](file:///Users/yansaputra/Naypict/src/server/service/login-service.ts#L275) removes the calling `uuid` from `authInfo.uuidList`. The `__Host-token` cookie is deleted via `clearLoginCookies`.
- **Result**: **PASS**. Presenting the logged-out cookie subsequently fails with HTTP 401.

---

## 4. Device Anomaly Detection (ANOMALY-01)

- When an authenticated user logs in, [`loginService.login`](file:///Users/yansaputra/Naypict/src/server/service/login-service.ts#L101-L105) computes a device fingerprint:
  ```typescript
  const deviceFingerprint = crypto
    .createHash('sha256')
    .update(`${userAgent}|${acceptLanguage}|${ipSubnet}`)
    .digest('hex')
    .slice(0, 32);
  ```
- If a user authenticates from a new subnet or user agent, the system logs a security warning and records the new fingerprint in the 90-day trusted cache, alerting the user via `isNewDevice: true`.
- **Result**: **PASS**.
