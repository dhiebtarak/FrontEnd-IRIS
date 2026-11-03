import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { catchError, map, of } from 'rxjs';
import { Auth } from '../services/auth';

export const adminGuard: CanActivateFn = () => {
  const auth = inject(Auth);
  const router = inject(Router);

  if (!auth.isLoggedIn()) return router.createUrlTree(['/login']);
  return auth.refreshCurrentUserProfile().pipe(
    map(user => user.roles?.some(role => role.toLowerCase() === 'admin') ? true : router.createUrlTree(['/access-denied'])),
    catchError(error => of(router.createUrlTree([error.status === 401 ? '/login' : '/access-denied'])))
  );
};
