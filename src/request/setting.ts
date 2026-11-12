import { http } from "@/request/request";
import { type Setting } from "@/server/entity/setting";
import { type PhotoVo } from "@/server/entity/vo/photo";

// This module encapsulates system settings related interface requests.

export interface PublicSettingVo {
  rightClickGuard: boolean;
}

export interface LandingPrioritySettingVo {
  photoIds: string[];
  photos: PhotoVo[];
  maxCount: number;
}

// Fetch public system settings for guest visitors (cached at edge)
export function settingPublicGet() {
  return http.get<PublicSettingVo>('/setting/public');
}

// Overwrite the entire system settings.
export function settingSet(params: Setting) {
  return http.post<void>('/setting/set', params);
}

// Fetch admin-configured priority photos for the landing page infinite gallery.
export function landingPriorityGet() {
  return http.get<LandingPrioritySettingVo>('/setting/landing-priority');
}

// Save up to 10 priority photo IDs for the landing page infinite gallery.
export function landingPrioritySet(photoIds: string[]) {
  return http.post<{ photoIds: string[] }>('/setting/landing-priority', { photoIds });
}
