import { http } from "@/request/request";
import { type UserSetAvatarBo, type UserPasswordBo } from "@/server/entity/bo/user";
import { type UserInfoVo } from "@/server/entity/vo/user";

// This module encapsulates user-related interface requests.

// Query the currently logged in user information.
export function userInfo() {
  return http.post<UserInfoVo | null>('/user/info');
}

// Modify the current login user password.
export function userSetUserPassword(params: UserPasswordBo) {
  return http.post<void>('/user/setUserPassword', params);
}

// Set current user avatar.
export function userSetAvatar(params: UserSetAvatarBo) {
  return http.post<string>('/user/setAvatar', params);
}
