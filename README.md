<p align="center">
    <img src="docs/images/logo.png" width="96px" />
    <h1 align="center">NayPict</h1>
    <p align="center"><strong>A modern, high-performance masonry web photo gallery built with Next.js & Cloudflare R2</strong></p>
</p>

## 🌟 Highlights & Key Features

- **🌐 Public Read-Only Gallery:** Beautiful, distraction-free photo showcase (`/photos` and `/albums`) accessible to public visitors without login required.
- **🔐 Single-Admin Portal (`/admin`):** Dedicated management dashboard for uploading, editing, organizing albums, and system configurations.
- **🔀 Dynamic Photo Shuffle:** Randomizes photo order using the Fisher-Yates algorithm on every page visit or refresh for a fresh browsing experience.
- **☁️ Private Cloudflare R2 Integration:** Originals remain private behind the authenticated `/media` proxy, while an allowlisted Worker serves preview and thumbnail derivatives.
- **🛡️ Smart Media Streaming Proxy:** Original-file authorization and download policy are enforced by the same-origin `/media/{key}` route.
- **🖼️ Virtualized Masonry Grid:** Responsive masonry layout powered by `masonic` and `react-photo-album` with smooth infinite scrolling.
- **🌄 Instant ThumbHash & WebP Preview:** Displays blurred ThumbHash placeholders while loading WebP/JPEG optimized thumbnails and high-res previews.
- **📷 EXIF Metadata Parsing:** Extracts photo shooting details, camera parameters, and timestamps automatically.
- **📁 Album Organization:** Create albums with custom or auto-suggested cover photos.

---

## 🛠️ Tech Stack

- **Full-stack Framework:** [Next.js 16](https://nextjs.org/) (App Router + Turbopack)
- **UI Library:** [React 19](https://react.dev/)
- **API Framework:** [Hono](https://hono.dev/)
- **Database & ORM:** [Drizzle ORM](https://orm.drizzle.team/) + SQLite (with Vercel Serverless `/tmp` support)
- **Cloud Storage:** Cloudflare R2 / AWS S3 / Local Storage
- **Image Processing:** [Sharp](https://sharp.pixelplumbing.com/) & [ThumbHash](https://github.com/evanw/thumbhash)
- **Styling:** [Tailwind CSS v4](https://tailwindcss.com/) + Radix UI + Lucide Icons + Framer Motion

---

## 🚀 Deploying to Vercel

### 1. Import Repository on Vercel
1. Push your code to GitHub (`https://github.com/YnaStpra/NayPict.git`).
2. Go to [Vercel](https://vercel.com/new) and click **Import** on `NayPict`.

### 2. Configure Environment Variables
Set the following environment variables in Vercel settings:
- `TITLE`: `NayPict`
- `ADMIN`: Your admin username (default: `YOURUSERNAME`)
- `PASSWORD`: Your admin password (default: `YOURPASSWORD`)
- `JWT_SECRET`: A long random secret key

### 3. Click Deploy
Click **Deploy**. Vercel will automatically compile the project and deploy it to a free Vercel subdomain (`https://naypict.vercel.app`).

### 4. Connect Private Cloudflare R2 Storage
1. Create an R2 bucket and keep both its `r2.dev` URL and direct custom-domain public access disabled.
2. Deploy the derivative-only gateway from [`workers/media-gateway`](workers/media-gateway) and bind it to that private bucket.
3. Log in to your deployed app and open **Storage Settings** (`/storage`).
4. Add your **Cloudflare R2** credentials:
   - **Type:** S3 Object Storage
   - **Endpoint:** `https://<ACCOUNT_ID>.r2.cloudflarestorage.com`
   - **Bucket:** Your R2 bucket name
   - **Region:** `auto`
   - **Access Key ID:** Your R2 API Access Key
   - **Secret Access Key:** Your R2 API Secret Key
   - **Domain:** The same Worker URL configured in `R2_MEDIA_GATEWAY_URL`, or blank to proxy every media request through the app
5. Set Cloudflare R2 as **Active / Top Priority**.

The gateway serves only `previews/` and `thumbnails/`. Both the legacy `photos/` prefix and the current `originals/` prefix remain inaccessible through the CDN.

---

## 💻 Local Development

1. **Clone the repository:**
   ```bash
   git clone https://github.com/YnaStpra/NayPict.git
   cd NayPict
   ```

2. **Install dependencies:**
   ```bash
   pnpm install
   ```

3. **Configure Environment Variables (`.env`):**
   ```env
   TITLE=NayPict
   APP_URL=http://localhost:3000
   JWT_SECRET=your_jwt_secret
   ADMIN=admin
   PASSWORD=your_password
   ```

4. **Run the development server:**
   ```bash
   pnpm dev
   ```

5. Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## ⚙️ Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `TITLE` | ❌ | `NayPict` | Website title and app name |
| `ADMIN` | ✅ | `admin isme` | Administrator username |
| `PASSWORD` | ✅ | `yourpass` | Administrator password |
| `JWT_SECRET` | ✅ | `Secret_JWT` | Secret key for signing JWT tokens |
| `APP_URL` | ✅ | `http://localhost:3000` | Canonical application origin used by the CORS allowlist |
| `R2_MEDIA_GATEWAY_URL` | ❌ | — | Allowlisted Worker gateway for derivatives; never a native `r2.dev` URL |

---

## 📄 License

`NayPict` is open-source software licensed under the [AGPL-3.0](LICENSE).
