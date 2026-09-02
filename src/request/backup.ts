import { http } from "@/request/request";
import { type DatabaseStatsVo } from "@/server/service/backup-service";

// This module encapsulates database backup request methods.

// Fetch SQLite database file metrics and status.
export function getBackupStats() {
  return http.get<DatabaseStatsVo>('/backup/stats');
}

// Download encrypted SQLite database backup file directly to client browser.
export async function downloadEncryptedBackup(password?: string): Promise<void> {
  const response = await fetch('/api/backup/export', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ password }),
  });

  if (!response.ok) {
    throw new Error('Failed to generate encrypted backup snapshot');
  }

  const blob = await response.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const dateStr = new Date().toISOString().slice(0, 10);
  a.download = `naypict-backup-${dateStr}.bak`;
  document.body.appendChild(a);
  a.click();
  window.URL.revokeObjectURL(url);
  document.body.removeChild(a);
}
