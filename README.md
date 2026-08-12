<p align="center">
    <img src="docs/images/logo.png" width="96px" />
    <h1 align="center">NayPict</h1>
    <p align="center"><strong>A modern, high-performance masonry web photo gallery built with Next.js & Cloudflare R2</strong></p>
</p>

## 🌟 Highlights & Key Features

- **🌐 Public Read-Only Gallery:** Beautiful, distraction-free photo showcase (`/photos` and `/albums`) accessible to public visitors without login required.
- **🔐 Single-Admin Portal (`/admin`):** Dedicated management dashboard for uploading, editing, organizing albums, and system configurations.
- **🔀 Dynamic Photo Shuffle:** Randomizes photo order using the Fisher-Yates algorithm on every page visit or refresh for a fresh browsing experience.
- **☁️ Cloudflare R2 & S3 Integration:** Full support for Cloudflare R2 and S3-compatible object storage with 10GB free cloud storage capacity.
- **🛡️ Smart Media Streaming Proxy:** Features an internal `/media/{key}` proxy that bypasses ISP DNS blocks on `*.r2.dev` subdomains for 100% reliable image delivery globally.
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

### 4. Connect Cloudflare R2 Storage
1. Log in to your deployed app at `https://your-app.vercel.app/login`.
2. Go to **Storage Settings** (`/storage`).
3. Add your **Cloudflare R2** credentials:
   - **Type:** S3 Object Storage
   - **Endpoint:** `https://<ACCOUNT_ID>.r2.cloudflarestorage.com`
   - **Bucket:** Your R2 bucket name
   - **Region:** `auto`
   - **Access Key ID:** Your R2 API Access Key
   - **Secret Access Key:** Your R2 API Secret Key
   - **Domain:** `https://pub-<ID>.r2.dev` (or custom domain)
4. Set Cloudflare R2 as **Active / Top Priority**.

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
| `ADMIN` | ✅ | `admin` | Administrator username |
| `PASSWORD` | ✅ | `password` | Administrator password |
| `JWT_SECRET` | ✅ | `kuncirahasia12345` | Secret key for signing JWT tokens |

---

## 📄 License

`NayPict` is open-source software licensed under the [AGPL-3.0](LICENSE).
