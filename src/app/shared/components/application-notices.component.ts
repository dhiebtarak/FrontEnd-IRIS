import { Component, HostListener, inject } from '@angular/core';
import { A11yModule } from '@angular/cdk/a11y';
import { Router, NavigationEnd } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, map } from 'rxjs';
import { Auth } from '../services/auth';
import { AppUpdateService } from '../services/app-update.service';

export const SESSION_LIMIT_MESSAGE = 'Your session has reached its limit. Re-login to continue.';

@Component({
  selector: 'app-application-notices', standalone: true, imports: [A11yModule],
  template: `
    @if (showExpiration()) {
      <div class="fixed inset-0 z-[2147483647] flex items-center justify-center bg-iris-navy/65 p-4 font-calibri backdrop-blur-sm">
        <section role="alertdialog" aria-modal="true" aria-labelledby="session-title" aria-describedby="session-message"
          cdkTrapFocus [cdkTrapFocusAutoCapture]="true"
          class="w-full max-w-md rounded-[24px] border border-iris-border bg-white p-6 shadow-2xl md:p-8">
          <h2 id="session-title" class="sr-only">Session expired</h2>
          <p id="session-message" class="text-lg font-semibold leading-7 text-iris-navy">{{ message }}</p>
          <button type="button" cdkFocusInitial (click)="logout()"
            class="mt-6 w-full rounded-xl bg-iris-teal px-5 py-3 text-sm font-bold text-white hover:bg-iris-teal-light focus:outline-none focus:ring-4 focus:ring-sky-100">Log out</button>
        </section>
      </div>
    } @else if (!auth.sessionExpired() && updates.available()) {
      <aside role="status" aria-labelledby="update-title"
        class="fixed bottom-5 right-5 z-[100] w-[calc(100%-2.5rem)] max-w-sm rounded-[24px] border border-iris-border bg-white p-6 font-calibri shadow-2xl">
        <h2 id="update-title" class="font-cambria text-xl font-bold text-iris-navy">A new version is available.</h2>
        <button type="button" (click)="updates.reloadLatest()" [disabled]="updates.reloading()"
          class="mt-4 w-full rounded-xl bg-iris-teal px-5 py-3 text-sm font-bold text-white hover:bg-iris-teal-light focus:outline-none focus:ring-4 focus:ring-sky-100 disabled:opacity-60">Reload latest version</button>
      </aside>
    }
  `
})
export class ApplicationNoticesComponent {
  readonly auth = inject(Auth);
  readonly updates = inject(AppUpdateService);
  private readonly router = inject(Router);
  private readonly url = toSignal(this.router.events.pipe(filter(e => e instanceof NavigationEnd), map(e => e.urlAfterRedirects)), { initialValue: this.router.url === '/' ? location.pathname : this.router.url });
  readonly message = SESSION_LIMIT_MESSAGE;
  showExpiration(): boolean { return this.auth.sessionExpired() && !/^\/login(?:[/?#]|$)/.test(this.url()); }
  logout(): void { this.auth.logout().subscribe(); }
  @HostListener('document:keydown', ['$event'])
  keydown(event: KeyboardEvent): void {
    if (this.showExpiration() && event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); }
  }
}
