/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

describe('Round 24 Mobile Ergonomics & Adaptive Performance Suite', () => {

  describe('Item 1: Dynamic Grid Density & Pinch-to-Zoom Sync (Feed / Standard / Compact)', () => {
    it('verifies photo-masonry supports custom event cycle and human-readable column density labels', () => {
      const masonryPath = path.join(process.cwd(), 'src/components/photo/photo-masonry.tsx');
      assert.ok(fs.existsSync(masonryPath), 'src/components/photo/photo-masonry.tsx must exist');

      const content = fs.readFileSync(masonryPath, 'utf-8');

      // Verify human-friendly density labels
      assert.ok(content.includes('function getColumnDensityLabel'), 'Must have getColumnDensityLabel function');
      assert.ok(content.includes('1 Column (Feed View)'), 'Must define Feed View for 1 column');
      assert.ok(content.includes('2 Columns (Standard)'), 'Must define Standard for 2 columns');
      assert.ok(content.includes('3 Columns (Compact)'), 'Must define Compact for 3 columns');

      // Verify custom events for external chip triggering
      assert.ok(content.includes('naypict:grid-columns-cycle'), 'Must listen to naypict:grid-columns-cycle event');
      assert.ok(content.includes('naypict:grid-columns-change'), 'Must listen to naypict:grid-columns-change event');
      assert.ok(content.includes('localStorage.setItem(key, String(nextCols))'), 'Must persist column choice across reloads');

      // Verify capsule indicator displays the density label
      assert.ok(content.includes('getColumnDensityLabel(indicatorInfo.columns)'), 'Floating capsule must display descriptive density label');
    });

    it('verifies gallery quick-filter bar contains Grid Density toggle chip', () => {
      const photosPagePath = path.join(process.cwd(), 'src/app/photos/page.tsx');
      const content = fs.readFileSync(photosPagePath, 'utf-8');

      assert.ok(content.includes('naypict:grid-columns-cycle'), 'Quick chip must dispatch naypict:grid-columns-cycle event');
      assert.ok(content.includes('<span>Grid Density</span>'), 'Must render Grid Density chip label in English');
      assert.ok(content.includes('Toggle Grid Density'), 'Must have accessible aria-label');
    });
  });

  describe('Item 4: Admin Mobile Floating Speed Dial (FAB)', () => {
    it('verifies AdminMobileSpeedDial component exists with actions and Admin gating', () => {
      const speedDialPath = path.join(process.cwd(), 'src/components/admin/admin-mobile-speed-dial.tsx');
      assert.ok(fs.existsSync(speedDialPath), 'src/components/admin/admin-mobile-speed-dial.tsx must exist');

      const content = fs.readFileSync(speedDialPath, 'utf-8');

      // Verify Admin and mobile gating
      assert.ok(content.includes('UserTypeEnum.ADMIN'), 'Must gate to admin users only');
      assert.ok(content.includes('md:hidden'), 'Must be hidden on desktop viewports');

      // Verify actions: Upload Media, Albums, Admin Console
      assert.ok(content.includes('openUpload(null)'), 'Must support 1-tap Upload Media');
      assert.ok(content.includes('router.push("/albums")'), 'Must support Albums shortcut');
      assert.ok(content.includes('router.push("/admin")'), 'Must support Admin Console shortcut');

      // Verify auto-hiding when lightbox/viewer is open
      assert.ok(content.includes('data-yarl-viewer-open'), 'Must observe viewer attribute to auto-hide');
    });

    it('verifies AdminMobileSpeedDial is mounted in app-sidebar alongside MobileBottomNav', () => {
      const sidebarPath = path.join(process.cwd(), 'src/components/layout/app-sidebar.tsx');
      const content = fs.readFileSync(sidebarPath, 'utf-8');

      assert.ok(content.includes('AdminMobileSpeedDial'), 'AppSidebar must import AdminMobileSpeedDial');
      assert.ok(content.includes('<AdminMobileSpeedDial />'), 'AppSidebar must render AdminMobileSpeedDial');
    });
  });

  describe('Item 5: Smart Battery & Data Saver Eco Mode', () => {
    it('verifies useAdaptivePerformance hook supports ecoModeOverride and synchronizes .eco-mode class to DOM', () => {
      const hookPath = path.join(process.cwd(), 'src/hooks/use-adaptive-performance.ts');
      assert.ok(fs.existsSync(hookPath), 'src/hooks/use-adaptive-performance.ts must exist');

      const content = fs.readFileSync(hookPath, 'utf-8');

      // Verify override types and exports
      assert.ok(content.includes('EcoModeOverride'), 'Must export EcoModeOverride type');
      assert.ok(content.includes('setEcoModeOverride'), 'Must export setEcoModeOverride function');
      assert.ok(content.includes('getEcoModeOverride'), 'Must export getEcoModeOverride function');
      assert.ok(content.includes('naypict_eco_mode'), 'Must persist eco mode preference in localStorage');

      // Verify DOM class synchronization
      assert.ok(content.includes('document.documentElement.classList.toggle("eco-mode", isEco)'), 'Must toggle eco-mode class on document root');
    });

    it('verifies globals.css includes GPU and backdrop-filter bypass rules for .eco-mode', () => {
      const cssPath = path.join(process.cwd(), 'src/app/globals.css');
      const content = fs.readFileSync(cssPath, 'utf-8');

      assert.ok(content.includes('.eco-mode [class*="backdrop-blur"]'), 'Must target backdrop-blur classes in eco mode');
      assert.ok(content.includes('backdrop-filter: none !important'), 'Must disable heavy GPU backdrop filter in eco mode');
      assert.ok(content.includes('-webkit-backdrop-filter: none !important'), 'Must disable webkit backdrop filter for Safari/iOS');
      assert.ok(content.includes('background-color: var(--background) !important'), 'Must provide solid background replacement');
    });

    it('verifies EcoModeSwitcher component is integrated into NavUser', () => {
      const switcherPath = path.join(process.cwd(), 'src/components/layout/eco-mode-switcher.tsx');
      assert.ok(fs.existsSync(switcherPath), 'src/components/layout/eco-mode-switcher.tsx must exist');

      const navUserPath = path.join(process.cwd(), 'src/components/layout/nav-user.tsx');
      const content = fs.readFileSync(navUserPath, 'utf-8');

      assert.ok(content.includes('EcoModeSwitcher'), 'NavUser must import EcoModeSwitcher');
      assert.ok(content.includes('<EcoModeSwitcher iconOnly />'), 'NavUser must render EcoModeSwitcher in iconOnly mode for collapsed state');
      assert.ok(content.includes('<EcoModeSwitcher />'), 'NavUser must render EcoModeSwitcher in expanded menu');
    });
  });

});
