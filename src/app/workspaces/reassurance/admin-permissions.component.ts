import { CommonModule } from '@angular/common';
import { Component, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { ACCESS_MODULES, AdminManagedUser, Auth } from '../../shared/services/auth';

@Component({
  selector: 'app-admin-permissions',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <section class="mx-auto max-w-7xl px-5 py-8 text-slate-800">
      <div class="border-b border-slate-200 pb-5"><p class="text-xs font-bold uppercase tracking-widest text-teal-700">Administrator</p><h1 class="mt-1 text-2xl font-bold text-slate-900">Module permissions</h1><p class="mt-1 text-sm text-slate-600">Grant workspace modules without changing the user's department, position or role.</p></div>
      @if (error()) { <p role="alert" class="mt-4 border-l-4 border-red-600 bg-red-50 p-3 text-sm text-red-800">{{ error() }}</p> }
      <div class="mt-6 grid gap-6 lg:grid-cols-[minmax(16rem,0.8fr)_minmax(24rem,1.2fr)]">
        <section><label class="text-sm font-semibold">Find user<input class="mt-1 w-full rounded border border-slate-300 px-3 py-2 font-normal" [(ngModel)]="search" (ngModelChange)="loadUsers()" placeholder="Name or email" /></label>
          <div class="mt-3 max-h-[32rem] divide-y divide-slate-100 overflow-auto border border-slate-200 bg-white">
            @for (user of users(); track user.id) {
              <button type="button" (click)="select(user)" class="block w-full px-4 py-3 text-left hover:bg-slate-50" [class.bg-teal-50]="selected()?.id === user.id">
                <span class="block font-semibold">{{ user.fullName }}</span><span class="block text-xs text-slate-500">{{ user.department }} · {{ user.position }} · {{ user.email }}</span>
                @if (user.roles.includes('Admin')) { <span class="mt-1 inline-block text-xs font-bold text-amber-700">Admin role</span> }
              </button>
            } @empty { <p class="px-4 py-8 text-center text-sm text-slate-500">No users found.</p> }
          </div>
        </section>
        <section class="border border-slate-200 bg-white p-5">
          @if (!selected()) { <p class="py-12 text-center text-slate-500">Select a user to review access.</p> }
          @else {
            <h2 class="text-lg font-bold text-slate-900">{{ selected()!.fullName }}</h2><p class="text-sm text-slate-600">{{ selected()!.department }} · {{ selected()!.position }}</p>
            @if (selected()!.roles.includes('Admin')) { <p class="mt-5 rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">Administrator access is controlled by the Admin role. Module grants cannot add or remove administrator privileges.</p> }
            @else {
              <fieldset class="mt-5 space-y-3" [disabled]="saving()">
                @for (module of moduleCatalog; track module.key) {
                  <label class="flex cursor-pointer gap-3 border-b border-slate-100 pb-3"><input type="checkbox" class="mt-1 accent-teal-700" [checked]="hasModule(module.key)" (change)="toggleModule(module.key, $any($event.target).checked)" /><span><strong class="block text-sm">{{ module.label }}</strong><span class="text-xs text-slate-500">{{ module.description }}</span></span></label>
                }
              </fieldset>
              <div class="mt-5 flex items-center gap-3"><button type="button" [disabled]="saving()" (click)="save()" class="rounded bg-teal-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">{{ saving() ? 'Saving...' : 'Save access' }}</button><span aria-live="polite" class="text-sm text-green-700">{{ success() }}</span></div>
            }
          }
        </section>
      </div>
    </section>`
})
export class AdminPermissionsComponent implements OnInit {
  readonly moduleCatalog = ACCESS_MODULES;
  readonly users = signal<AdminManagedUser[]>([]);
  readonly selected = signal<AdminManagedUser | null>(null);
  readonly assignedModules = signal<string[]>([]);
  readonly saving = signal(false);
  readonly error = signal('');
  readonly success = signal('');
  search = '';
  constructor(private readonly auth: Auth, private readonly route: ActivatedRoute) {}
  ngOnInit(): void {
    this.loadUsers(() => {
      const requestedId = this.route.snapshot.queryParamMap.get('userId');
      const user = this.users().find(item => item.id === requestedId);
      if (user) this.select(user);
    });
  }
  loadUsers(afterLoad?: () => void): void {
    this.auth.listAdminUsers(this.search).subscribe({ next: users => { this.users.set(users); afterLoad?.(); }, error: error => this.showError(error) });
  }
  select(user: AdminManagedUser): void {
    this.selected.set(user); this.success.set(''); this.error.set(''); this.assignedModules.set([...user.modules]);
    if (!user.roles.includes('Admin')) this.auth.getAdminUserModules(user.id).subscribe({
      next: modules => { if (this.selected()?.id === user.id) this.assignedModules.set(modules); },
      error: error => { if (this.selected()?.id === user.id) this.showError(error); }
    });
  }
  hasModule(module: string): boolean { return this.assignedModules().includes(module); }
  toggleModule(module: string, enabled: boolean): void {
    this.assignedModules.update(current => enabled ? [...new Set([...current, module])] : current.filter(item => item !== module));
    this.success.set('');
  }
  save(): void {
    const user = this.selected();
    if (!user || user.roles.includes('Admin') || this.saving()) return;
    this.saving.set(true); this.error.set(''); this.success.set('');
    this.auth.setAdminUserModules(user.id, this.assignedModules()).subscribe({
      next: modules => { this.assignedModules.set(modules); this.success.set("Access saved. Changes apply to the user's next API request."); this.saving.set(false); this.loadUsers(); },
      error: error => { this.showError(error); this.saving.set(false); }
    });
  }
  private showError(error: HttpErrorResponse): void { this.error.set(error.error?.message ?? error.error?.title ?? `Request failed (${error.status}).`); }
}
