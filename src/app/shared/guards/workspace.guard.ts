import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { Auth } from '../services/auth';

export const workspaceGuard: CanActivateFn = (_route, state) => {
  const authService = inject(Auth);
  const router = inject(Router);

  if (!authService.isLoggedIn()) {
    return router.createUrlTree(['/login']);
  }

  const workspaceRoute = authService.getWorkspaceRoute();
  const requestedUrl = state.url.split('?')[0].split('#')[0];
  const isWorkspaceChildRoute = requestedUrl === workspaceRoute || requestedUrl.startsWith(`${workspaceRoute}/`);

  return isWorkspaceChildRoute ? true : router.createUrlTree([workspaceRoute]);
};
