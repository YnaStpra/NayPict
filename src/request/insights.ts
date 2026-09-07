import { http } from "@/request/request";
import {
  type InsightsChartDataVo,
  type InsightsOverviewVo,
  type InsightsTopPhotoVo,
  type InsightsTopReactionPhotoVo,
  type PhotoInsightsDetailVo,
} from "@/server/entity/vo/insights";

// This module encapsulates photo insights and public view tracking API requests.

// Record a public photo view event silently without disrupting UI.
export async function recordPhotoView(photoId: string): Promise<boolean> {
  if (!photoId || typeof window === 'undefined') return false;
  try {
    const res = await fetch(`/api/photos/${encodeURIComponent(photoId)}/view`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ photoId }),
    });
    const json = await res.json().catch(() => null);
    return json?.data?.recorded === true;
  } catch {
    return false;
  }
}

// Record a photo share event silently.
export async function recordPhotoShare(photoId: string): Promise<boolean> {
  if (!photoId || typeof window === 'undefined') return false;
  try {
    const res = await fetch(`/api/photos/${encodeURIComponent(photoId)}/share`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ photoId }),
    });
    const json = await res.json().catch(() => null);
    return json?.data?.recorded === true;
  } catch {
    return false;
  }
}

// Fetch high-level gallery insights overview (Admin only).
export function getInsightsOverview(): Promise<InsightsOverviewVo> {
  return http.get<InsightsOverviewVo>('/admin/insights/overview');
}

// Fetch public views trend chart data (Admin only).
export function getInsightsChart(range: '7d' | '30d' | '90d' = '7d', photoId?: string): Promise<InsightsChartDataVo> {
  const query = new URLSearchParams({ range });
  if (photoId) query.set('photoId', photoId);
  return http.get<InsightsChartDataVo>(`/admin/insights/chart?${query.toString()}`);
}

// Fetch top viewed, commented, and reacted photos (Admin only).
export function getInsightsTopPhotos(limit = 10): Promise<{
  mostViewed: InsightsTopPhotoVo[];
  mostCommented: InsightsTopPhotoVo[];
  mostReacted: InsightsTopReactionPhotoVo[];
}> {
  return http.get<{
    mostViewed: InsightsTopPhotoVo[];
    mostCommented: InsightsTopPhotoVo[];
    mostReacted: InsightsTopReactionPhotoVo[];
  }>(`/admin/insights/top-photos?limit=${limit}`);
}

// Fetch all photos with public reactions (Admin only).
export function getInsightsTopReactions(limit = 50): Promise<InsightsTopReactionPhotoVo[]> {
  return http.get<InsightsTopReactionPhotoVo[]>(`/admin/insights/reactions/top?limit=${limit}`);
}

// Reset public reactions for a single photo (Admin only).
export function resetPhotoReactions(photoId: string): Promise<{ success: boolean }> {
  return http.post<{ success: boolean }>(`/admin/insights/photo/${encodeURIComponent(photoId)}/reactions/reset`);
}

// Reset all public reactions across the entire gallery (Admin only).
export function resetAllReactions(): Promise<{ success: boolean }> {
  return http.post<{ success: boolean }>('/admin/insights/reactions/reset');
}

// Fetch individual photo insights metrics and 30-day views trend (Admin only).
export function getPhotoInsightsDetail(photoId: string): Promise<PhotoInsightsDetailVo> {
  return http.get<PhotoInsightsDetailVo>(`/admin/insights/photo/${encodeURIComponent(photoId)}`);
}

// Reset all gallery insights and view records (Admin only).
export function resetInsights(): Promise<{ success: boolean }> {
  return http.post<{ success: boolean }>('/admin/insights/reset');
}

