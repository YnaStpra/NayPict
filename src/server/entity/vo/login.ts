import { type UserInfoVo } from './user';

// This module defines the login interface return object.

interface LoginVo {
  token: string | null;
  user?: UserInfoVo | null;
  require2Fa?: boolean;
  tempToken?: string;
  qrCodeUrl?: string;
  secret?: string;
  isNewDevice?: boolean;
}

export type { LoginVo };
