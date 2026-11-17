import { inject } from '@angular/core';
import { Auth } from '../services/auth';
import { CanDeactivateFn } from '@angular/router';

export interface PendingChangesAware {
  canDeactivate: () => boolean;
}

export const pendingChangesGuard: CanDeactivateFn<PendingChangesAware> = component => {
  if (!inject(Auth).isLoggedIn()) return true;
  if (!component) {
    return true;
  }

  return component.canDeactivate();
};
