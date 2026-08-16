// This module defines the login interface input parameter object。

interface LoginBo {
  username: string;
  password: string;
  code?: string;
  tempToken?: string;
}

export type { LoginBo };
