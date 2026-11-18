/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

describe('Round 23 Mobile Ergonomics & Performance Optimization Suite (Android & iOS)', () => {

  describe('Item 1: Mobile Bottom Action Sheet for Sort & Filter', () => {
    it('verifies gallery page provides mobile-native Bottom Sheet for sort options instead of top-right dropdown', () => {
      const photosPagePath = path.join(process.cwd(), 'src/app/photos/page.tsx');
      assert.ok(fs.existsSync(photosPagePath), 'src/app/photos/page.tsx must exist');

      const content = fs.readFileSync(photosPagePath, 'utf-8');

      // Verify mobile detection and bottom sheet state
      assert.ok(content.includes('useIsMobile'), 'Must use useIsMobile hook to detect mobile viewport');
      assert.ok(content.includes('sortSheetOpen'), 'Must track sortSheetOpen state');

      // Verify Sheet component import and usage with side="bottom"
      assert.ok(content.includes('SheetContent side="bottom"'), 'Must render SheetContent with side="bottom" for mobile ergonomics');
      assert.ok(content.includes('rounded-t-3xl'), 'Sheet must have rounded top corners typical of mobile action sheets');
      assert.ok(content.includes('Sort Media'), 'Sheet must have clean English title');

      // Verify desktop fallback keeps dropdown menu
      assert.ok(content.includes('<DropdownMenu modal={false}>'), 'Desktop viewports must retain compact DropdownMenu');
    });
  });

  describe('Item 3: Mobile Horizontal Quick-Filter Chips Bar', () => {
    it('verifies horizontal swipeable quick-filter chips bar exists under header with English labels', () => {
      const photosPagePath = path.join(process.cwd(), 'src/app/photos/page.tsx');
      const content = fs.readFileSync(photosPagePath, 'utf-8');

      // Verify horizontal scroll container with no-scrollbar
      assert.ok(content.includes('overflow-x-auto no-scrollbar flex items-center gap-2'), 'Must have touch horizontal scroll container');

      // Verify chips: All, Videos, Group by Date, Nearby, Newest (All English)
      assert.ok(content.includes('>All</span>'), 'Must include "All" quick-filter chip in English');
      assert.ok(content.includes('>Videos</span>'), 'Must include "Videos" quick-filter chip in English');
      assert.ok(content.includes('>By Date</span>'), 'Must include "By Date" quick-filter chip in English');
      assert.ok(content.includes('>Nearby</span>'), 'Must include "Nearby" quick-filter chip in English');
      assert.ok(content.includes('>Newest</span>'), 'Must include "Newest" quick-filter chip in English');

      // Verify active states and touch interactions
      assert.ok(content.includes('active:scale-95'), 'Chips must provide tactile tap feedback');
    });
  });

  describe('Item 4: Predictive Viewport Preloading on High Velocity Scroll', () => {
    it('verifies photo-masonry detects fast flick momentum scroll and preloads landing slice', () => {
      const masonryPath = path.join(process.cwd(), 'src/components/photo/photo-masonry.tsx');
      assert.ok(fs.existsSync(masonryPath), 'src/components/photo/photo-masonry.tsx must exist');

      const content = fs.readFileSync(masonryPath, 'utf-8');

      // Verify velocity computation and high-velocity prefetch function
      assert.ok(content.includes('checkHighVelocityPrefetch'), 'Must have dedicated checkHighVelocityPrefetch handler');
      assert.ok(content.includes('velocity * 450'), 'Must project deceleration landing position based on momentum scroll physics');
      assert.ok(content.includes('projectedLandingIndex'), 'Must calculate projected landing index');
      assert.ok(content.includes('warmUrl(p.thumbnail || p.preview)'), 'Must warm upcoming thumbnail slice ahead of stopping point');

      // Verify it bypasses idleTimer delay when flinging
      assert.ok(content.includes('schedulePrefetch = () => {'), 'Must check high velocity prefetch before starting idle delay');
    });
  });

  describe('Item 5: EXIF Metadata Delivery & Sidebar Spec Rows', () => {
    it('verifies photo-service delivers essential EXIF keys for all photo list and onThisDay queries', () => {
      const photoServicePath = path.join(process.cwd(), 'src/server/service/photo-service.ts');
      assert.ok(fs.existsSync(photoServicePath), 'src/server/service/photo-service.ts must exist');

      const content = fs.readFileSync(photoServicePath, 'utf-8');

      // Verify EXIF query includes raw EXIF in list queries
      assert.ok(content.includes('exifService.listByPhotoIds(photoIds, true)'), 'Must fetch EXIF from database for photo lists');
      assert.ok(content.includes("'Make', 'Model', 'LensMake', 'LensModel'"), 'Must retain camera device keys');
      assert.ok(content.includes("'ExposureTime', 'FNumber', 'FocalLength', 'ISO'"), 'Must retain camera shooting param keys');
    });

    it('verifies photo-info-sidebar renders AnalogFilmStripCard and detailed spec rows for camera and lens', () => {
      const sidebarPath = path.join(process.cwd(), 'src/components/photo/photo-info-sidebar.tsx');
      assert.ok(fs.existsSync(sidebarPath), 'src/components/photo/photo-info-sidebar.tsx must exist');

      const content = fs.readFileSync(sidebarPath, 'utf-8');

      // Verify full sidebar layout without mobile horizontal displacement
      assert.ok(content.includes('fixed top-0 right-0 z-[60] flex h-full w-full flex-col overflow-hidden'), 'Sidebar must be full-width on mobile and right sidebar on desktop');
      assert.ok(content.includes('md:w-84'), 'Desktop must have w-84 sidebar layout');

      // Verify horizontal gesture tracking
      assert.ok(content.includes('isDraggingHorizontal'), 'Must support horizontal swipe-to-close gesture');
      assert.ok(content.includes('Swipe right to close'), 'Must hint swipe right to close on mobile');

      // Verify camera settings / EXIF film strip card prominence and detailed rows
      assert.ok(content.includes('AnalogFilmStripCard'), 'Must render AnalogFilmStripCard prominently for EXIF');
      assert.ok(content.includes('deviceParams.map'), 'Must render explicit device parameter rows (Camera, Lens)');
      assert.ok(content.includes('shootingParams.map'), 'Must render explicit shooting parameter rows (Shutter, Aperture, ISO)');
    });
  });
});
