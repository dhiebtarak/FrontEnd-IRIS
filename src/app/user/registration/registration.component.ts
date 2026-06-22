import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators, AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import { FirstKeyPipe } from '../../shared/pipes/first-key.pipe';
import { Auth } from '../../shared/services/auth';
import { ToastrService } from 'ngx-toastr';

const passwordMatchValidator: ValidatorFn = (control: AbstractControl): ValidationErrors | null => {
  const password = control.get('password');
  const confirmPassword = control.get('confirmPassword');
  if (!password || !confirmPassword) return null;
  return password.value === confirmPassword.value ? null : { passwordMismatch: true };
};

@Component({
  selector: 'app-registration',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink, FirstKeyPipe],
  templateUrl: './registration.component.html',
  styles: ``,
})
export class RegistrationComponent implements OnInit {
  registrationForm!: FormGroup;
  submitted = false;
  successMessage = '';
  readonly departmentPositions: Record<string, string[]> = {
    Reassurance: ['Front officer', 'Back officer', 'Finance officer'],
    Operation: ['Operations officer']
  };
  availablePositions: string[] = [];
  private readonly initialFormValue = {
    fullName: '',
    username: '',
    email: '',
    password: '',
    confirmPassword: '',
    department: '',
    position: '',
    agreeTerms: false
  };

  constructor(private fb: FormBuilder,
    private authService: Auth,
    private toastr: ToastrService
  ) {}

  ngOnInit(): void {
    this.registrationForm = this.fb.group({
      fullName: ['', [Validators.required, Validators.minLength(2)]],
      username: ['', [Validators.required, Validators.minLength(4)]],
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(6), Validators.pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{6,}$/)]],
      confirmPassword: ['', [Validators.required]],
      department: ['', [Validators.required]],
      position: [{ value: '', disabled: true }, [Validators.required]],
      agreeTerms: [false, [Validators.requiredTrue]]
    }, {
      validators: passwordMatchValidator
    });

    this.registrationForm.get('department')?.valueChanges.subscribe(department => {
      this.availablePositions = this.departmentPositions[department] ?? [];
      const positionControl = this.registrationForm.get('position');

      positionControl?.reset('');

      if (this.availablePositions.length) {
        positionControl?.enable();
      } else {
        positionControl?.disable();
      }
    });
  }

  // Helper getters for validation display
  get f() {
    return this.registrationForm.controls;
  }

  onSubmit(): void {
    this.submitted = true;
    this.successMessage = '';

    if (this.registrationForm.invalid) {
      this.registrationForm.markAllAsTouched();
      return;
    }

    // Process registration data
    const registrationPayload = this.registrationForm.getRawValue();

    console.log('Registration Success:', registrationPayload);
    this.authService.createUser(registrationPayload).subscribe({
      next: (response: any) => {
        console.log('User created successfully:', response);
        if (this.isSuccessfulRegistration(response)) {
          this.successMessage = 'User created successfully!';
          this.resetRegistrationForm(false);
          this.toastr.success(this.successMessage, 'Success');
        } else {
          this.showRegistrationErrors(response);
        }
      },
      error: (error: HttpErrorResponse) => {
        this.showRegistrationErrors(error.error ?? error.message);
      }
    });
  }

  resetRegistrationForm(clearSuccessMessage = true): void {
    if (clearSuccessMessage) {
      this.successMessage = '';
    }

    this.registrationForm.reset(this.initialFormValue);
    this.registrationForm.markAsPristine();
    this.registrationForm.markAsUntouched();
    this.registrationForm.updateValueAndValidity();
    this.submitted = false;
  }

  hasDisplayedError(controlName: string, errorName: string): boolean {
    const control = this.registrationForm.get(controlName);
    return !!(control && control.hasError(errorName) && (control.dirty || control.touched || this.submitted));
  }

  private isSuccessfulRegistration(response: any): boolean {
    if (response == null) {
      return true;
    }

    if (typeof response === 'boolean') {
      return response;
    }

    if (typeof response === 'object') {
      if ('succeeded' in response) {
        return response.succeeded === true;
      }

      if ('success' in response) {
        return response.success === true;
      }

      if ('isSuccess' in response) {
        return response.isSuccess === true;
      }

      return this.getRegistrationErrorMessages(response).length === 0;
    }

    return false;
  }

  private showRegistrationErrors(payload: unknown): void {
    const messages = this.getRegistrationErrorMessages(payload);

    if (!messages.length) {
      this.toastr.error('Registration failed.', 'Error');
      return;
    }

    messages.forEach(message => this.toastr.error(message, 'Error'));
  }

  private getRegistrationErrorMessages(payload: unknown): string[] {
    const messages = this.extractErrors(payload)
      .map(error => this.mapRegistrationError(error))
      .filter((message): message is string => !!message);

    return [...new Set(messages)];
  }

  private extractErrors(payload: unknown): unknown[] {
    if (payload == null) {
      return [];
    }

    if (typeof payload === 'string' || Array.isArray(payload)) {
      return Array.isArray(payload) ? payload : [payload];
    }

    if (typeof payload !== 'object') {
      return [];
    }

    const body = payload as Record<string, unknown>;
    const errors = body['errors'];

    if (Array.isArray(errors)) {
      return errors;
    }

    if (errors && typeof errors === 'object') {
      return Object.values(errors as Record<string, unknown>).flatMap(error =>
        Array.isArray(error) ? error : [error]
      );
    }

    if (body['code'] || body['description'] || body['message'] || body['title'] || body['detail']) {
      return [body];
    }

    return [];
  }

  private mapRegistrationError(error: unknown): string | null {
    const { code, description } = this.getErrorParts(error);
    const normalizedError = `${code} ${description}`.toLowerCase().replace(/[^a-z0-9]/g, '');

    if (
      normalizedError.includes('duplicateemail') ||
      normalizedError.includes('duplicatedemail') ||
      (normalizedError.includes('email') && this.isDuplicateMessage(normalizedError))
    ) {
      return 'Email already exists.';
    }

    if (
      normalizedError.includes('duplicateusername') ||
      normalizedError.includes('duplicatedusername') ||
      normalizedError.includes('duplicateuser') ||
      (normalizedError.includes('username') && this.isDuplicateMessage(normalizedError))
    ) {
      return 'Username already exists.';
    }

    if (description) {
      return description;
    }

    if (code) {
      return 'Contact support with error code: ' + code;
    }

    return null;
  }

  private getErrorParts(error: unknown): { code: string; description: string } {
    if (typeof error === 'string') {
      return { code: '', description: error };
    }

    if (!error || typeof error !== 'object') {
      return { code: '', description: '' };
    }

    const errorObject = error as Record<string, unknown>;
    const code = this.toText(errorObject['code']);
    const description =
      this.toText(errorObject['description']) ||
      this.toText(errorObject['message']) ||
      this.toText(errorObject['title']) ||
      this.toText(errorObject['detail']);

    return { code, description };
  }

  private toText(value: unknown): string {
    return typeof value === 'string' ? value : '';
  }

  private isDuplicateMessage(message: string): boolean {
    return message.includes('duplicate') ||
      message.includes('duplicated') ||
      message.includes('already') ||
      message.includes('exist') ||
      message.includes('taken');
  }
}
