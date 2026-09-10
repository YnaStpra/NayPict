// This module provides structured security audit logging for sensitive administrative operations.

export interface SecurityAuditEntry {
  action: string;
  userId?: string | null;
  clientIp?: string;
  targetId?: string | null;
  details?: Record<string, unknown>;
}

// Format and emit a high-priority structured security audit log entry.
export function logSecurityAudit(entry: SecurityAuditEntry): void {
  try {
    const timestamp = new Date().toISOString();
    const logData = {
      timestamp,
      type: 'SECURITY_AUDIT',
      action: entry.action,
      userId: entry.userId || 'anonymous',
      clientIp: entry.clientIp || 'unknown',
      targetId: entry.targetId ?? undefined,
      details: entry.details ?? undefined,
    };

    console.info(`[SECURITY_AUDIT] ${JSON.stringify(logData)}`);
  } catch (err) {
    console.warn('[SECURITY_AUDIT] Failed to emit audit log:', err);
  }
}
