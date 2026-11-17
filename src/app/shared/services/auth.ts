import { Injectable, OnDestroy, Optional, signal } from '@angular/core';
import { Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { catchError, defer, finalize, Observable, of, Subject, tap, timeout } from 'rxjs';

export interface LoginResponse {
  token?: string;
  accessToken?: string;
  jwt?: string;
  id?: string;
  fullName?: string;
  username?: string;
  email?: string;
  department?: string;
  position?: string;
  roles?: string[];
  user?: unknown;
  [key: string]: unknown;
}

export interface UserProfileResponse {
  id: string;
  fullName: string;
  username: string;
  email: string;
  department: string;
  position: string;
  roles: string[];
  [key: string]: unknown;
}

export interface WorkspaceAccessResponse {
  workspaceKey: string;
  displayName: string;
  department: string;
  position: string;
  roles: string[];
  permissions: string[];
  modules?: string[];
  [key: string]: unknown;
}

export interface AdminManagedUser {
  id: string;
  fullName: string;
  username: string;
  email: string;
  department: string;
  position: string;
  roles: string[];
  modules: string[];
  isEnabled: boolean;
  lastSuccessfulLoginAtUtc?: string;
  activeSessionCount: number;
  accountStatus: string;
  isLocked: boolean;
}

export const ACCESS_MODULES = [
  { key: 'Counterparties', label: 'Counterparties', description: 'Front Officer counterparty screens' },
  { key: 'Contracts', label: 'Contracts', description: 'Contract creation and placement screens' },
  { key: 'Claims', label: 'Claims', description: 'Claims screens' },
  { key: 'BackOffice', label: 'Back Officer', description: 'Receipt pairing, invoices and outgoing remittances' },
  { key: 'Encaissement', label: 'Encaissement', description: 'Incoming receipts and allocations' },
  { key: 'Decaissement', label: 'Decaissement', description: 'Outgoing payments and disbursements' },
  { key: 'CounterpartyBankAccounts', label: 'Counterparty Bank Accounts', description: 'Cedent and reinsurer bank accounts' }
] as const;

@Injectable({
  providedIn: 'root',
})
export class Auth implements OnDestroy {
  private readonly tokenStorageKey = 'iris_auth_token';
  private readonly userStorageKey = 'iris_auth_user';
  private readonly workspaceStorageKey = 'iris_auth_workspace';
  readonly baseUrl = '/api';

  readonly sessionExpired = signal(false);
  readonly sessionEnded = new Subject<void>();
  private expirationTimer?: ReturnType<typeof setTimeout>;
  private channel?: BroadcastChannel;
  private sessionId: string | null = null;
  private logoutToken: string | null = null;
  private loggingOut = false;
  private readonly eventKey = 'iris_auth_event';
  private readonly storageListener = (event: StorageEvent) => {
    if (event.key === this.eventKey && event.newValue) {
      try { this.receiveEvent(JSON.parse(event.newValue)); } catch { /* Ignore unrelated or malformed messages. */ }
    } else if (event.key === this.tokenStorageKey && event.newValue) {
      this.sessionExpired.set(false);
      this.scheduleExpiration();
    }
  };
  private readonly resumeListener = () => this.checkExpiration();

  constructor(private httpClient: HttpClient, @Optional() private router: Router | null) {
    if (typeof window.BroadcastChannel !== 'undefined') {
      this.channel = new window.BroadcastChannel('iris-auth');
      this.channel.onmessage = event => this.receiveEvent(event.data);
    }
    window.addEventListener('storage', this.storageListener);
    window.addEventListener('focus', this.resumeListener);
    document.addEventListener('visibilitychange', this.resumeListener);
    this.scheduleExpiration();
  }

  private tokenClaims(token = this.getToken()): Record<string, unknown> | null {
    try {
      if (!token) return null;
      const part = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
      const result = JSON.parse(atob(part.padEnd(Math.ceil(part.length / 4) * 4, '=')));
      return result && typeof result === 'object' ? result : null;
    } catch { return null; }
  }

  private expirationTime(): number | null {
    const exp = this.tokenClaims()?.['exp'];
    return typeof exp === 'number' && Number.isFinite(exp) && Math.abs(exp) < Number.MAX_SAFE_INTEGER / 1000 ? exp * 1000 : null;
  }

  private serverNow(): number {
    const offset = Number(localStorage.getItem('iris_auth_clock_offset') ?? 0);
    return Date.now() + (Number.isFinite(offset) ? offset : 0);
  }

  checkExpiration(): boolean {
    const expiry = this.expirationTime();
    if (expiry != null && expiry <= this.serverNow()) this.expireSession();
    return this.sessionExpired();
  }

  private scheduleExpiration(): void {
    clearTimeout(this.expirationTimer);
    const claims = this.tokenClaims();
    this.sessionId = typeof claims?.['sid'] === 'string' ? claims['sid'] : null;
    const expiry = this.expirationTime();
    if (expiry == null) return;
    const remaining = expiry - this.serverNow();
    if (remaining <= 0) { this.expireSession(); return; }
    this.expirationTimer = setTimeout(() => this.scheduleExpiration(), Math.min(remaining, 2147483647));
  }

  expireSession(): void {
    if (!this.getToken() || this.sessionExpired()) return;
    this.logoutToken = this.getToken();
    const sessionId = this.sessionId;
    this.clearCredentials();
    this.sessionExpired.set(true);
    this.publishEvent('expired', sessionId);
  }

  private publishEvent(type: 'expired' | 'logout', sessionId: string | null): void {
    const event = { type, sessionId, id: (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`) };
    localStorage.setItem(this.eventKey, JSON.stringify(event));
    this.channel?.postMessage(event);
  }

  private receiveEvent(event: { type?: string; sessionId?: string | null }): void {
    if (!event || !['expired', 'logout'].includes(event.type ?? '')) return;
    // Do not let a delayed message terminate a later successful login.
    if (event.sessionId && this.sessionId && event.sessionId !== this.sessionId) return;
    if (!this.sessionId && !this.getToken() && !this.sessionExpired()) return;
    this.clearCredentials();
    if (event.type === 'expired') this.sessionExpired.set(true);
    else { this.sessionExpired.set(false); this.logoutToken = null; this.sessionId = null; this.navigateToLogin(); }
  }

  private clearCredentials(): void {
    clearTimeout(this.expirationTimer);
    this.expirationTimer = undefined;
    this.sessionEnded.next();
    for (const storage of [localStorage, sessionStorage]) {
      for (const key of Object.keys(storage)) {
        if (key.startsWith('iris_auth_') && key !== this.eventKey) storage.removeItem(key);
      }
    }
  }

  private navigateToLogin(): void {
    if (this.router && !this.router.url.startsWith('/login'))
      void this.router.navigateByUrl('/login', { replaceUrl: true });
  }

  ngOnDestroy(): void {
    clearTimeout(this.expirationTimer);
    this.channel?.close();
    window.removeEventListener('storage', this.storageListener);
    window.removeEventListener('focus', this.resumeListener);
    document.removeEventListener('visibilitychange', this.resumeListener);
    this.sessionEnded.complete();
  }

  createUser(formData: any) {
    return this.httpClient.post<UserProfileResponse>(`${this.baseUrl}/users`, formData);
  }

  listAdminUsers(search = ''): Observable<AdminManagedUser[]> {
    const suffix = search.trim() ? `?search=${encodeURIComponent(search.trim())}` : '';
    return this.httpClient.get<AdminManagedUser[]>(`${this.baseUrl}/users/admin${suffix}`);
  }

  getAdminUserModules(userId: string): Observable<string[]> {
    return this.httpClient.get<string[]>(`${this.baseUrl}/users/admin/${encodeURIComponent(userId)}/modules`);
  }

  setAdminUserModules(userId: string, modules: string[]): Observable<string[]> {
    return this.httpClient.put<string[]>(`${this.baseUrl}/users/admin/${encodeURIComponent(userId)}/modules`, { modules });
  }

  setAdminUserEnabled(userId: string, isEnabled: boolean): Observable<{ userId: string; isEnabled: boolean }> {
    return this.httpClient.patch<{ userId: string; isEnabled: boolean }>(`${this.baseUrl}/users/admin/${encodeURIComponent(userId)}/status`, { isEnabled });
  }

  hasModule(module: string): boolean {
    if (this.isAdmin()) return false;
    const workspaceModules = this.findStringArray(this.getStoredWorkspace(), ['modules']);
    const userModules = this.findStringArray(this.getCurrentUser(), ['modules']);
    return [...workspaceModules, ...userModules].some(value => value.toLowerCase() === module.toLowerCase());
  }

  hasAnyModule(modules: string[]): boolean {
    return modules.some(module => this.hasModule(module));
  }

  loginUser(formData: any) {
    return this.httpClient.post<LoginResponse>(`${this.baseUrl}/auth/login`, formData).pipe(
      tap(response => this.saveSessionFromAuthResponse(response))
    );
  }

  fetchCurrentUserProfile(): Observable<UserProfileResponse> {
    return this.httpClient.get<UserProfileResponse>(`${this.baseUrl}/users/me`);
  }

  refreshCurrentUserProfile(): Observable<UserProfileResponse> {
    return this.fetchCurrentUserProfile().pipe(tap(user => this.saveUserProfile(user)));
  }

  fetchCurrentWorkspace(): Observable<WorkspaceAccessResponse> {
    return this.httpClient.get<WorkspaceAccessResponse>(`${this.baseUrl}/workspaces/me`);
  }

  refreshCurrentWorkspace(): Observable<WorkspaceAccessResponse> {
    return this.fetchCurrentWorkspace().pipe(tap(workspace => this.saveWorkspace(workspace)));
  }

  logout(): Observable<unknown> {
    return defer(() => {
      if (this.loggingOut) return of(null);
      this.loggingOut = true;
      const token = this.getToken() ?? this.logoutToken;
      const sessionId = this.sessionId;
      // Local logout never waits for an expired token or an unavailable API.
      this.clearCredentials();
      this.sessionExpired.set(false);
      this.logoutToken = null;
      this.publishEvent('logout', sessionId);
      this.sessionId = null;
      this.navigateToLogin();
      return this.httpClient.post(`${this.baseUrl}/auth/logout`, {}, {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      }).pipe(timeout(3000), catchError(() => of(null)), finalize(() => this.loggingOut = false));
    });
  }

  clearSession(): void {
    const sessionId = this.sessionId;
    this.clearCredentials();
    this.sessionExpired.set(false);
    this.logoutToken = null;
    this.publishEvent('logout', sessionId);
    this.sessionId = null;
    this.navigateToLogin();
  }

  isLoggedIn(): boolean {
    return !!this.getToken();
  }

  getToken(): string | null {
    return localStorage.getItem(this.tokenStorageKey);
  }

  getCurrentUser(): unknown {
    const storedUser = localStorage.getItem(this.userStorageKey);

    if (!storedUser) {
      return null;
    }

    try {
      return JSON.parse(storedUser);
    } catch {
      return storedUser;
    }
  }

  getStoredWorkspace(): unknown {
    const storedWorkspace = localStorage.getItem(this.workspaceStorageKey);

    if (!storedWorkspace) {
      return null;
    }

    try {
      return JSON.parse(storedWorkspace);
    } catch {
      return storedWorkspace;
    }
  }

  hasWorkspaceRole(role: 'FrontOfficer' | 'BackOfficer' | 'FinanceOfficer'): boolean {
    const normalizedRole = this.normalizeRoleValue(role);
    const workspace = this.getStoredWorkspace();
    const workspaceKey = this.normalizeRoleValue(this.findUserValue(workspace, ['workspaceKey']));
    const workspacePosition = this.normalizeRoleValue(this.findUserValue(workspace, ['position', 'role', 'roleName', 'jobTitle']));
    const workspaceRoles = this.findStringArray(workspace, ['roles']);
    const user = this.getCurrentUser();
    const userPosition = this.normalizeRoleValue(this.findUserValue(user, ['position', 'role', 'roleName', 'jobTitle']));
    const userRoles = this.findStringArray(user, ['roles']);

    return workspaceKey.includes(normalizedRole)
      || workspacePosition === normalizedRole
      || userPosition === normalizedRole
      || workspaceRoles.some(item => this.normalizeRoleValue(item) === normalizedRole)
      || userRoles.some(item => this.normalizeRoleValue(item) === normalizedRole);
  }

  isAdmin(): boolean {
    const workspace = this.getStoredWorkspace();
    const workspaceRoles = this.findStringArray(workspace, ['roles']);
    if (workspace && typeof workspace === 'object' && Array.isArray((workspace as Record<string, unknown>)['roles'])) {
      return workspaceRoles.some(role => role.trim().toLowerCase() === 'admin');
    }
    return this.findStringArray(this.getCurrentUser(), ['roles']).some(role => role.trim().toLowerCase() === 'admin');
  }

  getWorkspaceRoute(): string {
    if (this.isAdmin()) {
      return '/workspace/administrator';
    }

    const accessibleRoute = [
      ['Counterparties', '/workspace/reassurance/front-officer/counterparties'],
      ['Contracts', '/workspace/reassurance/front-officer/contracts'],
      ['Claims', '/workspace/reassurance/front-officer/claims'],
      ['BackOffice', '/workspace/reassurance/back-officer'],
      ['Encaissement', '/workspace/reassurance/finance-officer/incoming-remittances'],
      ['Decaissement', '/workspace/reassurance/finance-officer/disbursement-queue'],
      ['CounterpartyBankAccounts', '/workspace/reassurance/finance-officer/counterparty-bank-accounts']
    ].find(([module]) => this.hasModule(module));
    if (accessibleRoute) return accessibleRoute[1];

    const workspace = this.getStoredWorkspace();
    const workspaceKey = this.normalizeRoleValue(this.findUserValue(workspace, ['workspaceKey']));

    if (workspaceKey) {
      switch (workspaceKey) {
        case 'reassurancefrontofficer':
          return '/workspace/reassurance/front-officer';
        case 'reassurancebackofficer':
          return '/workspace/reassurance/back-officer';
        case 'reassurancefinanceofficer':
          return '/workspace/reassurance/finance-officer';
      }
    }

    const user = this.getCurrentUser();
    const department = this.normalizeRoleValue(this.findUserValue(user, ['department', 'departmentName']));
    const position = this.normalizeRoleValue(this.findUserValue(user, ['position', 'role', 'roleName', 'jobTitle']));

    if (department === 'reassurance') {
      switch (position) {
        case 'frontofficer':
          return '/workspace/reassurance/front-officer';
        case 'backofficer':
          return '/workspace/reassurance/back-officer';
        case 'financeofficer':
          return '/workspace/reassurance/finance-officer';
      }
    }

    return '/user';
  }

  saveUserProfile(user: UserProfileResponse): void {
    localStorage.setItem(this.userStorageKey, JSON.stringify(user));
  }

  saveWorkspace(workspace: WorkspaceAccessResponse): void {
    localStorage.setItem(this.workspaceStorageKey, JSON.stringify(workspace));
  }

  saveSessionFromAuthResponse(response: LoginResponse): void {
    const token = response.token ?? response.accessToken ?? response.jwt ?? this.getFallbackSessionToken(response);

    if (!token) {
      return;
    }

    this.clearCredentials();
    this.sessionExpired.set(false);
    this.logoutToken = null;
    const serverTime = typeof response['serverTimeUtc'] === 'string' ? Date.parse(response['serverTimeUtc']) : NaN;
    if (Number.isFinite(serverTime)) localStorage.setItem('iris_auth_clock_offset', String(serverTime - Date.now()));
    localStorage.setItem(this.tokenStorageKey, token);
    this.scheduleExpiration();

    const responseUser = this.extractResponseUser(response);

    if (responseUser && !this.sessionExpired()) {
      this.saveUserProfile(responseUser);
    }
  }

  private getFallbackSessionToken(response: LoginResponse): string | null {
    return response['succeeded'] === true || response['success'] === true ? 'authenticated' : null;
  }

  private findUserValue(source: unknown, keys: string[]): unknown {
    if (!source || typeof source !== 'object') {
      return null;
    }

    const record = source as Record<string, unknown>;

    for (const key of keys) {
      const value = record[key];

      if (typeof value === 'string' && value.trim()) {
        return value;
      }
    }

    for (const value of Object.values(record)) {
      const nestedValue = this.findUserValue(value, keys);

      if (nestedValue) {
        return nestedValue;
      }
    }

    return null;
  }

  private findStringArray(source: unknown, keys: string[]): string[] {
    if (!source || typeof source !== 'object') {
      return [];
    }

    const record = source as Record<string, unknown>;

    for (const key of keys) {
      const value = record[key];

      if (Array.isArray(value)) {
        return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
      }
    }

    return Object.values(record).flatMap(value => this.findStringArray(value, keys));
  }

  private normalizeRoleValue(value: unknown): string {
    return typeof value === 'string' ? value.toLowerCase().replace(/[^a-z]/g, '') : '';
  }

  private extractResponseUser(response: LoginResponse): UserProfileResponse | null {
    const directUser = this.coerceUserProfile(response.user);

    if (directUser) {
      return directUser;
    }

    const directProfile = this.coerceUserProfile(response);
    return directProfile;
  }

  private coerceUserProfile(value: unknown): UserProfileResponse | null {
    if (!value || typeof value !== 'object') {
      return null;
    }

    const record = value as Record<string, unknown>;
    const id = this.toText(record['id']);
    const fullName = this.toText(record['fullName']);
    const username = this.toText(record['username']);
    const email = this.toText(record['email']);
    const department = this.toText(record['department']);
    const position = this.toText(record['position']);
    const roles = Array.isArray(record['roles']) ? record['roles'].filter((role): role is string => typeof role === 'string') : [];

    if (!id && !fullName && !username && !email) {
      return null;
    }

    return { id, fullName, username, email, department, position, roles };
  }

  private toText(value: unknown): string {
    return typeof value === 'string' ? value : '';
  }
}
