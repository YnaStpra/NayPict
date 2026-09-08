// This module defines response data models (VO) for photo insights and analytics.

export interface InsightsOverviewVo {
  totalPhotos: number;
  totalViews: number;
  viewsToday: number;
  viewsThisWeek: number;
  viewsThisMonth: number;
  totalComments: number;
  totalShares: number;
  totalDownloads: number;
  totalReactions: number;
  reactionsBreakdown?: {
    love: number;
    fire: number;
    camera: number;
    place: number;
    clap: number;
  };
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
  commentCount: number;
  downloadCount?: number;
  reactionCount?: number;
  type?: string | null;
  key?: string | null;
}

export interface InsightsTopReactionPhotoVo {
  photoId: string;
  name: string;
  thumbnail: string;
  preview: string;
  width: number | null;
  height: number | null;
  totalReactions: number;
  reactions: {
    love: number;
    fire: number;
    camera: number;
    place: number;
    clap: number;
  };
  viewCount: number;
  commentCount: number;
  type?: string | null;
  key?: string | null;
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
  comments: number;
  shares: number;
  downloads: number;
  reactions: {
    total: number;
    love: number;
    fire: number;
    camera: number;
    place: number;
    clap: number;
  };
  chart: InsightsChartDataVo;
  type?: string | null;
  key?: string | null;
}

