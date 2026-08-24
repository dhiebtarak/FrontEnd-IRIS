import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { Auth } from '../../../shared/services/auth';

@Component({
  selector: 'app-front-officer-workspace',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './front-officer-workspace.component.html',
  styles: ``,
})
export class FrontOfficerWorkspaceComponent {
  readonly createContractRoute = '/workspace/reassurance/front-officer/contracts/new/type';

  constructor(
    private authService: Auth,
    private toastr: ToastrService,
    private router: Router
  ) {}

  get canCreateContract(): boolean {
    return this.authService.getWorkspaceRoute() === '/workspace/reassurance/front-officer';
  }

  logout(): void {
    this.authService.logout().subscribe({
      next: () => {
        this.toastr.success('You have been logged out.', 'Logout');
        this.router.navigate(['/login']);
      },
      error: () => {
        this.toastr.success('You have been logged out.', 'Logout');
        this.router.navigate(['/login']);
      }
    });
  }
}
