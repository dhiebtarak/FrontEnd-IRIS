import { Routes } from '@angular/router';
import { ContractConditionsPlaceholderComponent } from './contracts/contract-conditions-placeholder/contract-conditions-placeholder.component';
import { ContractTypeSelectionComponent } from './contracts/contract-type-selection/contract-type-selection.component';
import { FacultativeInformationComponent } from './contracts/facultative-information/facultative-information.component';
import { AddCounterpartyComponent } from './counterparties/add-counterparty/add-counterparty.component';
import { CounterpartyListComponent } from './counterparties/counterparty-list/counterparty-list.component';
import { authGuard } from './shared/guards/auth.guard';
import { pendingChangesGuard } from './shared/guards/pending-changes.guard';
import { workspaceGuard } from './shared/guards/workspace.guard';
import { LoginComponent } from './user/login/login.component';
import { RegistrationComponent } from './user/registration/registration.component';
import { UserComponent } from './user/user.component';
import { BackOfficerWorkspaceComponent } from './workspaces/reassurance/back-officer/back-officer-workspace.component';
import { FinanceOfficerWorkspaceComponent } from './workspaces/reassurance/finance-officer/finance-officer-workspace.component';
import { FrontOfficerWorkspaceComponent } from './workspaces/reassurance/front-officer/front-officer-workspace.component';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'login' },
  { path: 'login', component: LoginComponent },
  { path: 'register', component: RegistrationComponent },
  { path: 'user', component: UserComponent, canActivate: [authGuard] },
  {
    path: 'workspace/reassurance/front-officer',
    component: FrontOfficerWorkspaceComponent,
    canActivate: [workspaceGuard]
  },
  {
    path: 'workspace/reassurance/front-officer/counterparties',
    component: CounterpartyListComponent,
    canActivate: [workspaceGuard]
  },
  {
    path: 'workspace/reassurance/front-officer/counterparties/new',
    component: AddCounterpartyComponent,
    canActivate: [workspaceGuard]
  },
  {
    path: 'workspace/reassurance/front-officer/counterparties/:id',
    component: AddCounterpartyComponent,
    canActivate: [workspaceGuard]
  },
  {
    path: 'workspace/reassurance/front-officer/contracts/new/type',
    component: ContractTypeSelectionComponent,
    canActivate: [workspaceGuard]
  },
  {
    path: 'workspace/reassurance/front-officer/contracts/new/facultative',
    component: FacultativeInformationComponent,
    canActivate: [workspaceGuard],
    canDeactivate: [pendingChangesGuard]
  },
  {
    path: 'workspace/reassurance/front-officer/contracts/new/conditions',
    component: ContractConditionsPlaceholderComponent,
    canActivate: [workspaceGuard]
  },
  {
    path: 'workspace/reassurance/back-officer',
    component: BackOfficerWorkspaceComponent,
    canActivate: [workspaceGuard]
  },
  {
    path: 'workspace/reassurance/finance-officer',
    component: FinanceOfficerWorkspaceComponent,
    canActivate: [workspaceGuard]
  },
  { path: '**', redirectTo: 'login' }
];
