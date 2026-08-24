import { inject } from '@angular/core';
import { CanDeactivateFn } from '@angular/router';

export interface PendingChangesAware {
  canDeactivate: () => boolean;
}

export const pendingChangesGuard: CanDeactivateFn<PendingChangesAware> = component => {
  if (!component) {
    return true;
  }

  return component.canDeactivate();
};
