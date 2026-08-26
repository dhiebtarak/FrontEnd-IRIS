import { Component, DestroyRef, HostListener, inject, signal } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ToastrService } from 'ngx-toastr';
import { Auth } from '../../../shared/services/auth';

interface FrontOfficerNavigationItem {
  label: string;
  route: string;
  icon: 'dashboard' | 'counterparties' | 'contracts' | 'claims';
  exact: boolean;
}

@Component({
  selector: 'app-front-officer-layout',
  standalone: true,
  imports: [RouterLink, RouterLinkActive, RouterOutlet],
  templateUrl: './front-officer-layout.component.html',
  styles: `
    :host {
      display: block;
    }

    .front-nav-active {
      background: rgba(255, 255, 255, 0.14);
      color: #ffffff;
      box-shadow: inset 3px 0 0 #00d4f0;
    }
  `
})
export class FrontOfficerLayoutComponent {
  private readonly destroyRef = inject(DestroyRef);
  readonly isMobileNavigationOpen = signal(false);
  readonly navigationItems: FrontOfficerNavigationItem[] = [
    {
      label: 'Dashboard',
      route: '/workspace/reassurance/front-officer',
      icon: 'dashboard',
      exact: true
    },
    {
      label: 'Counterparties',
      route: '/workspace/reassurance/front-officer/counterparties',
      icon: 'counterparties',
      exact: false
    },
    {
      label: 'Contracts',
      route: '/workspace/reassurance/front-officer/contracts',
      icon: 'contracts',
      exact: false
    },
    {
      label: 'Claims',
      route: '/workspace/reassurance/front-officer/claims',
      icon: 'claims',
      exact: false
    }
  ];

  constructor(
    private readonly authService: Auth,
    private readonly toastr: ToastrService,
    private readonly router: Router
  ) {
    this.router.events
      .pipe(
        filter(event => event instanceof NavigationEnd),
        takeUntilDestroyed(this.destroyRef)
      )
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
