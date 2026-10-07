import { http } from "@/request/request";
import { type Setting } from "@/server/entity/setting";

// This module encapsulates system settings related interface requests.

export interface PublicSettingVo {
  rightClickGuard: boolean;
}

// Fetch public system settings for guest visitors (cached at edge)
export function settingPublicGet() {
  return http.get<PublicSettingVo>('/setting/public');
}

// Overwrite the entire system settings.
export function settingSet(params: Setting) {
  return http.post<void>('/setting/set', params);
}
