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

export function getSecurityAuditLogs(params?: { limit?: number; action?: string; severity?: string }) {
  return http.get<SecurityAuditRecord[]>('/security/audit', params as unknown as Record<string, unknown>);
}
