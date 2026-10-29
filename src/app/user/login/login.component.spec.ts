import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { of, Subject } from 'rxjs';
import { ToastrService } from 'ngx-toastr';
import { Auth, LoginResponse } from '../../shared/services/auth';
import { LoginComponent } from './login.component';

describe('LoginComponent', () => {
  let fixture: ComponentFixture<LoginComponent>;
  let component: LoginComponent;
  let loginResponse: Subject<LoginResponse>;
  let authService: Pick<
    Auth,
    | 'loginUser'
    | 'fetchCurrentUserProfile'
    | 'fetchCurrentWorkspace'
    | 'saveUserProfile'
    | 'saveWorkspace'
    | 'getWorkspaceRoute'
  >;

  beforeEach(async () => {
    loginResponse = new Subject<LoginResponse>();
    authService = {
      loginUser: vi.fn().mockReturnValue(loginResponse),
      fetchCurrentUserProfile: vi.fn().mockReturnValue(of({
        id: '1',
        fullName: 'Front Officer',
        username: 'front.officer',
        email: 'front@example.com',
        department: 'Reassurance',
        position: 'Front Officer',
        roles: ['Employee']
      })),
      fetchCurrentWorkspace: vi.fn().mockReturnValue(of({
        workspaceKey: 'ReassuranceFrontOfficer',
        displayName: 'Front Officer',
        department: 'Reassurance',
        position: 'Front Officer',
        roles: ['Employee'],
        permissions: []
      })),
      saveUserProfile: vi.fn(),
      saveWorkspace: vi.fn(),
      getWorkspaceRoute: vi.fn().mockReturnValue('/workspace/reassurance/front-officer')
    };

    await TestBed.configureTestingModule({
      imports: [LoginComponent],
      providers: [
        provideRouter([]),
        { provide: Auth, useValue: authService },
        { provide: ToastrService, useValue: { success: vi.fn(), error: vi.fn() } }
      ]
    }).compileComponents();

    const router = TestBed.inject(Router);
    vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);

    fixture = TestBed.createComponent(LoginComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('keeps the login action disabled until the form is valid', () => {
    const submitButton = fixture.nativeElement.querySelector('button[type="submit"]') as HTMLButtonElement;
    expect(submitButton.disabled).toBe(true);

    component.loginForm.setValue({
      emailOrUsername: 'front.officer',
      password: 'password'
    });
    fixture.detectChanges();

    expect(submitButton.disabled).toBe(false);
  });

  it('does not expose a public account-creation link', () => {
    expect(fixture.nativeElement.textContent).not.toContain('Need an operator account?');
    expect(fixture.nativeElement.querySelector('a[href="/register"]')).toBeNull();
  });

  it('uses a stable signal-backed disabled state throughout login', () => {
    component.loginForm.setValue({
      emailOrUsername: 'front.officer',
      password: 'password'
    });

    component.onSubmit();
    fixture.detectChanges();

    const submitButton = fixture.nativeElement.querySelector('button[type="submit"]') as HTMLButtonElement;
    expect(component.isSubmitting()).toBe(true);
    expect(submitButton.disabled).toBe(true);
    expect(submitButton.textContent).toContain('Authenticating...');

    loginResponse.next({ token: 'token' });
    fixture.detectChanges();

    expect(component.isSubmitting()).toBe(false);
    expect(submitButton.disabled).toBe(false);
    expect(submitButton.textContent).toContain('Access Portal');
  });
});
