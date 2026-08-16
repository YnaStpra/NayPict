// This module defines response data models (VO) for photo insights and analytics.

export interface InsightsOverviewVo {
  totalPhotos: number;
  totalViews: number;
  viewsToday: number;
  viewsThisWeek: number;
  viewsThisMonth: number;
  totalFavorites: number;
  totalComments: number;
  totalShares: number;
  totalDownloads: number;
}

export interface InsightsChartPointVo {
  date: string;
  label: string;
  views: number;
}

export interface InsightsChartDataVo {
  range: '7d' | '30d' | '90d';
  points: InsightsChartPointVo[];
}

export interface InsightsTopPhotoVo {
  photoId: string;
  name: string;
  thumbnail: string;
  preview: string;
  width: number | null;
  height: number | null;
  viewCount: number;
  favoriteCount: number;
  commentCount: number;
}

export interface PhotoInsightsDetailVo {
  photoId: string;
  name: string;
  thumbnail: string;
  preview: string;
  width: number | null;
  height: number | null;
  totalViews: number;
  viewsToday: number;
  viewsThisWeek: number;
  viewsThisMonth: number;
  favorites: number;
  comments: number;
  shares: number;
  downloads: number;
  chart: InsightsChartDataVo;
}
