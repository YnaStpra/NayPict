import { defineConfig, devices } from '@playwright/test';

// Read configuration environment variables with fallback defaults.
const baseURL = process.env.TEST_BASE_URL || 'http://localhost:3000';

export default defineConfig({
  testDir: './tests/e2e',
  // Run tests sequentially (1 worker) to prevent race conditions during DB mutating actions.
  workers: 1,
  fullyParallel: false,
  // Fail the build on CI if you accidentally left test.only in the source code.
  forbidOnly: Boolean(process.env.CI),
  // Retry failed tests once to ensure transient network glitches don't fail CI.
  retries: process.env.CI ? 2 : 1,
  reporter: [
    ['html', { open: 'never' }],
    ['list']
  ],
  use: {
    baseURL,
    // Collect trace when retrying the failed test.
    trace: 'on-first-retry',
    // Capture screenshot on test failure.
    screenshot: 'only-on-failure',
    // Default navigation and action timeouts.
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'mobile-chrome',
      use: { ...devices['Pixel 5'] },
    },
  ],
});
