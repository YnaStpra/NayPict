import { http } from "@/request/request";
import { type UserAddBo, type UserDeleteBo, type UserSetAvatarBo, type UserSetBo, type UserPasswordBo, type UserToggleStatusBo } from "@/server/entity/bo/user";
import { type PageVo } from "@/server/entity/vo/common";
import { type UserInfoVo, type UserVo } from "@/server/entity/vo/user";

// This module encapsulates user-related interface requests。

// Query the currently logged in user information。
export function userInfo() {
  return http.post<UserInfoVo | null>('/user/info');
}

// Query all user list。
export function userList() {
  return http.post<PageVo<UserVo>>('/user/list');
}

// Add user。
export function userAdd(params: UserAddBo) {
  return http.post<void>('/user/add', params);
}

// Modify user information。
export function userSet(params: UserSetBo) {
  return http.post<void>('/user/set', params);
}

// Modify the current login user password。
export function userSetUserPassword(params: UserPasswordBo) {
  return http.post<void>('/user/setUserPassword', params);
}

// Set current user avatar。
export function userSetAvatar(params: UserSetAvatarBo) {
  return http.post<string>('/user/setAvatar', params);
}

// Toggle user enabled status。
export function userToggleStatus(params: UserToggleStatusBo) {
  return http.post<void>('/user/toggleStatus', params);
}

// Delete user。
export function userDelete(userId: string) {
  return http.post<void>('/user/delete', { userId } satisfies UserDeleteBo);
}
