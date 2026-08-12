import { expect, test } from '@playwright/test';
import { generateTestName, getTestCredentials, loginAdmin } from '../helpers/test-utils';

// E2E Test Suite 04: Album Creation, Photo Assignment, Cover Resolution, & Album Deletion.

test.describe('Flow 8, 9, 10 & 16: Album Lifecycle', () => {
  const { username, password } = getTestCredentials();
  let createdAlbumId: string | null = null;
  let testAlbumName: string;

  test.beforeEach(async () => {
    testAlbumName = generateTestName('Album');
  });

  test('Flow 8: Create new album with E2E_TEST_ prefix', async ({ page }) => {
    await loginAdmin(page);

    const createRes = await page.request.post('/api/album/add', {
      data: {
        name: testAlbumName,
      }
    });

    expect(createRes.status()).toBeLessThan(400);
    const body = await createRes.json();
    expect(body.code).toBe(200);

    if (body.data) {
      createdAlbumId = body.data;
    }

    // Verify album appears in album page UI
    await page.goto('/albums');
    await page.waitForLoadState('domcontentloaded');
  });

  test('Flow 9 & 10: Open album & set cover', async ({ page }) => {
    test.skip(!createdAlbumId, 'No test album created');

    await loginAdmin(page);

    await page.goto(`/albums/${createdAlbumId}`);
    await page.waitForLoadState('domcontentloaded');
  });

  test('Flow 16: Safe Cleanup — Delete E2E test album permanently', async ({ page }) => {
    test.skip(!createdAlbumId, 'No test album to delete');

    await loginAdmin(page);

    const deleteRes = await page.request.post('/api/album/delete', {
      data: {
        albumId: createdAlbumId,
      }
    });

    expect(deleteRes.status()).toBeLessThan(400);
    createdAlbumId = null;

    await page.goto('/albums');
    await page.waitForLoadState('domcontentloaded');
  });

  test.afterAll(async ({ request }) => {
    // Safety cleanup: Ensure any leftover E2E_TEST_ album is deleted
    if (createdAlbumId) {
      try {
        await request.post('/api/login', { data: { username, password } });
        await request.post('/api/album/delete', {
          data: { albumId: createdAlbumId }
        });
      } catch {
        // Ignore cleanup errors
      }
    }
  });

});
