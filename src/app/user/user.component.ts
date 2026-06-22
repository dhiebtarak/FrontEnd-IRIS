import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { Auth } from '../shared/services/auth';

@Component({
  selector: 'app-user',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './user.component.html',
  styles: ``,
})
export class UserComponent {
  readonly currentUser: unknown;
  readonly workspaceRoute: string;

  constructor(
    private authService: Auth,
    private toastr: ToastrService,
    private router: Router
  ) {
    this.currentUser = this.authService.getCurrentUser();
    this.workspaceRoute = this.authService.getWorkspaceRoute();
  }

  get displayName(): string {
    if (!this.currentUser || typeof this.currentUser !== 'object') {
      return 'Operator';
    }

    const user = this.currentUser as Record<string, unknown>;
    const name = user['fullName'] ?? user['userName'] ?? user['username'] ?? user['email'];

    return typeof name === 'string' && name.trim() ? name : 'Operator';
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

  get hasOfficerWorkspace(): boolean {
    return this.workspaceRoute !== '/user';
  }
}
