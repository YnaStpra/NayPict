import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { photoService } from '@/server/service/photo-service';
import { PhotoVisibilityEnum } from '@/server/enums/photo-enum';

describe('Archive Feed Visibility Isolation Suite', () => {
  it('blocks unauthenticated guests from querying archived photo IDs via randomIdList', async () => {
    const ids = await photoService.randomIdList(
      { visibility: PhotoVisibilityEnum.ARCHIVED },
      undefined
    );
    assert.deepEqual(ids, []);
  });

  it('prevents usePhotoList from leaking public offline catalog photos into filtered/archive feeds', () => {
    const hookSource = fs.readFileSync(
      path.join(process.cwd(), 'src/hooks/use-photo-list.ts'),
      'utf-8'
    );

    assert.ok(
      hookSource.includes('isMainGalleryScope'),
      'usePhotoList must gate offline catalog seeding/fallback behind isMainGalleryScope'
    );
    assert.ok(
      hookSource.includes('hasCustomVisibility'),
      'isMainGalleryScope must exclude custom visibility scopes such as ARCHIVED'
    );

    const randomCallMatches = hookSource.match(/photoRandomIdList\(\{[\s\S]*?\}\)/g) ?? [];
    assert.equal(randomCallMatches.length, 3, 'Expected 3 photoRandomIdList call sites in usePhotoList');
    for (const callBlock of randomCallMatches) {
      assert.ok(
        callBlock.includes('visibility:'),
        'Every photoRandomIdList call in usePhotoList must forward visibility scope'
      );
    }
  });

  it('ensures ArchivePage strictly scopes queries and SSR total to ARCHIVED visibility', () => {
    const archivePageSource = fs.readFileSync(
      path.join(process.cwd(), 'src/app/archive/page.tsx'),
      'utf-8'
    );
    const archiveLayoutSource = fs.readFileSync(
      path.join(process.cwd(), 'src/app/archive/layout.tsx'),
      'utf-8'
    );

    assert.ok(archivePageSource.includes('visibility: PhotoVisibilityEnum.ARCHIVED'));
    assert.ok(archiveLayoutSource.includes('initialTotal={photoData.total ?? photoData.list.length}'));
  });
});

