import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { DatePipe } from '@angular/common';
import { Component, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { Auth, AdminManagedUser } from '../../shared/services/auth';

@Component({
  selector: 'app-admin-account-management',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <section class="mx-auto max-w-7xl px-5 py-8 text-slate-800">
      <div class="flex flex-wrap items-end justify-between gap-4 border-b border-slate-200 pb-5">
        <div><p class="text-xs font-bold uppercase tracking-widest text-teal-700">Administrator</p><h1 class="mt-1 text-2xl font-bold text-slate-900">Account management</h1></div>
        <label class="w-full max-w-sm text-sm font-semibold">Search users
          <input class="mt-1 w-full rounded border border-slate-300 px-3 py-2 font-normal" [(ngModel)]="search" (ngModelChange)="load()" placeholder="Name, username, email or position" />
        </label>
      </div>
      @if (error()) { <p role="alert" class="mt-4 border-l-4 border-red-600 bg-red-50 p-3 text-sm text-red-800">{{ error() }}</p> }
      @if (loading()) { <p class="py-10 text-center text-slate-500">Loading accounts...</p> }
      @else {
        <div class="mt-5 overflow-x-auto border border-slate-200 bg-white">
          <table class="w-full min-w-[760px] text-left text-sm"><thead class="bg-slate-50 text-xs uppercase text-slate-600"><tr><th class="px-4 py-3">User</th><th class="px-4 py-3">Department / Position</th><th class="px-4 py-3">Roles</th><th class="px-4 py-3">Account</th><th class="px-4 py-3">Last successful login</th><th class="px-4 py-3">Active sessions</th><th class="px-4 py-3">Action</th></tr></thead>
            <tbody class="divide-y divide-slate-100">
              @for (user of users(); track user.id) {
                <tr><td class="px-4 py-3"><strong>{{ user.fullName }}</strong><div class="text-xs text-slate-500">{{ user.email }} · {{ user.username }}</div></td><td class="px-4 py-3">{{ user.department || '—' }} / {{ user.position || '—' }}</td><td class="px-4 py-3">{{ user.roles.join(', ') || '—' }}</td>
                  <td class="px-4 py-3"><span [class]="user.isEnabled ? 'text-green-700' : 'text-red-700'">{{ user.accountStatus }} {{ user.isLocked ? '(Locked)' : '' }}</span></td>
                  <td class="px-4 py-3">{{ user.lastSuccessfulLoginAtUtc ? (user.lastSuccessfulLoginAtUtc | date:'medium') : '?' }}</td><td class="px-4 py-3">{{ user.activeSessionCount }}</td><td class="px-4 py-3"><a class="mr-3 text-teal-700 underline" routerLink="/workspace/administrator/access-activity" [queryParams]="{ userId: user.id }">View access history</a><button type="button" [disabled]="busyId() === user.id" (click)="toggle(user)" class="rounded border px-3 py-1.5 font-semibold disabled:opacity-50" [class.border-red-300]="user.isEnabled" [class.text-red-700]="user.isEnabled" [class.border-green-300]="!user.isEnabled" [class.text-green-700]="!user.isEnabled">{{ busyId() === user.id ? 'Saving...' : user.isEnabled ? 'Disable' : 'Enable' }}</button></td>
                </tr>
              } @empty { <tr><td colspan="7" class="px-4 py-10 text-center text-slate-500">No accounts found.</td></tr> }
            </tbody>
          </table>
        </div>
        <p class="mt-3 text-xs text-slate-500">Disabled accounts cannot authenticate. Your own administrator account and the last enabled administrator are protected.</p>
      }
    </section>`
})
export class AdminAccountManagementComponent implements OnInit {
  readonly users = signal<AdminManagedUser[]>([]);
  readonly loading = signal(false);
  readonly busyId = signal('');
  readonly error = signal('');
  search = '';
  constructor(private readonly auth: Auth) {}
  ngOnInit(): void { this.load(); }
  load(): void {
    this.loading.set(true); this.error.set('');
    this.auth.listAdminUsers(this.search).subscribe({
      next: users => { this.users.set(users); this.loading.set(false); },
      error: (error: HttpErrorResponse) => { this.error.set(this.errorMessage(error)); this.loading.set(false); }
    });
  }
  toggle(user: AdminManagedUser): void {
    if (this.busyId()) return;
    const nextEnabled = !user.isEnabled;
    if (!nextEnabled && !window.confirm(`Disable ${user.fullName}'s account? They will no longer be able to sign in.`)) return;
    this.busyId.set(user.id); this.error.set('');
    this.auth.setAdminUserEnabled(user.id, nextEnabled).subscribe({
      next: () => { this.busyId.set(''); this.load(); },
      error: (error: HttpErrorResponse) => { this.error.set(this.errorMessage(error)); this.busyId.set(''); }
    });
  }
  private errorMessage(error: HttpErrorResponse): string {
    return error.error?.message ?? error.error?.title ?? `Account request failed (${error.status}).`;
  }
}
