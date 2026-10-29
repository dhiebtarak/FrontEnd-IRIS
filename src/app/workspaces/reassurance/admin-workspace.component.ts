import { Component } from '@angular/core';
import { RoleWorkspaceShellComponent, WorkspaceNavigationItem } from './shared/role-workspace-shell.component';

@Component({
  selector: 'app-admin-workspace',
  standalone: true,
  imports: [RoleWorkspaceShellComponent],
  template: `<app-role-workspace-shell title="Administrator" homeRoute="/workspace/admin/users/new" deskLabel="Administrator workspace" [navigationItems]="navigationItems" />`,
  styles: `:host { display: block; }`
})
export class AdminWorkspaceComponent {
  readonly navigationItems: WorkspaceNavigationItem[] = [
    { label: 'Create user', route: '/workspace/admin/users/new', icon: 'dashboard', exact: true }
  ];
}
