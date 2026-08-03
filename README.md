<p align="center">
    <img src="docs/images/logo.png" width="96px" />
    <h1 align="center">Pixtale</h1>
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
- **☁️ Storage Integration:** Supports local storage and S3-compatible object storage to aggregate photo storage.
- **👥 Multi-User Management:** Support for multiple user accounts and permissions.

## Tech Stack

- **Full-stack Framework:** [Next.js](https://nextjs.org/)
- **Web Framework:** [Hono](https://hono.dev/)
- **ORM:** [Drizzle ORM](https://orm.drizzle.team/)
- **Database:** [SQLite](https://sqlite.org/)
- **UI Components:** [shadcn/ui](https://ui.shadcn.com/)

## Getting Started

### Local Development

1. Install dependencies:
   ```bash
   pnpm install
   ```

2. Configure environment variables in `.env`:
   ```env
   TITLE=Pixtale
   JWT_SECRET=your_jwt_secret
   ADMIN=admin
   PASSWORD=your_password
   ```

3. Run the development server:
   ```bash
   pnpm dev
   ```

4. Open `http://localhost:3000` in your browser.

### Docker Deployment

```bash
docker run -d \
  --name pixtale \
  -p 8082:8082 \
  -v /home/pixtale:/app/data \
  -e ADMIN=admin \
  -e PASSWORD=your_password \
  -e JWT_SECRET=your_jwt_secret \
  YnaStpra/pixtale:latest
```

## Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `ADMIN` | ✅ | None | Administrator username |
| `PASSWORD` | ✅ | None | Administrator password |
| `JWT_SECRET` | ✅ | None | Secret key for signing JWT tokens |
| `TITLE` | ❌ | Pixtale | Website title |

## License

`Pixtale` is open-source software licensed under the [AGPL-3.0](LICENSE).
