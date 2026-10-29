import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { Auth } from '../services/auth';
import { adminGuard } from './admin.guard';

describe('adminGuard', () => {
  const auth = { isLoggedIn: vi.fn(), isAdmin: vi.fn() };

  beforeEach(() => {
    auth.isLoggedIn.mockReset();
    auth.isAdmin.mockReset();
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: Auth, useValue: auth }]
    });
  });

  it('redirects anonymous users to login', () => {
    auth.isLoggedIn.mockReturnValue(false);
    const result = TestBed.runInInjectionContext(() => adminGuard({} as never, { url: '/workspace/admin/users/new' } as never));
    expect(TestBed.inject(Router).serializeUrl(result as ReturnType<Router['createUrlTree']>)).toBe('/login');
  });

  it('redirects authenticated non-admin users to access denied', () => {
    auth.isLoggedIn.mockReturnValue(true);
    auth.isAdmin.mockReturnValue(false);
    const result = TestBed.runInInjectionContext(() => adminGuard({} as never, { url: '/workspace/admin/users/new' } as never));
    expect(TestBed.inject(Router).serializeUrl(result as ReturnType<Router['createUrlTree']>)).toBe('/access-denied');
  });

  it('allows administrators', () => {
    auth.isLoggedIn.mockReturnValue(true);
    auth.isAdmin.mockReturnValue(true);
    expect(TestBed.runInInjectionContext(() => adminGuard({} as never, { url: '/workspace/admin/users/new' } as never))).toBe(true);
  });
});
