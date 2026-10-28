// This module defines the TOTP / Google Authenticator return value objects.

interface TotpSetupVo {
  secret: string;
  otpauthUrl: string;
  qrCodeUrl: string;
  enabled: boolean;
  backupCodes?: string[];
}

interface TotpStatusVo {
  enabled: boolean;
  configured: boolean;
}

export type { TotpSetupVo, TotpStatusVo };
