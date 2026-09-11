import { http } from "@/request/request";
import { type CatalogSyncVersionVo } from "@/server/entity/vo/sync";

// Fetch the latest edge-cached catalog version vector to detect background mutations without full page reloads.
export function getSyncVersion(): Promise<CatalogSyncVersionVo> {
  return http.get<CatalogSyncVersionVo>('/sync/version');
}
