import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { debounceTime, distinctUntilChanged, merge } from 'rxjs';
import { CounterpartyListItem, CounterpartyStatusUpdatePayload } from '../../shared/models/counterparty.model';
import { CounterpartiesService } from '../../shared/services/counterparties.service';

@Component({
  selector: 'app-counterparty-list',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  templateUrl: './counterparty-list.component.html',
  styles: ``
})
export class CounterpartyListComponent implements OnInit {
  private readonly destroyRef = inject(DestroyRef);
  readonly counterparties = signal<CounterpartyListItem[]>([]);
  readonly isLoading = signal(true);
  readonly errorMessage = signal('');
  readonly totalCount = signal(0);
  readonly totalPages = signal(0);
  readonly pageNumber = signal(1);
  readonly pageSize = signal(25);
  readonly updatingStatusIds = signal<Record<string, boolean>>({});
  readonly startItem = computed(() => (this.totalCount() === 0 ? 0 : (this.pageNumber() - 1) * this.pageSize() + 1));
  readonly endItem = computed(() => Math.min(this.pageNumber() * this.pageSize(), this.totalCount()));
  readonly pageSizeOptions = [10, 25, 50, 100];
  readonly counterpartyTypes = ['Cedent', 'Reinsurer', 'Client'];
  readonly counterpartyStatuses = ['Active', 'Inactive', 'Pending', 'Suspended'];

  readonly searchControl = new FormControl('', { nonNullable: true });
  readonly typeControl = new FormControl('', { nonNullable: true });
  readonly statusControl = new FormControl('', { nonNullable: true });

  constructor(
    private readonly counterpartiesService: CounterpartiesService,
    private readonly toastr: ToastrService,
    private readonly route: ActivatedRoute,
    private readonly router: Router
  ) {}

  ngOnInit(): void {
    this.route.queryParamMap
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(params => {
        this.searchControl.setValue(params.get('search') ?? '', { emitEvent: false });
        this.typeControl.setValue(params.get('type') ?? '', { emitEvent: false });
        this.statusControl.setValue(params.get('status') ?? '', { emitEvent: false });
        this.pageNumber.set(this.parsePositiveInteger(params.get('pageNumber'), 1));
        this.pageSize.set(Math.min(this.parsePositiveInteger(params.get('pageSize'), 25), 100));
        this.loadCounterparties();
      });

    this.searchControl.valueChanges
      .pipe(debounceTime(350), distinctUntilChanged(), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.updateFilterQueryParams());

    merge(this.typeControl.valueChanges, this.statusControl.valueChanges)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.updateFilterQueryParams());
  }

  loadCounterparties(): void {
    this.isLoading.set(true);
    this.errorMessage.set('');

    this.counterpartiesService
      .getCounterparties({
        pageNumber: this.pageNumber(),
        pageSize: this.pageSize(),
        search: this.searchControl.value,
        type: this.typeControl.value,
        status: this.statusControl.value
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: response => {
          const items = Array.isArray(response.items) ? response.items : [];
          this.counterparties.set(items);
          this.totalCount.set(typeof response.totalCount === 'number' ? response.totalCount : items.length);
          this.totalPages.set(typeof response.totalPages === 'number' ? response.totalPages : 0);
          this.pageNumber.set(typeof response.pageNumber === 'number' ? response.pageNumber : this.pageNumber());
          this.pageSize.set(typeof response.pageSize === 'number' ? response.pageSize : this.pageSize());
          this.isLoading.set(false);
        },
        error: (error: HttpErrorResponse) => {
          this.errorMessage.set(this.getErrorMessage(error));
          this.isLoading.set(false);
        }
      });
  }

  clearFilters(): void {
    this.searchControl.setValue('', { emitEvent: false });
    this.typeControl.setValue('', { emitEvent: false });
    this.statusControl.setValue('', { emitEvent: false });

    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {
        search: null,
        type: null,
        status: null,
        pageNumber: 1,
        pageSize: this.pageSize()
      },
      queryParamsHandling: 'merge'
    });
  }

  goToPage(page: number): void {
    if (page < 1 || page > this.totalPages() || page === this.pageNumber()) {
      return;
    }

    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { pageNumber: page },
      queryParamsHandling: 'merge'
    });
  }

  changePageSize(event: Event): void {
    const pageSize = Number((event.target as HTMLSelectElement).value);

    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { pageNumber: 1, pageSize },
      queryParamsHandling: 'merge'
    });
  }

  isStatusUpdating(id: number | string): boolean {
    return !!this.updatingStatusIds()[String(id)];
  }

  onToggleStatus(event: Event, counterparty: CounterpartyListItem): void {
    event.preventDefault();
    event.stopPropagation();

    if (this.isStatusUpdating(counterparty.id)) {
      return;
    }

    const nextStatus = this.getNextStatusPayload(counterparty);

    if (!window.confirm(this.getStatusConfirmationMessage(counterparty, nextStatus))) {
      return;
    }

    this.setStatusUpdating(counterparty.id, true);

    this.counterpartiesService.updateCounterpartyStatus(counterparty.id, nextStatus).subscribe({
      next: () => {
        this.counterparties.update(items =>
          items.map(item =>
            item.id === counterparty.id
              ? { ...item, isActive: nextStatus.isActive, status: nextStatus.status }
              : item
          )
        );
        this.setStatusUpdating(counterparty.id, false);
        this.toastr.success(
          `Counterparty ${nextStatus.isActive ? 'activated' : 'deactivated'} successfully.`,
          'Success'
        );

        if (this.statusControl.value && this.statusControl.value !== nextStatus.status) {
          this.loadCounterparties();
        }
      },
      error: (error: HttpErrorResponse) => {
        this.setStatusUpdating(counterparty.id, false);
        this.toastr.error(this.getStatusUpdateErrorMessage(error), 'Update failed');
      }
    });
  }

  getStatusBadgeLabel(counterparty: CounterpartyListItem): string {
    return this.isStatusUpdating(counterparty.id)
      ? 'Updating...'
      : counterparty.isActive
        ? 'Active'
        : 'Inactive';
  }

  getStatusBadgeTitle(counterparty: CounterpartyListItem): string {
    return counterparty.isActive ? 'Deactivate counterparty' : 'Activate counterparty';
  }

  private updateFilterQueryParams(): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {
        search: this.searchControl.value.trim() || null,
        type: this.typeControl.value || null,
        status: this.statusControl.value || null,
        pageNumber: 1,
        pageSize: this.pageSize()
      },
      queryParamsHandling: 'merge',
      replaceUrl: true
    });
  }

  private getNextStatusPayload(counterparty: CounterpartyListItem): CounterpartyStatusUpdatePayload {
    return counterparty.isActive
      ? { isActive: false, status: 'Inactive' }
      : { isActive: true, status: 'Active' };
  }

  private setStatusUpdating(id: number | string, isUpdating: boolean): void {
    const normalizedId = String(id);

    this.updatingStatusIds.update(state => {
      if (isUpdating) {
        return { ...state, [normalizedId]: true };
      }

      const nextState = { ...state };
      delete nextState[normalizedId];
      return nextState;
    });
  }

  private getStatusConfirmationMessage(counterparty: CounterpartyListItem, nextStatus: CounterpartyStatusUpdatePayload): string {
    return nextStatus.isActive
      ? `Activate Counterparty?\n\n${counterparty.name} will become available for operations.`
      : `Deactivate Counterparty?\n\n${counterparty.name} will no longer be available for new operations.`;
  }

  private parsePositiveInteger(value: string | null, fallback: number): number {
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
  }

  private getErrorMessage(error: HttpErrorResponse): string {
    if (error.status === 400) {
      return 'The counterparty filters were rejected by the backend.';
    }

    if (error.status === 404) {
      return 'The counterparties endpoint is not available.';
    }

    if (error.status === 0) {
      return 'Unable to reach the counterparty service.';
    }

    return 'Counterparties could not be loaded right now.';
  }

  private getStatusUpdateErrorMessage(error: HttpErrorResponse): string {
    if (error.status === 400) {
      return 'The backend rejected the status update payload for this counterparty.';
    }

    if (error.status === 404) {
      return 'This counterparty could not be found anymore.';
    }

    if (error.status === 0) {
      return 'Unable to reach the counterparty service.';
    }

    return 'The counterparty status could not be updated right now.';
  }
}
