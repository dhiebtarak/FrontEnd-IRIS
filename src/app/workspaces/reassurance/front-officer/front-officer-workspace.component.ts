import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { Auth } from '../../../shared/services/auth';

@Component({
  selector: 'app-front-officer-workspace',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './front-officer-workspace.component.html',
  styles: ``,
})
export class FrontOfficerWorkspaceComponent {
  constructor(
    private authService: Auth,
    private toastr: ToastrService,
    private router: Router
  ) {}

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
