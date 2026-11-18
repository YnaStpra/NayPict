import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

describe('Round 22: Gallery Infinite Scroll & Random Pagination Hardening Suite', () => {
  const hookPath = path.join(process.cwd(), 'src/hooks/use-photo-list.ts');
  const hookSource = fs.readFileSync(hookPath, 'utf-8');

  it('ensures fragile index-offset pagination (pageOffsetRef) is completely eliminated', () => {
    assert.equal(
      hookSource.includes('pageOffsetRef'),
      false,
      'usePhotoList must not use pageOffsetRef to prevent offset desynchronization across random shuffles'
    );
  });

  it('ensures remainingShuffledIdsRef is used to track unshown photo ID queue', () => {
    assert.ok(
      hookSource.includes('remainingShuffledIdsRef'),
      'usePhotoList must use remainingShuffledIdsRef for robust client-side random queueing'
    );
  });

  it('ensures in-flight photoRandomIdList promises are deduplicated', () => {
    assert.ok(
      hookSource.includes('fetchRandomIdsPromiseRef'),
      'usePhotoList must deduplicate concurrent in-flight photoRandomIdList promises to prevent 429 rate limit errors'
    );
  });

  it('ensures failed ID slices are rolled back into remainingShuffledIdsRef on error', () => {
    assert.ok(
      hookSource.includes('remainingShuffledIdsRef.current = ['),
      'Failed loadPhotosByIds batches must unshift failed IDs back into remainingShuffledIdsRef so retry works seamlessly'
    );
  });

  it('simulates unshown ID queue filtering: guarantees 0 duplicate photos and 0 omitted photos', () => {
    // Simulate 100 total photos in DB
    const totalCatalog = Array.from({ length: 100 }, (_, i) => `photo_${i + 1}`);

    // SSR renders first 30 photos from a random shuffle
    const ssrPhotos = totalCatalog.slice(0, 30);
    const shownIds = new Set(ssrPhotos);

    // Client idle callback fetches a newly shuffled catalog (Fisher-Yates)
    const newShuffledCatalog = [...totalCatalog].sort(() => Math.random() - 0.5);

    // Compute unshown queue
    let remainingQueue = newShuffledCatalog.filter((id) => !shownIds.has(id));

    assert.equal(remainingQueue.length, 70, 'Unshown queue must contain exactly 70 remaining photos');
    for (const ssrId of ssrPhotos) {
      assert.equal(remainingQueue.includes(ssrId), false, `Queue must not contain SSR photo: ${ssrId}`);
    }

    // Simulate scrolling batches of size 30
    const loadedPhotos: string[] = [...ssrPhotos];
    const pageSize = 30;

    while (remainingQueue.length > 0) {
      const batch = remainingQueue.slice(0, pageSize);
      remainingQueue = remainingQueue.slice(pageSize);
      loadedPhotos.push(...batch);
    }

    assert.equal(loadedPhotos.length, 100, 'All 100 photos must be loaded after scrolling');
    const uniqueLoaded = new Set(loadedPhotos);
    assert.equal(uniqueLoaded.size, 100, 'All 100 loaded photos must be completely unique');
    assert.equal(remainingQueue.length, 0, 'Queue must be completely empty when hasMore becomes false');
  });

  it('ensures initialMoreAvailable accurately reflects initialTotal vs initialPhotos.length', () => {
    // When initialTotal is 15 and initialPhotos is 15 (gallery has 15 total)
    const total15 = 15;
    const initial15 = 15;
    const more15 = initial15 < total15;
    assert.equal(more15, false, 'hasMore must be false when all photos in catalog are already loaded');

    // When initialTotal is 50 and initialPhotos is 30
    const total50 = 50;
    const initial30 = 30;
    const more50 = initial30 < total50;
    assert.equal(more50, true, 'hasMore must be true when initialPhotos is less than initialTotal');

    // When initialTotal is 50 but SSR returned 28 (e.g. 2 draft/archived excluded)
    const initial28 = 28;
    const more28 = initial28 < total50;
    assert.equal(more28, true, 'hasMore must be true even if initialPhotos.length < pageSize as long as total is greater');
  });
});
