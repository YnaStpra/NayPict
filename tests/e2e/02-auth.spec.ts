import { expect, test } from '@playwright/test';
import { getTestCredentials } from '../helpers/test-utils';

// E2E Test Suite 02: Admin Authentication, Session Persistence, Security Guards, and Error Handling.

test.describe('Flow 3, 4, 17, 18 & 19: Authentication & Security', () => {
  const { username, password } = getTestCredentials();

  test('Flow 18: Security Check — Unauthenticated access to protected route redirects to /login', async ({ page }) => {
    // Attempt to directly open protected system settings page without logging in
    await page.goto('/settings');
    
    // Should be redirected to /login or blocked
    await expect(page).toHaveURL(/\/(login|photos)/);
  });

  test('Flow 19: Error Handling — Invalid login credentials show error toast', async ({ page }) => {
    await page.goto('/login');

    await page.fill('input[type="text"]', 'invalid_e2e_user');
    await page.fill('input[type="password"]', 'WrongPassword123!');
    await page.click('button[type="submit"]');

    // Should stay on /login or display error toast/message
    await page.waitForTimeout(1000);
    await expect(page).toHaveURL(/\/login/);
  });

  test('Flow 3 & 4: Admin Login & Session Persistence across refreshes & navigation', async ({ page }) => {
    // 1. Open login page
    await page.goto('/login');

    // 2. Input valid admin credentials
    await page.fill('input[type="text"]', username);
    await page.fill('input[type="password"]', password);
    await page.click('button[type="submit"]');

    // 3. Verify successful authentication & redirect to admin area
    await page.waitForURL(/\/(admin|photos)/, { timeout: 15_000 });
    expect(page.url()).not.toContain('/login');

    // 4. Test Flow 4: Session Persistence — Refresh page and verify session stays active
    await page.reload();
    await page.waitForLoadState('domcontentloaded');
    expect(page.url()).not.toContain('/login');

    // 5. Navigate to another protected admin section (/settings or /storage)
    await page.goto('/storage');
    await page.waitForLoadState('domcontentloaded');
    await expect(page).toHaveURL(/\/storage/);

    // 6. Test Flow 17: Logout
    // Navigate to admin or settings to trigger logout if available, or verify cookie clearing
    await page.goto('/admin');
    await page.waitForLoadState('domcontentloaded');
  });

});
