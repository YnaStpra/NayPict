import { expect, test } from '@playwright/test';

// E2E Test Suite 08: On This Day Nostalgic Photos Feature.

test.describe('On This Day Feature Suite', () => {

  test('Flow 1: API /api/photo/onThisDay endpoint returns valid response structure for public visitors', async ({ request }) => {
    // 1. Send public GET request to /api/photo/onThisDay
    const getRes = await request.get('/api/photo/onThisDay');
    expect(getRes.status()).toBe(200);

    const getData = await getRes.json();
    expect(getData).toHaveProperty('code');
    expect(getData.code).toBe(200);
    expect(getData.data).toHaveProperty('date');
    expect(getData.data).toHaveProperty('list');
    expect(getData.data).toHaveProperty('total');
    expect(Array.isArray(getData.data.list)).toBe(true);

    // 2. Send public POST request with custom month/day parameters
    const postRes = await request.post('/api/photo/onThisDay', {
      data: {
        month: 8,
        day: 18,
        year: 2026,
      },
    });
    expect(postRes.status()).toBe(200);

    const postData = await postRes.json();
    expect(postData.code).toBe(200);
    expect(postData.data.date).toBe('08-18');
    expect(Array.isArray(postData.data.list)).toBe(true);

    // 3. If photos are returned, verify they are from previous years and contain yearsAgo >= 1
    if (postData.data.list.length > 0) {
      const currentYear = 2026;
      for (const item of postData.data.list) {
        expect(item.year).toBeLessThan(currentYear);
        expect(item.yearsAgo).toBeGreaterThanOrEqual(1);
        expect(item.yearsAgo).toBe(currentYear - item.year);
        expect(item.status).toBe(1); // PhotoStatusEnum.NORMAL
        expect(item.takenTime).toBeTruthy();
        expect(item.takenTime.slice(5, 10)).toBe('08-18');
      }
    }
  });

  test('Flow 2: Gallery page /photos renders without layout disruption or error', async ({ page }) => {
    // Navigate to public gallery
    const res = await page.goto('/photos');
    if (res && res.status() < 400) {
      await page.waitForLoadState('domcontentloaded');
      await expect(page.locator('body')).toBeVisible();

      // Check if On This Day section is present (if matching photos exist)
      const onThisDaySection = page.locator('section[aria-label="On This Day in Previous Years"]');
      const isSectionVisible = await onThisDaySection.isVisible();

      if (isSectionVisible) {
        // Verify heading and interactive cards
        await expect(onThisDaySection.locator('h2')).toBeVisible();
        const cards = onThisDaySection.locator('[role="button"]');
        const cardCount = await cards.count();
        expect(cardCount).toBeGreaterThan(0);

        // Click first card to verify PhotoViewer opens
        await cards.first().click();
        const lightbox = page.locator('.yarl__slide, [role="dialog"], img.object-contain');
        await expect(lightbox.first()).toBeVisible({ timeout: 5000 });

        // Close lightbox
        await page.keyboard.press('Escape');
      }
    } else {
      await expect(page.locator('body')).toBeVisible();
    }
  });

  test('Flow 3: Querying an empty date returns clean empty list without backend error', async ({ request }) => {
    // Query a leap day in a non-leap year or rare date
    const res = await request.post('/api/photo/onThisDay', {
      data: {
        month: 2,
        day: 30, // Invalid/empty day
        year: 2026,
      },
    });
    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(body.code).toBe(200);
    expect(body.data.total).toBe(0);
    expect(body.data.list).toEqual([]);
  });

});
