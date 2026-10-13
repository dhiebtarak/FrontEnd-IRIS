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
          umr: 'IT26-F-PD-0001',
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
    expect(result?.recentContracts[0].umr).toBe('IT26-F-PD-0001');
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

  it('loads Main Covers from the coverage catalog and maps backend field aliases', () => {
    service.getMainCovers().subscribe(result => {
      expect(result).toEqual([
        {
          id: 1,
          code: 'PD',
          name: 'Property Damage',
          level: 'MAIN',
          parentId: null,
          relationType: null,
          isMandatory: false,
          hasSlip: true,
          slipTemplateId: 10
        }
      ]);
    });

    const request = httpTesting.expectOne('http://localhost:5151/api/coverage-catalog/main-covers');
    expect(request.request.method).toBe('GET');
    expect(request.request.headers.get('Authorization')).toBe('Bearer dashboard-token');
    request.flush([
      {
        id_coverage_item: 1,
        coverage_code: 'PD',
        coverage_name: 'Property Damage',
        coverage_level: 'main',
        has_slip: true,
        id_slip_template: 10
      },
      {
        idCoverageItem: 2,
        coverageCode: 'PD-MB',
        coverageName: 'Machinery Breakdown',
        coverageLevel: 'SECTION',
        parentId: 1,
        relation_type: 'section'
      },
      {
        idCoverageItem: 7,
        coverageCode: 'PD-EXT',
        coverageName: 'Debris Removal',
        coverageLevel: 'EXTENSION',
        parentId: 1,
        relation_type: 'extension'
      }
    ]);
  });

  it('loads coverage children with the requested level query parameter', () => {
    service.getCoverageChildren(1, 'SECTION').subscribe(result => {
      expect(result).toEqual([
        {
          id: 2,
          code: 'PD-MB',
          name: 'Machinery Breakdown',
          level: 'SECTION',
          parentId: 1,
          relationType: 'HAS_SECTION',
          isMandatory: true,
          hasSlip: false,
          slipTemplateId: null
        }
      ]);
    });

    const request = httpTesting.expectOne(req =>
      req.url === 'http://localhost:5151/api/coverage-catalog/1/children'
      && req.params.get('level') === 'SECTION'
    );
    expect(request.request.method).toBe('GET');
    request.flush([
      {
        id: 2,
        code: 'PD-MB',
        name: 'Machinery Breakdown',
        level: 'SECTION',
        parentId: 1,
        relationType: 'SECTION',
        isMandatory: true,
        hasSlip: false
      }
    ]);
  });

  it('preserves coverageSelection on Facultative contract responses', () => {
    service.getFacultativeContract(7).subscribe(result => {
      expect(result.coverageSelection).toEqual({
        primaryMainCoverId: 1,
        coverageIds: [1],
        mainCoverId: 1,
        sectionIds: [2, 3],
        extensionIds: [7],
        mainCover: {
          id: 1,
          code: 'PD',
          name: 'Property Damage',
          level: 'MAIN',
          parentId: null,
          relationType: null,
          isMandatory: false,
          hasSlip: true,
          slipTemplateId: 10
        },
        sections: [],
        extensions: []
      });
      expect(result.panels).toEqual([
        {
          idPanel: 3,
          idContract: 7,
          idCounterparty: 9,
          reinsurerName: 'Global Re',
          role: 'Lead',
          writtenSharePct: 40,
          signedSharePct: 35,
          tsi: 400000,
          limitOfLiability: null,
          deductible: 2000,
          premiumRatePct: 1.2,
          grossPremium: 48000,
          brokeragePct: 2,
          otherDeductions: 300,
          netPremium: 46740,
          premiumReference: 'RE-PREM-1',
          status: 'Draft'
        }
      ]);
    });

    const request = httpTesting.expectOne('http://localhost:5151/api/contracts/facultative/7');
    request.flush({
      id: 7,
      status: 'Draft',
      name: 'Coverage Draft',
      counterpartyId: 2,
      currencyId: 1,
      inceptionDate: '2026-09-20',
      expiryDate: '2027-08-10',
      isHighPriority: false,
      isFronting: false,
      coverageSelection: {
        mainCoverId: 1,
        sectionIds: [2, 3],
        extensionIds: [7],
        mainCover: {
          id: 1,
          code: 'PD',
          name: 'Property Damage',
          hasSlip: true,
          slipTemplateId: 10
        },
        sections: [],
        extensions: []
      },
      panels: [
        {
          idPanel: 3,
          idContract: 7,
          idCounterparty: 9,
          reinsurerName: 'Global Re',
          role: 'Lead',
          writtenSharePct: 40,
          signedSharePct: 35,
          tsi: 400000,
          limitOfLiability: null,
          deductible: 2000,
          premiumRatePct: 1.2,
          grossPremium: 48000,
          brokeragePct: 2,
          otherDeductions: 300,
          netPremium: 46740,
          premiumReference: 'RE-PREM-1',
          status: 'Draft'
        }
      ]
    });
  });

  it('loads a contract overview from the backend overview endpoint', () => {
    service.getContractOverview(7).subscribe(result => {
      expect(result.contractId).toBe(7);
      expect(result.name).toBe('Coverage Draft');
      expect(result.netPremiumCedent).toBe(0);
      expect(result.netPremium).toBeNull();
    });

    const request = httpTesting.expectOne('http://localhost:5151/api/contracts/7/overview');
    expect(request.request.method).toBe('GET');
    expect(request.request.headers.get('Authorization')).toBe('Bearer dashboard-token');
    request.flush({
      idContract: 7,
      status: 'Ready for Placement',
      name: 'Coverage Draft',
      counterpartyId: 2,
      currencyId: 1,
      inceptionDate: '2026-09-20',
      expiryDate: '2027-08-10',
      netPremiumCedent: 0,
      isHighPriority: false,
      isFronting: false
    });
  });

  it('loads contract panels from the dedicated panels endpoint', () => {
    service.getContractPanels(123).subscribe(result => {
      expect(result).toEqual([
        {
          idPanel: 3,
          idContract: 123,
          idCounterparty: 9,
          reinsurerName: 'Global Re',
          role: 'Lead',
          writtenSharePct: 40,
          signedSharePct: 35,
          tsi: 400000,
          limitOfLiability: null,
          deductible: 2000,
          premiumRatePct: 1.2,
          grossPremium: 48000,
          brokeragePct: 2,
          otherDeductions: 300,
          netPremium: 46740,
          premiumReference: 'RE-PREM-1',
          status: 'Draft'
        }
      ]);
    });

    const request = httpTesting.expectOne('http://localhost:5151/api/contracts/123/panels');
    expect(request.request.method).toBe('GET');
    expect(request.request.headers.get('Authorization')).toBe('Bearer dashboard-token');
    request.flush([
      {
        idPanel: 3,
        idContract: 123,
        idCounterparty: 9,
        reinsurerName: 'Global Re',
        role: 'Lead',
        writtenSharePct: 40,
        signedSharePct: 35,
        tsi: 400000,
        deductible: 2000,
        premiumRatePct: 1.2,
        grossPremium: 48000,
        brokeragePct: 2,
        otherDeductions: 300,
        netPremium: 46740,
        premiumReference: 'RE-PREM-1',
        status: 'Draft'
      }
    ]);
  });

  it('creates a contract panel on the existing contracts API route', () => {
    service.createContractPanel(123, {
      idCounterparty: 9,
      writtenSharePct: 40,
      signedSharePct: 35,
      tsi: 400000,
      deductible: 2000,
      premiumRatePct: 1.2,
      grossPremium: 48000,
      brokeragePct: 2,
      otherDeductions: 300,
      premiumReference: 'RE-PREM-1'
    }).subscribe(result => {
      expect(result.status).toBe('PlacementInProgress');
      expect(result.panels?.[0].reinsurerName).toBe('Global Re');
      expect(result.panels?.[0].tsi).toBe(400000);
      expect(result.panels?.[0].premiumRatePct).toBe(1.2);
      expect(result.panels?.[0].brokeragePct).toBe(2);
      expect(result.panels?.[0].premiumReference).toBe('RE-PREM-1');
      expect(result.panels?.[0].netPremium).toBe(46740);
    });

    const request = httpTesting.expectOne('http://localhost:5151/api/contracts/123/panels');
    expect(request.request.method).toBe('POST');
    expect(request.request.headers.get('Authorization')).toBe('Bearer dashboard-token');
    expect(request.request.body).toEqual({
      idCounterparty: 9,
      writtenSharePct: 40,
      signedSharePct: 35,
      tsi: 400000,
      deductible: 2000,
      premiumRatePct: 1.2,
      grossPremium: 48000,
      brokeragePct: 2,
      otherDeductions: 300,
      premiumReference: 'RE-PREM-1'
    });
    request.flush({
      idContract: 123,
      umr: 'IT26-F-PD-0001',
      status: 'PlacementInProgress',
      name: 'Coverage Draft',
      counterpartyId: 2,
      currencyId: 1,
      inceptionDate: '2026-09-20',
      expiryDate: '2027-08-10',
      isHighPriority: false,
      isFronting: false,
      panels: [{
        idPanel: 3,
        idContract: 123,
        idCounterparty: 9,
        reinsurerName: 'Global Re',
        role: 'Lead',
        writtenSharePct: 40,
        signedSharePct: 35,
        tsi: 400000,
        deductible: 2000,
        premiumRatePct: 1.2,
        grossPremium: 48000,
        brokeragePct: 2,
        otherDeductions: 300,
        netPremium: 46740,
        premiumReference: 'RE-PREM-1',
        status: 'Draft'
      }]
    });
  });

  it('updates a contract panel on the panel-specific route', () => {
    service.updateContractPanel(123, 3, {
      idCounterparty: 9,
      writtenSharePct: 40,
      signedSharePct: 36,
      tsi: 400000,
      deductible: 2000,
      premiumRatePct: 1.2,
      grossPremium: 48000,
      brokeragePct: 2,
      otherDeductions: 300,
      premiumReference: 'RE-PREM-1',
      netPremium: 47000,
      status: 'Confirmed'
    }).subscribe(result => {
      expect(result.panels?.[0].signedSharePct).toBe(36);
      expect(result.panels?.[0].netPremium).toBe(47000);
      expect(result.panels?.[0].status).toBe('Confirmed');
    });

    const request = httpTesting.expectOne('http://localhost:5151/api/contracts/123/panels/3');
    expect(request.request.method).toBe('PUT');
    expect(request.request.headers.get('Authorization')).toBe('Bearer dashboard-token');
    expect(request.request.body).toEqual({
      idCounterparty: 9,
      writtenSharePct: 40,
      signedSharePct: 36,
      tsi: 400000,
      deductible: 2000,
      premiumRatePct: 1.2,
      grossPremium: 48000,
      brokeragePct: 2,
      otherDeductions: 300,
      premiumReference: 'RE-PREM-1',
      netPremium: 47000,
      status: 'Confirmed'
    });
    request.flush({
      idContract: 123,
      umr: 'IT26-F-PD-0001',
      status: 'PlacementInProgress',
      name: 'Coverage Draft',
      counterpartyId: 2,
      currencyId: 1,
      inceptionDate: '2026-09-20',
      expiryDate: '2027-08-10',
      isHighPriority: false,
      isFronting: false,
      panels: [{
        idPanel: 3,
        idContract: 123,
        idCounterparty: 9,
        reinsurerName: 'Global Re',
        role: 'Lead',
        writtenSharePct: 40,
        signedSharePct: 36,
        tsi: 400000,
        deductible: 2000,
        premiumRatePct: 1.2,
        grossPremium: 48000,
        brokeragePct: 2,
        otherDeductions: 300,
        netPremium: 47000,
        premiumReference: 'RE-PREM-1',
        status: 'Confirmed'
      }]
    });
  });

  it('confirms a contract panel on the confirm endpoint', () => {
    service.confirmContractPanel(123, 3).subscribe(result => {
      expect(result.status).toBe('Confirmed');
    });

    const request = httpTesting.expectOne('http://localhost:5151/api/contracts/123/panels/3/confirm');
    expect(request.request.method).toBe('POST');
    expect(request.request.headers.get('Authorization')).toBe('Bearer dashboard-token');
    request.flush({
      idPanel: 3,
      idContract: 123,
      idCounterparty: 9,
      reinsurerName: 'Global Re',
      role: 'Lead',
      status: 'Confirmed'
    });
  });

  it('starts the binding phase on the contract start-binding endpoint', () => {
    service.startBindingPhase(123).subscribe(result => {
      expect(result.status).toBe('Bound');
    });

    const request = httpTesting.expectOne('http://localhost:5151/api/contracts/123/start-binding');
    expect(request.request.method).toBe('POST');
    expect(request.request.headers.get('Authorization')).toBe('Bearer dashboard-token');
    request.flush({
      idContract: 123,
      umr: 'IT26-F-PD-0001',
      status: 'Bound',
      name: 'Coverage Draft',
      counterpartyId: 2,
      currencyId: 1,
      inceptionDate: '2026-09-20',
      expiryDate: '2027-08-10',
      isHighPriority: false,
      isFronting: false
    });
  });

  it('downloads contract slips as a blob and reads the response filename', () => {
    service.downloadContractSlips(123).subscribe(result => {
      expect(result.hasSlip).toBe(true);
      expect(result.filename).toBe('contract-slip.docx');
      expect(result.blob?.size).toBeGreaterThan(0);
    });

    const request = httpTesting.expectOne('http://localhost:5151/api/contracts/123/slips');
    expect(request.request.method).toBe('GET');
    expect(request.request.responseType).toBe('blob');
    request.flush(new Blob(['docx'], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }), {
      headers: { 'Content-Disposition': 'attachment; filename="contract-slip.docx"' }
    });
  });

  it('treats an empty slip response as unavailable', () => {
    service.downloadContractSlips(123).subscribe(result => {
      expect(result.hasSlip).toBe(false);
      expect(result.blob).toBeNull();
      expect(result.filename).toBeNull();
    });

    const request = httpTesting.expectOne('http://localhost:5151/api/contracts/123/slips');
    request.flush(new Blob([]));
  });
});
