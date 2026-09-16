# Automated Security & Penetration Testing Report

## Overview
- **Target URL**: `https://www.naypict.my.id/`
- **Owner Authorization**: Verified & Confirmed by Site Owner
- **Testing Approach**: Non-Destructive, Conservative Rate Limiting, Zero-Downtime
- **Execution Date**: September 16, 2026
- **Testing Scope**: Frontend UI, APIs, Authentication, Authorization, Session & Cookies, TLS/SSL, Edge Proxy Configuration, Content Discovery, and Static Code Security Audit.

---

## Directory Structure & Generated Artifacts

| File | Description | Tool / Phase |
| :--- | :--- | :--- |
| [`executive-summary.md`](./executive-summary.md) | High-level risk overview, vulnerability statistics, and remediation priority | Phase 11 & 12 |
| [`findings.md`](./findings.md) | Detailed vulnerability analysis, proof-of-concept evidence, impact, and remediation steps | Phase 10 |
| [`testssl.txt`](./testssl.txt) | Complete SSL/TLS cryptographic cipher and protocol evaluation report | `testssl.sh` v3.2.4 (Phase 3) |
| [`nuclei.txt`](./nuclei.txt) | CLI output of vulnerability scanning across CVEs, exposures, and misconfigurations | `nuclei` v3.11.1 (Phase 4) |
| [`nuclei.json`](./nuclei.json) | Structured JSON export of Nuclei vulnerability scan results | `nuclei` v3.11.1 (Phase 4) |
| [`zap-report.html`](./zap-report.html) | OWASP ZAP passive baseline spider and security headers HTML report | OWASP ZAP Passive Engine (Phase 5) |
| [`zap-report.json`](./zap-report.json) | OWASP ZAP baseline scan structured JSON export | OWASP ZAP Passive Engine (Phase 5) |
| [`ffuf.json`](./ffuf.json) | Content discovery and endpoint fuzzing output across 70 sensitive paths | `ffuf` v2.3.0 (Phase 6) |
| [`nikto.txt`](./nikto.txt) | Web server and HTTP misconfiguration scanner output | `nikto` v2.6.1 (Phase 7) |
| [`wordlist.txt`](./wordlist.txt) | Targeted non-destructive discovery wordlist used for endpoint exploration | Phase 6 |

---

## Testing Phases Summary

1. **Phase 1 — Environment Check**: Verified tool availability (`curl 8.5.0`, `jq 1.7.1`, `brew`). Installed `nuclei 3.11.1`, `ffuf 2.3.0`, `nikto 2.6.1`, `testssl.sh 3.2.4`. Documented OWASP ZAP macOS Gatekeeper status and implemented automated passive baseline engine.
2. **Phase 2 — Passive Reconnaissance**: Evaluated HTTP->HTTPS redirection (301 via Cloudflare), Grade A+ HSTS (`max-age=63072000; includeSubDomains; preload`), `nosniff`, `frame-ancestors 'none'`, CORS non-reflection, and common endpoints (`/robots.txt`, `/sitemap.xml`, `/api/health`).
3. **Phase 3 — TLS & Cryptographic Testing**: Discovered Cloudflare edge accepts legacy TLS 1.0 and TLS 1.1 handshake connections, capping overall SSL Labs rating to **Grade B**. Forward secrecy and post-quantum KEM (`X25519MLKEM768`) are supported.
4. **Phase 4 — Nuclei Vulnerability Scan**: Loaded 1,513 templates. Identified weak cipher suites on TLS 1.0/1.1. No critical CVEs or exposed configuration panels found.
5. **Phase 5 — OWASP ZAP Baseline**: Spidered public and API routes. Identified `X-Powered-By` disclosure, Vercel routing headers, and `'unsafe-inline'` CSP directive.
6. **Phase 6 — Content Discovery**: Tested 70 sensitive paths with `ffuf`. All administrative panels (`/admin`, `/storage`, `/settings`, `/trash`) safely redirect to `/login` (307). All sensitive APIs return `401 Unauthorized`.
7. **Phase 7 — Nikto Web Server Scanner**: Confirmed Cloudflare edge proxying and verified Cloudflare Bot Defense / TLS rate-limiting actively suppresses high-frequency automated probes.
8. **Phase 8 — Static Application Security Review**: Audited source code for Argon2id password hashing, constant-time comparisons, `__Host-token` cookie protection, Turnstile bot defenses, Drizzle ORM SQL injection immunity, and R2 private bucket isolation.
9. **Phase 9 — Business Logic Test Scenarios**: Formulated manual test cases for IDOR, parameter tampering, and role elevation.
10. **Phase 10 — Classification**: Formulated confirmed findings vs false positives.
11. **Phase 11 & 12 — Reports & Prioritization**: Generated comprehensive documentation and actionable remediation order.
