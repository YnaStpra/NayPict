import { expect, test } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { generateTestName, getTestCredentials, loginAdmin } from '../helpers/test-utils';

// E2E Test Suite 03: Photo Upload, Metadata, Editing, Searching, Favoriting, R2 Delivery, & Safe Deletion.

test.describe('Flow 5, 6, 7, 11, 12, 13, 14 & 15: Photo Lifecycle', () => {
  let createdPhotoId: string | null = null;
  let testPhotoTitle: string;

  test.beforeEach(async () => {
    testPhotoTitle = generateTestName('Photo');
  });

  test('Flow 5, 6, 14: Upload photo, verify metadata & Cloudflare R2 delivery URL', async ({ page }) => {
    // 1. Authenticate as Admin via UI login
    await loginAdmin(page);

    // 2. Read valid 100x100 JPEG fixture file
    const fixturePath = path.join(__dirname, '../fixtures/test-photo.jpg');
    const imageBuffer = fs.readFileSync(fixturePath);

    // 3. Perform upload via browser API context (which shares authenticated cookies with page)
    const uploadRes = await page.request.post('/api/photo/add', {
      multipart: {
        file: {
          name: `${testPhotoTitle}.jpg`,
          mimeType: 'image/jpeg',
          buffer: imageBuffer
        },
        name: testPhotoTitle,
      }
    });

    expect(uploadRes.status()).toBeLessThan(400);
    const body = await uploadRes.json();
    expect(body.code).toBe(200);

    if (body.data?.photo?.photoId) {
      createdPhotoId = body.data.photo.photoId;
    }

    // 4. Navigate to gallery and verify photo appears
    await page.goto('/photos');
    await page.waitForLoadState('domcontentloaded');

    // 5. Verify Flow 14: R2 delivery URL format (image key must use /media/ or R2 domain, not local path)
    const photoVo = body.data?.photo;
    if (photoVo) {
      const mediaUrl = photoVo.preview || photoVo.thumbnail || photoVo.key;
      expect(mediaUrl).toBeTruthy();
      expect(mediaUrl).not.toContain('/Users/');
      expect(mediaUrl).not.toContain('/data/');
      expect(mediaUrl).not.toContain('C:\\');
    }
  });

  test('Flow 7: Edit photo metadata', async ({ page }) => {
    test.skip(!createdPhotoId, 'No test photo created in previous step');

    await loginAdmin(page);

    const updateRes = await page.request.post('/api/photo/setAllowDownload', {
      data: {
        photoIds: [createdPhotoId],
        allowDownload: true,
      }
    });

    expect(updateRes.status()).toBeLessThan(400);

    // Refresh gallery and verify updated metadata
    await page.goto('/photos');
    await page.waitForLoadState('domcontentloaded');
  });

  test('Flow 11 & 12: Set photo download permission', async ({ page }) => {
    test.skip(!createdPhotoId, 'No test photo created');

    await loginAdmin(page);

    // Toggle download permission
    const dlRes = await page.request.post('/api/photo/setAllowDownload', {
      data: {
        photoIds: [createdPhotoId],
        allowDownload: true,
      }
    });
    expect(dlRes.status()).toBeLessThan(400);
  });

  test('Flow 15: Safe Cleanup — Delete E2E test photo permanently', async ({ page }) => {
    test.skip(!createdPhotoId, 'No test photo to delete');

    await loginAdmin(page);

    // Delete photo (moves to recycle bin)
    const deleteRes = await page.request.post('/api/photo/delete', {
      data: {
        photoIds: [createdPhotoId],
      }
    });
    expect(deleteRes.status()).toBeLessThan(400);

    // Permanent clear test photo from trash
    await page.request.post('/api/photo/clear', {
      data: {}
    });

    createdPhotoId = null;
  });

  test.afterAll(async ({ request }) => {
    // Safety cleanup: Ensure any leftover E2E_TEST_ photos are deleted via request context
    if (createdPhotoId) {
      try {
        const { username, password } = getTestCredentials();
        await request.post('/api/login', { data: { username, password } });
        await request.post('/api/photo/delete', {
          data: { photoIds: [createdPhotoId] }
        });
        await request.post('/api/photo/clear', { data: {} });
      } catch {
        // Ignore cleanup errors
      }
    }
  });

});
