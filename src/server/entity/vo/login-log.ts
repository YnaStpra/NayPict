// This module defines return value objects for login logs and session management.

interface ActiveSessionVo {
  logId: string;
  uuid: string;
  ip: string;
  location: string;
  device: string;
  browser: string;
  os: string;
  loginTime: string;
  isCurrent: boolean;
}

interface LoginLogItemVo {
  logId: string;
  userId: string;
  username: string;
  ip: string;
  location: string;
  device: string;
  browser: string;
  os: string;
  status: number; // 1 = Success, 0 = Failed
  isRevoked: number; // 1 = Logged out / Revoked
  loginTime: string;
}

export type { ActiveSessionVo, LoginLogItemVo };
