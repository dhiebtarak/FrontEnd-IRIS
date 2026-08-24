import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { CounterpartyListItem, CounterpartyStatusUpdatePayload } from '../../shared/models/counterparty.model';
import { CounterpartiesService } from '../../shared/services/counterparties.service';

@Component({
  selector: 'app-counterparty-list',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './counterparty-list.component.html',
  styles: ``
})
export class CounterpartyListComponent implements OnInit {
  readonly counterparties = signal<CounterpartyListItem[]>([]);
  readonly isLoading = signal(true);
  readonly errorMessage = signal('');
  readonly totalCount = signal(0);
  readonly updatingStatusIds = signal<Record<string, boolean>>({});
  readonly registeredCount = computed(() => this.totalCount() || this.counterparties().length);
  readonly activeCount = computed(() => this.counterparties().filter(counterparty => counterparty.isActive).length);
  readonly pendingCount = computed(() => this.counterparties().filter(counterparty => counterparty.status === 'Pending').length);

  constructor(
    private readonly counterpartiesService: CounterpartiesService,
    private readonly toastr: ToastrService
  ) {}

  ngOnInit(): void {
    this.loadCounterparties();
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
              ? {
                  ...item,
                  isActive: nextStatus.isActive,
                  status: nextStatus.status
                }
              : item
          )
        );
        this.setStatusUpdating(counterparty.id, false);
        this.toastr.success(
          `Counterparty ${nextStatus.isActive ? 'activated' : 'deactivated'} successfully.`,
          'Success'
        );
      },
      error: (error: HttpErrorResponse) => {
        this.setStatusUpdating(counterparty.id, false);
        this.toastr.error(this.getStatusUpdateErrorMessage(error), 'Update failed');
      }
    });
  }

  getStatusBadgeLabel(counterparty: CounterpartyListItem): string {
    if (this.isStatusUpdating(counterparty.id)) {
      return 'Updating...';
    }

    return counterparty.isActive ? 'Active' : 'Inactive';
  }

  getStatusBadgeTitle(counterparty: CounterpartyListItem): string {
    return counterparty.isActive ? 'Deactivate counterparty' : 'Activate counterparty';
  }

  private loadCounterparties(): void {
    this.isLoading.set(true);
    this.errorMessage.set('');
    console.log('Loading counterparties...');
    this.counterpartiesService.getCounterparties().subscribe({
      next: response => {
        const items = Array.isArray(response.items) ? response.items : [];

        this.counterparties.set(items);
        this.totalCount.set(typeof response.totalCount === 'number' ? response.totalCount : items.length);
        this.isLoading.set(false);
      },
      error: (error: HttpErrorResponse) => {
        this.errorMessage.set(this.getErrorMessage(error));
        this.isLoading.set(false);
      }
    });
  }

  private getNextStatusPayload(counterparty: CounterpartyListItem): CounterpartyStatusUpdatePayload {
    if (counterparty.isActive) {
      return {
        isActive: false,
        status: 'Inactive'
      };
    }

    return {
      isActive: true,
      status: 'Active'
    };
  }

  private setStatusUpdating(id: number | string, isUpdating: boolean): void {
    const normalizedId = String(id);

    this.updatingStatusIds.update(state => {
      if (isUpdating) {
        return {
          ...state,
          [normalizedId]: true
        };
      }

      const nextState = { ...state };
      delete nextState[normalizedId];
      return nextState;
    });
  }

  private getStatusConfirmationMessage(
    counterparty: CounterpartyListItem,
    nextStatus: CounterpartyStatusUpdatePayload
  ): string {
    if (nextStatus.isActive) {
      return `Activate Counterparty?\n\n${counterparty.name} will become available for operations.`;
    }

    return `Deactivate Counterparty?\n\n${counterparty.name} will no longer be available for new operations.`;
  }

  private getErrorMessage(error: HttpErrorResponse): string {
    if (error.status === 415) {
      return 'The counterparty API rejected the media type for this request.';
    }

    if (error.status === 404) {
      return 'The counterparties endpoint is not available yet.';
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
