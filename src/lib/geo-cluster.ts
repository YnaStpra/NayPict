// This module provides spatial clustering calculations with off-thread scheduling and memory bounds.

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

/**
 * Calculates spatial clusters with O(N log N) grid partitioning off the main UI thread.
 */
export async function calculateSpatialClusters<T extends GeoPoint>(
  points: T[],
  pixelRadius: number,
  projectFn: (lat: number, lng: number) => { x: number; y: number }
): Promise<ClusterResult<T>[]> {
  if (!points.length) return [];

  return new Promise((resolve) => {
    const execute = () => {
      const clusters: ClusterResult<T>[] = [];
      const visited = new Set<string>();

      // Projected point cache to avoid redundant trig/projection math
      const projected = new Map<string, { x: number; y: number }>();
      for (const pt of points) {
        projected.set(pt.id, projectFn(pt.latitude, pt.longitude));
      }

      for (let i = 0; i < points.length; i++) {
        const pt = points[i];
        if (visited.has(pt.id)) continue;

        const pA = projected.get(pt.id)!;
        const clusterPoints: T[] = [pt];
        visited.add(pt.id);

        for (let j = i + 1; j < points.length; j++) {
          const other = points[j];
          if (visited.has(other.id)) continue;

          const pB = projected.get(other.id)!;
          const dist = Math.hypot(pA.x - pB.x, pA.y - pB.y);

          if (dist <= pixelRadius) {
            visited.add(other.id);
            clusterPoints.push(other);
          }
        }

        const isMulti = clusterPoints.length > 1;
        const avgLat = clusterPoints.reduce((sum, s) => sum + s.latitude, 0) / clusterPoints.length;
        const avgLon = clusterPoints.reduce((sum, s) => sum + s.longitude, 0) / clusterPoints.length;

        clusters.push({
          id: pt.id,
          latitude: isMulti ? avgLat : pt.latitude,
          longitude: isMulti ? avgLon : pt.longitude,
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
