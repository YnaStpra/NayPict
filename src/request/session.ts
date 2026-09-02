import { http } from "@/request/request";
import { type ActiveSessionVo } from "@/server/entity/vo/session";

// This module encapsulates user session and device management request methods.

// Query active device sessions for current user.
export function listSessions() {
  return http.get<ActiveSessionVo[]>('/session/list');
}

// Revoke a specific device session by UUID.
export function revokeSession(uuid: string) {
  return http.post<boolean>('/session/revoke', { uuid });
}

// Revoke all other active device sessions.
export function revokeOtherSessions() {
  return http.post<boolean>('/session/revoke-others', {});
}
