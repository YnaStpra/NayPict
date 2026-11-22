import { http } from "@/request/request";
import { type UserSetAvatarBo, type UserPasswordBo } from "@/server/entity/bo/user";
import { type UserInfoVo } from "@/server/entity/vo/user";

// This module encapsulates user-related interface requests.

// Query the currently logged in user information.
export function userInfo(silent = true) {
  return http.post<UserInfoVo | null>('/user/info', null, { silent });
}

// Modify the current login user password.
export function userSetUserPassword(params: UserPasswordBo) {
  return http.post<void>('/user/setUserPassword', params);
}

// Set current user avatar.
export function userSetAvatar(params: UserSetAvatarBo) {
  return http.post<string>('/user/setAvatar', params);
}

// Elevate current administrative session to Sudo Mode (15-minute validity).
export function userSudo(password: string, code?: string) {
  return http.post<{ active: boolean; remainingSeconds: number }>('/user/sudo', { password, code });
}

// Query current Sudo Mode elevation status and remaining validity window.
export function userSudoStatus() {
  return http.get<{ active: boolean; remainingSeconds: number }>('/user/sudo/status');
}

// Revoke current Sudo Mode elevation early upon user request.
export function userSudoDrop() {
  return http.post<{ active: boolean; remainingSeconds: number }>('/user/sudo/drop');
}

