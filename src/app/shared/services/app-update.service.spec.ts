import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { AppUpdateService, BUILD_VERSION } from './app-update.service';
import { Auth } from './auth';

describe('Frontend version updates', () => {
  let service: AppUpdateService, http: HttpTestingController;
  let expired = false;
  const auth = { checkExpiration: () => expired, clearSession: vi.fn() };
  beforeEach(() => {
    vi.useFakeTimers(); expired = false;
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(), { provide: Auth, useValue: auth }, { provide: BUILD_VERSION, useValue: 'running-build' }] });
    service = TestBed.inject(AppUpdateService); http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => { http.verify(); TestBed.resetTestingModule(); vi.useRealTimers(); vi.restoreAllMocks(); document.querySelectorAll('[data-test-dirty]').forEach(e => e.remove()); });
  const response = (version: string) => ({ version, authSchema: 1 });
  function flush(version: string) { http.expectOne(r => r.url.startsWith('/version.json?t=')).flush(response(version)); }
  it('does not notify for the compiled version and polls only once despite duplicate startup', () => {
    service.start(); service.start();
    const request = http.expectOne(r => r.url.startsWith('/version.json?t='));
    expect(request.request.headers.get('Cache-Control')).toContain('no-store'); request.flush(response('running-build'));
    expect(service.available()).toBeNull();
    vi.advanceTimersByTime(300000); flush('next-build'); expect(service.available()?.version).toBe('next-build');
  });
  it('deduplicates a detected version and reloads only on explicit click', () => {
    const reload = vi.spyOn(service as any, 'reload').mockImplementation(() => {});
    service.check(); flush('next-build'); const notification = service.available();
    service.check(); flush('next-build'); expect(service.available()).toBe(notification); expect(reload).not.toHaveBeenCalled();
    service.reloadLatest(); service.reloadLatest(); expect(reload).toHaveBeenCalledTimes(1);
  });
  it('requires confirmation for dirty forms and gives session expiration priority', () => {
    const reload = vi.spyOn(service as any, 'reload').mockImplementation(() => {});
    const form = document.createElement('form'); form.className = 'ng-dirty'; form.setAttribute('data-test-dirty', ''); document.body.append(form);
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    service.check(); flush('next-build'); service.reloadLatest(); expect(reload).not.toHaveBeenCalled();
    confirm.mockReturnValue(true); expired = true; service.reloadLatest(); expect(reload).not.toHaveBeenCalled();
    expired = false; service.reloadLatest(); expect(reload).toHaveBeenCalledOnce();
  });
  it('checks on tab activation/reconnection and recovers after check errors', () => {
    service.start(); http.expectOne(r => r.url.startsWith('/version.json')).flush({}, { status: 503, statusText: 'Offline' });
    window.dispatchEvent(new Event('online')); flush('running-build');
    document.dispatchEvent(new Event('visibilitychange')); flush('next-build');
    expect(service.available()?.version).toBe('next-build');
  });
  it('removes a stale notice when deployment rolls back to the running version', () => {
    service.check(); flush('next-build'); expect(service.available()).not.toBeNull();
    service.check(); flush('running-build'); expect(service.available()).toBeNull();
  });
  it('cleans up polling, listeners and pending requests', () => {
    service.start(); const request = http.expectOne(r => r.url.startsWith('/version.json'));
    service.ngOnDestroy(); expect(request.cancelled).toBe(true); expect(vi.getTimerCount()).toBe(0);
    window.dispatchEvent(new Event('online')); http.expectNone(r => r.url.startsWith('/version.json'));
  });
});
