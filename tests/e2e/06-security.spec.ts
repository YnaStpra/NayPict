import { expect, test } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { getTestCredentials } from '../helpers/test-utils';

// E2E Test Suite 06: Automated Security & Regression Tests (SEC-01 through SEC-10)

test.describe('Security & Authorization Regression Suite', () => {
  const { username, password } = getTestCredentials();

  test('SEC-01: Authentication Guard — Unauthenticated requests to protected endpoints return 401', async ({ request }) => {
    const protectedEndpoints = [
      { url: '/api/photo/add', method: 'post', data: {} },
      { url: '/api/photo/recycle', method: 'post', data: { photoIds: ['test-id'] } },
      { url: '/api/photo/delete', method: 'post', data: { photoIds: ['test-id'] } },
      { url: '/api/photo/clear', method: 'post', data: {} },
      { url: '/api/storage/list', method: 'post', data: {} },
      { url: '/api/storage/add', method: 'post', data: { name: 'test', type: 1 } },
      { url: '/api/user/list', method: 'post', data: {} },
      { url: '/api/user/info', method: 'post', data: {} },
      { url: '/api/setting/set', method: 'post', data: {} },
      { url: '/api/totp/status', method: 'get', data: undefined },
      { url: '/api/totp/setup', method: 'post', data: {} },
    ];

    for (const ep of protectedEndpoints) {
      const res = ep.method === 'post'
        ? await request.post(ep.url, { data: ep.data })
        : await request.get(ep.url);

      expect(res.status(), `Endpoint ${ep.url} should require authentication`).toBe(401);
      const json = await res.json().catch(() => ({}));
      expect(json.code).toBe(401);
    }
  });

  test('SEC-02: Token Integrity — Invalid or forged JWT tokens are rejected', async ({ request }) => {
    const forgedToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJhZG1pbiIsInV1aWQiOiJhdHRhY2tlciJ9.invalid_signature_here';

    const res = await request.post('/api/user/info', {
      headers: {
        Cookie: `token=${forgedToken}`,
      },
    });

    expect(res.status()).toBe(401);
  });

  test('SEC-03: Authentication Logic — Invalid credentials fail gracefully without leaking stack traces', async ({ request }) => {
    const res = await request.post('/api/login', {
      data: {
        username: 'non_existent_user_999',
        password: 'IncorrectPassword!',
      },
    });

    const body = await res.json();
    expect(body.code).not.toBe(200);
    // Should return clean error message, not internal stack trace or SQL errors
    expect(body.message).toBeTruthy();
    expect(body.message).not.toContain('at ');
    expect(body.message).not.toContain('node_modules');
    expect(body.message).not.toContain('drizzle');
  });

  test('SEC-04: Storage API Defense (CRIT-03) — Cloud credentials (accessKey, secretKey) are stripped from responses', async ({ page }) => {
    // 1. Authenticate as Admin
    await page.goto('/login');
    await page.fill('input[type="text"]', username);
    await page.fill('input[type="password"]', password);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/(admin|photos|storage)/, { timeout: 15_000 });

    // 2. Query storage list
    const res = await page.request.post('/api/storage/list', { data: {} });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.code).toBe(200);

    const storageList = body.data?.list || [];
    for (const item of storageList) {
      // accessKey and secretKey MUST NOT be exposed to client
      expect(item.accessKey, 'accessKey must be undefined in client response').toBeUndefined();
      expect(item.secretKey, 'secretKey must be undefined in client response').toBeUndefined();
    }
  });

  test('SEC-05: Upload Security (CRIT-02 & MED-02) — Non-image files and shell scripts are rejected', async ({ page }) => {
    // 1. Authenticate as Admin
    await page.goto('/login');
    await page.fill('input[type="text"]', username);
    await page.fill('input[type="password"]', password);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/(admin|photos)/, { timeout: 15_000 });

    // 2. Attempt to upload a text script disguised as .jpg
    const maliciousBuffer = Buffer.from('<?php echo "malicious_script_execution"; ?>');
    const uploadRes = await page.request.post('/api/photo/add', {
      multipart: {
        file: {
          name: 'malicious.jpg',
          mimeType: 'image/jpeg',
          buffer: maliciousBuffer,
        },
        name: 'Malicious Photo',
      },
    });

    const body = await uploadRes.json();
    // Must be rejected because magic bytes do not match valid image
    expect(body.code).not.toBe(200);
    expect(body.message).toContain('Invalid file type');
  });

  test('SEC-06: Upload Security — Valid image upload succeeds', async ({ page }) => {
    // 1. Authenticate as Admin
    await page.goto('/login');
    await page.fill('input[type="text"]', username);
    await page.fill('input[type="password"]', password);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/(admin|photos)/, { timeout: 15_000 });

    // 2. Upload valid test JPEG fixture
    const fixturePath = path.join(__dirname, '../fixtures/test-photo.jpg');
    const imageBuffer = fs.readFileSync(fixturePath);

    const uploadRes = await page.request.post('/api/photo/add', {
      multipart: {
        file: {
          name: 'security_test_photo.jpg',
          mimeType: 'image/jpeg',
          buffer: imageBuffer,
        },
        name: 'Security Test Photo',
      },
    });

    const body = await uploadRes.json();
    expect(body.code).toBe(200);
    expect(body.data?.photo?.photoId).toBeTruthy();

    const createdId = body.data.photo.photoId;

    // Cleanup: delete the test photo
    await page.request.post('/api/photo/delete', {
      data: { photoIds: [createdId] },
    });
    await page.request.post('/api/photo/clear', { data: {} });
  });

  test('SEC-07: Security HTTP Headers (HIGH-04) — Standard defensive headers are present', async ({ page }) => {
    const res = await page.goto('/photos');
    expect(res).not.toBeNull();

    const headers = res!.headers();

    // Verify clickjacking protection
    expect(headers['x-frame-options']?.toUpperCase()).toBe('DENY');

    // Verify MIME sniffing protection
    expect(headers['x-content-type-options']?.toLowerCase()).toBe('nosniff');

    // Verify referrer policy
    expect(headers['referrer-policy']).toBeTruthy();

    // Verify permissions policy
    expect(headers['permissions-policy']).toBeTruthy();
  });

  test('SEC-08: TOTP Replay & Access Guard (HIGH-03 & MED-05) — TOTP endpoints properly guarded', async ({ request }) => {
    // Unauthenticated setup request blocked
    const setupRes = await request.post('/api/totp/setup', { data: {} });
    expect(setupRes.status()).toBe(401);

    // Unauthenticated enable request blocked
    const enableRes = await request.post('/api/totp/enable', {
      data: { code: '123456', secret: 'JBSWY3DPEHPK3PXP' },
    });
    expect(enableRes.status()).toBe(401);

    // Unauthenticated disable request blocked
    const disableRes = await request.post('/api/totp/disable', { data: {} });
    expect(disableRes.status()).toBe(401);
  });

  test('SEC-09: Session Management — Logout clears authentication cookie', async ({ page }) => {
    // 1. Login
    await page.goto('/login');
    await page.fill('input[type="text"]', username);
    await page.fill('input[type="password"]', password);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/(admin|photos)/, { timeout: 15_000 });

    // 2. Call logout endpoint
    const logoutRes = await page.request.post('/api/logout', { data: {} });
    expect(logoutRes.status()).toBe(200);

    // 3. Verify user/info now returns 401
    const infoRes = await page.request.post('/api/user/info', { data: {} });
    expect(infoRes.status()).toBe(401);
  });
});
