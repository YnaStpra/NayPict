// This module defines value object return types for visitor analytics and session inspection.

export type VisitorSessionVo = {
  id: string;
  visitorId: string;
  ip: string;
  country: string;
  city: string;
  region: string;
  browser: string;
  browserVersion: string;
  os: string;
  device: string;
  referrer: string;
  landingPath: string;
  startedAt: string;
  lastActiveAt: string;
  durationSeconds: number;
  mediaCount: number;
};

export type VisitorActivityItemVo = {
  id: string;
  photoId: string;
  photoTitle: string;
  thumbnail: string;
  action: string;
  createdAt: string;
};

export type VisitorSessionDetailVo = {
  session: VisitorSessionVo;
  activities: VisitorActivityItemVo[];
};

export type AnalyticsDistributionVo = {
  name: string;
  count: number;
  percentage: number;
  code?: string;
};

export type AnalyticsOverviewVo = {
  totalVisitors: number;
  totalSessions: number;
  liveVisitors: number;
  avgDurationSeconds: number;
  totalMediaInteractions: number;
  topBrowsers: AnalyticsDistributionVo[];
  topDevices: AnalyticsDistributionVo[];
  topCountries: AnalyticsDistributionVo[];
  topReferrers: AnalyticsDistributionVo[];
};

export type VisitorSessionsListVo = {
  items: VisitorSessionVo[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};
