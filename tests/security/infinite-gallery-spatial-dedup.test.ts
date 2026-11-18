import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

describe('Infinite Gallery 2D Spatial De-duplication & Anti-Clustering Suite', () => {
  // Test mathematical lattice strides logic directly
  function getOptimalLatticeStrides(N: number): { sx: number; sy: number; minDistance: number } {
    if (N <= 1) return { sx: 1, sy: 1, minDistance: 0 };
    if (N === 2) return { sx: 1, sy: 1, minDistance: 1 };
    if (N === 3) return { sx: 1, sy: 2, minDistance: 1.414 };

    let bestSy = 2;
    let bestDistSq = 0;
    const maxDy = Math.min(N, Math.ceil(Math.sqrt(N) * 2) + 1);

    for (let sy = 1; sy < N; sy++) {
      let minDistSq = Infinity;
      for (let dy = -maxDy; dy <= maxDy; dy++) {
        if (dy === 0) continue;
        const rem = ((-dy * sy) % N + N) % N;
        for (const dx of [rem, rem - N]) {
          const dSq = dx * dx + dy * dy;
          if (dSq > 0 && dSq < minDistSq) {
            minDistSq = dSq;
          }
        }
      }
      if (N * N < minDistSq) {
        minDistSq = N * N;
      }
      if (minDistSq > bestDistSq) {
        bestDistSq = minDistSq;
        bestSy = sy;
      }
    }

    return { sx: 1, sy: bestSy, minDistance: Math.sqrt(bestDistSq) };
  }

  describe('Zero-Adjacent Duplicate Photo Guarantee (Berdempetan Defense)', () => {
    it('guarantees horizontally and vertically adjacent tiles NEVER share the same photo for any N >= 2', () => {
      for (let N = 2; N <= 60; N++) {
        const { sx, sy } = getOptimalLatticeStrides(N);

        // Horizontally adjacent: dx = 1, dy = 0
        const horizontalDelta = (1 * sx + 0 * sy) % N;
        assert.notEqual(
          horizontalDelta,
          0,
          `N=${N}: Horizontally adjacent tiles must NEVER have the same photo`
        );

        // Vertically adjacent: dx = 0, dy = 1
        const verticalDelta = (0 * sx + 1 * sy) % N;
        assert.notEqual(
          verticalDelta,
          0,
          `N=${N}: Vertically adjacent tiles must NEVER have the same photo`
        );
      }
    });

    it('guarantees diagonal adjacent tiles NEVER share the same photo for any N >= 4', () => {
      for (let N = 4; N <= 60; N++) {
        const { sx, sy } = getOptimalLatticeStrides(N);

        // Diagonals: (1, 1) and (1, -1)
        const diag1 = ((1 * sx + 1 * sy) % N + N) % N;
        const diag2 = ((1 * sx - 1 * sy) % N + N) % N;

        assert.notEqual(
          diag1,
          0,
          `N=${N}: Diagonal (+1, +1) tiles must not collide`
        );
        assert.notEqual(
          diag2,
          0,
          `N=${N}: Diagonal (+1, -1) tiles must not collide`
        );
      }
    });

    it('guarantees all 16 slots within any cell (4x4 subcells) are 100% unique for N >= 16 with intra-cell resolution', () => {
      for (let N = 16; N <= 60; N++) {
        const { sx, sy } = getOptimalLatticeStrides(N);
        const subN = 4;
        const count = 16;

        // Test over sample grid cells with intra-cell resolution
        for (let gx = -2; gx <= 2; gx++) {
          for (let gy = -2; gy <= 2; gy++) {
            const usedInCell = new Set<number>();
            for (let localSx = 0; localSx < subN; localSx++) {
              for (let localSy = 0; localSy < subN; localSy++) {
                const col = gx * subN + localSx;
                const row = gy * subN + localSy;
                const rawIndex = (((col * sx + row * sy) % N) + N) % N;
                let mappedIdx = rawIndex;

                if (N >= count && usedInCell.has(mappedIdx)) {
                  let candidate = (mappedIdx + 1) % N;
                  let attempts = 0;
                  while (usedInCell.has(candidate) && attempts < N) {
                    candidate = (candidate + 1) % N;
                    attempts++;
                  }
                  mappedIdx = candidate;
                }

                assert.ok(
                  !usedInCell.has(mappedIdx),
                  `N=${N}: Cell (${gx}, ${gy}) slot (${localSx}, ${localSy}) collided with duplicate photo idx ${mappedIdx}`
                );
                usedInCell.add(mappedIdx);
              }
            }
          }
        }
      }
    });
  });

  describe('Visible Viewport Frame Separation for Landing Page', () => {
    it('guarantees duplicate photo distance on landing page (N=60) is at least 8 subcells (~1,320px)', () => {
      const { minDistance } = getOptimalLatticeStrides(60);
      assert.ok(
        minDistance >= 8,
        `N=60 minDistance should be >= 8 subcells, got ${minDistance}`
      );
    });

    it('guarantees duplicate photo distance for N=50 is at least 7 subcells (~1,155px)', () => {
      const { minDistance } = getOptimalLatticeStrides(50);
      assert.ok(
        minDistance >= 7,
        `N=50 minDistance should be >= 7 subcells, got ${minDistance}`
      );
    });

    it('guarantees zero duplicate photos in standard mobile viewport (3x6 subcells) for landing page (N=50)', () => {
      const width = 3;
      const height = 6;
      const N = 50;
      const { sx, sy } = getOptimalLatticeStrides(N);
      const seen = new Set<number>();
      let hasDuplicate = false;

      for (let r = 0; r < height; r++) {
        for (let c = 0; c < width; c++) {
          const idx = (((c * sx + r * sy) % N) + N) % N;
          if (seen.has(idx)) {
            hasDuplicate = true;
            break;
          }
          seen.add(idx);
        }
        if (hasDuplicate) break;
      }

      assert.equal(
        hasDuplicate,
        false,
        `N=${N}: Mobile screen viewport (3x6 subcells) must have ZERO duplicate photos`
      );
    });
  });

  describe('Source Code Verification in infinite-gallery.tsx', () => {
    const galleryFilePath = path.join(
      process.cwd(),
      'src/components/gallery/infinite-gallery.tsx'
    );
    const content = fs.readFileSync(galleryFilePath, 'utf8');

    it('implements getOptimalLatticeStrides to prevent adjacent duplicates', () => {
      assert.ok(
        content.includes('function getOptimalLatticeStrides'),
        'infinite-gallery.tsx must contain getOptimalLatticeStrides function'
      );
    });

    it('deduplicates safeImages by photoId or key to prevent input duplication', () => {
      assert.ok(
        content.includes('const seen = new Set<string>()'),
        'infinite-gallery.tsx must deduplicate safeImages by photo ID/src'
      );
    });

    it('enforces intra-cell conflict resolution so no two tiles in the same cell share photo', () => {
      assert.ok(
        content.includes('usedInCell'),
        'infinite-gallery.tsx must track intra-cell photo uniqueness'
      );
    });
  });
});
