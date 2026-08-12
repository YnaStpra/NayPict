import { type UserInfoVo } from './user';

// This module defines the login interface return object.

interface LoginVo {
  token: string;
  user?: UserInfoVo | null;
}

export type { LoginVo };
