import { inject, Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Auth } from './auth';
export type SessionStatus = 'Active' | 'LoggedOut' | 'Expired' | 'Revoked';
export interface ActivityRow {
  sessionId: string | null; userId: string | null; fullName: string; username: string; email: string;
  role: string; department: string; accountStatus: string; loginAtUtc: string;
  lastActivityAtUtc: string | null; logoutAtUtc: string | null; expiresAtUtc: string | null;
  revokedAtUtc: string | null; durationSeconds: number | null; sessionStatus: SessionStatus | null;
  ipAddress: string | null; userAgent: string | null; browser: string | null; operatingSystem: string | null;
  deviceType: string | null; revocationReason: string | null; revokedByUserId: string | null;
  result: string; eventType: string; isCurrentSession: boolean;
}
export interface ActivitySummary { activeSessions: number; successfulLoginsToday: number; failedLoginsLast24Hours: number;
  lockedOrDisabledAccounts: number; revokedSessionsToday: number; averageSessionDurationSeconds: number; }
export interface ActivityPage<T> { items: T[]; totalCount: number; pageNumber: number; pageSize: number; }
export interface AuditEvent { id: number; eventType: string; createdAtUtc: string; identifier: string;
  reason: string | null; ipAddress: string | null; userAgent: string | null; actorUserId: string | null; sessionId: string | null; }
export interface ActivityQuery { pageNumber: number; pageSize: number; search?: string; userId?: string; role?: string;
  department?: string; accountStatus?: string; sessionStatus?: string; eventType?: string; result?: string;
  dateFrom?: string; dateTo?: string; sortBy: string; sortDirection: string; }
export function formatDuration(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds)) return '?';
  const minutes = Math.max(0, Math.floor(seconds / 60));
  const hours = Math.floor(minutes / 60); const days = Math.floor(hours / 24);
  const part = (n: number, unit: string) => `${n} ${unit}${n === 1 ? '' : 's'}`;
  if (days) return `${part(days, 'day')} ${part(hours % 24, 'hour')}`;
  if (hours) return `${part(hours, 'hour')} ${part(minutes % 60, 'minute')}`;
  return part(minutes, 'minute');
}
@Injectable({ providedIn: 'root' })
export class AccessActivityService {
  private readonly http = inject(HttpClient);
  private readonly url = `${inject(Auth).baseUrl}/admin/access-activity`;
  private params(query: ActivityQuery): HttpParams {
    let params = new HttpParams();
    for (const [key, value] of Object.entries(query)) if (value !== undefined && value !== '') params = params.set(key, String(value));
    return params;
  }
  summary() { return this.http.get<ActivitySummary>(`${this.url}/summary`); }
  list(query: ActivityQuery) { return this.http.get<ActivityPage<ActivityRow>>(`${this.url}/sessions`, { params: this.params(query) }); }
  detail(id: string) { return this.http.get<ActivityRow>(`${this.url}/sessions/${encodeURIComponent(id)}`); }
  history(userId: string, query: ActivityQuery) { return this.http.get<ActivityPage<AuditEvent>>(`${this.url}/users/${encodeURIComponent(userId)}/history`, { params: this.params(query) }); }
  revoke(id: string, reason: string) { return this.http.post<{ revokedCount: number; currentSessionRevoked: boolean }>(`${this.url}/sessions/${encodeURIComponent(id)}/revoke`, { reason }); }
  revokeAll(userId: string, reason: string) { return this.http.post<{ revokedCount: number }>(`${this.url}/users/${encodeURIComponent(userId)}/revoke-all`, { reason }); }
}
