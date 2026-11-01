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

    it('consolidates analytics overview queries into parallel single-roundtrip queries', () => {
      const analyticsFile = path.resolve(process.cwd(), 'src/server/service/analytics-service.ts');
      const analyticsContent = fs.readFileSync(analyticsFile, 'utf-8');
      assert.ok(analyticsContent.includes('Consolidate overview metrics and distributions into parallel single-roundtrip queries'), 'Must use parallel consolidation');
      assert.ok(analyticsContent.includes('liveThresholdIso'), 'Must compute liveThresholdIso');
    });

    it('uses SQL GROUP BY aggregation for album photo counts and bounded cover candidates', () => {
      const albumFile = path.resolve(process.cwd(), 'src/server/service/album-service.ts');
      const albumContent = fs.readFileSync(albumFile, 'utf-8');
      assert.ok(albumContent.includes('.groupBy(albumPhotoTab.albumId)'), 'Must aggregate album counts via SQL GROUP BY');
      assert.ok(albumContent.includes('.limit(500)'), 'Cover candidates query must be bounded');
    });

    it('bypasses ThumbHash decoding for cached thumbnails and preloads PhotoViewer on hover', () => {
      const cardFile = path.resolve(process.cwd(), 'src/components/photo/photo-card.tsx');
      const cardContent = fs.readFileSync(cardFile, 'utf-8');
      assert.ok(cardContent.includes('!initialLoaded && !isDummyThumbHash'), 'Must bypass ThumbHash decoding if initialLoaded is true');
      assert.ok(cardContent.includes('prefetchPhotoViewer()'), 'Must prefetch photo viewer chunk on hover and touchstart');
    });

    it('optimizes location reverse geocoding precision and caches fallback coordinates', () => {
      const locationFile = path.resolve(process.cwd(), 'src/server/service/location-service.ts');
      const locationContent = fs.readFileSync(locationFile, 'utf-8');
      assert.ok(locationContent.includes('lat.toFixed(4)'), 'Must use 4-decimal precision for street/venue clustering');
      assert.ok(locationContent.includes('setAddressCache(cacheKey, fallbackResult)'), 'Must cache fallback result to prevent timeout storms');
    });

    it('scopes storage cleaner file queries when target storage is specified', () => {
      const cleanerFile = path.resolve(process.cwd(), 'src/server/service/storage-cleaner-service.ts');
      const cleanerContent = fs.readFileSync(cleanerFile, 'utf-8');
      assert.ok(cleanerContent.includes('dbFilesQuery.where(eq(photoTab.storageId, targetStorageId))'), 'Must scope files to targetStorageId');
    });
  });

  describe('Sprint 4 Performance: Content-Visibility, ETag, Preconnect & Tree-Shaking', () => {
    it('applies content-visibility: auto to PhotoCard for off-screen rendering optimization', () => {
      const cardFile = path.resolve(process.cwd(), 'src/components/photo/photo-card.tsx');
      const cardContent = fs.readFileSync(cardFile, 'utf-8');
      assert.ok(cardContent.includes('[content-visibility:auto]'), 'PhotoCard must include [content-visibility:auto] className');
      assert.ok(cardContent.includes('contentVisibility: "auto"'), 'PhotoCard must set contentVisibility in inline style');
    });

    it('enables dynamic HTTP ETag generation and 304 Not Modified validation in Hono', () => {
      const honoFile = path.resolve(process.cwd(), 'src/server/hono/hono.ts');
      const honoContent = fs.readFileSync(honoFile, 'utf-8');
      assert.ok(honoContent.includes("import { etag } from 'hono/etag'"), 'Must import etag middleware');
      assert.ok(honoContent.includes("instance.use('*', etag())"), 'Must register etag middleware');
    });

    it('pre-connects to media gateway and storage origins in root layout', () => {
      const layoutFile = path.resolve(process.cwd(), 'src/app/layout.tsx');
      const layoutContent = fs.readFileSync(layoutFile, 'utf-8');
      assert.ok(layoutContent.includes('process.env.S3_ENDPOINT'), 'Must check S3_ENDPOINT for preconnect');
      assert.ok(layoutContent.includes('preconnectOrigins.add(new URL(formatted).origin)'), 'Must register origins for preconnect');
    });

    it('tree-shakes yet-another-react-lightbox from package.json and globals.css', () => {
      const pkgFile = path.resolve(process.cwd(), 'package.json');
      const pkgContent = fs.readFileSync(pkgFile, 'utf-8');
      assert.ok(!pkgContent.includes('yet-another-react-lightbox'), 'yet-another-react-lightbox must be uninstalled');

      const cssFile = path.resolve(process.cwd(), 'src/app/globals.css');
      const cssContent = fs.readFileSync(cssFile, 'utf-8');
      assert.ok(!cssContent.includes('yet-another-react-lightbox'), 'Dead lightbox CSS imports must be removed from globals.css');
    });

    it('configures adaptive virtual overscan on mobile in PhotoMasonry', () => {
      const masonryFile = path.resolve(process.cwd(), 'src/components/photo/photo-masonry.tsx');
      const masonryContent = fs.readFileSync(masonryFile, 'utf-8');
      assert.ok(masonryContent.includes('overscanBy={isMobile ? 2 : 4}'), 'Must use 2 screens overscan on mobile and 4 on desktop');
    });

    it('precaches PWA application icons in service worker', () => {
      const swFile = path.resolve(process.cwd(), 'public/sw.js');
      const swContent = fs.readFileSync(swFile, 'utf-8');
      assert.ok(swContent.includes('/naypict-icon-192x192.png'), 'Must precache 192x192 icon');
      assert.ok(swContent.includes('/naypict-icon-512x512.png'), 'Must precache 512x512 icon');
    });

    it('uses read-replica database pool for setting queries', () => {
      const settingFile = path.resolve(process.cwd(), 'src/server/service/setting-service.ts');
      const settingContent = fs.readFileSync(settingFile, 'utf-8');
      assert.ok(settingContent.includes('readOrm\n        .select()'), 'settingService.get must use readOrm');
    });

    it('isolates react-easy-crop CSS to avatar-upload component', () => {
      const cssFile = path.resolve(process.cwd(), 'src/app/globals.css');
      const cssContent = fs.readFileSync(cssFile, 'utf-8');
      assert.ok(!cssContent.includes('react-easy-crop'), 'globals.css must not import react-easy-crop');

      const avatarFile = path.resolve(process.cwd(), 'src/components/layout/avatar-upload.tsx');
      const avatarContent = fs.readFileSync(avatarFile, 'utf-8');
      assert.ok(avatarContent.includes('react-easy-crop/react-easy-crop.css'), 'avatar-upload.tsx must import its own CSS');
    });
  });

  describe('Sprint 5 Multi-Device & Cross-Platform Suite (iOS, Android, Tablet, macOS, Windows, Linux)', () => {
    it('implements dynamic viewport height (100dvh) for mobile URL bar stability', () => {
      const cssFile = path.resolve(process.cwd(), 'src/app/globals.css');
      const cssContent = fs.readFileSync(cssFile, 'utf-8');
      assert.ok(cssContent.includes('min-height: calc(100dvh - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px))'), 'globals.css must use 100dvh for safe viewport');

      const photosFile = path.resolve(process.cwd(), 'src/app/photos/page.tsx');
      const photosContent = fs.readFileSync(photosFile, 'utf-8');
      assert.ok(photosContent.includes('h-[calc(100dvh-3.5rem)]'), 'photos page must use 100dvh');

      const albumsFile = path.resolve(process.cwd(), 'src/app/albums/[albumId]/page.tsx');
      const albumsContent = fs.readFileSync(albumsFile, 'utf-8');
      assert.ok(albumsContent.includes('h-[calc(100dvh-3.5rem)]'), 'albums page must use 100dvh');
    });

    it('configures interactiveWidget resizes-visual for Android virtual keyboard stability', () => {
      const layoutFile = path.resolve(process.cwd(), 'src/app/layout.tsx');
      const layoutContent = fs.readFileSync(layoutFile, 'utf-8');
      assert.ok(layoutContent.includes('interactiveWidget: "resizes-visual"'), 'layout.tsx must configure interactiveWidget');
    });

    it('enforces scrollbar-gutter: stable to eliminate 16px CLS jumps on Windows and Linux', () => {
      const cssFile = path.resolve(process.cwd(), 'src/app/globals.css');
      const cssContent = fs.readFileSync(cssFile, 'utf-8');
      assert.ok(cssContent.includes('scrollbar-gutter: stable'), 'html element must reserve stable scrollbar gutter');
    });

    it('suppresses iOS native context action sheet on lightbox images', () => {
      const viewerFile = path.resolve(process.cwd(), 'src/components/photo/photo-viewer.tsx');
      const viewerContent = fs.readFileSync(viewerFile, 'utf-8');
      assert.ok(viewerContent.includes('["WebkitTouchCallout" as string]: "none"'), 'PhotoViewer must suppress webkit touch callout');

      const cssFile = path.resolve(process.cwd(), 'src/app/globals.css');
      const cssContent = fs.readFileSync(cssFile, 'utf-8');
      assert.ok(cssContent.includes('-webkit-touch-callout: none !important'), 'globals.css must suppress touch callout on viewer media');
    });

    it('protects tablets and touch laptops from double-trigger clicks and synthetic tap conflicts', () => {
      const cardFile = path.resolve(process.cwd(), 'src/components/photo/photo-card.tsx');
      const cardContent = fs.readFileSync(cardFile, 'utf-8');
      assert.ok(cardContent.includes('lastTouchEndTimeRef.current = Date.now()'), 'handleTouchEnd must record touch timestamp');
      assert.ok(cardContent.includes('Date.now() - lastTouchEndTimeRef.current < 450'), 'handlePhotoClick must filter recent touch taps');
    });

    it('eliminates sticky hover artifacts on touch-only devices', () => {
      const cssFile = path.resolve(process.cwd(), 'src/app/globals.css');
      const cssContent = fs.readFileSync(cssFile, 'utf-8');
      assert.ok(cssContent.includes('@media (hover: none) and (pointer: coarse)'), 'Must restrict hover effects on coarse pointer devices');
    });

    it('dynamically displays platform-appropriate modifier key (Cmd for Mac vs Ctrl for Windows/Linux)', () => {
      const shortcutsFile = path.resolve(process.cwd(), 'src/components/common/keyboard-shortcuts-dialog.tsx');
      const shortcutsContent = fs.readFileSync(shortcutsFile, 'utf-8');
      assert.ok(shortcutsContent.includes('isApple ? "⌘" : "Ctrl"'), 'Must adapt modifier key for Apple vs Windows/Linux');
    });
  });

  describe('Sprint 6 Resilience & UX Suite: a11y, View Transitions, Offline Fallback & DB Timeout', () => {
    it('enables keyboard navigation and WCAG focus ring on PhotoCard', () => {
      const cardFile = path.resolve(process.cwd(), 'src/components/photo/photo-card.tsx');
      const cardContent = fs.readFileSync(cardFile, 'utf-8');
      assert.ok(cardContent.includes('tabIndex={0}'), 'PhotoCard must be keyboard focusable');
      assert.ok(cardContent.includes('role="button"'), 'PhotoCard must declare button role');
      assert.ok(cardContent.includes('focus-visible:ring-primary'), 'PhotoCard must display focus ring');
      assert.ok(cardContent.includes('e.key === "Enter" || e.key === " "'), 'PhotoCard must open on Enter or Space');
    });

    it('implements View Transitions API for smooth theme switching', () => {
      const providerFile = path.resolve(process.cwd(), 'src/app/provider.tsx');
      const providerContent = fs.readFileSync(providerFile, 'utf-8');
      assert.ok(providerContent.includes('startViewTransition'), 'provider.tsx must leverage startViewTransition');
    });

    it('provides a standalone branded offline fallback page in Service Worker', () => {
      const swFile = path.resolve(process.cwd(), 'public/sw.js');
      const swContent = fs.readFileSync(swFile, 'utf-8');
      assert.ok(swContent.includes('const OFFLINE_HTML ='), 'Service Worker must define OFFLINE_HTML fallback');
      assert.ok(swContent.includes('new Response(OFFLINE_HTML'), 'Service Worker must serve OFFLINE_HTML when network fails');
      assert.ok(swContent.includes("window.addEventListener('online'"), 'Offline page must auto-refresh on reconnection');
    });

    it('protects serverless execution with Neon DB query abort timeout', () => {
      const dbFile = path.resolve(process.cwd(), 'src/server/infra/db.ts');
      const dbContent = fs.readFileSync(dbFile, 'utf-8');
      assert.ok(dbContent.includes('neonConfig.fetchFunction ='), 'Must wrap neonConfig.fetchFunction');
      assert.ok(dbContent.includes('AbortSignal.timeout(8000)'), 'Must enforce 8000ms query timeout');
    });

    it('predictively preloads adjacent lightbox media for 0ms transitions', () => {
      const viewerFile = path.resolve(process.cwd(), 'src/components/photo/photo-viewer.tsx');
      const viewerContent = fs.readFileSync(viewerFile, 'utf-8');
      assert.ok(viewerContent.includes('adjacentIndices = [viewIndex + 1, viewIndex - 1]'), 'Must preload adjacent indices');
      assert.ok(viewerContent.includes('fetchPriority = "low"'), 'Preload must use low priority');
    });

    it('synchronizes infinite canvas bounds during orientation change and resize', () => {
      const galleryFile = path.resolve(process.cwd(), 'src/components/gallery/infinite-gallery.tsx');
      const galleryContent = fs.readFileSync(galleryFile, 'utf-8');
      assert.ok(galleryContent.includes('window.addEventListener("orientationchange"'), 'Must track orientation change');
    });
  });

});

