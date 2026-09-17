# Server-Side Request Forgery (SSRF) Assessment — NayPict Phase 3

This document details the comprehensive evaluation of outbound network calls, host/IP validation routines, and SSRF prevention mechanisms in NayPict.

---

## 1. Outbound Egress Inventory

| Outbound Target | Purpose | Caller Module | Caller Inputs | SSRF Prevention Mechanism | Result |
| :--- | :--- | :--- | :--- | :--- | :---: |
| `https://nominatim.openstreetmap.org/reverse` | Reverse geocoding GPS coordinates | [`location-service.ts:54`](file:///Users/yansaputra/Naypict/src/server/service/location-service.ts#L54) | `lat`, `lng` (Numbers) | Strict floating-point range bounds: `lat ∈ [-90, 90]`, `lng ∈ [-180, 180]`. Rejects `NaN`, `±Infinity`, or non-numeric strings. | **PASS** |
| `https://ipwho.is/{ip}` | Visitor telemetry city/country resolution | [`analytics-api.ts:175`](file:///Users/yansaputra/Naypict/src/server/api/analytics-api.ts#L175) | Client IP | `isPublicIp(ip)` validation blocks private, loopback, CGNAT, and cloud metadata (169.254.169.254) addresses. | **PASS** |
| `http://ip-api.com/json/{ip}` | Fallback visitor telemetry resolution | [`analytics-api.ts:213`](file:///Users/yansaputra/Naypict/src/server/api/analytics-api.ts#L213) | Client IP | Same `isPublicIp(ip)` pre-flight filtering as above. | **PASS** |
| `https://challenges.cloudflare.com/turnstile/v0/siteverify` | Bot challenge validation | [`turnstile.ts:32`](file:///Users/yansaputra/Naypict/src/server/lib/turnstile.ts#L32) | Hardcoded Cloudflare API | Hardcoded endpoint. Payload transmits form-encoded `secret`, `response`, and `remoteip`. | **PASS** |
| Upstash Redis REST API | Distributed cache & rate limiting | [`cache.ts:24`](file:///Users/yansaputra/Naypict/src/server/infra/cache.ts#L24) | Server env `UPSTASH_REDIS_REST_URL` | Configured exclusively via administrator environment variables; no user-controlled URL inputs. | **PASS** |
| AWS S3 / Cloudflare R2 | Media upload/download SDK | [`s3-storage.ts:15`](file:///Users/yansaputra/Naypict/src/server/storage/s3-storage.ts#L15) | Server env credentials | Direct SDK connection; presigned URLs generated server-side. | **PASS** |

---

## 2. In-Depth Evaluation of SSRF Defense Mechanisms

### Test SSRF-01: GPS Boundary Sanitization in Reverse Geocoding
- **Vulnerability Hypothesis**: An attacker passes malicious URL fragments, CRLF injection, or path traversal inside latitude or longitude parameters to pivot the OpenStreetMap request toward internal systems:
  `GET /api/location/reverse?lat=127.0.0.1&lng=80` or `GET /api/location/reverse?lat=169.254.169.254`
- **Source Code Verification**:
  In [`src/server/service/location-service.ts:25-41`](file:///Users/yansaputra/Naypict/src/server/service/location-service.ts#L25-L41):
  ```typescript
  if (
    isNaN(lat) ||
    isNaN(lng) ||
    !isFinite(lat) ||
    !isFinite(lng) ||
    lat < -90 ||
    lat > 90 ||
    lng < -180 ||
    lng > 180
  ) {
    return { address: '', latitude: isNaN(lat) ? 0 : lat, longitude: isNaN(lng) ? 0 : lng, mapsUrl: '' };
  }
  ```
  The parameters are strictly cast to JavaScript native `number`. If the numbers fall outside valid Earth coordinates `[-90, 90]` or `[-180, 180]`, the method returns immediately **without invoking `fetch()`**.
- **Automated Test Suite**: Verified via `npm run test:security` (`tests/security/location-bounds.test.ts`), passing all 4 unit tests.
- **Result**: **PASS** (Immune to SSRF).

---

### Test SSRF-02: IP Address Parsing & Cloud Metadata Defense
- **Vulnerability Hypothesis**: An attacker manipulates `x-forwarded-for` or client IP headers to trick `resolveAccurateGeo` into querying internal endpoints or AWS/GCP/Azure instance metadata services (`http://169.254.169.254/latest/meta-data/`).
- **Source Code Verification**:
  In [`src/server/api/analytics-api.ts:156`](file:///Users/yansaputra/Naypict/src/server/api/analytics-api.ts#L156):
  ```typescript
  if (!isPublicIp(ip)) {
    return sanitizeGeoRecord(fallback);
  }
  ```
  In [`src/server/lib/ip.ts:45-112`](file:///Users/yansaputra/Naypict/src/server/lib/ip.ts#L45-L112), `isPrivateOrReservedIp` evaluates:
  1. Canonical validation via `net.isIP(clean) !== 0` (rejects octal notation attacks such as `0177.0.0.1` and malformed formats).
  2. Blocks `169.254.0.0/16` (Cloud Metadata Service & Link-Local).
  3. Blocks `127.0.0.0/8` and `::1` (Loopback).
  4. Blocks `10.0.0.0/8`, `172.16.0.0/12`, and `192.168.0.0/16` (RFC 1918 Private networks).
  5. Blocks `100.64.0.0/10` (Carrier-Grade NAT).
  6. Blocks `224.0.0.0/4` (Multicast) and `240.0.0.0/4` (Reserved).
  7. Blocks IPv6 Unique-Local (`fc00::/7`) and Link-Local (`fe80::/10`).
- **Automated Test Suite**: Verified via `npm run test:security` (`tests/security/ip-validation.test.ts`), passing all 12 unit tests.
- **Result**: **PASS** (Immune to SSRF & Cloud Metadata Extraction).

---

## 3. Remote URL Ingestion & Webhook Audit

NayPict has **zero** user-facing "Upload by URL" or "Import from Webhook" features. All photo uploads are performed either:
1. Through presigned S3/R2 direct PUT URLs where the destination host is fixed to the bucket origin.
2. Directly via multi-part form upload with binary magic bytes validation.

Because the server never fetches caller-specified external HTTP URLs, the entire attack surface for classical blind or reflected SSRF is non-existent by design.
