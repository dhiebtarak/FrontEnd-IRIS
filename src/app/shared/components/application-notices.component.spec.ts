import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { InteractivityChecker } from '@angular/cdk/a11y';
import { Router, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { Auth } from '../services/auth';
import { AppUpdateService } from '../services/app-update.service';
import { ApplicationNoticesComponent, SESSION_LIMIT_MESSAGE } from './application-notices.component';

describe('Application notices', () => {
  const auth = { sessionExpired: signal(true), logout: vi.fn(() => of(null)) };
  const updates = { available: signal({ version: 'new', authSchema: 1 }), reloading: signal(false), reloadLatest: vi.fn() };
  beforeEach(() => { auth.sessionExpired.set(true); auth.logout.mockClear(); TestBed.configureTestingModule({ imports: [ApplicationNoticesComponent], providers: [provideRouter([]), { provide: InteractivityChecker, useValue: { isFocusable: () => true, isTabbable: () => true } }, { provide: Auth, useValue: auth }, { provide: AppUpdateService, useValue: updates }] }); });
  it('has one exact message and blue primary logout button; backdrop and Escape cannot dismiss it', async () => {
    const f = TestBed.createComponent(ApplicationNoticesComponent); f.detectChanges(); await f.whenStable();
    const dialog = f.nativeElement.querySelector('[role="alertdialog"]');
    expect(dialog.textContent).toContain(SESSION_LIMIT_MESSAGE);
    expect(dialog.querySelectorAll('button')).toHaveLength(1);
    const button = dialog.querySelector('button'); expect(button.textContent.trim()).toBe('Log out');
    expect(document.activeElement).toBe(button);
    dialog.parentElement.click(); document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); f.detectChanges();
    expect(f.nativeElement.querySelectorAll('[role="alertdialog"]')).toHaveLength(1);
    expect(f.nativeElement.textContent).not.toContain('A new version is available.');
    button.click(); expect(auth.logout).toHaveBeenCalledTimes(1);
  });
  it('never opens the expiration popup on login and otherwise shows the version notice only when the session permits', async () => {
    TestBed.inject(Router).resetConfig([{ path: 'login', children: [] }]);
    await TestBed.inject(Router).navigateByUrl('/login');
    const f = TestBed.createComponent(ApplicationNoticesComponent); f.detectChanges();
    expect(f.nativeElement.querySelector('[role="alertdialog"]')).toBeNull();
    auth.sessionExpired.set(false); f.detectChanges();
    expect(f.nativeElement.textContent).toContain('A new version is available.');
    expect(f.nativeElement.textContent).toContain('Reload latest version');
  });
});
