import { Component, signal } from '@angular/core';
import { RoleWorkspaceShellComponent, WorkspaceNavigationItem } from '../shared/role-workspace-shell.component';

@Component({
  selector: 'app-front-officer-layout',
  standalone: true,
  imports: [RoleWorkspaceShellComponent],
  templateUrl: './front-officer-layout.component.html',
  styles: `:host { display: block; }`
})
export class FrontOfficerLayoutComponent {
  readonly isMobileNavigationOpen = signal(false);
  readonly navigationItems: WorkspaceNavigationItem[] = [
    {
      label: 'Dashboard',
      route: '/workspace/reassurance/front-officer',
      icon: 'dashboard',
      exact: true
    },
    {
      label: 'Counterparties',
      route: '/workspace/reassurance/front-officer/counterparties',
      icon: 'counterparties',
      exact: false
    },
    {
      label: 'Contracts',
      route: '/workspace/reassurance/front-officer/contracts',
      icon: 'contracts',
      exact: false
    },
    {
      label: 'Claims',
      route: '/workspace/reassurance/front-officer/claims',
      icon: 'claims',
      exact: false
    }
  ];

  openMobileNavigation(): void {
    this.isMobileNavigationOpen.set(true);
  }

  closeMobileNavigation(): void {
    this.isMobileNavigationOpen.set(false);
  }

  onEscape(): void {
    this.closeMobileNavigation();
  }
}
