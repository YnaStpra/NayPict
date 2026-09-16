# Security Assessment Handoff — Phase 2

## Application Information
- **Application Name**: NayPict
- **Phase**: Pentest Phase 2 — Authenticated Access Control, RBAC & API Authorization
- **Assessment Date**: September 16, 2026
- **Test Accounts Used**:
  - `TEST_GUEST`: Unauthenticated public context.
  - `TEST_NORMAL_USER`: Authenticated Normal User account (`type: 2`, `userId: [REDACTED_NORMAL_ID]`).
  - `TEST_ADMIN_USER`: Authenticated Administrator account (`type: 1`, `userId: [REDACTED_ADMIN_ID]`).

---

## Assessment Summary

### 1. Authorization Matrix Summary
- Total Endpoints Evaluated: 44
- Fully Passing: 43
- Needs Review / Informational: 1 (`POST /api/login` timing side-channel)
- Failed (Critical/High): 0

### 2. RBAC & Vertical Privilege Escalation Results
- **Result**: **NOT FOUND**
- **Evaluation**: The application layer interceptor `src/server/security/security.ts` intercepts all requests before controller dispatch. Any attempt by a Normal User to invoke `SYSTEM_PATHS` triggers `BizError('auth.forbidden', 403)` immediately. Tampering with headers, verbs, path separators, or trailing slashes does not bypass the authorization middleware.

### 3. IDOR / BOLA Results
- **Result**: **NOT FOUND**
- **Evaluation**: All user-specific mutations (avatar update, password change, profile reading, session listing, session revocation) extract identity strictly from `getUserId()` in the verified JWT context rather than request parameters. Photo batch updates enforce database-level ownership filters `where(and(inArray(photoId), eq(userId)))`.

### 4. Session Security Results
- **Result**: **NOT FOUND**
- **Evaluation**: Cookies adhere to RFC 6265bis (`__Host-token`, `HttpOnly`, `Secure`, `SameSite: Lax`, no domain attribute). Multi-device revocation correctly filters caller-owned session UUIDs. Password changes increment `tokenVersion`, invalidating tokens across all active devices.

### 5. JWT Validation Results
- **Result**: **NOT FOUND**
- **Evaluation**: The verification routine strictly requires algorithm `'HS256'`. Algorithm confusion (`none`, `RS256`), signature stripping, payload tampering, and expiration bypass are rejected. Role information is deliberately omitted from JWT claims, preventing claim tampering.

### 6. TOTP / 2FA Results
- **Result**: **NOT FOUND**
- **Evaluation**: Two-Factor Authentication is enforced through an ephemeral `tempToken` with a 300-second TTL. The system enforces an attempt counter with lockout after 3 consecutive failures. No session token is created before 2FA verification completes.

### 7. Mass Assignment Results
- **Result**: **NOT FOUND**
- **Evaluation**: Drizzle ORM queries in `userService.set`, `photoService.batchEdit`, and `storageService.set` explicitly whitelist updated fields. Injected properties (`tokenVersion`, `role`, `status`, `userId`) are ignored. Self-demotion and last-admin deletion are blocked.

---

## Confirmed Findings

| Finding ID | Title | Severity | OWASP Category | Status |
| :--- | :--- | :---: | :--- | :---: |
| **SEC-PHASE2-01** | Observable Timing Discrepancy During Authentication Permitting Account Enumeration | **LOW** | A07:2021 – Identification and Authentication Failures | CONFIRMED |

---

## False Positives & Exclusions
- **Knip flagged Radix UI & utility modules**: Verified as dead code during preparation and removed cleanly in commit `3208431`.
- **Cloudflare Turnstile bypass**: Not executed against production Cloudflare edge infrastructure per safety rules. Code verification confirms `verifyTurnstileToken` enforces server-side validation against `challenges.cloudflare.com`.

---

## Tests That Could Not Safely Be Executed on Production
- **Destructive account deletion**: Tested logic without permanently purging real production administrative records.
- **High-volume brute force**: Not executed against production to respect rate limits and prevent service degradation.

---

## Remaining Attack Surface & Recommended Phase 3 Areas
1. **SSRF via User-Controlled Media Fetching**: Audit any remote image import or URL preview fetching endpoints.
2. **File Processing Parser Security**: Dynamic analysis of WebAssembly FFmpeg and Sharp against malformed polyglot image/video inputs.
3. **GraphQL / WebSocket / SSE Security**: Evaluate real-time comment synchronization and SSE event streams (`/photo/sse`, `comment-event-hub.ts`) for unauthenticated channel listening or memory leaks.
4. **Client-Side Storage & Offline PWA Sync**: Audit IndexedDB/CacheStorage for cached sensitive thumbnails or metadata in shared workstation environments.
