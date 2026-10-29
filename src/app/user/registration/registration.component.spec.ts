import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { Subject } from 'rxjs';
import { ToastrService } from 'ngx-toastr';
import { Auth } from '../../shared/services/auth';
import { RegistrationComponent } from './registration.component';

describe('RegistrationComponent administrator provisioning', () => {
  let fixture: ComponentFixture<RegistrationComponent>;
  let response: Subject<{ id: string; username: string }>;
  const auth = { createUser: vi.fn() };
  const toastr = { success: vi.fn(), error: vi.fn() };

  beforeEach(async () => {
    response = new Subject();
    auth.createUser.mockReset().mockReturnValue(response);
    toastr.success.mockReset();
    toastr.error.mockReset();
    await TestBed.configureTestingModule({
      imports: [RegistrationComponent],
      providers: [provideRouter([]), { provide: Auth, useValue: auth }, { provide: ToastrService, useValue: toastr }]
    }).compileComponents();
    fixture = TestBed.createComponent(RegistrationComponent);
    fixture.detectChanges();
  });

  function fillValidForm(): void {
    const form = fixture.componentInstance.registrationForm;
    form.patchValue({
      fullName: 'Staff Member', username: 'staff.member', email: 'staff@example.test',
      password: 'Strong!1', confirmPassword: 'Strong!1', department: 'Reassurance',
      position: 'Front officer', agreeTerms: true
    });
    form.get('position')?.enable();
    form.get('position')?.setValue('Front officer');
    form.updateValueAndValidity();
  }

  it('does not show success for a failed API request and prevents duplicate submissions while pending', () => {
    fillValidForm();
    fixture.componentInstance.onSubmit();
    fixture.componentInstance.onSubmit();

    expect(auth.createUser).toHaveBeenCalledTimes(1);
    expect(fixture.componentInstance.isSubmitting).toBe(true);
    response.error(new HttpErrorResponse({ status: 403, error: { message: 'Forbidden' } }));

    expect(fixture.componentInstance.successMessage).toBe('');
    expect(toastr.success).not.toHaveBeenCalled();
    expect(toastr.error).toHaveBeenCalledWith('Forbidden', 'Error');
    expect(fixture.componentInstance.isSubmitting).toBe(false);
  });

  it('shows success only after a user ID is returned and clears password fields', () => {
    fillValidForm();
    fixture.componentInstance.onSubmit();
    const requestPayload = auth.createUser.mock.calls[0][0];
    expect(requestPayload).not.toHaveProperty('agreeTerms');
    expect(requestPayload).toHaveProperty('password', 'Strong!1');

    response.next({ id: 'staff-1', username: 'staff.member' });
    expect(fixture.componentInstance.successMessage).toContain('staff.member');
    expect(fixture.componentInstance.registrationForm.get('password')?.value).toBe('');
    expect(fixture.componentInstance.registrationForm.get('confirmPassword')?.value).toBe('');
  });
});
