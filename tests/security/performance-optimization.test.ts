import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { toMediaUrl, toProxyMediaUrl } from '@/lib/url';

describe('Media Performance & Delivery Optimization Test Suite', () => {

  describe('Edge Media Gateway Direct Resolution (Zero 307 Redirects)', () => {
    const originalGateway = process.env.NEXT_PUBLIC_MEDIA_GATEWAY_URL;

    it('resolves thumbnails directly to CDN gateway when configured', () => {
      process.env.NEXT_PUBLIC_MEDIA_GATEWAY_URL = 'https://media.naypict.com';
      try {
        const url = toMediaUrl('thumbnails/abc-123.avif');
        assert.equal(url, 'https://media.naypict.com/thumbnails/abc-123.avif');

        const proxyUrl = toProxyMediaUrl('thumbnails/abc-123.avif');
        assert.equal(proxyUrl, 'https://media.naypict.com/thumbnails/abc-123.avif');
      } finally {
        process.env.NEXT_PUBLIC_MEDIA_GATEWAY_URL = originalGateway;
      }
    });

    it('resolves previews directly to CDN gateway when configured', () => {
      process.env.NEXT_PUBLIC_MEDIA_GATEWAY_URL = 'https://media.naypict.com';
      try {
        const url = toMediaUrl('previews/photo-large.jpg');
        assert.equal(url, 'https://media.naypict.com/previews/photo-large.jpg');
      } finally {
        process.env.NEXT_PUBLIC_MEDIA_GATEWAY_URL = originalGateway;
      }
    });

    it('resolves videos directly to CDN gateway when configured', () => {
      process.env.NEXT_PUBLIC_MEDIA_GATEWAY_URL = 'https://media.naypict.com';
      try {
        const url = toMediaUrl('videos/vacation.mp4');
        assert.equal(url, 'https://media.naypict.com/videos/vacation.mp4');
      } finally {
        process.env.NEXT_PUBLIC_MEDIA_GATEWAY_URL = originalGateway;
      }
    });

    it('falls back to /media proxy for originals without custom domain', () => {
      delete process.env.NEXT_PUBLIC_MEDIA_GATEWAY_URL;
      delete process.env.R2_MEDIA_GATEWAY_URL;
      const url = toMediaUrl('photos/original-raw.jpg');
      assert.equal(url, '/media/photos/original-raw.jpg');
    });

    it('never exposes private S3 endpoint as direct media gateway base', () => {
      process.env.NEXT_PUBLIC_MEDIA_GATEWAY_URL = 'https://account-id.r2.cloudflarestorage.com/bucket';
      try {
        const url = toMediaUrl('thumbnails/test.avif');
        assert.equal(url, '/media/thumbnails/test.avif');
      } finally {
        process.env.NEXT_PUBLIC_MEDIA_GATEWAY_URL = originalGateway;
      }
    });
  });

  describe('PhotoCard Viewport Priority & Native Lazy Loading', () => {
    const cardFile = path.resolve(process.cwd(), 'src/components/photo/photo-card.tsx');
    const cardContent = fs.readFileSync(cardFile, 'utf-8');

    it('does not include false 1280w preview in thumbnail srcSet to avoid massive mobile downloads', () => {
      assert.ok(
        !cardContent.includes('${data.preview} 1280w'),
        'responsiveSrcSet promoting 2560px preview must not be present'
      );
      assert.ok(
        !cardContent.includes('const responsiveSrcSet ='),
        'misleading responsiveSrcSet declaration should be removed'
      );
    });

    it('ensures off-screen cards use native lazy loading and low fetch priority', () => {
      assert.ok(
        !cardContent.includes('isInPreloadWindow'),
        'isInPreloadWindow forcing eager loading on all cards must not be present'
      );
      assert.ok(
        cardContent.includes('loading={isPriority ? "eager" : "lazy"}'),
        'Card images must strictly use lazy loading unless isPriority is true'
      );
      assert.ok(
        cardContent.includes('fetchPriority={isPriority ? "high" : "low"}'),
        'Card images must strictly use low fetchPriority unless isPriority is true'
      );
    });
  });

  describe('Photo Pipeline & Sharp Dimensions Hardening', () => {
    const processFile = path.resolve(process.cwd(), 'src/server/lib/photo-process.ts');
    const processContent = fs.readFileSync(processFile, 'utf-8');

    it('configures thumbnail resize to 720x720 bounding box for crisp Retina portrait rendering', () => {
      assert.ok(
        processContent.includes('width: 720, height: 720, fit: "inside"'),
        'Sharp thumbnail pipeline must use 720x720 fit inside to prevent blurry 9:16 portraits'
      );
    });
  });

  describe('R2/S3 Upload Edge Cache-Control Headers', () => {
    const serviceFile = path.resolve(process.cwd(), 'src/server/service/photo-service.ts');
    const serviceContent = fs.readFileSync(serviceFile, 'utf-8');

    it('tags preview and thumbnail derivative uploads with public immutable cache headers', () => {
      assert.ok(
        serviceContent.includes("['Cache-Control', 'public, max-age=31536000, immutable']"),
        'Derivative files must use public immutable cache control for CDN edge edge caching'
      );
    });

    it('supports lightweight EXIF projection for high-speed gallery grid listing', () => {
      assert.ok(
        serviceContent.includes('isGridList = false'),
        'toPhotoVo must support isGridList parameter'
      );
      assert.ok(
        serviceContent.includes('true // isGridList: lightweight EXIF payload'),
        'photoService.list must pass isGridList = true to prune unnecessary EXIF in grid responses'
      );
    });
  });

  describe('Next.js Asset Cache Headers', () => {
    const nextConfigFile = path.resolve(process.cwd(), 'next.config.ts');
    const nextConfigContent = fs.readFileSync(nextConfigFile, 'utf-8');

    it('provides immutable cache headers for CSS Houdini paint worklets', () => {
      assert.ok(
        nextConfigContent.includes("source: '/worklets/:path*'"),
        'next.config.ts must configure worklets route for edge caching'
      );
      assert.ok(
        nextConfigContent.includes("value: 'public, max-age=31536000, immutable'"),
        'worklets route must set public immutable Cache-Control header'
      );
    });
  });

  describe('Deep Performance Sprint: Pipeline, SQL Aggregation & Indexes', () => {
    it('eliminates dead WebP mediumBuffer compression during photo processing', () => {
      const processFile = path.resolve(process.cwd(), 'src/server/lib/photo-process.ts');
      const processContent = fs.readFileSync(processFile, 'utf-8');
      assert.ok(!processContent.includes('const mediumBuffer ='), 'Dead mediumBuffer WebP generation must be eliminated');
      assert.ok(processContent.includes('Generated directly from orientedBuffer to avoid lossy intermediate WebP encoding'), 'Thumbnail must generate directly from orientedBuffer');
    });

    it('consolidates N+1 sequential insight queries into single-roundtrip SQL conditional aggregation', () => {
      const insightsFile = path.resolve(process.cwd(), 'src/server/service/insights-service.ts');
      const insightsContent = fs.readFileSync(insightsFile, 'utf-8');
      assert.ok(insightsContent.includes('COUNT(*) FILTER (WHERE'), 'Must use SQL conditional aggregation for metrics');
      assert.ok(insightsContent.includes('Promise.all(['), 'Overview metrics must run in parallel');
    });

    it('lazy-loads EXIF and file metadata only for identified duplicate clusters', () => {
      const serviceFile = path.resolve(process.cwd(), 'src/server/service/photo-service.ts');
      const serviceContent = fs.readFileSync(serviceFile, 'utf-8');
      assert.ok(serviceContent.includes('duplicatePhotoIds = Array.from(new Set(validClusters.flatMap'), 'Must only fetch metadata for duplicate clusters');
    });

    it('ensures high-traffic columns have dedicated database indexes', () => {
      const photoEntity = fs.readFileSync(path.resolve(process.cwd(), 'src/server/entity/photo.ts'), 'utf-8');
      assert.ok(photoEntity.includes('idx_photo_storage_id'), 'photoTab must index storageId');

      const analyticsEntity = fs.readFileSync(path.resolve(process.cwd(), 'src/server/entity/analytics.ts'), 'utf-8');
      assert.ok(analyticsEntity.includes('idx_visitor_session_admin_started'), 'visitorSessionTab must index (isAdmin, startedAt)');

      const insightsEntity = fs.readFileSync(path.resolve(process.cwd(), 'src/server/entity/insights.ts'), 'utf-8');
      assert.ok(insightsEntity.includes('idx_photo_view_photo_type_time'), 'photoViewTab must index (photoId, type, viewedAt)');
    });

    it('pre-caches CSS Houdini paint worklets in PWA service worker', () => {
      const swFile = path.resolve(process.cwd(), 'public/sw.js');
      const swContent = fs.readFileSync(swFile, 'utf-8');
      assert.ok(swContent.includes('/worklets/smooth-corners.js'), 'Must precache smooth corners worklet');
      assert.ok(swContent.includes('/worklets/skeleton-shimmer.js'), 'Must precache skeleton shimmer worklet');
    });

    it('tree-shakes @tabler/icons-react and configures Turbopack optimizePackageImports', () => {
      const pkgFile = path.resolve(process.cwd(), 'package.json');
      const pkgContent = fs.readFileSync(pkgFile, 'utf-8');
      assert.ok(!pkgContent.includes('@tabler/icons-react'), '@tabler/icons-react must be removed from package.json');

      const nextConfigFile = path.resolve(process.cwd(), 'next.config.ts');
      const nextConfigContent = fs.readFileSync(nextConfigFile, 'utf-8');
      assert.ok(nextConfigContent.includes('@radix-ui/react-dialog'), 'optimizePackageImports must include Radix UI modules');
      assert.ok(nextConfigContent.includes('sonner'), 'optimizePackageImports must include sonner');
    });
  });

});

