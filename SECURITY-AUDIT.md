# NayPict — Comprehensive Security Audit Report

**Audit Date:** 2026-08-16  
**Branch:** `security/automated-security-audit`  
**Auditor:** Static Analysis + Manual Source Review  
**Scope:** Authentication, Authorization, File Upload, API Surface, Dependencies, Secrets, Security Headers

---

## Executive Summary

| Severity | Count |
|----------|-------|
| 🔴 CRITICAL | 3 |
| 🟠 HIGH | 7 |
| 🟡 MEDIUM | 6 |
| 🔵 LOW | 4 |
| ✅ Dependency (npm audit) | 39 (20 High, 18 Moderate, 1 Low) |

---

## API Surface Map

| Route | Method | Auth | Admin Only | Notes |
|-------|--------|------|-----------|-------|
| `/api/login` | POST | ❌ | ❌ | Public |
| `/api/logout` | POST | ❌ | ❌ | Public |
| `/api/photo/list` | POST | ❌ | ❌ | Public |
| `/api/photo/randomIdList` | POST | ❌ | ❌ | Public |
| `/api/photo/takenDateList` | POST | ❌ | ❌ | Public |
| `/api/photo/download` | GET/POST | ❌ | ❌ | Public (download-protected guard) |
| `/api/photo/add` | POST | ✅ | ❌ | Any logged-in user |
| `/api/photo/exists` | POST | ✅ | ❌ | Any logged-in user |
| `/api/photo/recycle` | POST | ✅ | ❌ | Any logged-in user |
| `/api/photo/favorite` | POST | ✅ | ❌ | Any logged-in user |
| `/api/photo/restore` | POST | ✅ | ❌ | Any logged-in user |
| `/api/photo/delete` | POST | ✅ | ❌ | Any logged-in user |
| `/api/photo/clear` | POST | ✅ | ❌ | Any logged-in user |
| `/api/photo/duplicates` | GET/POST | ✅ | ❌ | Any logged-in user |
| `/api/photo/setAllowDownload` | POST | ✅ | ❌ | ⚠️ Should be admin-only |
| `/api/album/list` | POST | ❌ | ❌ | Public |
| `/api/album/trash` | POST | ✅ | ❌ | Any logged-in user |
| `/api/album/add` | POST | ✅ | ❌ | Any logged-in user |
| `/api/album/setCover` | POST | ✅ | ❌ | Any logged-in user |
| `/api/album/coverCandidates` | POST | ✅ | ❌ | Any logged-in user |
| `/api/album/addPhoto` | POST | ✅ | ❌ | Any logged-in user |
| `/api/album/removePhoto` | POST | ✅ | ❌ | Any logged-in user |
| `/api/album/setName` | POST | ✅ | ❌ | Any logged-in user |
| `/api/album/setTop` | POST | ✅ | ❌ | Any logged-in user |
| `/api/album/delete` | POST | ✅ | ❌ | Any logged-in user |
| `/api/user/info` | POST | ✅ | ❌ | Any logged-in user |
| `/api/user/list` | POST | ✅ | ✅ | Admin only |
| `/api/user/add` | POST | ✅ | ✅ | Admin only |
| `/api/user/set` | POST | ✅ | ✅ | Admin only |
| `/api/user/toggleStatus` | POST | ✅ | ✅ | Admin only |
| `/api/user/delete` | POST | ✅ | ✅ | Admin only |
| `/api/user/setUserPassword` | POST | ✅ | ❌ | Any logged-in user |
| `/api/user/setAvatar` | POST | ✅ | ❌ | Any logged-in user |
| `/api/user/avatar/:key` | GET | ❌ | ❌ | Public (keyed URL) |
| `/api/storage/select` | POST | ❌ | ❌ | Public |
| `/api/storage/list` | POST | ✅ | ✅ | Admin only |
| `/api/storage/add` | POST | ✅ | ✅ | Admin only |
| `/api/storage/set` | POST | ✅ | ✅ | Admin only |
| `/api/storage/setTop` | POST | ✅ | ✅ | Admin only |
| `/api/storage/toggleStatus` | POST | ✅ | ✅ | Admin only |
| `/api/storage/delete` | POST | ✅ | ✅ | Admin only |
| `/api/setting/set` | POST | ✅ | ✅ | Admin only |
| `/api/totp/status` | GET | ✅ | ❌ | Any logged-in user |
| `/api/totp/setup` | POST | ✅ | ❌ | Any logged-in user |
| `/api/totp/enable` | POST | ✅ | ❌ | Any logged-in user |
| `/api/totp/disable` | POST | ✅ | ❌ | Any logged-in user |
| `/media/*` | GET | ❌/✅ | ❌ | Public thumbs/previews; Auth for originals |

---

## Findings

---

### 🔴 CRIT-01: Weak Default Credentials in `.env`

**File:** `.env` lines 2-4  
**CVSS:** 9.8

The `.env` has `JWT_SECRET=kuncirahasia12345`, `PASSWORD=password123`.  
A weak JWT secret allows offline token forgery via HMAC-SHA256 brute-force.

**Fix:** `openssl rand -base64 48` → new JWT_SECRET. Change admin password.

---

### 🔴 CRIT-02: No File Type Validation on Photo Upload

**File:** `src/server/service/photo-service.ts:782-789`, `src/server/lib/photo-process.ts`  
**CVSS:** 8.8

`readPhotoUpload()` trusts `file.type` (client-controlled Content-Type) without any magic byte validation. An attacker can upload HTML/SVG/ZIP files disguised as images.

**Fix Implemented:** Magic byte check + MIME allowlist in `photo-service.ts`.

---

### 🔴 CRIT-03: Storage API Returns Plaintext Cloud Credentials

**File:** `src/server/service/storage-service.ts:55-63`  
**CVSS:** 9.1

`storageService.list()` spreads the full `Storage` row including `accessKey` and `secretKey` (Cloudflare R2 credentials) to the admin client response.

**Fix Implemented:** Strip `accessKey`/`secretKey` before returning response.

---

### 🟠 HIGH-01: Wildcard CORS — No Origin Restriction

**File:** `src/server/hono/hono.ts:15`, `src/server/hono/media.ts:22`  
**CVSS:** 7.5

`cors()` with no config defaults to `Access-Control-Allow-Origin: *`. All API responses are accessible cross-origin.

**Fix:** Restrict to trusted origins via `ALLOWED_ORIGIN` env var.

---

### 🟠 HIGH-02: No Rate Limiting on Login Endpoint

**File:** `src/server/api/login-api.ts`  
**CVSS:** 7.3

`POST /api/login` has no brute-force protection. No attempt counter, no lockout, no delay.

**Fix Implemented:** IP-based rate limiter (max 10/min per IP using existing cache).

---

### 🟠 HIGH-03: TOTP OTP Replay Attack

**File:** `src/server/lib/totp.ts:60-72`  
**CVSS:** 7.1

No used-code tracking. A valid OTP can be replayed within the ±90s verification window.

**Fix Implemented:** Cache used codes per user with 90s TTL.

---

### 🟠 HIGH-04: Missing Security HTTP Headers

**File:** `next.config.ts`  
**CVSS:** 6.8

No `Content-Security-Policy`, `X-Frame-Options`, `X-Content-Type-Options`, `Strict-Transport-Security`, `Referrer-Policy`, or `Permissions-Policy` headers.

**Fix Implemented:** Added all six headers globally in `next.config.ts`.

---

### 🟠 HIGH-05: `/photo/setAllowDownload` Not Admin-Only

**File:** `src/server/security/security.ts:16-27`  
**CVSS:** 6.5

Route comment says "Admin only" but it is not in `SYSTEM_PATHS`. Any authenticated user can call it.

**Status:** Documented — to be decided if multi-user per-photo control is intended.

---

### 🟠 HIGH-06: 2FA `tempToken` Allows OTP Brute-Force

**File:** `src/server/service/login-service.ts:93-99`  
**CVSS:** 6.4

After password auth passes, a `tempToken` (valid 5 min, no attempt counter) is issued. Attacker with token can make unlimited TOTP guesses.

**Fix Implemented:** `tempToken` deleted after each attempt; 3-strike lockout added.

---

### 🟠 HIGH-07: Next.js Known CVEs

**Tool:** `npm audit`  
**CVSS:** 7.5–8.2

`next@16.2.10` has SSRF (GHSA-89xv-2m56-2m9x, GHSA-p9j2-gv94-2wf4) and middleware bypass (GHSA-6gpp-xcg3-4w24) vulnerabilities.

**Fix:** `pnpm update next`

---

### 🟡 MED-01: `SameSite: None` Cookie Without Domain

**File:** `src/server/api/login-api.ts:21-27`  
**CVSS:** 5.4

`SameSite: None` weakens CSRF protection unless cross-origin embedding is required.

---

### 🟡 MED-02: No File Size Limit on Upload

**File:** `src/server/api/photo-api.ts:89-92`  
**CVSS:** 5.3

No size check before photo processing — DoS vector.

**Fix Implemented:** 100MB server-side limit.

---

### 🟡 MED-03: Hono CORS ReDoS (GHSA-8j4g-w8fx-2239)

Hono CORS middleware has ReDoS via `Access-Control-Request-Headers`.  
**Fix:** Upgrade `hono`.

---

### 🟡 MED-04: `typescript.ignoreBuildErrors: true`

**File:** `next.config.ts:25`

TypeScript errors in auth code will not block deployments.

---

### 🟡 MED-05: Client-Supplied TOTP Secret Accepted

**File:** `src/server/service/totp-service.ts:92-94`  
**CVSS:** 4.5

`verifyAndEnableTotp` accepts `body.secret` from the client instead of always reading from DB. Attacker who intercepts a secret could enable TOTP with a different secret.

**Fix Implemented:** Server always uses DB-stored secret.

---

### 🟡 MED-06: Demo User `uuid: 'demo'` Bypass

**File:** `src/server/security/security.ts:96`  
**CVSS:** 4.3

Security middleware has `uuid !== 'demo'` bypass. A forged JWT with `uuid: 'demo'` passes session validation if the JWT_SECRET is weak.

---

### 🔵 LOW-01: `ini` Prototype Pollution (GHSA-qqgx-2p2h-9c37)

Via `better-sqlite3` dependency chain. Build-time risk.

---

### 🔵 LOW-02: Error Messages Leak Stack Traces

**File:** `src/server/hono/hono.ts:33-34`

`err.message` returned to clients for unhandled errors — may expose internal paths.

**Fix Implemented:** Return generic `system.internalError` message.

---

### 🔵 LOW-03: TOTP QR via Third-Party Service

**File:** `src/server/lib/totp.ts:80-82`

`quickchart.io` receives the `otpauthUrl` (contains TOTP secret) to generate QR code.

---

### 🔵 LOW-04: `reactStrictMode: false`

**File:** `next.config.ts:20`

Development safety checks disabled.

---

## Fixes Applied (This Audit)

| Finding | Fix Location |
|---------|-------------|
| CRIT-02 — File type validation | `photo-service.ts` |
| CRIT-03 — Storage credential leak | `storage-service.ts` |
| HIGH-02 — Login rate limiting | `login-api.ts` + `login-service.ts` |
| HIGH-03 — TOTP replay protection | `totp-service.ts` |
| HIGH-04 — Security headers | `next.config.ts` |
| HIGH-06 — 2FA tempToken brute-force | `login-service.ts` |
| MED-02 — File size limit | `photo-service.ts` |
| MED-05 — Client-supplied TOTP secret | `totp-service.ts` |
| LOW-02 — Error message leakage | `hono.ts` |

---

## Automated Security Regression Tests

See: `tests/e2e/06-security.spec.ts`

| ID | Category | Test Description |
|----|----------|-----------------|
| SEC-01 | Auth | Unauthenticated API access returns 401 |
| SEC-02 | Auth | Invalid JWT rejected |
| SEC-03 | Auth | Wrong password returns error, not 500 |
| SEC-04 | Auth | Login rate limit enforced |
| SEC-05 | IDOR | Cannot recycle another user's photos |
| SEC-06 | IDOR | Cannot delete another user's photos |
| SEC-07 | Upload | Non-image upload rejected |
| SEC-08 | Upload | Oversized upload rejected |
| SEC-09 | Headers | Security headers present on page responses |
| SEC-10 | Storage | Storage list response has no accessKey/secretKey |
| SEC-11 | TOTP | TOTP code cannot be replayed |
| SEC-12 | Auth | Logout invalidates session |
| SEC-13 | Auth | Admin-only routes blocked for normal user |

---

## npm audit Summary

| Severity | Count | Key Packages |
|----------|-------|-------------|
| HIGH | 20 | `next`, `undici`, `brace-expansion`, `postcss`, `fast-uri`, `sharp` |
| MODERATE | 18 | `hono`, `postcss`, `undici`, `ip-address` |
| LOW | 1 | `hono` (Proxy Helper) |

---

## Vulnerability Summary

| ID | Severity | Fixed |
|----|----------|-------|
| CRIT-01 Weak credentials | 🔴 CRITICAL | Manual action needed |
| CRIT-02 No file type validation | 🔴 CRITICAL | ✅ |
| CRIT-03 Storage credential leak | 🔴 CRITICAL | ✅ |
| HIGH-01 Wildcard CORS | 🟠 HIGH | Documented |
| HIGH-02 No login rate limit | 🟠 HIGH | ✅ |
| HIGH-03 TOTP replay | 🟠 HIGH | ✅ |
| HIGH-04 Missing security headers | 🟠 HIGH | ✅ |
| HIGH-05 setAllowDownload not admin | 🟠 HIGH | Documented |
| HIGH-06 2FA tempToken brute-force | 🟠 HIGH | ✅ |
| HIGH-07 Next.js CVEs | 🟠 HIGH | Upgrade needed |
| MED-01 SameSite:None | 🟡 MEDIUM | Documented |
| MED-02 No file size limit | 🟡 MEDIUM | ✅ |
| MED-03 Hono CORS ReDoS | 🟡 MEDIUM | Upgrade needed |
| MED-04 ignoreBuildErrors | 🟡 MEDIUM | Documented |
| MED-05 Client TOTP secret | 🟡 MEDIUM | ✅ |
| MED-06 Demo uuid bypass | 🟡 MEDIUM | Documented |
| LOW-01 ini prototype pollution | 🔵 LOW | Upgrade needed |
| LOW-02 Stack trace leakage | 🔵 LOW | ✅ |
| LOW-03 TOTP QR third-party | 🔵 LOW | Documented |
| LOW-04 reactStrictMode off | 🔵 LOW | Documented |
