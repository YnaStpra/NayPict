import { http } from "@/request/request";

// This module encapsulates security audit request methods for the Admin Portal.

export interface SecurityAuditRecord {
  id: string;
  timestamp: string;
  action: string;
  userId: string;
  clientIp: string;
  targetId?: string;
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
  details?: Record<string, unknown>;
}

export interface SecurityAuditExportData {
  exportVersion: string;
  exportedAt: string;
  exportedBy: string;
  recordCount: number;
  sha256Checksum: string;
  records: SecurityAuditRecord[];
}

export function getSecurityAuditLogs(params?: { limit?: number; action?: string; severity?: string }) {
  return http.get<SecurityAuditRecord[]>('/security/audit', params as unknown as Record<string, unknown>);
}

export function exportSecurityAuditLogs() {
  return http.get<SecurityAuditExportData>('/security/audit/export');
}
