# Detailed Security Findings & Vulnerability Analysis

This document provides a comprehensive technical breakdown of all vulnerabilities, misconfigurations, and information exposures discovered during the security assessment of `https://www.naypict.my.id/`.

---

## Finding 1: Deprecated TLS 1.0 and TLS 1.1 Protocols Enabled on Cloudflare Edge

- **Severity**: 🟡 **MEDIUM**
- **Status**: **CONFIRMED**
- **URL / Endpoint**: `https://www.naypict.my.id:443` (IPs: `104.21.53.199`, `172.67.218.117`)
- **Discovered By**: `testssl.sh` v3.2.4 & `nuclei` v3.11.1
- **CWE / OWASP Reference**: [CWE-326: Inadequate Encryption Strength](https://cwe.mitre.org/data/definitions/326.html) | [RFC 8996: Deprecating TLS 1.0 and TLS 1.1](https://datatracker.ietf.org/doc/rfc8996/) | [PCI-DSS v3.2.1 Requirement 4.1](https://www.pcisecuritystandards.org/)

### Description
The edge proxy nameservers for `www.naypict.my.id` negotiate TLS handshakes using legacy TLS 1.0 and TLS 1.1 protocol versions. In both protocols, outdated Cipher Block Chaining (CBC) suites (`TLS_ECDHE_ECDSA_WITH_AES_128_CBC_SHA`) are permitted. Both TLS 1.0 and 1.1 lack support for modern authenticated encryption with associated data (AEAD) ciphers and are vulnerable to known padding oracle attacks (e.g. POODLE on TLS, BEAST). The overall SSL Labs score is capped at **Grade B**.

### Evidence
1. **testssl.sh Report** ([`security-results/testssl.txt`](./testssl.txt)):
   ```text
   Testing protocols via sockets except NPN+ALPN 
    SSLv2      not offered (OK)
    SSLv3      not offered (OK)
    TLS 1      offered (deprecated)
    TLS 1.1    offered (deprecated)
    TLS 1.2    offered (OK)
    TLS 1.3    offered (OK): final

   Overall Grade: B
   Grade cap reasons: Grade capped to B. TLS 1.1 offered
                      Grade capped to B. TLS 1.0 offered
   ```
2. **Nuclei Output** ([`security-results/nuclei.txt`](./nuclei.txt)):
   ```text
   [weak-cipher-suites:tls-1.0] [ssl] [low] www.naypict.my.id:443 ["[tls10 TLS_ECDHE_ECDSA_WITH_AES_128_CBC_SHA]"]
   [weak-cipher-suites:tls-1.1] [ssl] [low] www.naypict.my.id:443 ["[tls11 TLS_ECDHE_ECDSA_WITH_AES_128_CBC_SHA]"]
   ```

### Impact
Adversaries with network interception capabilities (e.g., public Wi-Fi, rogue proxies) can attempt protocol downgrade attacks against legacy user clients, weakening session confidentiality. Furthermore, organizations requiring compliance with PCI-DSS, HIPAA, or ISO 27001 will fail cryptographic audit standards.

### False Positive Analysis
- **Likelihood**: **FALSE POSITIVE: NO**
- **Reason**: Independently confirmed via socket handshake verification with OpenSSL by two separate tools (`testssl.sh` and `nuclei`).

### Safe Verification Command
```bash
openssl s_client -tls1 -connect www.naypict.my.id:443 < /dev/null
```
*Expected Result: Connection succeeds with `Protocol  : TLSv1`.*

### Remediation
1. Log in to the **Cloudflare Dashboard**.
2. Select the `naypict.my.id` zone.
3. Navigate to **SSL/TLS** → **Edge Certificates**.
4. Scroll to **Minimum TLS Version**.
5. Select **TLS 1.2** (or **TLS 1.3**).
6. Enable **TLS 1.3** and **Automatic HTTPS Rewrites**.

---

## Finding 2: Technology Stack Disclosure via `X-Powered-By: Next.js`

- **Severity**: 🔵 **LOW**
- **Status**: **CONFIRMED**
- **URL / Endpoint**: `https://www.naypict.my.id/` (Global)
- **Discovered By**: `nikto` v2.6.1, `curl` 8.5.0, `OWASP ZAP`
- **CWE / OWASP Reference**: [CWE-200: Exposure of Sensitive Information](https://cwe.mitre.org/data/definitions/200.html) | [OWASP WSTG-INFO-08: Fingerprint Web Server](https://owasp.org/www-project-web-security-testing-guide/latest/4-web-application-security-testing/01-information-gathering/02-fingerprint-web-server)

### Description
Every HTTP response from the production deployment includes the response header `x-powered-by: Next.js`. This discloses the application runtime framework to scanners and attackers.

### Evidence
```http
HTTP/2 200 
date: Wed, 16 Sep 2026 06:54:48 GMT
content-type: text/html; charset=utf-8
x-powered-by: Next.js
server: cloudflare
...
```

### Impact
Assists attackers in performing targeted reconnaissance, enabling them to search for published CVEs specific to Next.js or React Server Components.

### False Positive Analysis
- **Likelihood**: **FALSE POSITIVE: NO**
- **Reason**: Verifiable in cleartext on every HTTP response.

### Safe Verification Command
```bash
curl -sI https://www.naypict.my.id/ | grep -i "x-powered-by"
```

### Remediation
In [`next.config.ts`](file:///Users/yansaputra/Naypict/next.config.ts), disable the header by setting `poweredByHeader: false`:
```ts
const nextConfig: NextConfig = {
  poweredByHeader: false,
  // ... other configuration
};
```

---

## Finding 3: Content Security Policy Uses `'unsafe-inline'` Directive

- **Severity**: 🔵 **LOW**
- **Status**: **CONFIRMED** (Design Trade-Off)
- **URL / Endpoint**: `https://www.naypict.my.id/`
- **Discovered By**: `OWASP ZAP`, `curl`
- **CWE / OWASP Reference**: [CWE-693: Protection Mechanism Failure](https://cwe.mitre.org/data/definitions/693.html) | [OWASP CSP Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Content_Security_Policy_Cheat_Sheet.html)

### Description
The Content Security Policy header defined for NayPict contains `'unsafe-inline'` for both `script-src` and `style-src`:
`content-security-policy: default-src 'self'; script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com; ...`
While necessary for Next.js inline chunk bootstrapping and Cloudflare Turnstile CAPTCHA injection without cryptographic nonce middleware, it weakens CSP's ability to halt client-side DOM injection or reflected XSS.

### Evidence
```http
content-security-policy: default-src 'self'; script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com; frame-src 'self' https://challenges.cloudflare.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; media-src 'self' blob: https:; font-src 'self' data:; connect-src 'self' https: wss: https://challenges.cloudflare.com; frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'; upgrade-insecure-requests; report-uri /api/csp-report; report-to csp-endpoint
```

### Impact
If a vulnerability that allows user-controlled HTML injection were to appear in any client component, the CSP would not block inline script execution from firing.

### False Positive Analysis
- **Likelihood**: **FALSE POSITIVE: NO**
- **Reason**: Confirmed present in header. However, risk is mitigated because Next.js auto-escapes React JSX variables and `object-src 'none'` prevents plugin execution.

### Remediation
Adopt cryptographic nonces for script authorization in Next.js middleware using `crypto.randomUUID()` and inject nonces into `<Script>` tags, allowing removal of `'unsafe-inline'`.

---

## Finding 4: Infrastructure Origin & Routing Disclosure via Vercel Headers

- **Severity**: ⚪ **INFORMATIONAL**
- **Status**: **CONFIRMED**
- **URL / Endpoint**: `https://www.naypict.my.id/`
- **Discovered By**: `nikto` v2.6.1, `OWASP ZAP`
- **CWE / OWASP Reference**: [CWE-200: Exposure of Sensitive Information](https://cwe.mitre.org/data/definitions/200.html)

### Description
The server responses include custom Vercel reverse proxy identifiers:
- `x-vercel-id: sin1::iad1::...`
- `x-vercel-cache: MISS / HIT`
These headers reveal the origin hosting provider (Vercel) and the serverless execution regions (`sin1` = Singapore edge, `iad1` = Northern Virginia origin).

### Evidence
```http
x-vercel-cache: MISS
x-vercel-id: sin1::iad1::h6nr8-1789549326948-3f4079d3a9d7
```

### Impact
Information disclosure that allows external parties to confirm the multi-cloud architecture (Cloudflare proxying to Vercel).

### False Positive Analysis
- **Likelihood**: **FALSE POSITIVE: NO**

### Remediation
If full cloud infrastructure anonymization is desired, configure a **Cloudflare Transform Rule** (HTTP Response Header Modification) to remove headers matching `x-vercel-*`.

---

## Finding 5: Server Uptime & Database Connectivity Disclosed via Public `/api/health`

- **Severity**: ⚪ **INFORMATIONAL**
- **Status**: **CONFIRMED**
- **URL / Endpoint**: `https://www.naypict.my.id/api/health`
- **Discovered By**: `ffuf` v2.3.0, `curl` 8.5.0
- **CWE / OWASP Reference**: [CWE-200: Exposure of Sensitive Information](https://cwe.mitre.org/data/definitions/200.html)

### Description
The `/api/health` route is accessible unauthenticated and returns system operational status:
```json
{
  "status": "healthy",
  "database": "connected",
  "timestamp": "2026-09-16T06:55:36.433Z",
  "uptime": 536
}
```

### Impact
Reveals database connection state and exact server uptime in seconds. Uptime can be leveraged by attackers to determine when code was deployed, server instances rebooted, or cold starts occurred.

### False Positive Analysis
- **Likelihood**: **FALSE POSITIVE: NO**

### Remediation
Modify the health check response to return a simple `{"status": "ok"}` for unauthenticated public monitors, or require a shared secret header (e.g. `X-Health-Check-Key`) for detailed database diagnostics.

---

## Analyzed Non-Issues & False Positive Review

| Scanned Condition | Status | Technical Analysis |
| :--- | :---: | :--- |
| **SQL Injection** | **VERIFIED CLEAN** | All database interactions utilize Drizzle ORM parameterized expressions. No dynamic raw string concatenation exists in service layers. |
| **Unauthenticated File Upload** | **VERIFIED CLEAN** | Direct uploads and multipart presigned URL generators (`/photo/presignedUploadUrl`, `/photo/multipart/initiate`) are restricted to `SYSTEM_PATHS` requiring Admin role. |
| **Password Hashing Weakness** | **VERIFIED CLEAN** | Implements Argon2id (64MB RAM, 3 iterations) with automatic rehashing from legacy hashes and timing-safe equality comparisons. |
| **Session Fixation / Cookie Tossing** | **VERIFIED CLEAN** | In production, session tokens strictly enforce `__Host-token` prefix (RFC 6265bis), `Secure`, `HttpOnly`, and `SameSite: Lax`. |
| **Clickjacking / UI Redress** | **VERIFIED CLEAN** | Protected via both `X-Frame-Options: DENY` and CSP `frame-ancestors 'none'`. |
| **Directory Traversal** | **VERIFIED CLEAN** | FFUF and manual fuzzing against `.git`, `.env`, and backup files confirmed they are blocked with HTTP 307 redirect or HTTP 404. |

---

## Phase 9: Business Logic Manual Test Plan

The following test scenarios represent recommended non-destructive manual verification procedures designed to test authorization boundaries, role enforcement, and parameter manipulation:

### Scenario 1: Vertical Privilege Escalation (Normal User to Admin Endpoints)
- **Objective**: Verify that a non-admin user (`type: UserTypeEnum.NORMAL`) cannot access administrative management routes.
- **Methodology**:
  1. Authenticate with standard non-admin credentials.
  2. Capture the valid JWT cookie (`__Host-token`).
  3. Send an authenticated HTTP POST request to an administrative endpoint such as `/api/user/list` or `/api/photo/delete`:
     ```bash
     curl -s -i -X POST -H "Cookie: __Host-token=<VALID_USER_TOKEN>" "https://www.naypict.my.id/api/user/list"
     ```
- **Expected Defense**: Application must reject with HTTP `403 Forbidden` (`{"code": 403, "message": "Access denied"}`).

### Scenario 2: Horizontal Privilege Escalation & IDOR on Photo Comments
- **Objective**: Verify whether User A can delete or manipulate comments posted by User B.
- **Methodology**:
  1. Post a comment on a photo as Guest/User A and obtain `commentId_A`.
  2. Post a comment as User B and obtain `commentId_B`.
  3. Issue an API call to `/api/photo/comment/delete` with `{"commentId": "commentId_B"}` using User A's session or unauthenticated token.
- **Expected Defense**: HTTP `401 Unauthorized` or `403 Forbidden` because comment deletion is restricted exclusively to authenticated Administrators.

### Scenario 3: Mass Assignment / Privilege Tampering during Profile/User Updates
- **Objective**: Test if adding unauthorized privilege fields (e.g. `type: 1` or `isAdmin: true`) during user creation/update promotes a standard user to administrator.
- **Methodology**:
  1. Send a request to `/api/user/set` with extra payload properties:
     ```json
     {
       "userId": "usr_target",
       "username": "tester",
       "type": 1,
       "isAdmin": true
     }
     ```
- **Expected Defense**: The backend DTO schema must sanitize or reject unpermitted fields (`type` must only be modifiable by an authenticated Administrator via explicit role-modification logic).

### Scenario 4: Direct API Invocations Bypassing Frontend Validation
- **Objective**: Verify that backend validation does not rely solely on client-side React constraints.
- **Methodology**:
  1. Direct invocation of `/api/photo/comment/add` with payloads exceeding 1,000 characters, empty names, or invalid `photoId`.
  2. Direct invocation of `/api/telemetry/session/location` with GPS coordinates out of bounds (e.g. `latitude: 999.0` or `latitude: "NaN"`).
- **Expected Defense**: Backend responds with HTTP `400 Bad Request` or gracefully drops invalid inputs via bounds-checking and sanitizers.

