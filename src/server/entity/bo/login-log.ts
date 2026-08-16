// This module defines input parameter objects for login logs and session management.

interface RecordLoginLogBo {
  userId: string;
  username: string;
  uuid: string;
  ip: string;
  location: string;
  device: string;
  browser: string;
  os: string;
  userAgent: string;
  status: number; // 1 = Success, 0 = Failed
}

interface RevokeSessionBo {
  uuid: string;
}

interface ListLoginLogQueryBo {
  page?: number;
  size?: number;
}

export type { RecordLoginLogBo, RevokeSessionBo, ListLoginLogQueryBo };
