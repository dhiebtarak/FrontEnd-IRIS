import { Routes } from '@angular/router';
import { ContractOverviewComponent } from './contracts/contract-overview/contract-overview.component';
import { ContractTypeSelectionComponent } from './contracts/contract-type-selection/contract-type-selection.component';
import { FacultativeInformationComponent } from './contracts/facultative-information/facultative-information.component';
import { AddCounterpartyComponent } from './counterparties/add-counterparty/add-counterparty.component';
import { CounterpartyListComponent } from './counterparties/counterparty-list/counterparty-list.component';
import { authGuard } from './shared/guards/auth.guard';
import { adminGuard } from './shared/guards/admin.guard';
import { pendingChangesGuard } from './shared/guards/pending-changes.guard';
import { workspaceGuard } from './shared/guards/workspace.guard';
import { LoginComponent } from './user/login/login.component';
import { RegistrationComponent } from './user/registration/registration.component';
import { UserComponent } from './user/user.component';
import { BackOfficerWorkspaceComponent } from './workspaces/reassurance/back-officer/back-officer-workspace.component';
import { FinanceOfficerWorkspaceComponent } from './workspaces/reassurance/finance-officer/finance-officer-workspace.component';
import { FrontOfficerWorkspaceComponent } from './workspaces/reassurance/front-officer/front-officer-workspace.component';
import { FrontOfficerLayoutComponent } from './workspaces/reassurance/front-officer/front-officer-layout.component';
import { ContractsListComponent } from './contracts/contracts-list/contracts-list.component';
import { ClaimsComingSoonComponent } from './claims/claims-coming-soon.component';
import { AdminWorkspaceComponent } from './workspaces/reassurance/admin-workspace.component';
import { AccessDeniedComponent } from './user/access-denied.component';
import { AdminAccountManagementComponent } from './workspaces/reassurance/admin-account-management.component';
import { AdminPermissionsComponent } from './workspaces/reassurance/admin-permissions.component';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'login' },
  { path: 'workspace/admin', pathMatch: 'full', redirectTo: 'workspace/administrator' },
  { path: 'workspace/admin/users/:action', redirectTo: 'workspace/administrator/users/:action' },
  { path: 'login', component: LoginComponent },
  { path: 'access-denied', component: AccessDeniedComponent },
  { path: 'user', component: UserComponent, canActivate: [authGuard] },
  {
    path: 'workspace/administrator',
    component: AdminWorkspaceComponent,
    canActivate: [authGuard, adminGuard],
    canActivateChild: [authGuard, adminGuard],
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'users/accounts' },
      { path: 'users/new', component: RegistrationComponent },
      { path: 'users/accounts', component: AdminAccountManagementComponent },
      { path: 'users/permissions', component: AdminPermissionsComponent },
      { path: 'access-activity', loadComponent: () => import('./workspaces/reassurance/admin-access-activity.component').then(m => m.AdminAccessActivityComponent) }
    ]
  },
  {
    path: 'workspace/reassurance/front-officer',
    component: FrontOfficerLayoutComponent,
    canActivate: [authGuard],
    canActivateChild: [workspaceGuard],
    children: [
      { path: '', component: FrontOfficerWorkspaceComponent },
      { path: 'counterparties', component: CounterpartyListComponent },
      { path: 'counterparties/new', component: AddCounterpartyComponent },
      { path: 'counterparties/:id', component: AddCounterpartyComponent },
      { path: 'contracts', component: ContractsListComponent },
      { path: 'contracts/new/type', component: ContractTypeSelectionComponent },
      {
        path: 'contracts/new/facultative',
        component: FacultativeInformationComponent,
        canDeactivate: [pendingChangesGuard]
      },
      { path: 'contracts/new/overview', component: ContractOverviewComponent },
      { path: 'claims', component: ClaimsComingSoonComponent }
    ]
  },
  {
    path: 'workspace/reassurance/back-officer',
    component: BackOfficerWorkspaceComponent,
    canActivate: [authGuard],
    canActivateChild: [workspaceGuard],
    children: [
      { path: '', loadComponent: () => import('./workspaces/reassurance/financial-workspace/financial-workspace-page.component').then(m => m.FinancialWorkspacePageComponent), data: { role: 'back-office', page: 'dashboard' } },
      { path: 'receipt-pairing', loadComponent: () => import('./workspaces/reassurance/financial-workspace/financial-workspace-page.component').then(m => m.FinancialWorkspacePageComponent), data: { role: 'back-office', page: 'receipts' } },
      { path: 'outgoing-remittances', loadComponent: () => import('./workspaces/reassurance/financial-workspace/financial-workspace-page.component').then(m => m.FinancialWorkspacePageComponent), data: { role: 'back-office', page: 'remittances' } },
      { path: 'invoices', loadComponent: () => import('./workspaces/reassurance/financial-workspace/financial-workspace-page.component').then(m => m.FinancialWorkspacePageComponent), data: { role: 'back-office', page: 'invoices' } },
      { path: 'contracts', component: ContractsListComponent, data: { workspace: 'back-office', readonly: true } },
      { path: 'contracts/:contractId/overview', component: ContractOverviewComponent, data: { workspace: 'back-office', readonly: true } },
      { path: 'contracts/overview', component: ContractOverviewComponent, data: { workspace: 'back-office', readonly: true } },
      { path: 'claims', component: ClaimsComingSoonComponent },
      { path: 'notifications', loadComponent: () => import('./workspaces/reassurance/financial-workspace/financial-workspace-page.component').then(m => m.FinancialWorkspacePageComponent), data: { role: 'back-office', page: 'notifications' } }
    ]
  },
  {
    path: 'workspace/reassurance/finance-officer',
    component: FinanceOfficerWorkspaceComponent,
    canActivate: [authGuard],
    canActivateChild: [workspaceGuard],
    children: [
      { path: '', loadComponent: () => import('./workspaces/reassurance/financial-workspace/financial-workspace-page.component').then(m => m.FinancialWorkspacePageComponent), data: { role: 'finance', page: 'dashboard' } },
      { path: 'incoming-remittances', loadComponent: () => import('./workspaces/reassurance/financial-workspace/financial-workspace-page.component').then(m => m.FinancialWorkspacePageComponent), data: { role: 'finance', page: 'receipts' } },
      { path: 'disbursement-queue', loadComponent: () => import('./workspaces/reassurance/financial-workspace/financial-workspace-page.component').then(m => m.FinancialWorkspacePageComponent), data: { role: 'finance', page: 'disbursements' } },
      { path: 'counterparty-bank-accounts', loadComponent: () => import('./workspaces/reassurance/financial-workspace/financial-workspace-page.component').then(m => m.FinancialWorkspacePageComponent), data: { role: 'finance', page: 'bank-accounts' } },
      { path: 'notifications', loadComponent: () => import('./workspaces/reassurance/financial-workspace/financial-workspace-page.component').then(m => m.FinancialWorkspacePageComponent), data: { role: 'finance', page: 'notifications' } }
    ]
  },
  { path: '**', redirectTo: 'login' }
];
