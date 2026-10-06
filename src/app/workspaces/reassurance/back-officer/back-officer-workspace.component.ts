import { Component } from '@angular/core';
import { RoleWorkspaceShellComponent, WorkspaceNavigationItem } from '../shared/role-workspace-shell.component';

@Component({
  selector: 'app-back-officer-workspace',
  standalone: true,
  imports: [RoleWorkspaceShellComponent],
  templateUrl: './back-officer-workspace.component.html',
  styles: `:host { display: block; }`,
})
export class BackOfficerWorkspaceComponent {
  readonly navigationItems: WorkspaceNavigationItem[] = [
    { label: 'Dashboard', route: '/workspace/reassurance/back-officer', icon: 'dashboard', exact: true },
    { label: 'Receipt Pairing', route: '/workspace/reassurance/back-officer/receipt-pairing', icon: 'receipts', exact: false },
    { label: 'Outgoing Remittances', route: '/workspace/reassurance/back-officer/outgoing-remittances', icon: 'remittances', exact: false },
    { label: 'Invoices', route: '/workspace/reassurance/back-officer/invoices', icon: 'invoices', exact: false },
    { label: 'Contracts', route: '/workspace/reassurance/back-officer/contracts', icon: 'contracts', exact: false },
    { label: 'Notifications', route: '/workspace/reassurance/back-officer/notifications', icon: 'notifications', exact: false }
  ];
}
