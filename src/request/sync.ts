import { type CatalogSyncVersionVo } from "@/server/entity/vo/sync";

// Fetch the latest edge-cached catalog version vector silently without user-facing toast alerts.
export async function getSyncVersion(): Promise<CatalogSyncVersionVo | null> {
  try {
    const res = await fetch('/api/sync/version', {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
    });

    if (!res.ok) return null;
    const json = await res.json();
    if (json && json.code === 200 && json.data) {
      return json.data as CatalogSyncVersionVo;
    }
    if (json && typeof json.v === 'number') {
      return json as CatalogSyncVersionVo;
    }
    return null;
  } catch {
    return null;
  }
}
