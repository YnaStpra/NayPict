// This module defines business object input types for visitor session and media tracking.

export type InitVisitorSessionBo = {
  visitorId?: string;
  referrer?: string;
  landingPath?: string;
  browser?: string;
  browserVersion?: string;
  os?: string;
  device?: string;
  userLat?: string;
  userLng?: string;
  userLocationName?: string;
};

export type UpdateVisitorLocationBo = {
  sessionId: string;
  latitude: number;
  longitude: number;
  locationName?: string;
};

export type HeartbeatBo = {
  sessionId: string;
  durationSeconds: number;
};

export type TrackMediaBo = {
  sessionId?: string;
  photoId: string;
  action?: 'view' | 'download' | 'share' | 'reaction';
};

export type VisitorSessionsQueryBo = {
  page?: number;
  pageSize?: number;
  search?: string;
  device?: string;
  browser?: string;
  country?: string;
};
