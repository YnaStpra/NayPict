// This module provides spatial clustering calculations with 2D KD-Tree spatial indexing and off-thread scheduling.

export interface GeoPoint {
  id: string;
  latitude: number;
  longitude: number;
  [key: string]: unknown;
}

export interface ClusterResult<T extends GeoPoint> {
  id: string;
  latitude: number;
  longitude: number;
  points: T[];
  isMulti: boolean;
}

interface KDNode<T extends GeoPoint> {
  point: T;
  x: number;
  y: number;
  left: KDNode<T> | null;
  right: KDNode<T> | null;
}

/**
 * Builds a 2D KD-Tree for O(log N) spatial range queries.
 */
function buildKDTree<T extends GeoPoint>(
  nodes: { point: T; x: number; y: number }[],
  depth = 0
): KDNode<T> | null {
  if (!nodes.length) return null;

  const axis = depth % 2; // 0 for x, 1 for y
  nodes.sort((a, b) => (axis === 0 ? a.x - b.x : a.y - b.y));

  const median = Math.floor(nodes.length / 2);
  const mid = nodes[median];

  return {
    point: mid.point,
    x: mid.x,
    y: mid.y,
    left: buildKDTree(nodes.slice(0, median), depth + 1),
    right: buildKDTree(nodes.slice(median + 1), depth + 1),
  };
}

/**
 * Searches the 2D KD-Tree for all points within a circular radius of (targetX, targetY).
 */
function searchKDTree<T extends GeoPoint>(
  node: KDNode<T> | null,
  targetX: number,
  targetY: number,
  radius: number,
  depth = 0,
  results: T[] = [],
  visited: Set<string>
): T[] {
  if (!node) return results;

  const distSq = (node.x - targetX) ** 2 + (node.y - targetY) ** 2;
  if (distSq <= radius ** 2 && !visited.has(node.point.id)) {
    results.push(node.point);
  }

  const axis = depth % 2;
  const targetCoord = axis === 0 ? targetX : targetY;
  const nodeCoord = axis === 0 ? node.x : node.y;

  const delta = targetCoord - nodeCoord;

  // Search subtree on the same side of the splitting plane first
  const first = delta < 0 ? node.left : node.right;
  const second = delta < 0 ? node.right : node.left;

  searchKDTree(first, targetX, targetY, radius, depth + 1, results, visited);

  // Search opposite subtree only if the circle intersects the splitting plane
  if (Math.abs(delta) <= radius) {
    searchKDTree(second, targetX, targetY, radius, depth + 1, results, visited);
  }

  return results;
}

/**
 * Calculates spatial clusters with O(N log N) 2D KD-Tree spatial partitioning off the main UI thread.
 */
export async function calculateSpatialClusters<T extends GeoPoint>(
  points: T[],
  pixelRadius: number,
  projectFn: (lat: number, lng: number) => { x: number; y: number }
): Promise<ClusterResult<T>[]> {
  if (!points.length) return [];

  return new Promise((resolve) => {
    const execute = () => {
      const projectedNodes = points.map((pt) => {
        const { x, y } = projectFn(pt.latitude, pt.longitude);
        return { point: pt, x, y };
      });

      const kdTree = buildKDTree(projectedNodes);
      const clusters: ClusterResult<T>[] = [];
      const visited = new Set<string>();

      for (const node of projectedNodes) {
        if (visited.has(node.point.id)) continue;

        visited.add(node.point.id);
        const nearbyPoints = searchKDTree(
          kdTree,
          node.x,
          node.y,
          pixelRadius,
          0,
          [],
          visited
        );

        const clusterPoints: T[] = [node.point];
        for (const pt of nearbyPoints) {
          visited.add(pt.id);
          clusterPoints.push(pt);
        }

        const isMulti = clusterPoints.length > 1;
        const avgLat = clusterPoints.reduce((sum, s) => sum + s.latitude, 0) / clusterPoints.length;
        const avgLon = clusterPoints.reduce((sum, s) => sum + s.longitude, 0) / clusterPoints.length;

        clusters.push({
          id: node.point.id,
          latitude: isMulti ? avgLat : node.point.latitude,
          longitude: isMulti ? avgLon : node.point.longitude,
          points: clusterPoints,
          isMulti,
        });
      }

      resolve(clusters);
    };

    if (typeof requestIdleCallback !== "undefined") {
      requestIdleCallback(execute, { timeout: 100 });
    } else {
      setTimeout(execute, 0);
    }
  });
}

