import { http } from "@/request/request";
import { type LoginBo } from "@/server/entity/bo/login";
import { type LoginVo } from "@/server/entity/vo/login";

// This module encapsulates login-related interface requests.

// Log in using username and password.
export function login(params: LoginBo) {
  return http.post<LoginVo>('/login', params);
}

// Log out and clear the server Cookie.
export function logout() {
  return http.post<void>('/logout');
}
