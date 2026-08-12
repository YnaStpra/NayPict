import { type Page } from '@playwright/test';

// Prefix for all test-created resources to ensure test data is easily identified and safely cleaned up.
export const E2E_PREFIX = 'E2E_TEST_';

// Generate unique resource name with timestamp prefix.
export function generateTestName(baseName: string): string {
  const timestamp = new Date().toISOString().replace(/[-:T.Z]/g, '').slice(0, 14);
  return `${E2E_PREFIX}${baseName}_${timestamp}`;
}

// Retrieve test admin credentials from environment variables with fallback defaults.
export function getTestCredentials() {
  const username = process.env.TEST_ADMIN_USERNAME || 'admin';
  const password = process.env.TEST_ADMIN_PASSWORD || 'password123';
  const baseURL = process.env.TEST_BASE_URL || 'http://localhost:3000';

  return { username, password, baseURL };
}

// Helper to log in as admin via the UI.
export async function loginAdmin(page: Page, customUsername?: string, customPassword?: string) {
  const { username, password } = getTestCredentials();
  const userToUse = customUsername ?? username;
  const passToUse = customPassword ?? password;

  // Skip login form submission if page is already on an authenticated route
  if (page.url().includes('/admin') || page.url().includes('/settings') || page.url().includes('/storage')) {
    return;
  }

  await page.goto('/login');
  await page.fill('input[type="text"]', userToUse);
  await page.fill('input[type="password"]', passToUse);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/(admin|photos)/, { timeout: 15_000 });
}
