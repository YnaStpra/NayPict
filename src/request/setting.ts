import { http } from "@/request/request";
import { type Setting } from "@/server/entity/setting";

// This module encapsulates system settings related interface requests。

// Get current system settings
export function settingGet() {
  return http.get<Setting>('/setting/get');
}

// Overwrite the entire system settings
export function settingSet(params: Setting) {
  return http.post<void>('/setting/set', params);
}
