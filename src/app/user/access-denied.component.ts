import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-access-denied',
  standalone: true,
  imports: [RouterLink],
  template: `
    <main class="min-h-screen grid place-items-center bg-iris-bg p-6">
      <section class="max-w-lg border border-iris-border bg-white p-8 text-center">
        <h1 class="font-cambria text-2xl font-bold text-iris-navy">Access denied</h1>
        <p class="mt-3 text-iris-slate">Administrator access is required to create user accounts.</p>
        <a routerLink="/user" class="mt-6 inline-flex border border-iris-border px-4 py-2 font-bold text-iris-navy">Return to account</a>
      </section>
    </main>
  `
})
export class AccessDeniedComponent {}
