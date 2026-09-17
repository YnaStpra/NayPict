# NayPict Penetration Testing — Phase 3: Infrastructure, SSRF, Media Processing & Real-time Security

**Target Application**: `https://www.naypict.my.id/`  
**Assessment Date**: September 17, 2026  
**Assessment Type**: Phase 3 — SSRF, Media Processing & Decompression Bombs, Real-Time SSE/WebSocket Resilience, PWA Cache Isolation & Post-Pentest Hardening  
**Execution Environment**: Production Verification, Architectural Audit & Source Code Hardening  

---

## Executive Summary

Penetration Testing Phase 3 concludes the security assessment of NayPict. While Phase 1 covered perimeter scanning, TLS configuration, and external reconnaissance, and Phase 2 audited authenticated access control, RBAC, session lifecycle, and object ownership, **Phase 3 focused on deep backend engine and infrastructure security**:

1. **Server-Side Request Forgery (SSRF) & Egress Control**: Evaluated all outbound network requests (Nominatim reverse geocoding, IP geolocation lookups, Cloudflare Turnstile verification, and Upstash Redis REST). Verified strict IP validation and private/cloud metadata range filtering.
2. **Media Processing & Decompression Bomb Resilience**: Audited binary magic bytes validation, Sharp input limits (`limitInputPixels: 268402689`), and WebAssembly FFmpeg decoders against malicious polyglot payloads and pixel-flood resource exhaustion.
3. **Real-Time SSE & DoS Architecture**: Evaluated event broadcasting. Verified that NayPict avoids persistent HTTP Server-Sent Event (SSE) streams on serverless lambdas by utilizing client-side `BroadcastChannel` across tabs and on-demand REST updates, preventing serverless concurrency exhaustion.
4. **PWA & Client-Side Cache Isolation**: Evaluated Service Worker caching (`public/sw.js`). Applied a security patch (`SEC-PHASE3-01`) preventing the caching of `Cache-Control: private` or `no-store` responses, ensuring original protected photo media is never persisted into shared workstation CacheStorage.
5. **Remediation of Prior Findings**: Fully resolved `SEC-PHASE2-01` (login timing discrepancy) by implementing constant-time dummy Argon2id verification for nonexistent accounts.

---

## Phase 3 Deliverables Index

| File | Topic | Primary Finding / Verification |
| :--- | :--- | :--- |
| [`ssrf-testing.md`](./ssrf-testing.md) | SSRF & Outbound Requests | Zero SSRF; strictly protected by `isPublicIp` and GPS bounds. |
| [`media-processing-security.md`](./media-processing-security.md) | Media Engine & Decompression Bombs | Protected by `validateImageMagicBytes` & Sharp `limitInputPixels`. |
| [`realtime-sse-dos-testing.md`](./realtime-sse-dos-testing.md) | Real-Time Events & DoS | Zero long-lived stream exhaustion; client BroadcastChannel architecture. |
| [`pwa-cache-storage-security.md`](./pwa-cache-storage-security.md) | PWA Offline Cache Security | Patched `sw.js` to exclude `private` / `no-store` media. |
| [`findings.md`](./findings.md) | Vulnerability Status & Resolution | All findings (`SEC-PHASE2-01`, `SEC-PHASE3-01`) resolved. |
| [`phase3-handoff.md`](./phase3-handoff.md) | Final Security Certification | Overall security post-assessment sign-off for production. |
