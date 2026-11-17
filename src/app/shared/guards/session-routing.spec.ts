import { TestBed } from '@angular/core/testing';
import { provideRouter, Router, UrlTree } from '@angular/router';
import { Auth } from '../services/auth';
import { authGuard } from './auth.guard';
import { pendingChangesGuard } from './pending-changes.guard';

describe('Session routing', () => {
  const auth = { isLoggedIn: vi.fn(() => false), sessionExpired: vi.fn(() => false) };
  beforeEach(() => { auth.isLoggedIn.mockReturnValue(false); auth.sessionExpired.mockReturnValue(false); TestBed.configureTestingModule({ providers: [provideRouter([]), { provide: Auth, useValue: auth }] }); });
  it('prevents Back navigation to a protected page after local logout', () => {
    const result = TestBed.runInInjectionContext(() => authGuard({} as any, {} as any));
    expect(TestBed.inject(Router).serializeUrl(result as UrlTree)).toBe('/login');
  });
  it('blocks new protected navigation while keeping the expiration popup on the current page', () => {
    auth.sessionExpired.mockReturnValue(true);
    expect(TestBed.runInInjectionContext(() => authGuard({} as any, {} as any))).toBe(false);
  });
  it('allows logout to leave a dirty form but retains normal dirty-form navigation protection', () => {
    const component = { canDeactivate: vi.fn(() => false) };
    const call = () => TestBed.runInInjectionContext(() => pendingChangesGuard(component, {} as any, {} as any, {} as any));
    expect(call()).toBe(true); expect(component.canDeactivate).not.toHaveBeenCalled();
    auth.isLoggedIn.mockReturnValue(true); expect(call()).toBe(false);
  });
});
