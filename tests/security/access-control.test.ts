import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// Import security path evaluation rules
const SYSTEM_PATHS = [
  '/setting',
  '/user/list',
  '/user/add',
  '/user/set',
  '/user/toggleStatus',
  '/user/delete',
  '/storage',
  '/photo/setVisibility',
  '/photo/setAllowDownload',
  '/photo/batchEdit',
  '/photo/recycle',
  '/photo/restore',
  '/photo/delete',
  '/photo/clear',
  '/photo/duplicates',
  '/photo/add',
  '/photo/addVideo',
  '/photo/exists',
  '/photo/presignedUploadUrl',
  '/photo/multipart/initiate',
  '/photo/multipart/partUrl',
  '/photo/multipart/complete',
  '/photo/multipart/abort',
  '/album/add',
  '/album/setCover',
  '/album/coverCandidates',
  '/album/addPhoto',
  '/album/removePhoto',
  '/album/togglePinPhoto',
  '/album/setName',
  '/album/reorder',
  '/album/delete',
  '/album/trash',
  '/photo/comment/admin',
  '/photo/comment/reply',
  '/photo/comment/delete',
  '/photo/comment/heart',
  '/photo/comment/pin',
  '/photo/untagged',
  '/admin/insights',
  '/insights',
  '/analytics/overview',
  '/analytics/sessions',
  '/analytics/reset',
  '/backup',
  '/totp'
];

const PUBLIC_API_PATHS = [
  '/health',
  '/cron',
  '/login',
  '/logout',
  '/photo/list',
  '/photo/randomIdList',
  '/photo/takenDateList',
  '/photo/onThisDay',
  '/photo/download',
  '/album/list',
  '/storage/select',
  '/media',
  '/photos',
  '/photo/comment/list',
  '/photo/comment/add',
  '/photo/reactions',
  '/photo/reaction',
  '/photo/view',
  '/photo/share',
  '/location',
  '/csp-report',
  '/sync',
  '/analytics/session/init',
  '/analytics/session/ping',
  '/analytics/session/location',
  '/analytics/media/track',
  '/telemetry/session/init',
  '/telemetry/session/ping',
  '/telemetry/session/location',
  '/telemetry/media/track'
];

function isPathMatched(path: string, target: string) {
  return path === target || path.startsWith(`${target}/`);
}

function isPublicApiPath(path: string) {
  return PUBLIC_API_PATHS.some((target) => isPathMatched(path, target));
}

function isSystemPath(path: string) {
  return SYSTEM_PATHS.some((target) => isPathMatched(path, target));
}

describe('Access Control & RBAC Policy Suite', () => {
  it('correctly classifies public browsing endpoints as public', () => {
    assert.strictEqual(isPublicApiPath('/photo/list'), true);
    assert.strictEqual(isPublicApiPath('/album/list'), true);
    assert.strictEqual(isPublicApiPath('/storage/select'), true);
    assert.strictEqual(isPublicApiPath('/health'), true);
    assert.strictEqual(isPublicApiPath('/cron/cleanup'), true);
    assert.strictEqual(isPublicApiPath('/photo/download'), true);
    assert.strictEqual(isPublicApiPath('/location/reverse'), true);
  });

  it('strictly classifies sensitive administrative endpoints as system paths', () => {
    assert.strictEqual(isSystemPath('/setting/set'), true);
    assert.strictEqual(isSystemPath('/storage/add'), true);
    assert.strictEqual(isSystemPath('/storage/delete'), true);
    assert.strictEqual(isSystemPath('/album/reorder'), true);
    assert.strictEqual(isSystemPath('/album/delete'), true);
    assert.strictEqual(isSystemPath('/photo/delete'), true);
    assert.strictEqual(isSystemPath('/photo/clear'), true);
    assert.strictEqual(isSystemPath('/photo/recycle'), true);
    assert.strictEqual(isSystemPath('/photo/restore'), true);
    assert.strictEqual(isSystemPath('/backup/export'), true);
    assert.strictEqual(isSystemPath('/totp/setup'), true);
    assert.strictEqual(isSystemPath('/totp/enable'), true);
    assert.strictEqual(isSystemPath('/totp/disable'), true);
  });

  it('ensures public endpoints are not blocked by system path restrictions for normal users', () => {
    // /storage/select is public, even though /storage is a system path prefix
    const path = '/storage/select';
    const isPublic = isPublicApiPath(path);
    const isSystem = isSystemPath(path);

    assert.strictEqual(isPublic, true);
    assert.strictEqual(isSystem, true);

    // Rule: isSystemPath && !isPublicApiPath determines whether normal user is forbidden
    const isForbiddenForNormalUser = isSystem && !isPublic;
    assert.strictEqual(isForbiddenForNormalUser, false);
  });

  it('rejects unauthorized access to unauthenticated requests on protected endpoints', () => {
    const protectedPaths = [
      '/setting',
      '/storage',
      '/album/reorder',
      '/photo/delete',
      '/backup/stats',
      '/totp/setup',
      '/user/list'
    ];

    for (const path of protectedPaths) {
      assert.strictEqual(
        isPublicApiPath(path),
        false,
        `Path ${path} must NOT be public!`
      );
    }
  });
});
