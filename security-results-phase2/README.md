# NayPict Penetration Testing — Phase 2: Authenticated Access Control & Authorization

**Target Application**: `https://www.naypict.my.id/`  
**Assessment Date**: September 16, 2026  
**Assessment Type**: Phase 2 — Authenticated Access Control, RBAC, BFLA, IDOR/BOLA, Session Security, JWT Validation, Object Ownership & Mass Assignment  
**Execution Environment**: Production Verification, Architectural Audit & Source Code Correlation  
**Branch**: `develop`  

---

## Executive Summary

Penetration Testing Phase 2 focused on the dynamic and architectural verification of authorization boundaries, privilege models, and session management within NayPict. While Phase 1 established perimeter security, TLS hygiene, automated baseline scanning, and network resilience, Phase 2 rigorously evaluated the **Guest → Normal User → Administrator** privilege transitions.

### Overall Assessment Posture
NayPict demonstrates a mature defense-in-depth authorization posture:
1. **Zero Client-Controlled Roles**: Privilege level (`type`) is never embedded into JWT claims. All authorization determinations query persisted user records from the database or server-managed cache.
2. **Global Middleware Interception**: All administrative operations listed under `SYSTEM_PATHS` in `src/server/security/security.ts` are gated prior to controller execution, returning HTTP 403 Forbidden to any authenticated caller with `UserTypeEnum.NORMAL`.
3. **Strict Context-Bound Data Access**: User modification, avatar upload, password changes, session revocation, and 2FA configuration are strictly bound to the authenticated caller's context ID (`getUserId()`), preventing horizontal IDOR/BOLA.
4. **Isolated Media Storage & Derivatives**: Original protected photography is served only through authenticated origin proxies with download permission checks; public derivatives are physically partitioned via an edge worker gateway allowlist.

One minor security observation was identified (observable login timing variation permitting username enumeration), classified as **Low / Informational**.

---

## Phase 2 Assessment Deliverables

| File | Description |
| :--- | :--- |
| [`authorization-matrix.md`](./authorization-matrix.md) | Comprehensive endpoint verification table across Guest, Normal User, and Admin states. |
| [`findings.md`](./findings.md) | Detailed vulnerability report with OWASP classifications, proof of concept, and remediation. |
| [`session-testing.md`](./session-testing.md) | Multi-device session lifecycle, device anomaly detection, and revocation evaluation. |
| [`jwt-testing.md`](./jwt-testing.md) | Cryptographic signature validation, algorithm confusion resistance, and claim tampering tests. |
| [`idor-bola-testing.md`](./idor-bola-testing.md) | Object-level authorization, context isolation, and horizontal access control verification. |
| [`mass-assignment-testing.md`](./mass-assignment-testing.md) | Property injection and DTO/ORM parameter tampering analysis. |
| [`manual-test-log.md`](./manual-test-log.md) | Chronological audit log of all individual test cases with preconditions and results. |
| [`phase2-handoff.md`](./phase2-handoff.md) | Executive handoff summary and recommended focus areas for Phase 3. |

---

## Authorization Boundaries & Privilege Levels

```
                     ┌────────────────────────────────┐
                     │          GUEST (PUBLIC)        │
                     │  - Gallery Browsing & Map      │
                     │  - Unprotected Downloads       │
                     │  - Comments (Turnstile Guard)  │
                     └───────────────┬────────────────┘
                                     │ (POST /api/login)
                                     ▼
                     ┌────────────────────────────────┐
                     │       NORMAL USER (ROLE 2)     │
                     │  - Profile & Password Update   │
                     │  - Multi-Device Session Mgmt   │
                     │  - Personal TOTP 2FA Setup     │
                     │  - Protected Photo Downloads   │
                     └───────────────┬────────────────┘
                                     │ (RBAC Boundary: 403 Forbidden)
                                     ▼
                     ┌────────────────────────────────┐
                     │       ADMINISTRATOR (ROLE 1)   │
                     │  - Full Media Upload & Delete  │
                     │  - Storage Provider Config     │
                     │  - User Account Management     │
                     │  - System Settings & Watermark │
                     │  - Encrypted DB Export Backup  │
                     └────────────────────────────────┘
```
