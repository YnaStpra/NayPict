// This module defines the login authentication cache and active session objects.

export interface SessionMeta {
  uuid: string
  ip: string
  userAgent: string
  deviceLabel: string
  deviceType: 'desktop' | 'mobile' | 'tablet' | 'unknown'
  createdAt: number
  lastActive: number
}

interface AuthInfo {
  userId: string
  username: string
  avatar: string
  type: number
  tokenVersion: number
  // Current unexpired login session uuid list.
  uuidList: string[]
  // Detailed metadata for active client devices and sessions.
  sessions?: SessionMeta[]
}

export type { AuthInfo }

