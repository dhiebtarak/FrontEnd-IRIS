import { Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { debounceTime, forkJoin } from 'rxjs';
import { CedentReference, ContractTypeReference, CurrencyReference } from '../../shared/models/contract.model';
import { ContractsService } from '../../shared/services/contracts.service';

@Component({
  selector: 'app-contracts-list',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './contracts-list.component.html',
  styles: ``
})
export class ContractsListComponent implements OnInit {
  private readonly destroyRef = inject(DestroyRef);
  readonly contractTypes = signal<ContractTypeReference[]>([]);
  readonly currencies = signal<CurrencyReference[]>([]);
  readonly cedents = signal<CedentReference[]>([]);
  readonly isLoadingReferences = signal(true);
  readonly referenceError = signal('');
  readonly createContractRoute = '/workspace/reassurance/front-officer/contracts/new/type';

  readonly filters = new FormGroup({
    search: new FormControl('', { nonNullable: true }),
    contractType: new FormControl('', { nonNullable: true }),
    status: new FormControl('', { nonNullable: true }),
    counterpartyId: new FormControl('', { nonNullable: true }),
    currencyId: new FormControl('', { nonNullable: true }),
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
    this.hydrateFiltersFromUrl();
    this.loadReferenceData();

    this.filters.valueChanges
      .pipe(debounceTime(350), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.syncFiltersToUrl());
  }

  loadReferenceData(): void {
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
        },
        error: () => {
          this.referenceError.set('Contract filter reference data could not be loaded.');
          this.isLoadingReferences.set(false);
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
    });
  }

  private hydrateFiltersFromUrl(): void {
    const queryParams = this.route.snapshot.queryParamMap;

    this.filters.setValue(
      {
        search: queryParams.get('search') ?? '',
        contractType: queryParams.get('contractType') ?? '',
        status: queryParams.get('status') ?? '',
        counterpartyId: queryParams.get('counterpartyId') ?? '',
        currencyId: queryParams.get('currencyId') ?? '',
        inceptionFrom: queryParams.get('inceptionFrom') ?? '',
        inceptionTo: queryParams.get('inceptionTo') ?? '',
        expiryFrom: queryParams.get('expiryFrom') ?? '',
        expiryTo: queryParams.get('expiryTo') ?? ''
      },
      { emitEvent: false }
    );
  }

  private syncFiltersToUrl(): void {
    const value = this.filters.getRawValue();
    const queryParams = Object.fromEntries(
      Object.entries(value).map(([key, rawValue]) => [key, rawValue.trim() || null])
    );

    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams,
      replaceUrl: true
    });
  }
}
