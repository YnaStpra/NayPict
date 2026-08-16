import { http } from "@/request/request";
import { type ActiveSessionVo, type LoginLogItemVo } from "@/server/entity/vo/login-log";

// This module encapsulates active session and login audit log request calls.

// Get active login sessions
export function getActiveSessions() {
  return http.get<ActiveSessionVo[]>('/login/sessions');
}

// Revoke/logout a specific session
export function revokeSession(uuid: string) {
  return http.post<void>('/login/revoke-session', { uuid });
}

// Get login history logs
export function getLoginLogs() {
  return http.get<LoginLogItemVo[]>('/login/logs');
}
