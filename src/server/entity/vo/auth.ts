// This module defines the login authentication cache object.

interface AuthInfo {
  userId: string
  username: string
  avatar: string
  type: number
  tokenVersion: number
  // Current unexpired login session uuid list.
  uuidList: string[]
}

export type { AuthInfo }
