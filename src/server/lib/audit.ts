import { cache } from '@/server/infra/cache';

// This module provides structured security audit logging and in-app forensic trail retention for sensitive administrative operations.

export interface SecurityAuditEntry {
  action: string;
  userId?: string | null;
  clientIp?: string;
  targetId?: string | null;
  details?: Record<string, unknown>;
}

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

// Sensitive keys pattern to redact automatically from audit logs
const SENSITIVE_KEY_PATTERN = /(password|passwd|secret|token|auth|cookie|session|backupcode|privatekey|apikey|accesskey|credential|signature)/i;

const AUDIT_CACHE_KEY = 'security_audit_logs_v1';
const MAX_AUDIT_LOGS = 300;

// In-memory sliding buffer for immediate zero-latency access across serverless executions
let memoryAuditLogs: SecurityAuditRecord[] = [];

// Determine event severity based on security impact
function determineSeverity(action: string): 'INFO' | 'WARNING' | 'CRITICAL' {
  const act = action.toUpperCase();
  if (
    act.includes('FAILED') ||
    act.includes('LOCKOUT') ||
    act.includes('DELETE') ||
    act.includes('CLEAR') ||
    act.includes('RESET') ||
    act.includes('PURGE') ||
    act.includes('BLOCKED')
  ) {
    return 'CRITICAL';
  }
  if (
    act.includes('SUDO') ||
    act.includes('PASSWORD') ||
    act.includes('STATUS') ||
    act.includes('REVOKE') ||
    act.includes('BACKUP')
  ) {
    return 'WARNING';
  }
  return 'INFO';
}

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

// Format, emit, and store a high-priority structured security audit log entry.
export function logSecurityAudit(entry: SecurityAuditEntry): void {
  try {
    const timestamp = new Date().toISOString();
    const cleanDetails = entry.details
      ? (redactSensitiveDetails(entry.details) as Record<string, unknown>)
      : undefined;

    const record: SecurityAuditRecord = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      timestamp,
      action: entry.action,
      userId: entry.userId || 'anonymous',
      clientIp: entry.clientIp || 'unknown',
      targetId: entry.targetId ?? undefined,
      severity: determineSeverity(entry.action),
      details: cleanDetails,
    };

    // 1. Maintain in-memory ring buffer
    memoryAuditLogs.unshift(record);
    if (memoryAuditLogs.length > MAX_AUDIT_LOGS) {
      memoryAuditLogs.length = MAX_AUDIT_LOGS;
    }

    // 2. Persist to cache layer asynchronously with multi-container merge
    (async () => {
      try {
        const cached = await cache.get<SecurityAuditRecord[]>(AUDIT_CACHE_KEY);
        const existingList = Array.isArray(cached) ? cached : [];
        const mergedMap = new Map<string, SecurityAuditRecord>();
        // Current in-memory logs take precedence
        for (const item of memoryAuditLogs) {
          mergedMap.set(item.id, item);
        }
        for (const item of existingList) {
          if (!mergedMap.has(item.id) && mergedMap.size < MAX_AUDIT_LOGS) {
            mergedMap.set(item.id, item);
          }
        }
        const mergedLogs = Array.from(mergedMap.values())
          .sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp))
          .slice(0, 150);
        await cache.set(AUDIT_CACHE_KEY, mergedLogs, { ttl: 30 * 86400 });
      } catch {}
    })();

    // 3. Emit structured stdout log
    console.info(`[SECURITY_AUDIT] ${JSON.stringify(record)}`);
  } catch (err) {
    console.warn('[SECURITY_AUDIT] Failed to emit audit log:', err);
  }
}

// Retrieve recent audit records with optional filters for administrative forensic review.
export async function getRecentAuditLogs(options?: {
  limit?: number;
  action?: string;
  severity?: string;
}): Promise<SecurityAuditRecord[]> {
  try {
    const cached = await cache.get<SecurityAuditRecord[]>(AUDIT_CACHE_KEY);
    if (cached && Array.isArray(cached) && cached.length > 0) {
      const mergedMap = new Map<string, SecurityAuditRecord>();
      for (const item of memoryAuditLogs) {
        mergedMap.set(item.id, item);
      }
      for (const item of cached) {
        if (!mergedMap.has(item.id)) {
          mergedMap.set(item.id, item);
        }
      }
      memoryAuditLogs = Array.from(mergedMap.values())
        .sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp))
        .slice(0, MAX_AUDIT_LOGS);
    }
  } catch {}

  let filtered = memoryAuditLogs;
  if (options?.action) {
    const act = options.action.trim().toUpperCase();
    filtered = filtered.filter((l) => l.action.toUpperCase().includes(act));
  }
  if (options?.severity) {
    const sev = options.severity.trim().toUpperCase();
    filtered = filtered.filter((l) => l.severity === sev);
  }

  const limit = Math.max(1, Math.min(100, Number(options?.limit) || 50));
  return filtered.slice(0, limit);
}

// Clear in-memory audit logs (used in automated testing)
export function clearMemoryAuditLogs(): void {
  memoryAuditLogs = [];
}
