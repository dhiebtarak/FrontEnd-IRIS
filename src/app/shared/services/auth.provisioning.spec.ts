import { TestBed } from '@angular/core/testing';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { Auth } from './auth';
import { authInterceptor } from '../interceptors/auth.interceptor';

describe('Auth user provisioning', () => {
  let auth: Auth;
  let http: HttpTestingController;

  beforeEach(() => {
    localStorage.setItem('iris_auth_token', 'administrator-token');
    localStorage.setItem('iris_auth_user', JSON.stringify({ id: 'admin-1', roles: ['Admin'] }));
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting()
      ]
    });
    auth = TestBed.inject(Auth);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    localStorage.clear();
  });

  it('posts to the protected provisioning route with the administrator bearer token and preserves the session', () => {
    auth.createUser({ username: 'staff.user' }).subscribe();

    const request = http.expectOne('/api/users');
    expect(request.request.method).toBe('POST');
    expect(request.request.headers.get('Authorization')).toBe('Bearer administrator-token');
    request.flush({ id: 'staff-1', username: 'staff.user', roles: ['Employee'] });

    expect(localStorage.getItem('iris_auth_token')).toBe('administrator-token');
    expect(JSON.parse(localStorage.getItem('iris_auth_user')!).roles).toEqual(['Admin']);
  });
});
