import { Component, DestroyRef, HostListener, Input, inject, signal } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { filter } from 'rxjs';
import { ToastrService } from 'ngx-toastr';
import { NotificationBellComponent } from '../../../shared/components/notification-bell/notification-bell.component';
import { Auth } from '../../../shared/services/auth';

export type WorkspaceNavIcon =
  | 'dashboard'
  | 'counterparties'
  | 'contracts'
  | 'claims'
  | 'receipts'
  | 'remittances'
  | 'invoices'
  | 'bankAccounts'
  | 'disbursements'
  | 'notifications';

export interface WorkspaceNavigationItem {
  label: string;
  route: string;
  icon: WorkspaceNavIcon;
  exact: boolean;
}

@Component({
  selector: 'app-role-workspace-shell',
  standalone: true,
  imports: [NotificationBellComponent, RouterLink, RouterLinkActive, RouterOutlet],
  templateUrl: './role-workspace-shell.component.html',
  styles: `
    :host { display: block; }

    .workspace-nav-active {
      background: rgba(255, 255, 255, 0.14);
      color: #ffffff;
      box-shadow: inset 3px 0 0 #00d4f0;
    }
  `
})
export class RoleWorkspaceShellComponent {
  private readonly destroyRef = inject(DestroyRef);

  @Input({ required: true }) title = '';
  @Input({ required: true }) homeRoute = '';
  @Input({ required: true }) navigationItems: WorkspaceNavigationItem[] = [];
  @Input() showNotifications = false;
  @Input() deskLabel = 'Secure workspace';

  readonly isMobileNavigationOpen = signal(false);

  constructor(
    private readonly authService: Auth,
    private readonly toastr: ToastrService,
    private readonly router: Router
  ) {
    this.router.events
      .pipe(filter(event => event instanceof NavigationEnd), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.closeMobileNavigation());
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.closeMobileNavigation();
  }

  openMobileNavigation(): void {
    this.isMobileNavigationOpen.set(true);
  }

  closeMobileNavigation(): void {
    this.isMobileNavigationOpen.set(false);
  }

  logout(): void {
    this.authService.logout().subscribe({
      next: () => this.finishLogout(),
      error: () => this.finishLogout()
    });
  }

  private finishLogout(): void {
    this.toastr.success('You have been logged out.', 'Logout');
    void this.router.navigate(['/login']);
  }
}
