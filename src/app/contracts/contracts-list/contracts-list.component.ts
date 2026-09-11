import { DatePipe, NgClass } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, ParamMap, Router, RouterLink } from '@angular/router';
import { Subscription, debounceTime, distinctUntilChanged, forkJoin, merge } from 'rxjs';
import {
  CedentReference,
  ContractListFilters,
  ContractListItem,
  ContractSortDirection,
  ContractSortField,
  ContractTypeReference,
  CurrencyReference
} from '../../shared/models/contract.model';
import { getContractStatusClasses, getContractStatusDisplay, normalizeContractStatus } from '../../shared/models/contract-status.util';
import { ContractsService } from '../../shared/services/contracts.service';

type ContractListState = 'loading' | 'loaded' | 'error';

@Component({
  selector: 'app-contracts-list',
  standalone: true,
  imports: [DatePipe, NgClass, ReactiveFormsModule, RouterLink],
  templateUrl: './contracts-list.component.html',
  styles: ``
})
export class ContractsListComponent implements OnInit {
  private readonly destroyRef = inject(DestroyRef);
  private listRequest?: Subscription;

  readonly contracts = signal<ContractListItem[]>([]);
  readonly contractTypes = signal<ContractTypeReference[]>([]);
  readonly currencies = signal<CurrencyReference[]>([]);
  readonly cedents = signal<CedentReference[]>([]);
  readonly listState = signal<ContractListState>('loading');
  readonly errorMessage = signal('');
  readonly isLoadingReferences = signal(true);
  readonly referenceError = signal('');
  readonly pageNumber = signal(1);
  readonly pageSize = signal(20);
  readonly totalCount = signal(0);
  readonly totalPages = signal(0);
  readonly sortBy = signal<ContractSortField>('updatedAt');
  readonly sortDirection = signal<ContractSortDirection>('desc');
  readonly startItem = computed(() => this.totalCount() === 0 ? 0 : (this.pageNumber() - 1) * this.pageSize() + 1);
  readonly endItem = computed(() => Math.min(this.pageNumber() * this.pageSize(), this.totalCount()));
  readonly isLoading = computed(() => this.listState() === 'loading');
  readonly createContractRoute = '/workspace/reassurance/front-officer/contracts/new/type';
  readonly overviewRoute = '/workspace/reassurance/front-officer/contracts/new/overview';
  readonly pageSizeOptions = [10, 20, 50, 100];
  readonly contractStatuses = ['Draft', 'ReadyForPlacement', 'PlacementInProgress', 'Bound', 'Expired', 'Cancelled'];
  readonly sortOptions: ReadonlyArray<{ value: ContractSortField; label: string }> = [
    { value: 'updatedAt', label: 'Last update' },
    { value: 'createdAt', label: 'Created date' },
    { value: 'name', label: 'Contract name' },
    { value: 'umr', label: 'UMR' },
    { value: 'cedentName', label: 'Cedent' },
    { value: 'contractType', label: 'Contract type' },
    { value: 'status', label: 'Status' },
    { value: 'receptionDate', label: 'Reception date' },
    { value: 'inceptionDate', label: 'Inception date' },
    { value: 'expiryDate', label: 'Expiry date' }
  ];

  readonly filters = new FormGroup({
    search: new FormControl('', { nonNullable: true }),
    contractType: new FormControl({ value: '', disabled: true }, { nonNullable: true }),
    status: new FormControl('', { nonNullable: true }),
    counterpartyId: new FormControl({ value: '', disabled: true }, { nonNullable: true }),
    currencyId: new FormControl({ value: '', disabled: true }, { nonNullable: true }),
    inceptionFrom: new FormControl('', { nonNullable: true }),
    inceptionTo: new FormControl('', { nonNullable: true }),
    expiryFrom: new FormControl('', { nonNullable: true }),
    expiryTo: new FormControl('', { nonNullable: true })
  });

  constructor(
    private readonly contractsService: ContractsService,
    private readonly route: ActivatedRoute,
    private readonly router: Router
  ) {}

  ngOnInit(): void {
    this.bindFilterChanges();

    this.route.queryParamMap
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(params => {
        this.hydrateStateFromUrl(params);
        this.loadContracts();
      });

    this.loadReferenceData();
  }

  loadContracts(): void {
    this.listRequest?.unsubscribe();
    this.listState.set('loading');
    this.errorMessage.set('');
    this.contracts.set([]);

    this.listRequest = this.contractsService.getContracts(this.currentFilters())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: response => {
          this.contracts.set(response.items);
          this.pageNumber.set(response.pageNumber);
          this.pageSize.set(response.pageSize);
          this.totalCount.set(response.totalCount);
          this.totalPages.set(response.totalPages);
          this.listState.set('loaded');
        },
        error: (error: HttpErrorResponse) => {
          this.errorMessage.set(this.getListErrorMessage(error));
          this.listState.set('error');
        }
      });
  }

  loadReferenceData(): void {
    this.setReferenceFilterControlsDisabled(true);
    this.isLoadingReferences.set(true);
    this.referenceError.set('');

    forkJoin({
      contractTypes: this.contractsService.getContractTypes(),
      currencies: this.contractsService.getCurrencies(),
      cedents: this.contractsService.searchCedents(null, 1, 50)
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: response => {
          this.contractTypes.set(response.contractTypes);
          this.currencies.set(response.currencies);
          this.cedents.set(response.cedents.items);
          this.isLoadingReferences.set(false);
          this.setReferenceFilterControlsDisabled(false);
        },
        error: () => {
          this.referenceError.set('Contract filter reference data could not be loaded.');
          this.isLoadingReferences.set(false);
          this.setReferenceFilterControlsDisabled(false);
        }
      });
  }

  clearFilters(): void {
    this.filters.reset({
      search: '',
      contractType: '',
      status: '',
      counterpartyId: '',
      currencyId: '',
      inceptionFrom: '',
      inceptionTo: '',
      expiryFrom: '',
      expiryTo: ''
    }, { emitEvent: false });

    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {
        search: null,
        contractType: null,
        status: null,
        counterpartyId: null,
        currencyId: null,
        inceptionFrom: null,
        inceptionTo: null,
        expiryFrom: null,
        expiryTo: null,
        pageNumber: 1,
        pageSize: 20,
        sortBy: 'updatedAt',
        sortDirection: 'desc'
      },
      queryParamsHandling: 'merge',
      replaceUrl: true
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

  changeSort(event: Event): void {
    const sortBy = (event.target as HTMLSelectElement).value as ContractSortField;

    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { pageNumber: 1, sortBy },
      queryParamsHandling: 'merge'
    });
  }

  toggleSortDirection(): void {
    const sortDirection: ContractSortDirection = this.sortDirection() === 'asc' ? 'desc' : 'asc';

    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { pageNumber: 1, sortDirection },
      queryParamsHandling: 'merge'
    });
  }

  isFacultative(contract: ContractListItem): boolean {
    return contract.contractType?.toLowerCase() === 'facultative';
  }

  isReadyForPlacement(contract: ContractListItem): boolean {
    return normalizeContractStatus(contract.status) === 'readyforplacement';
  }

  getDisplayStatus(contract: Pick<ContractListItem, 'status'>): string {
    return getContractStatusDisplay(contract.status);
  }

  getDetailsRoute(contract: ContractListItem): string {
    return this.overviewRoute;
  }

  getDetailsQueryParams(contract: ContractListItem): { contractId: number } {
    return { contractId: contract.idContract };
  }

  getStatusClasses(status: string): string {
    return getContractStatusClasses(status);
  }

  private bindFilterChanges(): void {
    this.filters.controls.search.valueChanges
      .pipe(
        debounceTime(350),
        distinctUntilChanged(),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe(() => this.applyFilters());

    merge(
      this.filters.controls.contractType.valueChanges,
      this.filters.controls.status.valueChanges,
      this.filters.controls.counterpartyId.valueChanges,
      this.filters.controls.currencyId.valueChanges,
      this.filters.controls.inceptionFrom.valueChanges,
      this.filters.controls.inceptionTo.valueChanges,
      this.filters.controls.expiryFrom.valueChanges,
      this.filters.controls.expiryTo.valueChanges
    )
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.applyFilters());
  }

  private applyFilters(): void {
    const value = this.filters.getRawValue();

    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {
        search: this.toQueryValue(value.search),
        contractType: this.toQueryValue(value.contractType),
        status: this.toQueryValue(value.status),
        counterpartyId: this.toQueryValue(value.counterpartyId),
        currencyId: this.toQueryValue(value.currencyId),
        inceptionFrom: this.toQueryValue(value.inceptionFrom),
        inceptionTo: this.toQueryValue(value.inceptionTo),
        expiryFrom: this.toQueryValue(value.expiryFrom),
        expiryTo: this.toQueryValue(value.expiryTo),
        pageNumber: 1
      },
      queryParamsHandling: 'merge',
      replaceUrl: true
    });
  }

  private hydrateStateFromUrl(params: ParamMap): void {
    this.filters.setValue({
      search: params.get('search') ?? '',
      contractType: params.get('contractType') ?? '',
      status: params.get('status') ?? '',
      counterpartyId: params.get('counterpartyId') ?? '',
      currencyId: params.get('currencyId') ?? '',
      inceptionFrom: params.get('inceptionFrom') ?? '',
      inceptionTo: params.get('inceptionTo') ?? '',
      expiryFrom: params.get('expiryFrom') ?? '',
      expiryTo: params.get('expiryTo') ?? ''
    }, { emitEvent: false });

    this.pageNumber.set(this.parsePositiveInteger(params.get('pageNumber'), 1));
    this.pageSize.set(Math.min(this.parsePositiveInteger(params.get('pageSize'), 20), 100));
    this.sortBy.set(this.parseSortField(params.get('sortBy')));
    this.sortDirection.set(params.get('sortDirection')?.toLowerCase() === 'asc' ? 'asc' : 'desc');
  }

  private currentFilters(): ContractListFilters {
    const value = this.filters.getRawValue();

    return {
      pageNumber: this.pageNumber(),
      pageSize: this.pageSize(),
      search: value.search,
      contractType: value.contractType,
      status: value.status,
      counterpartyId: this.parseOptionalPositiveInteger(value.counterpartyId),
      currencyId: this.parseOptionalPositiveInteger(value.currencyId),
      inceptionFrom: value.inceptionFrom,
      inceptionTo: value.inceptionTo,
      expiryFrom: value.expiryFrom,
      expiryTo: value.expiryTo,
      sortBy: this.sortBy(),
      sortDirection: this.sortDirection()
    };
  }

  private parseSortField(value: string | null): ContractSortField {
    return this.sortOptions.some(option => option.value === value) ? value as ContractSortField : 'updatedAt';
  }

  private parsePositiveInteger(value: string | null, fallback: number): number {
    const parsedValue = Number(value);
    return Number.isInteger(parsedValue) && parsedValue > 0 ? parsedValue : fallback;
  }

  private parseOptionalPositiveInteger(value: string): number | undefined {
    const parsedValue = Number(value);
    return Number.isInteger(parsedValue) && parsedValue > 0 ? parsedValue : undefined;
  }

  private toQueryValue(value: string): string | null {
    return value.trim() || null;
  }

  private setReferenceFilterControlsDisabled(isDisabled: boolean): void {
    const controls = [
      this.filters.controls.contractType,
      this.filters.controls.counterpartyId,
      this.filters.controls.currencyId
    ];

    for (const control of controls) {
      if (isDisabled) {
        control.disable({ emitEvent: false });
      } else {
        control.enable({ emitEvent: false });
      }
    }
  }

  private getListErrorMessage(error: HttpErrorResponse): string {
    if (error.status === 400) {
      return 'The contract filters were rejected by the backend.';
    }

    if (error.status === 401 || error.status === 403) {
      return 'Your session is not authorized to load the contract portfolio.';
    }

    if (error.status === 404) {
      return 'The contract portfolio endpoint is not available.';
    }

    if (error.status === 0) {
      return 'Unable to reach the contract service.';
    }

    return 'Contracts could not be loaded right now.';
  }
}
