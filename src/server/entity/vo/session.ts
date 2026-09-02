// This module defines View Objects for active user sessions and multi-device management.

export interface ActiveSessionVo {
  uuid: string;
  ip: string;
  userAgent: string;
  deviceLabel: string;
  deviceType: 'desktop' | 'mobile' | 'tablet' | 'unknown';
  createdAt: number;
  lastActive: number;
  isCurrent: boolean;
}
