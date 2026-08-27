# Pixtale Media Gateway

This Cloudflare Worker exposes only immutable photo derivatives from a private R2 bucket:

- `GET` and `HEAD` are allowed only for `previews/` and `thumbnails/`.
- `photos/` (legacy originals), `originals/` (new originals), and every unknown prefix return `404` without reading R2.
- `OPTIONS` accepts only the exact origin configured in `APP_URL`; the Worker never emits `Access-Control-Allow-Origin: *`.
- Write methods return `405` and never reach R2.
- Plain `GET` responses are stored in Cloudflare's Cache API under a canonical URL.

Original files must continue to be served by Pixtale's authenticated same-origin `/media/...` route. Do not use this Worker as an original-photo download endpoint.

## Test locally

The tests use Node's built-in test runner and do not require Cloudflare credentials:

```bash
cd workers/media-gateway
npm test
```

## Configure and deploy

1. Copy the example configuration:

   ```bash
   cd workers/media-gateway
   cp wrangler.toml.example wrangler.toml
   ```

2. In `wrangler.toml`, set:

   - `APP_URL` to the exact Pixtale origin, for example `https://gallery.example.com`.
   - `bucket_name` to the existing R2 bucket used by Pixtale.

3. Authenticate and deploy:

   ```bash
   npx wrangler login
   npx wrangler deploy --config wrangler.toml
   ```

4. Test the generated `workers.dev` URL, then attach a dedicated Worker custom domain such as `media.example.com`.

5. Set Pixtale's `R2_PUBLIC_URL` and storage `domain` to that Worker custom domain. Never set either value to a native `pub-*.r2.dev` URL or a custom domain connected directly to the R2 bucket.

For a zero-downtime cutover, deploy and verify the Worker on a new hostname before changing Pixtale's media domain.

## Mandatory R2 privacy checklist

The Worker does not make a publicly exposed bucket private by itself. Complete every item:

- [ ] In **R2 → bucket → Settings → Public Development URL**, disable the `r2.dev` URL.
- [ ] Disable or remove every custom domain connected directly to the R2 bucket.
- [ ] Confirm the media hostname is routed to this Worker, not directly to R2.
- [ ] Keep the `MEDIA_BUCKET` R2 binding; do not add public-read object ACLs.
- [ ] Confirm Pixtale's S3 credentials can still read originals through `/media/...`.
- [ ] Confirm both legacy `photos/` and new `originals/` keys return `404` from the Worker.
- [ ] Confirm the disabled native R2 URLs no longer return `2xx` for a known object.

Cloudflare documents that enabling an `r2.dev` URL makes bucket contents internet-accessible and that it must be disabled when another access-control layer is used: <https://developers.cloudflare.com/r2/buckets/public-buckets/>.

## Smoke tests

Replace the hosts and known derivative keys before running these checks:

```bash
curl -i -X OPTIONS 'https://media.example.com/previews/aa/photo.jpg' \
  -H 'Origin: https://gallery.example.com' \
  -H 'Access-Control-Request-Method: GET'

curl -I 'https://media.example.com/previews/aa/photo.jpg' \
  -H 'Origin: https://gallery.example.com'

curl -I 'https://media.example.com/thumbnails/bb/photo.webp' \
  -H 'Origin: https://gallery.example.com'

curl -i 'https://media.example.com/photos/user/original.jpg'
curl -i 'https://media.example.com/originals/user/original.jpg'
curl -i -X POST 'https://media.example.com/previews/aa/photo.jpg'
```

Expected results are `204` for the valid preflight, `200` for existing derivatives, `404` for both original prefixes, and `405` for `POST`. Inspect every successful CORS response and confirm `Access-Control-Allow-Origin` equals `APP_URL` exactly and is never `*`.
