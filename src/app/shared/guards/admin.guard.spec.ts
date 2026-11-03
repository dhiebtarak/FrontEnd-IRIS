import { firstValueFrom, Observable, of } from 'rxjs';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { Auth } from '../services/auth';
import { adminGuard } from './admin.guard';

describe('adminGuard', () => {
  const auth = { isLoggedIn: vi.fn(), isAdmin: vi.fn(), refreshCurrentUserProfile: vi.fn() };

  beforeEach(() => {
    auth.isLoggedIn.mockReset();
    auth.isAdmin.mockReset();
    auth.refreshCurrentUserProfile.mockReturnValue(of({roles:[]}));
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: Auth, useValue: auth }]
    });
  });

  it('redirects anonymous users to login', () => {
    auth.isLoggedIn.mockReturnValue(false);
    const result = TestBed.runInInjectionContext(() => adminGuard({} as never, { url: '/workspace/admin/users/new' } as never));
    expect(TestBed.inject(Router).serializeUrl(result as ReturnType<Router['createUrlTree']>)).toBe('/login');
  });

  it('redirects authenticated non-admin users to access denied', async () => {
    auth.isLoggedIn.mockReturnValue(true);
    auth.isAdmin.mockReturnValue(false);
    const result = TestBed.runInInjectionContext(() => adminGuard({} as never, { url: '/workspace/admin/users/new' } as never));
    expect(TestBed.inject(Router).serializeUrl(await firstValueFrom(result as Observable<ReturnType<Router['createUrlTree']>>))).toBe('/access-denied');
  });

  it('allows administrators', async () => {
    auth.isLoggedIn.mockReturnValue(true);
    auth.isAdmin.mockReturnValue(true);
    auth.refreshCurrentUserProfile.mockReturnValue(of({roles:['Admin']}));
    expect(await firstValueFrom(TestBed.runInInjectionContext(() => adminGuard({} as never, { url: '/workspace/admin/users/new' } as never)) as Observable<boolean>)).toBe(true);
  });
});
