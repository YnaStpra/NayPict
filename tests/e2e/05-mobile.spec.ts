import { expect, test } from '@playwright/test';

// E2E Test Suite 05: Mobile Viewport & Responsiveness Verification.

test.describe('Flow 20: Mobile Viewport Testing', () => {

  test.use({ viewport: { width: 390, height: 844 } }); // iPhone 13 / 14 resolution

  test('Flow 20: Mobile Homepage and Gallery render without horizontal overflow', async ({ page }) => {
    // 1. Open homepage on mobile viewport
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    // 2. Check page container is visible
    const body = page.locator('body');
    await expect(body).toBeVisible();

    // 3. Ensure page scrollWidth does not exceed viewport width (no unwanted horizontal scroll)
    const hasHorizontalScroll = await page.evaluate(() => {
      return document.documentElement.scrollWidth > window.innerWidth;
    });

    expect(hasHorizontalScroll).toBe(false);
  });

  test('Flow 20: Mobile Login Form rendering', async ({ page }) => {
    // 1. Open login page on mobile
    await page.goto('/login');
    await page.waitForLoadState('domcontentloaded');

    // 2. Input fields should be visible and usable
    const usernameInput = page.locator('input[type="text"]');
    const passwordInput = page.locator('input[type="password"]');
    const submitBtn = page.locator('button[type="submit"]');

    await expect(usernameInput).toBeVisible();
    await expect(passwordInput).toBeVisible();
    await expect(submitBtn).toBeVisible();

    // 3. Check for mobile horizontal overflow
    const hasHorizontalScroll = await page.evaluate(() => {
      return document.documentElement.scrollWidth > window.innerWidth;
    });

    expect(hasHorizontalScroll).toBe(false);
  });

});
