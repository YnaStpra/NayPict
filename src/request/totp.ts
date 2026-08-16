import { http } from "@/request/request";
import { type TotpSetupBo } from "@/server/entity/bo/totp";
import { type TotpSetupVo, type TotpStatusVo } from "@/server/entity/vo/totp";

// This module encapsulates TOTP / Google Authenticator interface requests.

// Get current user's 2FA status
export function getTotpStatus() {
  return http.get<TotpStatusVo>('/totp/status');
}

// Setup / Generate QR Code for Google Authenticator
export function setupTotp() {
  return http.post<TotpSetupVo>('/totp/setup');
}

// Verify code and enable 2FA
export function enableTotp(params: TotpSetupBo) {
  return http.post<void>('/totp/enable', params);
}

// Disable 2FA
export function disableTotp() {
  return http.post<void>('/totp/disable');
}
