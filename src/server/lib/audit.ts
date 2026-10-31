// This module provides structured security audit logging for sensitive administrative operations.

export interface SecurityAuditEntry {
  action: string;
  userId?: string | null;
  clientIp?: string;
  targetId?: string | null;
  details?: Record<string, unknown>;
}

// Sensitive keys pattern to redact automatically from audit logs.
const SENSITIVE_KEY_PATTERN = /^(password|passwd|secret|token|accesstoken|refreshtoken|accesskey|secretkey|authorization|cookie|sessionid)$/i;

// Recursively redact sensitive authentication and credential values from log details.
export function redactSensitiveDetails(obj: unknown, depth = 0): unknown {
  if (depth > 5 || obj == null) return obj;
  if (typeof obj !== 'object') return obj;

  if (Array.isArray(obj)) {
    return obj.map((item) => redactSensitiveDetails(item, depth + 1));
  }

  const redacted: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    if (SENSITIVE_KEY_PATTERN.test(key)) {
      redacted[key] = '***REDACTED***';
    } else if (typeof value === 'object' && value !== null) {
      redacted[key] = redactSensitiveDetails(value, depth + 1);
    } else {
      redacted[key] = value;
    }
  }
  return redacted;
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
      details: entry.details ? (redactSensitiveDetails(entry.details) as Record<string, unknown>) : undefined,
    };

    console.info(`[SECURITY_AUDIT] ${JSON.stringify(logData)}`);
  } catch (err) {
    console.warn('[SECURITY_AUDIT] Failed to emit audit log:', err);
  }
}
