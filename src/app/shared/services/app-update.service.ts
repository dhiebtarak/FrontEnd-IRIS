import { HttpBackend, HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable, InjectionToken, OnDestroy, inject, signal } from '@angular/core';
import { Subscription } from 'rxjs';
import { Auth } from './auth';

export const CURRENT_BUILD_VERSION = typeof IRIS_BUILD_VERSION === 'undefined' ? 'development' : IRIS_BUILD_VERSION;
export const BUILD_VERSION = new InjectionToken<string>('IRIS build version', { providedIn: 'root', factory: () => CURRENT_BUILD_VERSION });
interface BuildVersion { version: string; authSchema: number; }

@Injectable({ providedIn: 'root' })
export class AppUpdateService implements OnDestroy {
  private readonly currentVersion = inject(BUILD_VERSION);
  private readonly http = new HttpClient(inject(HttpBackend));
  private readonly auth = inject(Auth);
  readonly available = signal<BuildVersion | null>(null);
  readonly reloading = signal(false);
  private interval?: ReturnType<typeof setInterval>;
  private request?: Subscription;
  private started = false;
  private checking = false;
  private readonly resume = () => { if (!document.hidden) this.check(); };

  start(): void {
    if (this.started || this.currentVersion === 'development') return;
    this.started = true;
    this.check();
    this.interval = setInterval(() => this.check(), 5 * 60 * 1000);
    document.addEventListener('visibilitychange', this.resume);
    window.addEventListener('online', this.resume);
  }

  check(): void {
    if (this.checking || !navigator.onLine) return;
    this.checking = true;
    this.request = this.http.get<BuildVersion>(`/version.json?t=${Date.now()}`, {
      headers: new HttpHeaders({ 'Cache-Control': 'no-cache, no-store', Pragma: 'no-cache' })
    }).subscribe({
      next: value => {
        if (typeof value?.version !== 'string' || !value.version) return;
        if (value.version === this.currentVersion) this.available.set(null);
        else if (value.version !== this.available()?.version) this.available.set(value);
      },
      error: () => { this.checking = false; },
      complete: () => { this.checking = false; }
    });
  }

  reloadLatest(): void {
    if (this.reloading() || !this.available() || this.auth.checkExpiration()) return;
    if (document.querySelector('form.ng-dirty, [data-unsaved-work="true"]')
      && !window.confirm('You have unsaved changes. Reloading will discard them. Continue?')) return;
    // Expiration could occur while a native confirmation was open.
    if (this.auth.checkExpiration()) return;
    this.reloading.set(true);
    if (this.available()!.authSchema !== 1) {
      this.auth.clearSession();
      window.location.replace('/login');
      return;
    }
    this.reload();
  }

  protected reload(): void { window.location.reload(); }

  ngOnDestroy(): void {
    clearInterval(this.interval);
    this.request?.unsubscribe();
    document.removeEventListener('visibilitychange', this.resume);
    window.removeEventListener('online', this.resume);
  }
}
