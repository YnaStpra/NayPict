<p align="center">
  <a href="https://www.naypict.my.id">
    <img src="docs/images/logo.png" width="100px" alt="NayPict Logo" style="border-radius: 20px;" />
  </a>
  <h1 align="center">NayPict</h1>
  <p align="center">
    <strong>Modern, high-performance photo & video gallery built with Next.js 16, Cloudflare R2, Neon PostgreSQL, and interactive media intelligence.</strong>
  </p>
  <p align="center">
    <a href="https://www.naypict.my.id"><img src="https://img.shields.io/badge/Production-naypict.my.id-emerald?style=flat-square&logo=cloudflare" alt="Production Site" /></a>
    <img src="https://img.shields.io/badge/Next.js-16%20(Turbopack)-black?style=flat-square&logo=next.js" alt="Next.js 16" />
    <img src="https://img.shields.io/badge/React-19-blue?style=flat-square&logo=react" alt="React 19" />
    <img src="https://img.shields.io/badge/Storage-Cloudflare%20R2-orange?style=flat-square&logo=cloudflare" alt="Cloudflare R2" />
    <img src="https://img.shields.io/badge/Database-Neon%20Postgres%20%7C%20SQLite-teal?style=flat-square&logo=postgresql" alt="Database" />
    <img src="https://img.shields.io/badge/License-AGPL--3.0-blue.svg?style=flat-square" alt="License" />
  </p>
</p>

---

## 🌟 Highlights & Features

### 📸 & 🎬 Full Photo & Video Multi-Media Gallery
- **Public & Admin Exhibition:** Distraction-free public gallery (`/photos`, `/albums`) with fluid infinite masonry scrolling and full-screen lightbox.
- **Dedicated Video Engine:** Seamless HTML5 & HLS video streaming with custom scrubber controls, volume sliders, and loop/mute controls without touch-swipe conflicts.
- **Client-Side Video Compression:** In-browser WebAssembly-powered compression (`@ffmpeg/ffmpeg`) capable of downsizing massive 4K video uploads to 720p/1080p with up to 90% file size reduction while preserving original perceptual quality.
- **Zero-Shift Blur Loading:** Instant visual feedback using compact [ThumbHash](https://github.com/evanw/thumbhash) placeholders before high-resolution previews load.

### 🗺️ Interactive Media Map (`/map`)
- **Geotagged Discovery:** Explore media plotted across 5 distinct Leaflet map tile styles (Google Streets, Satellite Hybrid, Terrain & Relief, CartoDB Dark, CartoDB Light).
- **Smart Clustering & Spot Covers:** Proximity grouping of burst captures, custom spot cover pins, and coordinates search in DMS or decimal formats.
- **Untagged Media Management:** Quickly assign GPS coordinates or device location to unmapped media, or mark them as intentionally ignored.

### 🔍 Duplicate Media Detector (`/duplicates`)
- **Multi-Factor Fingerprinting:** Automatically scans gallery items using visual pixel fingerprints (*ThumbHash*), file SHA-256 checksums, pixel dimensions, and byte sizes.
- **1-Click Batch Cleanup:** Group-based duplicate inspection allowing single-click deletion of redundant files while preserving the main primary media and album links.

### 📅 Nostalgic "On This Day" Memory Showcase
- **Time-Machine Showcase:** Automatically surfaces memorable moments captured on the current calendar day in prior years.
- **Dynamic Relative Dating:** Computes elapsed years and displays an expandable/collapsible carousel directly above the main gallery grid.

### 📱 Instagram Story Card Generator
- **High-Res Export:** Create stunning 1080×1920 Instagram Story cards from any media item with customizable blurred backgrounds and camera metadata tags (device, lens, shutter, ISO, aperture).
- **1-Click Share & Download:** One-tap direct image download or clipboard copy for effortless social media posting.

### 💬 Community Reactions & Comments
- **Live Emojis:** Interactive instant feedback with optimistic UI counters (🔥, ❤️, ✨, 👏, 🎉).
- **Public Discussions:** Nested commenting system with administrative moderation, pinned highlights, and **Cloudflare Turnstile CAPTCHA** bot defense.

### 📊 Performance & Analytics Insights (`/admin/insights`)
- **Engagement Leaderboards:** Track top-performing media by total views, shares, and reactions.
- **Interactive SVG Analytics:** Real-time visual traffic graphs, device/browser distributions, and animated odometer counters.

### ☁️ Cloudflare R2 & Private Media Gateway
- **100% Private Storage:** R2 bucket public access remains disabled. No raw asset URLs are ever exposed.
- **Edge Derivative Gateway:** Dedicated Cloudflare Worker (`workers/media-gateway/`) serves optimized `thumbnails/` and `previews/`.
- **Authenticated Proxy:** Original file downloads are strictly authenticated and rate-limited through the application's `/media/{key}` endpoint.

### 📱 Progressive Web App (PWA)
- **Installable Desktop & Mobile App:** Native-like standalone installation with offline static shell caching via Service Worker.
- **Comprehensive Brand Icon Pack:** Pixel-sharp icons across all standard dimensions (16px to 512px, SVG, Apple Touch Icon, Android).

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| **Framework** | [Next.js 16](https://nextjs.org/) (App Router, Server Actions & Turbopack) |
| **Frontend** | [React 19](https://react.dev/), [TypeScript](https://www.typescriptlang.org/), [Tailwind CSS v4](https://tailwindcss.com/) |
| **API & Backend** | [Hono](https://hono.dev/) mounted on Next.js Route Handlers |
| **Database & ORM** | [Neon Serverless PostgreSQL](https://neon.tech/) (Production) / [SQLite](https://www.sqlite.org/) (Local Dev) via [Drizzle ORM](https://orm.drizzle.team/) |
| **Object Storage** | [Cloudflare R2](https://www.cloudflare.com/products/r2/) via AWS S3 SDK v3 |
| **Media Processing** | [Sharp](https://sharp.pixelplumbing.com/), [@ffmpeg/ffmpeg](https://ffmpegwasm.netlify.app/) (Wasm), [ThumbHash](https://github.com/evanw/thumbhash) |
| **Maps** | [Leaflet](https://leafletjs.com/) with custom Google & CartoDB tiles |
| **Edge Security** | Cloudflare Turnstile, Upstash Redis Rate Limiting, Strict CSP & Early Hints |

---

## 🚀 Getting Started

### Prerequisites
- Node.js 20+ and `pnpm` (or `npm`)
- A Cloudflare account (for R2 storage) or local storage for testing

### 1. Clone & Install
```bash
git clone https://github.com/YnaStpra/NayPict.git
cd NayPict
pnpm install
```

### 2. Configure Environment Variables
Create a `.env` file in the root directory:
```env
# General
TITLE=NayPict
APP_URL=http://localhost:3000
JWT_SECRET=super_secret_jwt_random_key_here

# Administrator Credentials
ADMIN=admin
PASSWORD=your_secure_password

# Database (Neon PostgreSQL in production; leave blank for local SQLite)
DATABASE_URL=

# Media Gateway (Optional Cloudflare Worker derivative gateway)
R2_MEDIA_GATEWAY_URL=

# Cache & Rate Limiting (Optional Upstash Redis)
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=

# Bot Defense (Optional Cloudflare Turnstile)
NEXT_PUBLIC_TURNSTILE_SITE_KEY=
TURNSTILE_SECRET_KEY=
```

### 3. Run Development Server
```bash
pnpm dev
```
Open [http://localhost:3000](http://localhost:3000) to view your gallery.

---

## 🌐 Deploying to Production (Vercel)

1. **Push to GitHub** (`main` or `develop`).
2. **Import into Vercel** and attach your production domain (e.g. `www.naypict.my.id`).
3. Set your **Environment Variables** in Vercel Project Settings:
   - `TITLE`, `ADMIN`, `PASSWORD`, `JWT_SECRET`, `APP_URL`
   - `DATABASE_URL` (from Neon PostgreSQL)
   - `R2_MEDIA_GATEWAY_URL` (from your Cloudflare Worker)
4. **Deploy Cloudflare Media Gateway**:
   ```bash
   cd workers/media-gateway
   npx wrangler deploy
   ```
5. Log into `/login`, navigate to **Storage Settings** (`/storage`), and connect your Cloudflare R2 bucket credentials.

---

## ⚙️ Environment Variables Reference

| Variable | Required | Default | Description |
|---|---|---|---|
| `TITLE` | Optional | `NayPict` | Gallery branding and browser tab title |
| `ADMIN` | **Required** | — | Administrator portal username |
| `PASSWORD` | **Required** | — | Administrator portal password |
| `JWT_SECRET` | **Required** | — | Secret string for signing session JWTs |
| `APP_URL` | **Required** | `http://localhost:3000` | Canonical origin for CORS & metadata generation |
| `DATABASE_URL` | Optional | `data/naypict.sqlite` | PostgreSQL connection string (Neon Serverless) |
| `R2_MEDIA_GATEWAY_URL` | Optional | — | Worker gateway URL for derivative thumbnail/preview delivery |
| `UPSTASH_REDIS_REST_URL` | Optional | — | Redis REST URL for distributed rate limiting |
| `UPSTASH_REDIS_REST_TOKEN` | Optional | — | Redis authorization token |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | Optional | — | Cloudflare Turnstile Site Key for CAPTCHA verification |
| `TURNSTILE_SECRET_KEY` | Optional | — | Cloudflare Turnstile Secret Key for server verification |

---

## 📄 License

NayPict is open-source software licensed under the [AGPL-3.0 License](LICENSE).
