import { Component, DestroyRef, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { BehaviorSubject, Subject, catchError, debounceTime, distinctUntilChanged, forkJoin, interval, of, switchMap, tap } from 'rxjs';
import { AccessActivityService, ActivityPage, ActivityQuery, ActivityRow, ActivitySummary, AuditEvent, formatDuration } from '../../shared/services/access-activity.service';
import { Auth } from '../../shared/services/auth';

@Component({
  selector: 'app-admin-access-activity', standalone: true, imports: [CommonModule, FormsModule],
  templateUrl: './admin-access-activity.component.html',
  styles: `:host { display:block; } th,td { padding: .75rem; vertical-align:top; } th { white-space:nowrap; }
    input,select,textarea { border:1px solid #cbd5e1; border-radius:.4rem; padding:.5rem; width:100%; background:white; }
    button { border:1px solid #cbd5e1; border-radius:.4rem; padding:.4rem .7rem; } button:disabled { opacity:.5; }
    .active { background:#dcfce7; color:#166534; } .loggedout { background:#e2e8f0; color:#334155; }
    .expired { background:#fef3c7; color:#92400e; } .revoked { background:#fee2e2; color:#991b1b; }
    .badge { display:inline-block; border-radius:1rem; padding:.2rem .6rem; white-space:nowrap; }`
})
export class AdminAccessActivityComponent {
  private readonly api = inject(AccessActivityService);
  private readonly auth = inject(Auth);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly destroy = inject(DestroyRef);
  private readonly requests = new BehaviorSubject<ActivityQuery>({ pageNumber: 1, pageSize: 20, sortBy: 'loginAtUtc', sortDirection: 'desc', userId: this.route.snapshot.queryParamMap.get('userId') ?? undefined });
  private readonly searches = new Subject<string>();
  private readonly details = new Subject<string>();
  private readonly histories = new Subject<{ userId: string; pageNumber: number }>();
  readonly rows = signal<ActivityRow[]>([]); readonly summary = signal<ActivitySummary | null>(null);
  readonly loading = signal(true); readonly error = signal(''); readonly total = signal(0);
  readonly now = signal(Date.now()); readonly detail = signal<ActivityRow | null>(null); readonly detailLoading = signal(false);
  readonly history = signal<ActivityPage<AuditEvent> | null>(null); readonly historyUser = signal(''); readonly historyLoading = signal(false);
  readonly busy = signal(false); readonly confirmation = signal<{ row: ActivityRow; all: boolean } | null>(null);
  reason = 'Session revoked by Administrator'; search = ''; dateFrom = ''; dateTo = '';
  query: ActivityQuery = this.requests.value;
  readonly events = ['LoginSuccessful','LoginFailed','Logout','SessionExpired','SessionRevoked','AccountLocked','AccountUnlocked'];
  readonly formatDuration = formatDuration;
  constructor() {
    interval(60000).pipe(takeUntilDestroyed(this.destroy)).subscribe(() => this.now.set(Date.now()));
    this.searches.pipe(debounceTime(300), distinctUntilChanged(), takeUntilDestroyed(this.destroy))
      .subscribe(search => this.apply({ search, pageNumber: 1 }));
    this.requests.pipe(tap(() => { this.loading.set(true); this.error.set(''); }),
      switchMap(query => forkJoin({ page: this.api.list(query), summary: this.api.summary() }).pipe(
        catchError(error => { this.error.set(this.message(error)); return of(null); }))),
      takeUntilDestroyed(this.destroy)).subscribe(result => {
        this.loading.set(false);
        if (result) { this.rows.set(result.page.items); this.total.set(result.page.totalCount); this.summary.set(result.summary); }
        else { this.rows.set([]); this.total.set(0); this.summary.set(null); }
      });
    this.details.pipe(tap(() => { this.detailLoading.set(true); this.detail.set(null); }),
      switchMap(id => this.api.detail(id).pipe(catchError(e => { this.error.set(this.message(e)); return of(null); }))),
      takeUntilDestroyed(this.destroy)).subscribe(row => { this.detail.set(row); this.detailLoading.set(false); });
    this.histories.pipe(tap(() => this.historyLoading.set(true)), switchMap(({ userId, pageNumber }) =>
      this.api.history(userId, { ...this.query, pageNumber }).pipe(catchError(e => { this.error.set(this.message(e)); return of(null); }))),
      takeUntilDestroyed(this.destroy)).subscribe(page => { this.history.set(page); this.historyLoading.set(false); });
    this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroy)).subscribe(params => { const userId = params.get('userId') ?? undefined; if (userId !== this.query.userId) this.apply({ userId, pageNumber: 1 }); });
  }
  searchChanged(value: string): void { this.searches.next(value); }
  apply(patch: Partial<ActivityQuery>): void { this.query = { ...this.query, ...patch }; this.requests.next(this.query); }
  filter(key: 'role' | 'department' | 'accountStatus' | 'sessionStatus' | 'eventType' | 'result', value: string): void { this.apply({ [key]: value || undefined, pageNumber: 1 }); }
  dates(): void { this.apply({ dateFrom: this.dateFrom ? new Date(this.dateFrom).toISOString() : undefined,
    dateTo: this.dateTo ? new Date(this.dateTo).toISOString() : undefined, pageNumber: 1 }); }
  sort(sortBy: string): void { this.apply({ sortBy, sortDirection: this.query.sortBy === sortBy && this.query.sortDirection === 'desc' ? 'asc' : 'desc', pageNumber: 1 }); }
  page(delta: number): void { if (!this.loading()) this.apply({ pageNumber: this.query.pageNumber + delta }); }
  duration(row: ActivityRow): string { return formatDuration(row.sessionStatus === 'Active'
    ? Math.max(0, (this.now() - Date.parse(row.loginAtUtc)) / 1000) : row.durationSeconds); }
  badge(status: string | null): string { return `badge ${(status ?? '').toLowerCase()}`; }
  statusLabel(status: string | null): string { return status === 'LoggedOut' ? 'Logged Out' : status ?? 'No session'; }
  viewDetails(row: ActivityRow): void { if (row.sessionId) this.details.next(row.sessionId); }
  viewHistory(row: ActivityRow): void { if (row.userId) { this.historyUser.set(row.userId); this.history.set(null); this.histories.next({ userId: row.userId, pageNumber: 1 }); } }
  historyPage(delta: number): void { if (!this.historyLoading()) this.histories.next({ userId: this.historyUser(), pageNumber: (this.history()?.pageNumber ?? 1) + delta }); }
  clearUser(): void { void this.router.navigate([], { relativeTo: this.route, queryParams: { userId: null }, queryParamsHandling: 'merge' }); }
  askRevoke(row: ActivityRow, all = false): void { this.reason = 'Session revoked by Administrator'; this.confirmation.set({ row, all }); }
  confirmRevoke(): void {
    const action = this.confirmation(); if (!action || this.busy() || !this.reason.trim() || this.reason.length > 200) return;
    this.busy.set(true); this.error.set('');
    const request = action.all ? this.api.revokeAll(action.row.userId!, this.reason.trim()) : this.api.revoke(action.row.sessionId!, this.reason.trim());
    request.pipe(takeUntilDestroyed(this.destroy)).subscribe({ next: result => {
      this.busy.set(false); this.confirmation.set(null); this.detail.set(null);
      const self = 'currentSessionRevoked' in result ? result.currentSessionRevoked : this.isOwnUser(action.row);
      if (self) { this.auth.clearSession(); void this.router.navigate(['/login']); } else { this.apply({}); }
    }, error: e => { this.busy.set(false); this.error.set(this.message(e)); } });
  }
  isOwnUser(row: ActivityRow): boolean { return row.userId === (this.auth.getCurrentUser() as { id?: string } | null)?.id; }
  private message(error: { error?: { message?: string }; status?: number }): string { return error.error?.message ?? `Access activity request failed (${error.status ?? 'unknown'}).`; }
}
