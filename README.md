<p align="center">
    <img src="docs/images/logo.png" width="96px" />
    <h1 align="center">NayPict</h1>
    <p align="center"><strong>A masonry-style web photo gallery application built with Next.js</strong></p>
</p>

## Preview

![](docs/images/demo.jpg)
![](docs/images/demo1.jpg)

## Features

- **🖼️ Masonry Gallery:** Browse photos with infinite scrolling, cursor-based pagination, and virtualized rendering.
- **🌄 Thumbnail Optimization:** Automatically generates thumbnails and high-resolution previews for smoother performance on slower networks.
- **📷 EXIF Metadata Parsing:** Parses and records photo EXIF metadata, arranging photos chronologically.
- **💻 Responsive Layout:** Adapts seamlessly to desktop and mobile browsers.
- **☁️ Storage Integration:** Supports local storage and S3-compatible object storage (Cloudflare R2, AWS S3, Supabase Storage).
- **👥 Multi-User Management:** Support for multiple user accounts and permissions.

## Tech Stack

- **Full-stack Framework:** [Next.js](https://nextjs.org/)
- **Web Framework:** [Hono](https://hono.dev/)
- **ORM:** [Drizzle ORM](https://orm.drizzle.team/)
- **Database:** [Neon PostgreSQL](https://neon.tech/) (Cloud) / [SQLite](https://sqlite.org/) (Local)
- **UI Components:** [shadcn/ui](https://ui.shadcn.com/)

## Deploying to Vercel + Neon PostgreSQL

### 1. Create a Neon PostgreSQL Database
1. Sign up at [neon.tech](https://neon.tech/) and create a new project.
2. Copy your Connection String (`postgresql://username:password@ep-xyz.neon.tech/neondb?sslmode=require`).

### 2. Deploy on Vercel
1. Import your GitHub repository (`YnaStpra/pixtale`) on [Vercel](https://vercel.com/new).
2. Configure Environment Variables under **Environment Variables**:
   - `DATABASE_URL`: Your Neon connection string.
   - `JWT_SECRET`: A long random secret string.
   - `ADMIN`: Administrator username (e.g. `admin`).
   - `PASSWORD`: Administrator password (e.g. `password123`).
3. Click **Deploy**. Tables will be created automatically on Neon PostgreSQL upon deployment!

### 3. Connect Cloudflare R2 / S3 Storage (for Photo Uploads)
1. Open your deployed website on Vercel (`https://your-app.vercel.app`).
2. Log in using your `ADMIN` and `PASSWORD`.
3. Go to **Storage** in the left menu -> Click **Add Storage**.
4. Select **Object Storage (S3)**, enter your Bucket, Endpoint, Region, Access Key, and Secret Key.

---

## Local Development

1. Install dependencies:
   ```bash
   pnpm install
   ```

2. Configure environment variables in `.env`:
   ```env
   TITLE=NayPict
   JWT_SECRET=your_jwt_secret
   ADMIN=admin
   PASSWORD=your_password
   ```

3. Run the development server:
   ```bash
   pnpm dev
   ```

4. Open `http://localhost:3000` in your browser.

## Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `DATABASE_URL` | ❌ (Required on Vercel) | Local SQLite | Neon PostgreSQL Connection String |
| `ADMIN` | ✅ | None | Administrator username |
| `PASSWORD` | ✅ | None | Administrator password |
| `JWT_SECRET` | ✅ | None | Secret key for signing JWT tokens |
| `TITLE` | ❌ | NayPict | Website title |

## License

`NayPict` is open-source software licensed under the [AGPL-3.0](LICENSE).
