import { TestBed } from '@angular/core/testing';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Router } from '@angular/router';
import { Auth } from './auth';
import { authInterceptor } from '../interceptors/auth.interceptor';

describe('Session lifecycle', () => {
  let auth: Auth, http: HttpTestingController, client: HttpClient;
  const router = { url: '/workspace/reassurance/front-officer', navigateByUrl: vi.fn().mockResolvedValue(true) };
  function token(seconds = 60, sid = 'session-a') {
    return `header.${btoa(JSON.stringify({ sid, exp: Math.floor(Date.now() / 1000) + seconds }))}.signature`;
  }
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear(); sessionStorage.clear(); router.navigateByUrl.mockClear();
    localStorage.setItem('iris_auth_token', token());
    TestBed.configureTestingModule({ providers: [provideHttpClient(withInterceptors([authInterceptor])), provideHttpClientTesting(), { provide: Router, useValue: router }] });
    auth = TestBed.inject(Auth); http = TestBed.inject(HttpTestingController); client = TestBed.inject(HttpClient);
  });
  afterEach(() => { http.verify(); TestBed.resetTestingModule(); vi.useRealTimers(); localStorage.clear(); sessionStorage.clear(); });

  it('uses JWT expiration once and clears authentication instead of extending the session', () => {
    localStorage.setItem('iris_auth_user', '{}'); localStorage.setItem('iris_auth_workspace', '{}');
    const expire = vi.spyOn(auth, 'expireSession');
    vi.advanceTimersByTime(61000);
    expect(auth.sessionExpired()).toBe(true);
    expect(auth.getToken()).toBeNull();
    expect(localStorage.getItem('iris_auth_workspace')).toBeNull();
    expect(expire).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });
  it('handles an already expired startup token and resets timing after login/refresh', () => {
    auth.saveSessionFromAuthResponse({ token: token(-1) });
    expect(auth.sessionExpired()).toBe(true);
    auth.saveSessionFromAuthResponse({ token: token(120, 'session-b') });
    expect(auth.sessionExpired()).toBe(false);
    vi.advanceTimersByTime(61000); expect(auth.sessionExpired()).toBe(false);
    vi.advanceTimersByTime(60000); expect(auth.sessionExpired()).toBe(true);
  });
  it('handles a zero NumericDate and ignores malformed/non-numeric expiration claims safely', () => {
    auth.saveSessionFromAuthResponse({ token: `h.${btoa(JSON.stringify({ sid: 'old', exp: 0 }))}.s` });
    expect(auth.sessionExpired()).toBe(true);
    auth.saveSessionFromAuthResponse({ token: 'malformed-token' });
    expect(auth.sessionExpired()).toBe(false);
    auth.saveSessionFromAuthResponse({ token: `h.${btoa(JSON.stringify({ sid: 'invalid', exp: 'tomorrow' }))}.s` });
    expect(auth.checkExpiration()).toBe(false);
  });
  it('corrects clock differences from the server login time', () => {
    const server = Date.now() - 30000;
    const jwt = `h.${btoa(JSON.stringify({ sid: 'corrected', exp: Math.floor(server / 1000) + 60 }))}.s`;
    auth.saveSessionFromAuthResponse({ token: jwt, serverTimeUtc: new Date(server).toISOString() });
    vi.advanceTimersByTime(31000); expect(auth.sessionExpired()).toBe(false);
    vi.advanceTimersByTime(30000); expect(auth.sessionExpired()).toBe(true);
  });
  it('coalesces simultaneous expiration responses and cancels pending authenticated requests', () => {
    const expire = vi.spyOn(auth, 'expireSession');
    client.get('/api/one').subscribe({ error: () => {} });
    client.get('/api/two').subscribe({ error: () => {} });
    const first = http.expectOne('/api/one'), second = http.expectOne('/api/two');
    first.flush({ code: 'SESSION_EXPIRED' }, { status: 401, statusText: 'Unauthorized' });
    expect(second.cancelled).toBe(true);
    expect(auth.sessionExpired()).toBe(true);
    expect(expire).toHaveBeenCalledTimes(1);
  });
  it.each([401, 403, 400, 0])('does not label an ordinary %s response as expiration', status => {
    client.get('/api/one').subscribe({ error: () => {} });
    http.expectOne('/api/one').flush({}, { status, statusText: 'Rejected' });
    expect(auth.sessionExpired()).toBe(false);
  });
  it('ignores invalid-login and external/public expiration responses and never leaks a bearer token', () => {
    for (const url of ['/api/auth/login', '/version.json', 'https://example.invalid/api/test']) {
      client.get(url).subscribe({ error: () => {} });
      const request = http.expectOne(url);
      expect(request.request.headers.has('Authorization')).toBe(false);
      request.flush({ code: 'SESSION_EXPIRED' }, { status: 401, statusText: 'Unauthorized' });
    }
    expect(auth.sessionExpired()).toBe(false);
  });
  it('clears local/session storage, timers and redirects even when server logout fails', () => {
    for (const storage of [localStorage, sessionStorage]) {
      storage.setItem('iris_auth_refresh_token', 'refresh'); storage.setItem('iris_auth_roles', '[]');
      storage.setItem('iris_auth_session_id', 'session-a');
    }
    auth.logout().subscribe();
    expect(auth.getToken()).toBeNull();
    expect(router.navigateByUrl).toHaveBeenCalledWith('/login', { replaceUrl: true });
    http.expectOne('/api/auth/logout').flush({}, { status: 401, statusText: 'Unauthorized' });
    expect(auth.sessionExpired()).toBe(false);
    expect((auth as any).expirationTimer).toBeUndefined();
    for (const storage of [localStorage, sessionStorage]) {
      expect(storage.getItem('iris_auth_refresh_token')).toBeNull();
      expect(storage.getItem('iris_auth_roles')).toBeNull();
      expect(storage.getItem('iris_auth_session_id')).toBeNull();
    }
    expect(router.navigateByUrl).toHaveBeenCalledTimes(1);
  });
  it('finishes local logout immediately when the network never responds', () => {
    auth.logout().subscribe();
    const request = http.expectOne('/api/auth/logout');
    expect(router.navigateByUrl).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(3100); expect(request.cancelled).toBe(true);
  });
  it('synchronizes expiration/logout through the storage fallback and ignores stale sessions', () => {
    const message = (type: string, sessionId: string) => window.dispatchEvent(new StorageEvent('storage', { key: 'iris_auth_event', newValue: JSON.stringify({ type, sessionId }) }));
    message('expired', 'session-a'); expect(auth.sessionExpired()).toBe(true); expect(auth.getToken()).toBeNull();
    message('logout', 'session-a'); expect(auth.sessionExpired()).toBe(false); expect(router.navigateByUrl).toHaveBeenCalled();
    auth.saveSessionFromAuthResponse({ token: token(60, 'session-b') });
    message('expired', 'session-a'); expect(auth.sessionExpired()).toBe(false); expect(auth.getToken()).not.toBeNull();
  });
  it('uses BroadcastChannel when available and closes it during cleanup', () => {
    const original = Object.getOwnPropertyDescriptor(window, 'BroadcastChannel');
    const channel = { onmessage: null as any, postMessage: vi.fn(), close: vi.fn() };
    Object.defineProperty(window, 'BroadcastChannel', { configurable: true, value: class { constructor() { return channel; } } });
    const other = new Auth(client, router as unknown as Router);
    try {
      channel.onmessage({ data: { type: 'expired', sessionId: 'session-a' } });
      expect(other.sessionExpired()).toBe(true);
      other.logout().subscribe();
      expect(channel.postMessage).toHaveBeenCalledWith(expect.objectContaining({ type: 'logout' }));
      http.expectOne('/api/auth/logout').flush({});
    } finally {
      other.ngOnDestroy();
      expect(channel.close).toHaveBeenCalled();
      if (original) Object.defineProperty(window, 'BroadcastChannel', original);
      else Reflect.deleteProperty(window, 'BroadcastChannel');
    }
  });
});
