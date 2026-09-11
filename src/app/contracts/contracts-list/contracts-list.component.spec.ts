import { HttpErrorResponse } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { Observable, of, throwError } from 'rxjs';
import type { Mock } from 'vitest';
import {
  ContractListFilters,
  ContractListItem,
  PagedContractResponse
} from '../../shared/models/contract.model';
import { ContractsService } from '../../shared/services/contracts.service';
import { ContractsListComponent } from './contracts-list.component';

describe('ContractsListComponent', () => {
  let fixture: ComponentFixture<ContractsListComponent>;
  let component: ContractsListComponent;
  let router: Router;
  let getContracts: Mock<(filters: ContractListFilters) => Observable<PagedContractResponse>>;
  let contractsService: Pick<ContractsService, 'getContracts' | 'getContractTypes' | 'getCurrencies' | 'searchCedents'>;

  const contracts: ContractListItem[] = [
    {
      idContract: 2,
      umr: 'IT26-F-PD-0001',
      name: 'Property Facultative Contract STAR',
      cedentId: 2,
      cedentName: 'STAR Assurances',
      contractType: 'Facultative',
      typeOfBusiness: 'Property',
      currencyId: 1,
      currencyCode: 'TND',
      status: 'Draft',
      receptionDate: '2026-08-20',
      inceptionDate: '2026-09-20',
      expiryDate: '2027-08-10',
      grossPremium: 125000,
      actionRequired: false,
      createdAt: '2026-08-20T10:00:00Z',
      updatedAt: '2026-08-20T11:24:44Z'
    },
    {
      idContract: 1,
      umr: '',
      name: 'Marine Facultative Contract',
      cedentId: 8,
      cedentName: 'Atlas Cedent',
      contractType: 'Facultative',
      typeOfBusiness: 'Marine',
      currencyId: 2,
      currencyCode: 'EUR',
      status: 'Draft',
      receptionDate: null,
      inceptionDate: '2026-10-01',
      expiryDate: '2027-09-30',
      grossPremium: null,
      actionRequired: false,
      createdAt: '2026-08-19T10:00:00Z',
      updatedAt: null
    }
  ];

  async function createComponent(): Promise<void> {
    fixture = TestBed.createComponent(ContractsListComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  beforeEach(async () => {
    getContracts = vi.fn<(filters: ContractListFilters) => Observable<PagedContractResponse>>()
      .mockImplementation(filters => of({
      items: contracts,
      pageNumber: filters.pageNumber,
      page: filters.pageNumber,
      pageSize: filters.pageSize,
      totalCount: 42,
      totalPages: 3
    }));

    contractsService = {
      getContracts: filters => getContracts(filters),
      getContractTypes: vi.fn().mockReturnValue(of([
        { code: 'FACULTATIVE', name: 'Facultative', description: '', categoryTags: [], isImplemented: true }
      ])),
      getCurrencies: vi.fn().mockReturnValue(of([
        { id: 1, code: 'TND', name: 'Tunisian Dinar', symbol: 'DT', decimalPlaces: 3, isDefault: true }
      ])),
      searchCedents: vi.fn().mockReturnValue(of({
        items: [{ id: 2, name: 'STAR Assurances', country: null, city: null }],
        pageNumber: 1,
        pageSize: 50,
        totalCount: 1,
        totalPages: 1
      }))
    };

    await TestBed.configureTestingModule({
      imports: [ContractsListComponent],
      providers: [
        provideRouter([]),
        { provide: ContractsService, useValue: contractsService }
      ]
    }).compileComponents();

    router = TestBed.inject(Router);
    await createComponent();
  });

  it('loads one initial portfolio request and the existing reference APIs', () => {
    expect(getContracts).toHaveBeenCalledTimes(1);
    expect(getContracts).toHaveBeenCalledWith({
      pageNumber: 1,
      pageSize: 20,
      search: '',
      contractType: '',
      status: '',
      counterpartyId: undefined,
      currencyId: undefined,
      inceptionFrom: '',
      inceptionTo: '',
      expiryFrom: '',
      expiryTo: '',
      sortBy: 'updatedAt',
      sortDirection: 'desc'
    });
    expect(contractsService.getContractTypes).toHaveBeenCalledOnce();
    expect(contractsService.getCurrencies).toHaveBeenCalledOnce();
    expect(contractsService.searchCedents).toHaveBeenCalledWith(null, 1, 50);
  });

  it('renders API contracts and tracks rows by their real contract ID', () => {
    const rows = fixture.nativeElement.querySelectorAll('tbody tr');
    const text = fixture.nativeElement.textContent;

    expect(rows).toHaveLength(2);
    expect(rows[0].getAttribute('data-contract-id')).toBe('2');
    expect(rows[1].getAttribute('data-contract-id')).toBe('1');
    expect(text).toContain('IT26-F-PD-0001');
    expect(text).toContain('Property Facultative Contract STAR');
    expect(text).toContain('STAR Assurances');
    expect(text).toContain('Reception');
    expect(text).not.toContain('Gross premium');
    expect(text).not.toContain('Portfolio data source required');
    expect(text).not.toContain('waiting for a backend portfolio endpoint');
  });

  it('routes contract View details actions to the overview page', () => {
    const row = fixture.nativeElement.querySelector('tbody tr[data-contract-id="2"]') as HTMLTableRowElement;
    const link = row.querySelector('a') as HTMLAnchorElement;

    expect(row.textContent).toContain('Draft');
    expect(link.getAttribute('href')).toContain('/workspace/reassurance/front-officer/contracts/new/overview');
    expect(link.getAttribute('href')).toContain('contractId=2');
  });

  it('sends one request after debouncing text search and resets to page one', async () => {
    component.filters.controls.search.setValue('STAR');
    component.filters.controls.search.setValue('STAR Property');

    await new Promise(resolve => setTimeout(resolve, 400));
    await fixture.whenStable();

    expect(getContracts).toHaveBeenCalledTimes(2);
    expect(getContracts.mock.calls.at(-1)?.[0]).toEqual(expect.objectContaining({
      pageNumber: 1,
      search: 'STAR Property'
    }));
  });

  it('preserves filters when requesting another backend page', async () => {
    component.filters.controls.contractType.setValue('FACULTATIVE');
    await fixture.whenStable();

    component.goToPage(2);
    await fixture.whenStable();

    expect(getContracts.mock.calls.at(-1)?.[0]).toEqual(expect.objectContaining({
      pageNumber: 2,
      contractType: 'FACULTATIVE',
      sortBy: 'updatedAt',
      sortDirection: 'desc'
    }));
  });

  it('requests backend sorting instead of sorting the returned page locally', async () => {
    const event = { target: { value: 'name' } } as unknown as Event;

    component.changeSort(event);
    await fixture.whenStable();

    expect(getContracts.mock.calls.at(-1)?.[0]).toEqual(expect.objectContaining({
      pageNumber: 1,
      sortBy: 'name',
      sortDirection: 'desc'
    }));
    expect(component.contracts()).toEqual(contracts);
  });

  it('shows an error with Retry instead of converting a failed request into an empty result', () => {
    getContracts.mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status: 500 })));

    component.loadContracts();
    fixture.detectChanges();

    expect(component.listState()).toBe('error');
    expect(fixture.nativeElement.textContent).toContain('Unable to load contracts');
    expect(fixture.nativeElement.textContent).not.toContain('No contracts match your filters');
    expect(Array.from(fixture.nativeElement.querySelectorAll('button')).some((button: unknown) =>
      (button as HTMLButtonElement).textContent?.trim() === 'Retry'
    )).toBe(true);
  });

  it('clears all filters, pagination, and sorting through one action', async () => {
    await router.navigate([], {
      queryParams: {
        search: 'STAR',
        contractType: 'FACULTATIVE',
        pageNumber: 2,
        pageSize: 50,
        sortBy: 'name',
        sortDirection: 'asc'
      }
    });
    component.clearFilters();
    await fixture.whenStable();

    expect(getContracts.mock.calls.at(-1)?.[0]).toEqual(expect.objectContaining({
      pageNumber: 1,
      pageSize: 20,
      search: '',
      contractType: '',
      sortBy: 'updatedAt',
      sortDirection: 'desc'
    }));
  });
});
