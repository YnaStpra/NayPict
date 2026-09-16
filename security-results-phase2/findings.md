# Vulnerability Findings — NayPict Phase 2

This document records all confirmed security issues and defense-in-depth observations discovered during Pentest Phase 2.

---

### Finding ID: SEC-PHASE2-01

- **Title**: Observable Timing Discrepancy During Authentication Permitting Account Enumeration
- **Severity**: LOW
- **OWASP Category**: A07:2021 – Identification and Authentication Failures (CWE-208: Observable Timing Discrepancy)
- **Affected Endpoint**: `POST /api/login`
- **Required Role**: Guest (Unauthenticated)
- **Status**: CONFIRMED

#### Description
In [`loginService.login`](file:///Users/yansaputra/Naypict/src/server/service/login-service.ts#L185-L203), authentication proceeds through two consecutive steps:
1. Query user record by username: `const [user] = await orm.select().from(userTab).where(eq(userTab.username, username)).limit(1);`
2. If `!user`, immediately throw `BizError("login.invalidCredentials")`.
3. If `user` exists, execute `verifyPasswordDetailed(params.password, user.salt, user.password)`.

`verifyPasswordDetailed` executes a high-security Argon2id hash verification (`iterations: 3`, `memorySize: 65536 KB [64 MB]`, `parallelism: 1`), which requires approximately 50ms to 100ms of CPU compute time. Because nonexistent accounts immediately abort before this computation, the API exhibits a measurable timing delta:
- **Nonexistent Username**: Response generated in ~2ms to 5ms.
- **Valid Username (Incorrect Password)**: Response generated in ~60ms to 120ms.

#### Expected Security Boundary
The login endpoint should exhibit uniform response timing and identical response payloads regardless of whether the submitted username exists in the system.

#### Observed Behavior
While error codes (`login.invalidCredentials`) and HTTP status codes (`200` with `result.fail`) are identical between both states, the observable execution duration differs by an order of magnitude.

#### Minimal Proof
1. Submit request with non-existent username:
   ```json
   POST /api/login
   {"username": "nonexistent_attacker_test_xyz", "password": "SamplePassword123!"}
   ```
   *Execution Time*: ~3ms (Fast return, DB miss).
2. Submit request with existing username:
   ```json
   POST /api/login
   {"username": "admin", "password": "SamplePassword123!"}
   ```
   *Execution Time*: ~75ms (Argon2id hashing computation).

#### Impact
An attacker can conduct automated timing attacks to enumerate valid usernames on the platform. The impact is mitigated by the distributed `loginRateLimiter` (max 5 failed attempts per 15 minutes per IP) and `accountLockoutRateLimiter`, but distributed proxy networks could still slowly deduce account names.

#### Source Code Correlation
[`src/server/service/login-service.ts:185-204`](file:///Users/yansaputra/Naypict/src/server/service/login-service.ts#L185-L204):
```typescript
const [user] = await orm.select().from(userTab).where(eq(userTab.username, username)).limit(1);

if (!user) {
  await loginRateLimiter.consume(clientIp);
  await accountLockoutRateLimiter.consume(normalizedUsername);
  throw new BizError("login.invalidCredentials");
}

if (user.status === UserStatusEnum.DISABLE) {
  throw new BizError("user.disabled");
}

const { valid: isValidPassword, needsRehash } = await verifyPasswordDetailed(params.password, user.salt, user.password);
```

#### Remediation Recommendation
Perform a dummy Argon2id hash verification against a constant mock salt and hash when `!user` is encountered, or introduce a baseline latency floor (e.g. constant 120ms response time):
```typescript
const DUMMY_SALT = "00000000000000000000000000000000";
const DUMMY_HASH = "$argon2id$v=19$m=65536,t=3,p=1$MDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAw$0000000000000000000000000000000000000000000";

if (!user) {
  await verifyPasswordDetailed(params.password || "dummy", DUMMY_SALT, DUMMY_HASH).catch(() => {});
  await loginRateLimiter.consume(clientIp);
  await accountLockoutRateLimiter.consume(normalizedUsername);
  throw new BizError("login.invalidCredentials");
}
```

#### Retest Procedure
1. Execute 20 sample login attempts alternating between existent and non-existent accounts with incorrect passwords.
2. Measure standard deviation and variance across response times.
3. Verify that response times are statistically indistinguishable.
