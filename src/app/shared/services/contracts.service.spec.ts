import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ContractListFilters, DashboardSummary, PagedContractResponse } from '../models/contract.model';
import { authInterceptor } from '../interceptors/auth.interceptor';
import { ContractsService } from './contracts.service';

describe('ContractsService', () => {
  let service: ContractsService;
  let httpTesting: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(withInterceptors([authInterceptor])), provideHttpClientTesting()]
    });

    localStorage.setItem('iris_auth_token', 'dashboard-token');
    service = TestBed.inject(ContractsService);
    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpTesting.verify();
    localStorage.removeItem('iris_auth_token');
  });

  it('requests the dashboard summary once with JWT authorization and preserves the response', () => {
    const expected: DashboardSummary = {
      totalContracts: 2,
      pendingReviewContracts: 2,
      boundActiveContracts: 0,
      actionRequiredContracts: 0,
      workflowDistribution: [{ status: 'Draft', count: 2, percentage: 100 }],
      recentContracts: [
        {
          idContract: 2,
          umr: 'B1235FAC2026-X',
          name: 'Property Facultative Contract STAR',
          cedentId: 2,
          cedentName: 'STAR Assurances',
          contractType: 'Facultative',
          status: 'Draft',
          currencyCode: 'TND',
          inceptionDate: '2026-09-20',
          expiryDate: '2027-08-10',
          updatedAt: '2026-08-20T11:24:44.4214526'
        }
      ]
    };
    let result: DashboardSummary | undefined;

    service.getDashboardSummary().subscribe(summary => {
      result = summary;
    });

    const request = httpTesting.expectOne('http://localhost:5151/api/contracts/dashboard-summary');
    expect(request.request.method).toBe('GET');
    expect(request.request.headers.get('Authorization')).toBe('Bearer dashboard-token');

    request.flush(expected);

    expect(result).toEqual(expected);
    expect(result?.recentContracts[0].umr).toBe('B1235FAC2026-X');
  });

  it('requests the first contract page with backend defaults and JWT authorization', () => {
    const filters: ContractListFilters = {
      pageNumber: 1,
      pageSize: 20,
      sortBy: 'updatedAt',
      sortDirection: 'desc'
    };
    const expected: PagedContractResponse = {
      items: [],
      pageNumber: 1,
      page: 1,
      pageSize: 20,
      totalCount: 0,
      totalPages: 0
    };
    let result: PagedContractResponse | undefined;

    service.getContracts(filters).subscribe(response => {
      result = response;
    });

    const request = httpTesting.expectOne(
      'http://localhost:5151/api/contracts?PageNumber=1&PageSize=20&SortBy=updatedAt&SortDirection=desc'
    );
    expect(request.request.method).toBe('GET');
    expect(request.request.headers.get('Authorization')).toBe('Bearer dashboard-token');
    request.flush(expected);

    expect(result).toEqual(expected);
  });

  it('sends every populated contract filter using the exact Swagger parameter name', () => {
    service.getContracts({
      pageNumber: 2,
      pageSize: 50,
      search: '  STAR  ',
      contractType: 'FACULTATIVE',
      status: 'Draft',
      counterpartyId: 2,
      currencyId: 3,
      inceptionFrom: '2026-01-01',
      inceptionTo: '2026-12-31',
      expiryFrom: '2027-01-01',
      expiryTo: '2027-12-31',
      sortBy: 'name',
      sortDirection: 'asc'
    }).subscribe();

    const request = httpTesting.expectOne(req => req.url === 'http://localhost:5151/api/contracts');
    expect(request.request.params.keys().sort()).toEqual([
      'ContractType',
      'CounterpartyId',
      'CurrencyId',
      'ExpiryFrom',
      'ExpiryTo',
      'InceptionFrom',
      'InceptionTo',
      'PageNumber',
      'PageSize',
      'Search',
      'SortBy',
      'SortDirection',
      'Status'
    ]);
    expect(request.request.params.get('Search')).toBe('STAR');
    expect(request.request.params.get('ContractType')).toBe('FACULTATIVE');
    expect(request.request.params.get('Status')).toBe('Draft');
    expect(request.request.params.get('CounterpartyId')).toBe('2');
    expect(request.request.params.get('CurrencyId')).toBe('3');
    expect(request.request.params.get('InceptionFrom')).toBe('2026-01-01');
    expect(request.request.params.get('InceptionTo')).toBe('2026-12-31');
    expect(request.request.params.get('ExpiryFrom')).toBe('2027-01-01');
    expect(request.request.params.get('ExpiryTo')).toBe('2027-12-31');
    expect(request.request.params.get('PageNumber')).toBe('2');
    expect(request.request.params.get('PageSize')).toBe('50');
    expect(request.request.params.get('SortBy')).toBe('name');
    expect(request.request.params.get('SortDirection')).toBe('asc');
    request.flush({ items: [], pageNumber: 2, page: 2, pageSize: 50, totalCount: 0, totalPages: 0 });
  });

  it('omits blank and invalid optional contract filters', () => {
    service.getContracts({
      pageNumber: 1,
      pageSize: 20,
      search: '   ',
      contractType: '',
      status: '',
      counterpartyId: 0,
      currencyId: -1,
      inceptionFrom: '',
      inceptionTo: '',
      expiryFrom: '',
      expiryTo: '',
      sortBy: 'updatedAt',
      sortDirection: 'desc'
    }).subscribe();

    const request = httpTesting.expectOne(req => req.url === 'http://localhost:5151/api/contracts');
    expect(request.request.params.keys()).toEqual(['PageNumber', 'PageSize', 'SortBy', 'SortDirection']);
    request.flush({ items: [], pageNumber: 1, page: 1, pageSize: 20, totalCount: 0, totalPages: 0 });
  });

  it('uses the backend contract-type code as identity without inventing a numeric ID', () => {
    let result: unknown;

    service.getContractTypes().subscribe(types => {
      result = types;
    });

    const request = httpTesting.expectOne('http://localhost:5151/api/reference-data/contract-types');
    request.flush([
      {
        code: 'FACULTATIVE',
        displayName: 'Facultative',
        description: 'Single-risk reinsurance.',
        isImplemented: true
      },
      {
        code: 'QUOTA_SHARE',
        displayName: 'Quota Share',
        description: 'Proportional treaty.',
        isImplemented: false
      },
      {
        code: 'QUOTA_SHARE',
        displayName: 'Duplicate Quota Share',
        description: '',
        isImplemented: false
      },
      {
        code: '',
        displayName: 'Invalid type',
        description: '',
        isImplemented: false
      }
    ]);

    expect(result).toEqual([
      {
        code: 'FACULTATIVE',
        name: 'Facultative',
        description: 'Single-risk reinsurance.',
        categoryTags: [],
        isImplemented: true
      },
      {
        code: 'QUOTA_SHARE',
        name: 'Quota Share',
        description: 'Proportional treaty.',
        categoryTags: [],
        isImplemented: false
      }
    ]);
  });
});
