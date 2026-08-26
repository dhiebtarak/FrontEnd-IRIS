import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnInit, signal } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { catchError, forkJoin, of, switchMap } from 'rxjs';
import { Auth, LoginResponse } from '../../shared/services/auth';
import { FirstKeyPipe } from '../../shared/pipes/first-key.pipe';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink, FirstKeyPipe],
  templateUrl: './login.component.html',
  styles: ``,
})
export class LoginComponent implements OnInit {
  loginForm!: FormGroup;
  submitted = false;
  readonly isSubmitting = signal(false);

  constructor(
    private fb: FormBuilder,
    private authService: Auth,
    private toastr: ToastrService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.loginForm = this.fb.group({
      emailOrUsername: ['', [Validators.required]],
      password: ['', [Validators.required]]
    });
  }

  get f() {
    return this.loginForm.controls;
  }

  onSubmit(): void {
    if (this.isSubmitting()) {
      return;
    }

    this.submitted = true;

    if (this.loginForm.invalid) {
      this.loginForm.markAllAsTouched();
      return;
    }

    this.isSubmitting.set(true);

    const loginRequest = {
      emailOrUsername: this.loginForm.value.emailOrUsername,
      password: this.loginForm.value.password
    };

    this.authService.loginUser(loginRequest).pipe(
      switchMap(response => {
        if (!this.isSuccessfulLogin(response)) {
          return of({ response, user: null, workspace: null });
        }

        return forkJoin({
          response: of(response),
          user: this.authService.fetchCurrentUserProfile().pipe(catchError(() => of(null))),
          workspace: this.authService.fetchCurrentWorkspace().pipe(catchError(() => of(null)))
        });
      })
    ).subscribe({
      next: result => {
        if (!this.isSuccessfulLogin(result.response)) {
          this.toastr.error('Invalid email or password.', 'Error');
          this.finishSubmitting();
          return;
        }

        if (result.user) {
          this.authService.saveUserProfile(result.user);
        }

        if (result.workspace) {
          this.authService.saveWorkspace(result.workspace);
        }

        this.toastr.success('Login completed successfully.', 'Success');
        this.router.navigateByUrl(this.authService.getWorkspaceRoute());
        this.finishSubmitting();
      },
      error: (error: HttpErrorResponse) => {
        this.toastr.error(this.getLoginErrorMessage(error), 'Error');
        this.finishSubmitting();
      }
    });
  }

  resetLoginForm(): void {
    this.loginForm.reset({
      emailOrUsername: '',
      password: ''
    });
    this.loginForm.markAsPristine();
    this.loginForm.markAsUntouched();
    this.submitted = false;
  }

  private isSuccessfulLogin(response: LoginResponse | null): boolean {
    if (response == null) {
      return false;
    }

    if ('succeeded' in response) {
      return response['succeeded'] === true;
    }

    if ('success' in response) {
      return response['success'] === true;
    }

    return !!(response.token ?? response.accessToken ?? response.jwt);
  }

  private getLoginErrorMessage(error: HttpErrorResponse): string {
    if (error.status === 400 || error.status === 401) {
      return 'Invalid email or password.';
    }

    const payload = error.error;

    if (typeof payload === 'string' && payload.trim()) {
      return payload;
    }

    if (payload && typeof payload === 'object') {
      const errorObject = payload as Record<string, unknown>;
      const message = errorObject['message'] ?? errorObject['title'] ?? errorObject['detail'];

      if (typeof message === 'string' && message.trim()) {
        return message;
      }
    }

    return 'Login failed. Please try again.';
  }

  private finishSubmitting(): void {
    this.isSubmitting.set(false);
  }
}
