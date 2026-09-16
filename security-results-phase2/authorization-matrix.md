# Authorization Matrix — NayPict Phase 2

This document details the dynamic and architectural authorization verification across the three effective privilege levels:
1. **Guest**: Unauthenticated anonymous caller.
2. **Normal User**: Authenticated caller with `type === UserTypeEnum.NORMAL (2)`.
3. **Admin User**: Authenticated caller with `type === UserTypeEnum.ADMIN (1)`.

---

## Authorization Evaluation Table

| Method | Endpoint | Guest | Normal | Admin | Expected | Actual | Result | Evidence / Source Code Guard |
| :--- | :--- | :---: | :---: | :---: | :--- | :--- | :---: | :--- |
| `POST` | `/api/user/add` | 401 | 403 | 200 | Admin only | 401 / 403 / 200 | **PASS** | [`security.ts:20`](file:///Users/yansaputra/Naypict/src/server/security/security.ts#L20), `SYSTEM_PATHS` |
| `POST` | `/api/user/set` | 401 | 403 | 200 | Admin only | 401 / 403 / 200 | **PASS** | [`security.ts:21`](file:///Users/yansaputra/Naypict/src/server/security/security.ts#L21), `SYSTEM_PATHS` |
| `POST` | `/api/user/list` | 401 | 403 | 200 | Admin only | 401 / 403 / 200 | **PASS** | [`security.ts:19`](file:///Users/yansaputra/Naypict/src/server/security/security.ts#L19), `SYSTEM_PATHS` |
| `POST` | `/api/user/toggleStatus` | 401 | 403 | 200 | Admin only | 401 / 403 / 200 | **PASS** | [`security.ts:22`](file:///Users/yansaputra/Naypict/src/server/security/security.ts#L22), `SYSTEM_PATHS` |
| `POST` | `/api/user/delete` | 401 | 403 | 200 | Admin only | 401 / 403 / 200 | **PASS** | [`security.ts:23`](file:///Users/yansaputra/Naypict/src/server/security/security.ts#L23), `SYSTEM_PATHS` |
| `POST` | `/api/storage/list` | 401 | 403 | 200 | Admin only | 401 / 403 / 200 | **PASS** | [`security.ts:24`](file:///Users/yansaputra/Naypict/src/server/security/security.ts#L24), `SYSTEM_PATHS` |
| `POST` | `/api/storage/add` | 401 | 403 | 200 | Admin only | 401 / 403 / 200 | **PASS** | [`security.ts:24`](file:///Users/yansaputra/Naypict/src/server/security/security.ts#L24), `SYSTEM_PATHS` |
| `POST` | `/api/storage/set` | 401 | 403 | 200 | Admin only | 401 / 403 / 200 | **PASS** | [`security.ts:24`](file:///Users/yansaputra/Naypict/src/server/security/security.ts#L24), `SYSTEM_PATHS` |
| `POST` | `/api/storage/toggleStatus` | 401 | 403 | 200 | Admin only | 401 / 403 / 200 | **PASS** | [`security.ts:24`](file:///Users/yansaputra/Naypict/src/server/security/security.ts#L24), `SYSTEM_PATHS` |
| `POST` | `/api/storage/delete` | 401 | 403 | 200 | Admin only | 401 / 403 / 200 | **PASS** | [`security.ts:24`](file:///Users/yansaputra/Naypict/src/server/security/security.ts#L24), `SYSTEM_PATHS` |
| `POST` | `/api/setting/set` | 401 | 403 | 200 | Admin only | 401 / 403 / 200 | **PASS** | [`security.ts:18`](file:///Users/yansaputra/Naypict/src/server/security/security.ts#L18), `SYSTEM_PATHS` |
| `GET` | `/api/backup/stats` | 401 | 403 | 200 | Admin only | 401 / 403 / 200 | **PASS** | [`security.ts:62`](file:///Users/yansaputra/Naypict/src/server/security/security.ts#L62), `SYSTEM_PATHS` |
| `POST` | `/api/backup/export` | 401 | 403 | 200 | Admin only | 401 / 403 / 200 | **PASS** | [`security.ts:62`](file:///Users/yansaputra/Naypict/src/server/security/security.ts#L62), `SYSTEM_PATHS` |
| `POST` | `/api/photo/presignedUploadUrl` | 401 | 403 | 200 | Admin only | 401 / 403 / 200 | **PASS** | [`security.ts:36`](file:///Users/yansaputra/Naypict/src/server/security/security.ts#L36), `SYSTEM_PATHS` |
| `POST` | `/api/photo/batchEdit` | 401 | 403 | 200 | Admin only | 401 / 403 / 200 | **PASS** | [`security.ts:27`](file:///Users/yansaputra/Naypict/src/server/security/security.ts#L27), `SYSTEM_PATHS` |
| `POST` | `/api/photo/recycle` | 401 | 403 | 200 | Admin only | 401 / 403 / 200 | **PASS** | [`security.ts:28`](file:///Users/yansaputra/Naypict/src/server/security/security.ts#L28), `SYSTEM_PATHS` |
| `POST` | `/api/photo/restore` | 401 | 403 | 200 | Admin only | 401 / 403 / 200 | **PASS** | [`security.ts:29`](file:///Users/yansaputra/Naypict/src/server/security/security.ts#L29), `SYSTEM_PATHS` |
| `POST` | `/api/photo/delete` | 401 | 403 | 200 | Admin only | 401 / 403 / 200 | **PASS** | [`security.ts:30`](file:///Users/yansaputra/Naypict/src/server/security/security.ts#L30), `SYSTEM_PATHS` |
| `POST` | `/api/photo/clear` | 401 | 403 | 200 | Admin only | 401 / 403 / 200 | **PASS** | [`security.ts:31`](file:///Users/yansaputra/Naypict/src/server/security/security.ts#L31), `SYSTEM_PATHS` |
| `POST` | `/api/album/add` | 401 | 403 | 200 | Admin only | 401 / 403 / 200 | **PASS** | [`security.ts:41`](file:///Users/yansaputra/Naypict/src/server/security/security.ts#L41), `SYSTEM_PATHS` |
| `POST` | `/api/album/setName` | 401 | 403 | 200 | Admin only | 401 / 403 / 200 | **PASS** | [`security.ts:47`](file:///Users/yansaputra/Naypict/src/server/security/security.ts#L47), `SYSTEM_PATHS` |
| `POST` | `/api/album/delete` | 401 | 403 | 200 | Admin only | 401 / 403 / 200 | **PASS** | [`security.ts:49`](file:///Users/yansaputra/Naypict/src/server/security/security.ts#L49), `SYSTEM_PATHS` |
| `POST` | `/api/photo/comment/admin/list`| 401 | 403 | 200 | Admin only | 401 / 403 / 200 | **PASS** | [`security.ts:51`](file:///Users/yansaputra/Naypict/src/server/security/security.ts#L51), `SYSTEM_PATHS` |
| `POST` | `/api/photo/comment/delete` | 401 | 403 | 200 | Admin only | 401 / 403 / 200 | **PASS** | [`security.ts:53`](file:///Users/yansaputra/Naypict/src/server/security/security.ts#L53), `SYSTEM_PATHS` |
| `POST` | `/api/photo/comment/reply` | 401 | 403 | 200 | Admin only | 401 / 403 / 200 | **PASS** | [`security.ts:52`](file:///Users/yansaputra/Naypict/src/server/security/security.ts#L52), `SYSTEM_PATHS` |
| `POST` | `/api/analytics/overview` | 401 | 403 | 200 | Admin only | 401 / 403 / 200 | **PASS** | [`security.ts:59`](file:///Users/yansaputra/Naypict/src/server/security/security.ts#L59), `SYSTEM_PATHS` |
| `POST` | `/api/analytics/sessions` | 401 | 403 | 200 | Admin only | 401 / 403 / 200 | **PASS** | [`security.ts:60`](file:///Users/yansaputra/Naypict/src/server/security/security.ts#L60), `SYSTEM_PATHS` |
| `POST` | `/api/analytics/reset` | 401 | 403 | 200 | Admin only | 401 / 403 / 200 | **PASS** | [`security.ts:61`](file:///Users/yansaputra/Naypict/src/server/security/security.ts#L61), `SYSTEM_PATHS` |
| `POST` | `/api/user/info` | 401 | 200 | 200 | Authenticated user | 401 / 200 / 200 | **PASS** | Context-bound `getUserId()`, [`user-api.ts:15`](file:///Users/yansaputra/Naypict/src/server/api/user-api.ts#L15) |
| `POST` | `/api/user/setUserPassword`| 401 | 200 | 200 | Authenticated user | 401 / 200 / 200 | **PASS** | Context-bound `getUserId()`, [`user-api.ts:58`](file:///Users/yansaputra/Naypict/src/server/api/user-api.ts#L58) |
| `POST` | `/api/user/setAvatar` | 401 | 200 | 200 | Authenticated user | 401 / 200 / 200 | **PASS** | Context-bound `getUserId()`, [`user-api.ts:70`](file:///Users/yansaputra/Naypict/src/server/api/user-api.ts#L70) |
| `GET` | `/api/session/list` | 401 | 200 | 200 | Authenticated user | 401 / 200 / 200 | **PASS** | Context-bound `getUserId()`, [`session-api.ts:14`](file:///Users/yansaputra/Naypict/src/server/api/session-api.ts#L14) |
| `POST` | `/api/session/revoke` | 401 | 200 | 200 | Authenticated user | 401 / 200 / 200 | **PASS** | Context-bound `getUserId()`, [`session-api.ts:37`](file:///Users/yansaputra/Naypict/src/server/api/session-api.ts#L37) |
| `POST` | `/api/session/revoke-others` | 401 | 200 | 200 | Authenticated user | 401 / 200 / 200 | **PASS** | Context-bound `getUserId()`, [`session-api.ts:53`](file:///Users/yansaputra/Naypict/src/server/api/session-api.ts#L53) |
| `GET` | `/api/totp/status` | 401 | 200 | 200 | Authenticated user | 401 / 200 / 200 | **PASS** | Context-bound `getUserId()`, [`totp-api.ts:18`](file:///Users/yansaputra/Naypict/src/server/api/totp-api.ts#L18) |
| `POST` | `/api/totp/setup` | 401 | 200 | 200 | Authenticated user | 401 / 200 / 200 | **PASS** | Context-bound `getUserId()`, [`totp-api.ts:30`](file:///Users/yansaputra/Naypict/src/server/api/totp-api.ts#L30) |
| `POST` | `/api/totp/enable` | 401 | 200 | 200 | Authenticated user | 401 / 200 / 200 | **PASS** | Context-bound `getUserId()`, [`totp-api.ts:42`](file:///Users/yansaputra/Naypict/src/server/api/totp-api.ts#L42) |
| `POST` | `/api/totp/disable` | 401 | 200 | 200 | Authenticated user | 401 / 200 / 200 | **PASS** | Context-bound `getUserId()`, [`totp-api.ts:53`](file:///Users/yansaputra/Naypict/src/server/api/totp-api.ts#L53) |
| `GET` | `/media/{key}` (Originals, protected) | 403 | 200 | 200 | Authenticated / Allowed | 403 / 200 / 200 | **PASS** | `allowDownload = 0`, [`media.ts:117`](file:///Users/yansaputra/Naypict/src/server/hono/media.ts#L117) |
| `GET` | `/media/{key}` (Originals, public) | 200 | 200 | 200 | Public permitted | 200 / 200 / 200 | **PASS** | `allowDownload = 1`, [`media.ts:117`](file:///Users/yansaputra/Naypict/src/server/hono/media.ts#L117) |
| `GET` | `/media/{key}` (Derivatives) | 307 | 307 | 307 | Public redirected to CDN | 307 / 307 / 307 | **PASS** | Offloaded to Worker Media Gateway, [`media.ts:139`](file:///Users/yansaputra/Naypict/src/server/hono/media.ts#L139) |
| `POST` | `/api/photo/download` | 403/200| 200 | 200 | Authenticated / Allowed | 403 / 200 / 200 | **PASS** | Protected by `allowDownload \|\| userId`, [`photo-api.ts:356`](file:///Users/yansaputra/Naypict/src/server/api/photo-api.ts#L356) |
| `POST` | `/api/photo/list` | 200 | 200 | 200 | Public permitted | 200 / 200 / 200 | **PASS** | In `PUBLIC_API_PATHS`, [`security.ts:70`](file:///Users/yansaputra/Naypict/src/server/security/security.ts#L70) |
| `POST` | `/api/photo/comment/add` | 200 | 200 | 200 | Public (Turnstile) | 200 / 200 / 200 | **PASS** | In `PUBLIC_API_PATHS`, [`security.ts:80`](file:///Users/yansaputra/Naypict/src/server/security/security.ts#L80) |
| `POST` | `/api/photo/reaction/add` | 200 | 200 | 200 | Public (Rate-limited) | 200 / 200 / 200 | **PASS** | In `PUBLIC_API_PATHS`, [`security.ts:82`](file:///Users/yansaputra/Naypict/src/server/security/security.ts#L82) |
