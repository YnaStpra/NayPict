# Executive Summary: Security Assessment of NayPict

## Target Information
- **Domain**: `https://www.naypict.my.id/`
- **Infrastructure**: Cloudflare DNS/WAF/CDN Proxy → Vercel Serverless Origin
- **Storage**: Cloudflare R2 Private Bucket via Dedicated Cloudflare Worker Media Gateway
- **Database**: Neon Serverless PostgreSQL with Drizzle ORM
- **Assessment Date**: September 16, 2026
- **Assessor**: Antigravity Automated Pentest Engine (Authorized by Site Owner)

---

## Vulnerability Metrics

| Severity | Confirmed | Needs Manual Review | False Positive | Total |
| :--- | :---: | :---: | :---: | :---: |
| 🔴 **CRITICAL** | **0** | 0 | 0 | **0** |
| 🟠 **HIGH** | **0** | 0 | 0 | **0** |
| 🟡 **MEDIUM** | **1** | 0 | 0 | **1** |
| 🔵 **LOW** | **2** | 0 | 0 | **2** |
| ⚪ **INFORMATIONAL** | **2** | 0 | 0 | **2** |
| **TOTAL** | **3** | **0** | **2** | **5** |

---

## Key Risk Highlights

### 1. 🟡 Deprecated TLS 1.0 & TLS 1.1 Protocols Enabled (Medium Risk)
- **Status**: **CONFIRMED**
- **Affected Surface**: Cloudflare Edge Nameserver Handshakes (`104.21.53.199:443`, `172.67.218.117:443`)
- **Summary**: Cloudflare edge proxies permit TLS 1.0 and TLS 1.1 handshakes with obsolete CBC ciphers (`TLS_ECDHE_ECDSA_WITH_AES_128_CBC_SHA`). TLS 1.0 and 1.1 were formally deprecated in RFC 8996 and violate PCI-DSS v3.2.1 requirements.
- **Remediation**: Set **Minimum TLS Version** to **TLS 1.2** in Cloudflare SSL/TLS settings.

### 2. 🔵 Technology Stack Fingerprint via `X-Powered-By: Next.js` (Low Risk)
- **Status**: **CONFIRMED**
- **Affected Surface**: All HTTP responses (`/`, `/login`, `/api/*`)
- **Summary**: The server emits `x-powered-by: Next.js`, advertising the framework stack to automated vulnerability crawlers.
- **Remediation**: Disable the header in `next.config.ts` by adding `poweredByHeader: false`.

### 3. 🔵 Content Security Policy with `'unsafe-inline'` Directive (Low Risk)
- **Status**: **CONFIRMED** (Design Trade-off)
- **Affected Surface**: Global CSP Header
- **Summary**: CSP allows inline script execution (`script-src 'self' 'unsafe-inline' ...`), reducing defense-in-depth protection against potential Cross-Site Scripting (XSS).
- **Remediation**: Transition Next.js hydration scripts to cryptographic nonces if feasible without breaking third-party widgets like Cloudflare Turnstile.

### 4. ⚪ Vercel Origin Infrastructure Disclosure (Informational)
- **Status**: **CONFIRMED**
- **Affected Surface**: HTTP response headers (`x-vercel-id`, `x-vercel-cache`)
- **Summary**: Serverless edge regions (`sin1`, `iad1`) and caching states are revealed in response headers.
- **Remediation**: Strip `x-vercel-*` headers via Cloudflare Transform Rules if complete origin masking is desired.

### 5. ⚪ Uptime & Database Connectivity Disclosed via `/api/health` (Informational)
- **Status**: **CONFIRMED**
- **Affected Surface**: `/api/health`
- **Summary**: Unauthenticated callers receive database connectivity confirmation and process uptime in seconds.
- **Remediation**: Restrict granular health details to authenticated monitoring tokens.

---

## Defensive Strengths Noted During Assessment
- ✅ **Grade A+ HSTS**: Configured with `max-age=63072000; includeSubDomains; preload`.
- ✅ **Framing Protection**: Enforced via both `X-Frame-Options: DENY` and CSP `frame-ancestors 'none'`.
- ✅ **Anti-MIME Sniffing**: Enforced via `X-Content-Type-Options: nosniff`.
- ✅ **Cookie Isolation**: Session tokens use `SameSite: Lax`, `Secure`, `HttpOnly`, and RFC 6265bis `__Host-` prefixing in production (`__Host-token`).
- ✅ **Authentication Security**: Passwords are protected with **Argon2id** (64MB RAM, 3 iterations) with constant-time equality comparisons and Turnstile bot protection.
- ✅ **Authorization Boundaries**: All administrative endpoints (`/admin/*`, `/storage`, `/settings`, `/photo/delete`, `/user/add`) strictly enforce session and role validation; unauthorized requests are rejected with `401 Unauthorized` or redirected to `/login` (307).
- ✅ **SQL Injection Immunity**: Database queries leverage Drizzle ORM parameterized SQL expressions across all services.
- ✅ **Media Storage Privacy**: Cloudflare R2 bucket is private, with authenticated presigned uploads and server-mediated derivative delivery.

---

## Remediation Action Roadmap

| Priority | Action Item | Target Location | Estimated Effort |
| :---: | :--- | :--- | :---: |
| **P1** | Set Minimum TLS Version to **TLS 1.2** | Cloudflare Dashboard → SSL/TLS → Edge Certificates | 2 minutes |
| **P2** | Disable `x-powered-by: Next.js` header | `next.config.ts` (`poweredByHeader: false`) | 5 minutes |
| **P3** | Strip `x-vercel-*` response headers | Cloudflare Dashboard → Rules → Transform Rules | 5 minutes |
| **P4** | Secure or sanitize `/api/health` response | `src/server/api/health-api.ts` | 10 minutes |
| **P5** | Evaluate nonce-based CSP for Next.js | `src/middleware.ts` / Next.js headers | 1-2 hours |
