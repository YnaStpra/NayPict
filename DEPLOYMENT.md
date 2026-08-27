# NayPict – Vercel Deployment Guide

## Prerequisites

Before deploying, you need:

1. **Neon PostgreSQL** account and database → [neon.tech](https://neon.tech)
2. **Cloudflare R2** bucket with API credentials → [Cloudflare Dashboard](https://dash.cloudflare.com)
3. **GitHub** repository connected to Vercel

---

## Step 1 – Set Up Neon PostgreSQL

1. Create account at [neon.tech](https://neon.tech)
2. Create a new project (pick region closest to your users, e.g. `ap-southeast-1` for Southeast Asia)
3. Copy your **Connection String**: `postgresql://user:password@host.neon.tech/dbname?sslmode=require`
4. Save this as your `DATABASE_URL`

---

## Step 2 – Set Up Cloudflare R2

1. Open [Cloudflare Dashboard](https://dash.cloudflare.com) → **R2 Object Storage**
2. Create a new bucket (e.g. `naypict-photos`)
3. Go to **Manage R2 API Tokens** → Create token with **Object Read & Write** permissions
4. Save:
   - `R2_ACCOUNT_ID` → your Cloudflare Account ID (found in R2 settings)
   - `R2_ACCESS_KEY_ID` → from the API token
   - `R2_SECRET_ACCESS_KEY` → from the API token
   - `R2_BUCKET_NAME` → your bucket name
5. In the bucket public-access settings, explicitly disable both the **R2.dev subdomain** and any direct R2 custom domain.
6. Deploy the derivative-only Worker in [`workers/media-gateway`](workers/media-gateway), bind `MEDIA_BUCKET` to this private bucket, and set its `APP_URL` variable to your application origin.
7. Save the Worker URL as `R2_MEDIA_GATEWAY_URL`. The Worker exposes only `previews/` and `thumbnails/`; it returns 404 for both legacy `photos/` and current `originals/` keys.

---

## Step 3 – Run Database Migration

Before deploying to Vercel, generate and run the migration locally once:

```bash
# Set your DATABASE_URL temporarily
export DATABASE_URL="postgresql://..."

# Generate migration files from schema
pnpm db:generate

# Apply migrations to Neon PostgreSQL
pnpm db:migrate
```

> **Note**: The `drizzle/` migration folder must be committed to Git — Vercel uses it on startup.

---

## Step 4 – Configure Vercel Project

1. Go to [vercel.com](https://vercel.com) → Import your GitHub repository
2. Framework: **Next.js** (auto-detected)
3. Do NOT change build settings

---

## Step 5 – Add Environment Variables in Vercel

Go to **Project Settings → Environment Variables** and add:

| Variable | Value | Environment |
|---|---|---|
| `DATABASE_URL` | `postgresql://...neon.tech/...?sslmode=require` | Production, Preview |
| `JWT_SECRET` | (run `openssl rand -base64 32` to generate) | Production, Preview |
| `ADMIN` | Your admin username | Production, Preview |
| `PASSWORD` | Your admin password (strong!) | Production, Preview |
| `TITLE` | `NayPict` (or your site name) | Production, Preview |
| `APP_URL` | `https://your-app.vercel.app` | Production, Preview |
| `R2_ACCOUNT_ID` | Your Cloudflare Account ID | Production, Preview |
| `R2_ACCESS_KEY_ID` | R2 API Access Key | Production, Preview |
| `R2_SECRET_ACCESS_KEY` | R2 API Secret Key | Production, Preview |
| `R2_BUCKET_NAME` | Your R2 bucket name | Production, Preview |
| `R2_MEDIA_GATEWAY_URL` | Your deployed derivative-only Worker URL | Production, Preview |

> **⚠️ NEVER** commit real credentials to `.env` or source code.
>
> **⚠️ Do not define `R2_PUBLIC_URL`.** Production startup rejects this legacy variable because a native public bucket bypasses original-file authorization.

---

## Step 6 – Configure Cloudflare R2 Storage in the App

After your first deployment and login:

1. Login as admin at `https://your-app.vercel.app/login`
2. Go to **Storage Settings**
3. Click **Add Storage**
4. Fill in:
   - **Name**: `Cloudflare R2`
   - **Endpoint**: `https://<ACCOUNT_ID>.r2.cloudflarestorage.com`
   - **Bucket**: your bucket name
   - **Region**: `auto`
   - **Access Key**: your R2 Access Key ID
   - **Secret Key**: your R2 Secret Access Key
   - **Domain**: the exact Worker URL from `R2_MEDIA_GATEWAY_URL`, or leave it blank to use the same-origin proxy
5. Save and set as default

---

## Step 7 – Deploy

1. Push to `main` branch → Vercel auto-deploys
2. Or click **Deploy** in Vercel dashboard

---

## Step 8 – Test After Deployment

- [ ] Open `https://your-app.vercel.app/login`
- [ ] Login with your `ADMIN` / `PASSWORD` credentials
- [ ] Verify redirect to `/admin`
- [ ] Refresh `/admin` — should stay authenticated
- [ ] Upload a photo
- [ ] Verify photo appears in gallery
- [ ] Logout
- [ ] Verify redirect to `/login`
- [ ] Open `/admin` without login — should redirect to `/login`
- [ ] Request `<worker-url>/previews/<known-key>` — should return the derivative
- [ ] Request `<worker-url>/originals/test` and `<worker-url>/photos/test` — both should return 404
- [ ] Confirm the bucket's native `r2.dev` URL remains disabled

---

## Architecture After Migration

```
Browser
  ├─ originals ──→ Vercel `/media` authorization proxy ──→ Private Cloudflare R2
  └─ derivatives → Cloudflare Worker allowlist ───────────→ Private Cloudflare R2
                         │
                         └─ Neon PostgreSQL (metadata, auth, cache, settings)
```

No local filesystem. No SQLite. 100% serverless-compatible.

---

## Troubleshooting

### Admin Login Still Failing?
1. Verify `JWT_SECRET` is set in Vercel env vars
2. Verify `ADMIN` and `PASSWORD` are set
3. Check Vercel function logs for `[INIT]` messages
4. Ensure `DATABASE_URL` connects to Neon (test with `pnpm db:migrate`)

### Photos Not Uploading?
1. Verify R2 credentials in Vercel env vars
2. Verify the Storage record is configured in the app
3. Verify `R2_MEDIA_GATEWAY_URL` and the Worker's `APP_URL` match the application origin exactly
4. Verify the Worker `MEDIA_BUCKET` binding targets the private R2 bucket

### Database Connection Errors?
1. Ensure `DATABASE_URL` includes `?sslmode=require`
2. Verify the Neon database is not paused (free tier pauses after inactivity)
