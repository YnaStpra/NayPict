# SECURITY ASSESSMENT HANDOFF

## PROJECT

Name: NayPict

Purpose: High-performance photo and video gallery, portfolio exhibition, geotagged mapping, and media archiving platform.

Production URL: https://www.naypict.my.id/

Staging URL: https://naypict.vercel.app (Permanently redirected via HTTP 308 to production domain)

Repository architecture: Next.js 16 (App Router) + Hono API Router + Cloudflare Worker Media Gateway + Neon Serverless PostgreSQL + Cloudflare R2 Object Storage.

## STACK

Frontend: Next.js 16.2.10, React 19.2.4, Tailwind CSS v4, Radix UI, Zustand, Leaflet, Framer Motion.

Backend: Hono 4.13.7 mounted within Next.js Route Handlers (`src/app/api/[[...route]]/route.ts`).

Database: Neon Serverless PostgreSQL (`@neondatabase/serverless`) via Drizzle ORM; fallback to SQLite (`better-sqlite3`, `data/naypict.sqlite`) for local development.

ORM: Drizzle ORM 0.45.2 (`drizzle-orm`, `drizzle-kit`).

Authentication: Cookie-based JWT (`__Host-token`), salted Argon2id password hashing (`hash-wasm`), RFC 6238 TOTP 2FA, and Cloudflare Turnstile bot protection.

Authorization: Role-Based Access Control (RBAC) enforced via Next.js Edge Middleware (`src/proxy.ts`), Hono API Interceptor (`src/server/security/security.ts`), and media proxy guard (`src/server/hono/media.ts`).

Storage: Cloudflare R2 private bucket via AWS S3 SDK v3 (`@aws-sdk/client-s3`), with derivatives served via Cloudflare Worker Media Gateway (`workers/media-gateway/`).

Hosting: Vercel Serverless Origin (`sin1` edge compute, `iad1` origin).

CDN/WAF: Cloudflare (Full Strict SSL/TLS, Bot Fight Mode, HSTS, Minimum TLS 1.2).

Third Parties: Cloudflare Turnstile, OpenStreetMap Nominatim API, Upstash Redis REST API.

## ROLES

* Guest (Public Visitor): Unauthenticated visitor with read-only access to public gallery, map, comments, and allowed photo downloads; can post comments (Turnstile guarded) and reactions.
* User (Normal User / `UserTypeEnum.NORMAL = 2`): Registered user with personal profile, avatar update, password change, multi-device session management, and unrestricted photo downloads.
* Admin (Administrator / `UserTypeEnum.ADMIN = 1`): Full system administrator with media upload, batch editing, album management, comment moderation, user administration, storage provider configuration, backup export, and telemetry inspection.

## AUTHENTICATION

Login: `POST /api/login` accepting username, password, turnstileToken, and optional totpCode. Enforces 5 failed attempts per 15 mins rate limiting and constant-time Argon2id password verification.

Registration: None. Self-registration is disabled. Account provisioning is restricted to Admin via `POST /api/user/add`.

Session/JWT: Stateless JWT signed with HMAC-SHA256 (`HS256`) via `hono/jwt`. Claims: `userId`, `uuid`, `tokenVersion`, `iat`, `exp` (30 days). Revocation validated via `tokenVersion` and active session UUID tracking in cache/database.

Refresh token: None. Single 30-day token with server-side version invalidation.

Cookie: `__Host-token` (in production) or `token` (in dev). Attributes: `HttpOnly: true`, `Secure: true`, `SameSite: Lax`, `Path: /`, `Max-Age: 2592000`. Domain omitted per RFC 6265bis.

2FA: RFC 6238 TOTP (Google Authenticator) configured via `POST /api/totp/setup` and `POST /api/totp/enable`.

Password reset: None. No automated email/SMS password recovery. Authenticated users change passwords via `POST /api/user/setUserPassword`; Admins can reset user passwords via `POST /api/user/set`.

## HIGH VALUE RESOURCES

* `POST /api/login`: Authentication entry point; controls access to administrative functions.
* `POST /api/user/add` & `POST /api/user/set`: User management API; controls privilege escalation and account creation.
* `POST /api/storage/set` & `storageTab`: Stores S3/R2 Cloudflare access keys and secrets.
* `POST /api/backup/export`: Exports complete encrypted AES-256-GCM database snapshot.
* `/media/{key}`: Server-proxied original photo files subject to copyright download protection.
* `workers/media-gateway/`: Cloudflare Worker interface with direct private R2 bucket access.
* `POST /api/cron/cleanup`: Maintenance endpoint executing destructive recycle bin purge.

## IMPORTANT API ENDPOINTS

* `POST /api/login` (Auth: No, Role: Public) — Authentication portal.
* `POST /api/logout` (Auth: Yes, Role: Normal/Admin) — Session termination.
* `GET/POST /api/photo/list` (Auth: No, Role: Public) — Core gallery photo feed.
* `POST /api/photo/presignedUploadUrl` (Auth: Yes, Role: Admin) — Direct-to-R2 presigned upload generator.
* `POST /api/photo/comment/add` (Auth: No, Role: Public) — Turnstile-guarded comment submission.
* `POST /api/photo/reaction/add` (Auth: No, Role: Public) — Rate-limited emoji reaction endpoint.
* `POST /api/user/set` (Auth: Yes, Role: Admin) — User management & role assignment.
* `POST /api/storage/set` (Auth: Yes, Role: Admin) — Storage provider credentials configuration.
* `POST /api/backup/export` (Auth: Yes, Role: Admin) — Database dump export.
* `GET /api/cron/cleanup` (Auth: Yes, Role: Bearer CRON_SECRET) — Scheduled maintenance cleaner.
* `GET /media/*` (Auth: Conditional, Role: Public/User) — Media delivery and download proxy.

## PENTEST 1

Date: September 16, 2026

Environment: Production (`https://www.naypict.my.id/`)

Tools: `testssl.sh` v3.2.4, `nuclei` v3.11.1, `OWASP ZAP` v2.17.0 (Baseline passive engine), `ffuf` v2.3.0, `nikto` v2.6.1, `curl` 8.5.0, Node.js Test Runner.

## TESTS ALREADY PERFORMED

* TLS socket handshake testing across edge IPs (`104.21.53.199`, `172.67.218.117`) via `testssl.sh`.
* Automated CVE and vulnerability template scanning via `nuclei` (1,513 templates).
* Passive DAST baseline spidering and HTTP response header analysis via `OWASP ZAP`.
* Content discovery and endpoint fuzzing across 70 sensitive paths via `ffuf`.
* Web server banner, HTTP method, and misconfiguration scanning via `nikto`.
* HTTP/2 banner, redirect status, and header verification via `curl`.
* Automated SSRF boundary and IP validation unit testing via `npm run test:security` (16 passing tests).

## MANUAL TESTS ALREADY PERFORMED

* NONE (0%). No manual penetration testing, Burp Suite intercept proxying, or manual exploit crafting was conducted during Pentest 1.

## SOURCE CODE REVIEWS ALREADY PERFORMED

* Edge Routing Middleware (`src/proxy.ts`): Verified URL interception, session cache check, and 307 redirect behavior.
* API Security Interceptor (`src/server/security/security.ts`): Verified `SYSTEM_PATHS` vs `PUBLIC_API_PATHS` RBAC separation.
* Password Cryptography (`src/server/lib/crypto.ts`): Verified Argon2id 64MB memory parameters, salts, and `crypto.timingSafeEqual` constant-time verification.
* JWT Engine (`src/server/lib/jwt.ts`): Verified `HS256` signing, claim types, and `tokenVersion` enforcement.
* Media Proxy (`src/server/hono/media.ts`): Verified download protection checks on original photo assets.
* Media Gateway Worker (`workers/media-gateway/src/index.js`): Verified prefix restrictions (`previews/`, `thumbnails/`), CORS origin matching, and hotlink filtering.
* SQL Injection Immunity (`src/server/infra/`): Verified 100% Drizzle ORM parameterized SQL statements.
* Command Injection Audit: Verified zero presence of `child_process`, `exec`, or `eval` handling user input.

## CONFIRMED FINDINGS

* NAYPICT-SEC-01 (Medium): Deprecated TLS 1.0 and TLS 1.1 protocol handshakes permitted on Cloudflare edge proxies.
* NAYPICT-SEC-02 (Low): Framework stack disclosure via `x-powered-by: Next.js` response header.
* NAYPICT-SEC-03 (Low): Content Security Policy contains `'unsafe-inline'` directive for scripts and styles (Design Trade-Off).
* NAYPICT-SEC-04 (Informational): Backend infrastructure disclosure via `x-vercel-id` and `x-vercel-cache` response headers.
* NAYPICT-SEC-05 (Informational): Public `/api/health` endpoint disclosed database connectivity status and exact server process uptime in seconds.

## FIXED FINDINGS

* NAYPICT-SEC-01 (Medium): FIXED & RETESTED. Cloudflare Minimum TLS Version updated to TLS 1.2 on Sep 16, 2026. Socket retest confirmed complete rejection of TLS 1.0 and 1.1.
* NAYPICT-SEC-02 (Low): FIXED. Set `poweredByHeader: false` in `next.config.ts` (Commit `2ff7057`; pending production deployment re-test).
* NAYPICT-SEC-05 (Informational): FIXED. Sanitized response payload in `src/server/api/health-api.ts` to return only `{ "status": "healthy", "timestamp": "..." }` (Commit `2ff7057`; pending production deployment re-test).

## UNRESOLVED FINDINGS

* NAYPICT-SEC-03 (Low): Content Security Policy uses `'unsafe-inline'` for scripts and styles. Retained as an accepted architectural design trade-off for Next.js hydration and Turnstile CAPTCHA.
* NAYPICT-SEC-04 (Informational): Vercel routing headers (`x-vercel-id`, `x-vercel-cache`) remain visible on responses. Retained as an optional fix via Cloudflare Transform Rules.

## FALSE POSITIVES

* NONE. All 5 identified findings were technically verified and confirmed via raw HTTP headers or socket handshakes.

## COVERAGE

TLS: TESTED (`testssl.sh`, `nuclei`) — TLS 1.0/1.1 disabled; TLS 1.2+ enforced.

Headers: TESTED (`OWASP ZAP`, `nikto`, `curl`) — HSTS A+, X-Frame-Options: DENY, nosniff confirmed.

CORS: TESTED (`curl`, `workers/media-gateway`) — Strict origin matching; non-reflective behavior confirmed.

Authentication: PARTIALLY TESTED — Rate limiter & Turnstile verified; active brute-force prohibited.

Authorization: PARTIALLY TESTED — Public vs Admin route boundary verified; normal user privilege escalation untested.

RBAC: PARTIALLY TESTED — Code audit confirmed `UserTypeEnum.ADMIN` vs `NORMAL` checks; live token tampering untested.

IDOR/BOLA: NOT TESTED — Object ID manipulation across comments, albums, and photos untested.

API: TESTED — Protected routes return 401 unauthenticated; rate limiters active.

Injection: TESTED — Drizzle ORM parameterized SQL verified; command injection absent.

XSS: PARTIALLY TESTED — Reflected XSS clean; React JSX auto-escaping verified; DOM taint untested.

CSRF: TESTED — Origin/Referer verification + `SameSite: Lax` on `__Host-token` verified.

SSRF: TESTED — Coordinate bounding and IP validation unit tests pass (16/16).

File Upload: PARTIALLY TESTED — Presigned URLs restricted to Admin; polyglot upload untested.

Business Logic: NOT TESTED — Multi-step workflows and parameter tampering untested.

Rate Limiting: TESTED — Upload, login, reaction, telemetry, and location limiters verified active.

Secrets: TESTED — Redacted in error logs; `.env` excluded from version control.

Dependencies: NOT TESTED — No automated dependency vulnerability audit performed in Pentest 1.

Cloud: PARTIALLY TESTED — Cloudflare edge evaluated; Neon DB and Vercel IAM roles untested.

CI/CD: PARTIALLY TESTED — Workflows reviewed; GitHub Actions secrets and runner permissions untested.

## UNTESTED AREAS

* Vertical Privilege Escalation using standard user (`UserTypeEnum.NORMAL`) JWT against Admin APIs.
* Insecure Direct Object References (IDOR / BOLA) on comment moderation, album mutation, and photo deletion.
* Mass Assignment / Property Injection on `POST /api/user/set`.
* File Upload Polyglot Attacks & SVG Embedded Scripting against Cloudflare R2.
* Cryptographic JWT Signature Mutation (`alg: none`, claim tampering).
* Concurrent Request Race Conditions on reaction counters and session revocation.
* Third-Party Dependency Vulnerability Audit (`pnpm audit`, Snyk).
* Edge Cache Poisoning via unkeyed HTTP headers.

## PARTIALLY TESTED AREAS

* Authentication (Login Flow): Rate limiter and Turnstile verified; dynamic 2FA bypass and credential stuffing untested.
* Session Management: Code reviewed; multi-device concurrent session invalidation untested.
* Input Validation: GPS coordinate bounds and TypeScript types verified; full API parameter fuzzing untested.
* Stored & DOM XSS: Passive scanning completed; rich text and DOM source-sink taint analysis untested.
* Cloud Configuration: Edge proxy evaluated; backend serverless IAM and database wire encryption untested.

## IMPORTANT SECURITY-SENSITIVE FILES

* `src/proxy.ts`: Next.js Global Edge Middleware guarding administrative UI routes.
* `src/server/security/security.ts`: Hono API Interceptor enforcing authentication and RBAC boundaries.
* `src/server/security/csrf.ts`: CSRF Origin/Referer validator for state-changing API requests.
* `src/server/lib/crypto.ts`: Salted Argon2id password hashing and constant-time comparison engine.
* `src/server/lib/jwt.ts`: JWT token signing (`HS256`), verification, and claims validation.
* `src/server/service/login-service.ts`: Authentication orchestration, Turnstile verification, and rate limiting.
* `src/server/hono/media.ts`: Media delivery proxy enforcing download protection on original photos.
* `workers/media-gateway/src/index.js`: Cloudflare Worker Media Gateway enforcing prefix isolation on R2.
* `src/server/service/backup-service.ts`: AES-256-GCM encrypted database backup generation.
* `src/server/lib/ip.ts`: Client IP resolution anti-spoofing and SSRF IP classification parser.

## ATTACK SURFACE

Public: UI routes (`/`, `/photos`, `/albums`, `/map`, `/photo/[id]`, `/login`); Public APIs (`/api/photo/list`, `/randomIdList`, `/onThisDay`, `/download`, `/album/list`, `/comment/list`, `/comment/add`, `/reactions`, `/reaction/add`, `/view`, `/share`, `/location/reverse`, `/sync/version`, `/storage/select`, `/csp-report`, `/health`); Media derivatives via Cloudflare Worker (`previews/*`, `thumbnails/*`, videos); Visitor tracking cookie `naypict_vid`.

Authenticated: Normal User APIs (`/api/user/info`, `/api/user/setUserPassword`, `/api/user/setAvatar`, `/api/user/avatar/:key`, `/api/session/list`, `/api/session/revoke`, `/api/session/revoke-others`, `/api/totp/*`); Original photo downloads via `/media/{key}`.

Admin: UI management pages (`/admin`, `/admin/photos`, `/admin/analytics`, `/admin/insights`, `/duplicates`, `/comments`, `/settings`, `/storage`, `/trash`, `/users`); Admin APIs (Media upload/mutation, album management, comment moderation, user account control, storage configuration, encrypted backup export, telemetry analytics).

API: 43 distinct endpoints exposed via Hono on `/api/*` and `/media/*`.

Storage: Private Cloudflare R2 bucket (`photos/*`, `videos/*`, `previews/*`, `thumbnails/*`, `avatars/*`); public access disabled; access restricted to Worker derivatives and authenticated proxy.

External Services: Cloudflare Turnstile API, OpenStreetMap Nominatim API, Cloudflare R2 S3 API, Neon PostgreSQL Wire Protocol, Upstash Redis REST API.

## UNKNOWN INFORMATION

* Exact Upstash Redis token bucket capacity and rate limiting thresholds currently provisioned in production.
* Upstream rate limiting threshold and failure behavior of OpenStreetMap Nominatim.
* Connection pool concurrency limits configured on the Neon PostgreSQL cloud tier.
