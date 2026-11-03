import { inject } from '@angular/core';
import { CanActivateChildFn, Router } from '@angular/router';
import { catchError, map, of } from 'rxjs';
import { Auth } from '../services/auth';

export const workspaceGuard: CanActivateChildFn = (_route, state) => {
  const authService = inject(Auth);
  const router = inject(Router);

  if (!authService.isLoggedIn()) {
    return router.createUrlTree(['/login']);
  }

  return authService.refreshCurrentWorkspace().pipe(
    map(() => {
      if (authService.isAdmin()) return router.createUrlTree(['/workspace/administrator']);
      const requestedUrl = state.url.split('?')[0].split('#')[0];
      const required = moduleForUrl(requestedUrl);
      if (required === 'any') return authService.hasAnyModule(['Counterparties', 'Contracts', 'Claims', 'BackOffice', 'Encaissement', 'Decaissement', 'CounterpartyBankAccounts'])
        ? true : router.createUrlTree(['/access-denied']);
      if (required && authService.hasModule(required)) return true;
      return router.createUrlTree(['/access-denied']);
    }),
    catchError(error => of(router.createUrlTree([error.status === 401 ? '/login' : '/access-denied'])))
  );
};

function moduleForUrl(url: string): string | 'any' | null {
  if (url.startsWith('/workspace/reassurance/front-officer/counterparties')) return 'Counterparties';
  if (url.startsWith('/workspace/reassurance/front-officer/contracts')) return 'Contracts';
  if (url.startsWith('/workspace/reassurance/front-officer/claims')) return 'Claims';
  if (url.startsWith('/workspace/reassurance/back-officer')) return 'BackOffice';
  if (url.startsWith('/workspace/reassurance/finance-officer/incoming-remittances')) return 'Encaissement';
  if (url.startsWith('/workspace/reassurance/finance-officer/disbursement-queue')) return 'Decaissement';
  if (url.startsWith('/workspace/reassurance/finance-officer/counterparty-bank-accounts')) return 'CounterpartyBankAccounts';
  if (url.startsWith('/workspace/reassurance/finance-officer')) return 'any';
  if (url.startsWith('/workspace/reassurance/front-officer')) return 'any';
  return null;
}
