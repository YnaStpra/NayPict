// This module defines the TOTP / Google Authenticator business input parameter objects.

interface TotpSetupBo {
  secret: string;
  code: string;
}

interface TotpVerifyBo {
  userId?: string;
  username?: string;
  password?: string;
  tempToken?: string;
  code: string;
}

interface TotpToggleBo {
  enabled: boolean;
}

interface TotpDisableBo {
  password?: string;
  code?: string;
}

export type { TotpSetupBo, TotpVerifyBo, TotpToggleBo, TotpDisableBo };
