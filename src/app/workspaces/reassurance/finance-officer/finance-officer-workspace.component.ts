import { Component } from '@angular/core';
import { RoleWorkspaceShellComponent, WorkspaceNavigationItem } from '../shared/role-workspace-shell.component';

@Component({
  selector: 'app-finance-officer-workspace',
  standalone: true,
  imports: [RoleWorkspaceShellComponent],
  templateUrl: './finance-officer-workspace.component.html',
  styles: `:host { display: block; }`,
})
export class FinanceOfficerWorkspaceComponent {
  readonly navigationItems: WorkspaceNavigationItem[] = [
    { label: 'Dashboard', route: '/workspace/reassurance/finance-officer', icon: 'dashboard', exact: true },
    { label: 'Incoming Remittances', route: '/workspace/reassurance/finance-officer/incoming-remittances', icon: 'receipts', exact: false },
    { label: 'Disbursement Queue', route: '/workspace/reassurance/finance-officer/disbursement-queue', icon: 'disbursements', exact: false },
    { label: 'Counterparty Bank Accounts', route: '/workspace/reassurance/finance-officer/counterparty-bank-accounts', icon: 'bankAccounts', exact: false },
    { label: 'Notifications', route: '/workspace/reassurance/finance-officer/notifications', icon: 'notifications', exact: false }
  ];
}
