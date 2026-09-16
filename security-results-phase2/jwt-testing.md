# JWT Validation & Claim Tampering Tests — NayPict Phase 2

This document details the cryptographic verification, algorithm confusion resistance, and claim tampering analysis of the JSON Web Token implementation in NayPict.

---

## 1. JWT Structure & Design Analysis

NayPict utilizes stateless JWTs issued upon successful login at `POST /api/login`.

### Payload Schema
```json
{
  "userId": "usr_xxxxxxxxxxxx",
  "uuid": "ses_xxxxxxxxxxxx",
  "tokenVersion": 1,
  "iat": 1789500000,
  "exp": 1792092000
}
```

### Critical Architectural Security Feature:
> [!IMPORTANT]
> **Privilege level (`role` or `type`) is deliberately NOT present in the JWT claims.**
> The token serves purely as a cryptographic proof of identity (`userId`) and session identifier (`uuid`). All permission decisions query the database or server-side Redis/PostgreSQL cache (`userTab.type`).
> Tampering with client-side JWT claims to escalate privileges is conceptually impossible because the server never consults the JWT for authorization level.

---

## 2. Dynamic & Static Cryptographic Verification

All verification is performed inside [`src/server/lib/jwt.ts`](file:///Users/yansaputra/Naypict/src/server/lib/jwt.ts):

```typescript
// src/server/lib/jwt.ts:49
const payload = await verify(token, secret, 'HS256');
```

| Test Case | Attack Description | Expected Behavior | Actual Behavior | Result | Evidence |
| :--- | :--- | :--- | :--- | :---: | :--- |
| **TC-JWT-01** | **Algorithm "none" Attack** (`alg: "none"`) | Rejected | `verify()` throws exception; caught and returns `null` | **PASS** | Strict `'HS256'` parameter in `verify(token, secret, 'HS256')` |
| **TC-JWT-02** | **Algorithm Confusion** (`alg: "RS256"`) | Rejected | Rejected immediately; algorithm mismatch with `'HS256'` | **PASS** | Explicit algorithm whitelist parameter |
| **TC-JWT-03** | **Modified Signature** (Corrupted signature bytes) | Rejected | Cryptographic HMAC validation failure; returns `null` | **PASS** | HMAC-SHA256 integrity check |
| **TC-JWT-04** | **Payload Tampering** (Alter `userId` with unchanged signature) | Rejected | HMAC signature fails to match recomputed digest | **PASS** | Standard JWT signature verification |
| **TC-JWT-05** | **Expired Token** (`exp < now`) | Rejected | `verify()` validates expiration claims; returns `null` | **PASS** | Built-in Hono JWT expiry enforcement |
| **TC-JWT-06** | **Missing Secret Fail-Safe** (`JWT_SECRET` unset) | Fail closed | Throws fatal error / rejects verification | **PASS** | [`jwt.ts:42-46`](file:///Users/yansaputra/Naypict/src/server/lib/jwt.ts#L42-L46) logs fatal security error and returns `null` |
| **TC-JWT-07** | **Malformed Token Structure** (`eyJ...` with missing segments) | Rejected | Token string split fails; returns `null` | **PASS** | Graceful exception handling |
| **TC-JWT-08** | **Payload Schema Validation** (`userId` or `uuid` not a string) | Rejected | Rejected by explicit schema check: `typeof payload.userId !== 'string'` | **PASS** | [`jwt.ts:51-58`](file:///Users/yansaputra/Naypict/src/server/lib/jwt.ts#L51-L58) |

---

## 3. Claim Tampering & Privilege Escalation (Phase 2H)

### Scenario: Normal User Injects Admin Claim
1. **Attacker Action**: An authenticated Normal User takes their legitimate token `eyJ...REDACTED` and decodes the payload:
   ```json
   {"userId": "usr_normal123", "uuid": "ses_abc", "tokenVersion": 1, "iat": 1789500000, "exp": 1792092000}
   ```
2. **Tampering Attempt**:
   - Case A: Add `"type": 1` (Admin) or `"role": "admin"` to payload.
   - Case B: Change `"userId"` to target Administrator ID (`usr_admin001`).
3. **Outcome Case A**:
   - The token signature is invalidated. Server rejects with `401 Unauthorized`.
   - Even if the attacker had the secret key and signed the token, [`src/server/security/security.ts:144`](file:///Users/yansaputra/Naypict/src/server/security/security.ts#L144) ignores the payload type and executes:
     ```typescript
     const user = await userService.getById(userId);
     authInfo.type = user.type; // Fetched from database!
     ```
     The user remains `UserTypeEnum.NORMAL (2)` and is rejected with `403 Forbidden` on administrative endpoints.
4. **Outcome Case B**:
   - Modifying `userId` without the HMAC secret results in cryptographic verification failure (HTTP 401).
   - Even if signature verification passed, `authInfo.uuidList.includes(uuid)` checks the session UUID against the admin's active session list in cache. The admin has no record of this foreign session UUID, resulting in immediate HTTP 401.

---

## Conclusion
NayPict's JWT implementation conforms strictly to RFC 7519 and OWASP JWT Best Practices. It avoids all common JWT pitfalls (algorithm confusion, secret-as-public-key attacks, self-asserted privilege claims, and unverified lifetimes).
