import { Component } from '@angular/core';
import { RoleWorkspaceShellComponent, WorkspaceNavigationItem } from './shared/role-workspace-shell.component';

@Component({
  selector: 'app-admin-workspace',
  standalone: true,
  imports: [RoleWorkspaceShellComponent],
  template: `<app-role-workspace-shell title="Administrator" homeRoute="/workspace/administrator/users/accounts" deskLabel="Administrator workspace" [navigationItems]="navigationItems" />`,
  styles: `:host { display: block; }`
})
export class AdminWorkspaceComponent {
  readonly navigationItems: WorkspaceNavigationItem[] = [
    { label: 'Create User', route: '/workspace/administrator/users/new', icon: 'dashboard', exact: true },
    { label: 'Accounts', route: '/workspace/administrator/users/accounts', icon: 'counterparties', exact: true },
    { label: 'Permissions', route: '/workspace/administrator/users/permissions', icon: 'contracts', exact: true },
    { label: 'Access Activity', route: '/workspace/administrator/access-activity', icon: 'claims', exact: true }
  ];
}
