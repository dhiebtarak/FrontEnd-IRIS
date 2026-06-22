import { Routes } from '@angular/router';
import { authGuard } from './shared/guards/auth.guard';
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
