import { http } from "@/request/request";
import {
  type AnalyticsOverviewVo,
  type VisitorSessionDetailVo,
  type VisitorSessionsListVo,
} from "@/server/entity/vo/analytics";
import { type VisitorSessionsQueryBo } from "@/server/entity/bo/analytics";

// This module encapsulates visitor analytics API requests for administrator inspection.

// Fetch aggregated visitor analytics overview (Admin only).
export function getAnalyticsOverview(): Promise<AnalyticsOverviewVo> {
  return http.get<AnalyticsOverviewVo>('/analytics/overview');
}

// Fetch paginated visitor sessions list with optional filters (Admin only).
export function getVisitorSessions(params?: VisitorSessionsQueryBo): Promise<VisitorSessionsListVo> {
  const query = new URLSearchParams();
  if (params?.page) query.set('page', String(params.page));
  if (params?.pageSize) query.set('pageSize', String(params.pageSize));
  if (params?.search) query.set('search', params.search);
  if (params?.device) query.set('device', params.device);
  if (params?.browser) query.set('browser', params.browser);
  if (params?.country) query.set('country', params.country);

  const qs = query.toString();
  return http.get<VisitorSessionsListVo>(`/analytics/sessions${qs ? `?${qs}` : ''}`);
}

// Fetch detailed activity timeline and media viewed for a specific session (Admin only).
export function getSessionDetail(sessionId: string): Promise<VisitorSessionDetailVo> {
  return http.get<VisitorSessionDetailVo>(`/analytics/sessions/${encodeURIComponent(sessionId)}`);
}
