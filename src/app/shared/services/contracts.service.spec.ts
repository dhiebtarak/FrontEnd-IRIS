import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { DashboardSummary } from '../models/contract.model';
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
