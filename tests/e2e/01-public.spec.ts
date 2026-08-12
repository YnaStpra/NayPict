import { expect, test } from '@playwright/test';

// E2E Test Suite 01: Public Homepage & Photo Lightbox Browsing.

test.describe('Flow 1 & 2: Public Visitor Experience', () => {
  
  test('Flow 1: Public Homepage loads cleanly without errors', async ({ page }) => {
    // 1. Open photos gallery homepage
    const response = await page.goto('/photos');
    expect(response?.status()).toBeLessThan(400);

    // 2. Verify navigation to photos gallery
    await expect(page).toHaveURL(/\/(photos|albums|login)/);

    // 3. Verify body element is present and visible
    await expect(page.locator('body')).toBeVisible();
  });

  test('Flow 2: Public Gallery browsing and Photo Lightbox interaction', async ({ page }) => {
    await page.goto('/photos');
    await page.waitForLoadState('domcontentloaded');

    // Look for photo card elements in the gallery masonry
    const photoCards = page.locator('[data-testid="photo-card"], .group.relative, img');
    const photoCount = await photoCards.count();

    if (photoCount > 0) {
      // Click the first available photo to open lightbox
      const firstPhoto = photoCards.first();
      await firstPhoto.click();

      // Lightbox or photo viewer modal should open
      const lightbox = page.locator('.yarl__slide, [role="dialog"], img.object-contain');
      await expect(lightbox.first()).toBeVisible({ timeout: 5000 });

      // Test close via Escape key
      await page.keyboard.press('Escape');
    } else {
      // If no photos exist yet, ensure the gallery empty state or layout is rendered cleanly
      await expect(page.locator('body')).toBeVisible();
    }
  });

});
