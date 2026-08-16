import { expect, test } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { generateTestName, getTestCredentials } from '../helpers/test-utils';

// E2E Test Suite 07: Photo Comments System (API Validation, Public Posting, Scrollable UI, & Admin Moderation).

test.describe('Photo Comments Feature', () => {
  let createdPhotoId: string | null = null;
  let testPhotoTitle: string;

  test.beforeAll(async ({ request }) => {
    // 1. Upload a dedicated test photo to ensure we have a valid photoId for comment testing
    const { username, password } = getTestCredentials();
    await request.post('/api/login', { data: { username, password } });

    testPhotoTitle = generateTestName('CommentTestPhoto');
    const fixturePath = path.join(__dirname, '../fixtures/test-photo.jpg');
    const imageBuffer = fs.readFileSync(fixturePath);

    const uploadRes = await request.post('/api/photo/add', {
      multipart: {
        file: {
          name: `${testPhotoTitle}.jpg`,
          mimeType: 'image/jpeg',
          buffer: imageBuffer,
        },
        name: testPhotoTitle,
      },
    });

    const body = await uploadRes.json();
    if (body.code === 200 && body.data?.photo?.photoId) {
      createdPhotoId = body.data.photo.photoId;
    }
  });

  test.afterAll(async ({ request }) => {
    // Clean up test photo and associated comments
    if (createdPhotoId) {
      try {
        const { username, password } = getTestCredentials();
        await request.post('/api/login', { data: { username, password } });
        await request.post('/api/photo/delete', {
          data: { photoIds: [createdPhotoId] },
        });
        await request.post('/api/photo/clear', { data: {} });
      } catch {
        // Ignore cleanup errors
      }
    }
  });

  // --- API TESTS ---

  test('API: Public visitor can fetch comments for a photo (GET /api/photos/:photoId/comments)', async ({ request }) => {
    test.skip(!createdPhotoId, 'No test photo available');

    const res = await request.get(`/api/photos/${createdPhotoId}/comments`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.code).toBe(200);
    expect(Array.isArray(body.data)).toBe(true);
  });

  test('API: Public visitor can post a valid comment (POST /api/photos/:photoId/comments)', async ({ request }) => {
    test.skip(!createdPhotoId, 'No test photo available');

    const res = await request.post(`/api/photos/${createdPhotoId}/comments`, {
      data: {
        name: 'Jane Doe',
        content: 'Stunning composition and natural lighting!',
      },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.code).toBe(200);
    expect(body.data?.commentId).toBeTruthy();
    expect(body.data?.name).toBe('Jane Doe');
    expect(body.data?.content).toBe('Stunning composition and natural lighting!');
    expect(body.data?.photoId).toBe(createdPhotoId);
  });

  test('API Validation: Reject empty name or empty comment', async ({ request }) => {
    test.skip(!createdPhotoId, 'No test photo available');

    // 1. Empty name
    const emptyNameRes = await request.post(`/api/photos/${createdPhotoId}/comments`, {
      data: {
        name: '   ',
        content: 'Valid content',
      },
    });
    const emptyNameBody = await emptyNameRes.json();
    expect(emptyNameBody.code).not.toBe(200);

    // 2. Empty content
    const emptyContentRes = await request.post(`/api/photos/${createdPhotoId}/comments`, {
      data: {
        name: 'Valid Name',
        content: '   ',
      },
    });
    const emptyContentBody = await emptyContentRes.json();
    expect(emptyContentBody.code).not.toBe(200);
  });

  test('API Validation: Reject excessively long name (>50 chars) or content (>500 chars)', async ({ request }) => {
    test.skip(!createdPhotoId, 'No test photo available');

    // 1. Name over 50 chars
    const longName = 'A'.repeat(51);
    const longNameRes = await request.post(`/api/photos/${createdPhotoId}/comments`, {
      data: {
        name: longName,
        content: 'Valid content',
      },
    });
    const longNameBody = await longNameRes.json();
    expect(longNameBody.code).not.toBe(200);

    // 2. Content over 500 chars
    const longContent = 'B'.repeat(501);
    const longContentRes = await request.post(`/api/photos/${createdPhotoId}/comments`, {
      data: {
        name: 'Valid Name',
        content: longContent,
      },
    });
    const longContentBody = await longContentRes.json();
    expect(longContentBody.code).not.toBe(200);
  });

  test('API Validation: Reject comment on non-existent photo ID', async ({ request }) => {
    const invalidIdRes = await request.post('/api/photos/non_existent_photo_id_99999/comments', {
      data: {
        name: 'Tester',
        content: 'Hello world',
      },
    });
    const body = await invalidIdRes.json();
    expect(body.code).not.toBe(200);
  });

  test('API Moderation: Unauthenticated deletion is blocked (401)', async ({ request }) => {
    const res = await request.post('/api/photo/comment/delete', {
      data: { commentId: 'fake-comment-id' },
    });
    expect(res.status()).toBe(401);
  });

  test('API Moderation: Authenticated Admin can delete a comment', async ({ request }) => {
    test.skip(!createdPhotoId, 'No test photo available');

    // 1. Post a comment to delete
    const postRes = await request.post(`/api/photos/${createdPhotoId}/comments`, {
      data: {
        name: 'Spam Bot',
        content: 'Spam message to be moderated',
      },
    });
    const postBody = await postRes.json();
    const targetCommentId = postBody.data?.commentId;
    expect(targetCommentId).toBeTruthy();

    // 2. Login as admin
    const { username, password } = getTestCredentials();
    await request.post('/api/login', { data: { username, password } });

    // 3. Admin deletes the comment
    const deleteRes = await request.post('/api/photo/comment/delete', {
      data: { commentId: targetCommentId },
    });
    expect(deleteRes.status()).toBe(200);
    const deleteBody = await deleteRes.json();
    expect(deleteBody.code).toBe(200);

    // 4. Verify comment is no longer in the list
    const listRes = await request.get(`/api/photos/${createdPhotoId}/comments`);
    const listBody = await listRes.json();
    const commentExists = (listBody.data as Array<{ commentId: string }> | undefined)?.some((c) => c.commentId === targetCommentId);
    expect(commentExists).toBe(false);
  });

  // --- UI INTEGRATION TESTS ---

  test('UI: Comments section renders in Photo Lightbox and allows posting comments', async ({ page }) => {
    test.skip(!createdPhotoId, 'No test photo available');

    // 1. Visit photos gallery
    await page.goto('/photos');
    await page.waitForLoadState('domcontentloaded');

    // 2. Open first photo card to launch Photo Lightbox
    const photoCard = page.locator('img').first();
    await photoCard.click();

    // 3. Open info sidebar if not already open
    const infoButton = page.locator('button[title*="info" i], button[aria-label*="info" i], svg.lucide-panel-right-open, svg.lucide-panel-right-close').first();
    if (await infoButton.isVisible()) {
      await infoButton.click();
    }

    // 4. Verify Comments section is visible in the sidebar
    const commentSectionHeader = page.locator('text=/Comments|评论/i').first();
    await expect(commentSectionHeader).toBeVisible({ timeout: 10_000 });

    // 5. Fill in Name and Comment form
    const nameInput = page.locator('input[placeholder*="name" i], input[placeholder*="昵称" i]').first();
    const commentTextarea = page.locator('textarea[placeholder*="comment" i], textarea[placeholder*="评论" i]').first();
    const sendButton = page.locator('button:has-text("Send"), button:has-text("发送")').first();

    await nameInput.fill('Playwright Tester');
    await commentTextarea.fill('Awesome photo capture from automated UI test!');
    await sendButton.click();

    // 6. Verify newly added comment text appears in the UI without page reload
    await expect(page.locator('text=Awesome photo capture from automated UI test!')).toBeVisible({ timeout: 8_000 });
  });
});
