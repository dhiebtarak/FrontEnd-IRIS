import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap } from 'rxjs';

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
export class Auth {
  private readonly tokenStorageKey = 'iris_auth_token';
  private readonly userStorageKey = 'iris_auth_user';
  private readonly workspaceStorageKey = 'iris_auth_workspace';
  readonly baseUrl = '/api';

  constructor(private httpClient: HttpClient) { }

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
    return this.httpClient.post(`${this.baseUrl}/auth/logout`, {}).pipe(
      tap({
        next: () => this.clearSession(),
        error: () => this.clearSession()
      })
    );
  }

  clearSession(): void {
    localStorage.removeItem(this.tokenStorageKey);
    localStorage.removeItem(this.userStorageKey);
    localStorage.removeItem(this.workspaceStorageKey);
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

    localStorage.setItem(this.tokenStorageKey, token);

    const responseUser = this.extractResponseUser(response);

    if (responseUser) {
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
