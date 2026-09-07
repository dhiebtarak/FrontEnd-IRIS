import { DatePipe, DecimalPipe, NgClass } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { DashboardSummary } from '../../../shared/models/contract.model';
import { getContractStatusClasses, getContractStatusDisplay } from '../../../shared/models/contract-status.util';
import { Auth } from '../../../shared/services/auth';
import { ContractsService } from '../../../shared/services/contracts.service';

type DashboardLoadState = 'loading' | 'loaded' | 'error';

@Component({
  selector: 'app-front-officer-workspace',
  standalone: true,
  imports: [DatePipe, DecimalPipe, NgClass, RouterLink],
  templateUrl: './front-officer-workspace.component.html',
  styles: ``,
})
export class FrontOfficerWorkspaceComponent implements OnInit {
  private readonly destroyRef = inject(DestroyRef);
  readonly createContractRoute = '/workspace/reassurance/front-officer/contracts/new/type';
  readonly contractsRoute = '/workspace/reassurance/front-officer/contracts';
  readonly dashboardState = signal<DashboardLoadState>('loading');
  readonly dashboardSummary = signal<DashboardSummary | null>(null);
  readonly dashboardError = signal('');
  readonly statisticCards = computed(() => {
    const summary = this.dashboardSummary();

    return [
      { key: 'total-contracts', label: 'Total Contracts', description: 'Portfolio volume', value: summary?.totalContracts ?? null },
      { key: 'pending-review', label: 'Pending Review', description: 'Awaiting assessment', value: summary?.pendingReviewContracts ?? null },
      { key: 'bound-active', label: 'Bound & Active', description: 'Currently in force', value: summary?.boundActiveContracts ?? null },
      { key: 'action-required', label: 'Action Required', description: 'Needs Front Officer attention', value: summary?.actionRequiredContracts ?? null }
    ];
  });

  constructor(
    private readonly authService: Auth,
    private readonly contractsService: ContractsService
  ) {}

  ngOnInit(): void {
    this.loadDashboardSummary();
  }

  get canCreateContract(): boolean {
    return this.authService.getWorkspaceRoute() === '/workspace/reassurance/front-officer';
  }

  loadDashboardSummary(): void {
    this.dashboardState.set('loading');
    this.dashboardError.set('');

    this.contractsService.getDashboardSummary()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: summary => {
          this.dashboardSummary.set(summary);
          this.dashboardState.set('loaded');
        },
        error: (error: HttpErrorResponse) => {
          this.dashboardSummary.set(null);
          this.dashboardError.set(this.getDashboardErrorMessage(error));
          this.dashboardState.set('error');
        }
      });
  }

  normalizedPercentage(percentage: number): number {
    return Math.min(Math.max(percentage, 0), 100);
  }

  getDisplayStatus(status: string): string {
    return getContractStatusDisplay(status);
  }

  getStatusClasses(status: string): string {
    return getContractStatusClasses(status);
  }

  private getDashboardErrorMessage(error: HttpErrorResponse): string {
    if (error.status === 401 || error.status === 403) {
      return 'Your session is not authorized to load the contract dashboard.';
    }

    if (error.status === 0) {
      return 'The contract dashboard service could not be reached.';
    }

    return 'Contract dashboard data could not be loaded right now.';
  }
}
