import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ToastrService } from 'ngx-toastr';
import { BehaviorSubject } from 'rxjs';
import { ContractOverviewComponent } from './contract-overview.component';

describe('ContractOverviewComponent', () => {
  let fixture: ComponentFixture<ContractOverviewComponent>;
  let component: ContractOverviewComponent;
  let httpMock: HttpTestingController;
  let router: Router;
  let snackBar: { open: ReturnType<typeof vi.fn> };
  let paramMapSubject: BehaviorSubject<ReturnType<typeof convertToParamMap>>;
  let queryParamMapSubject: BehaviorSubject<ReturnType<typeof convertToParamMap>>;

  const contractResponse = {
    id: 123,
    umr: 'IT26-F-PD-0001',
    name: 'Property Facultative Contract STAR',
    contractType: 'Facultative',
    status: 'PlacementInProgress',
    allowedActions: ['ModifyContract', 'AddReinsurer', 'CancelContract', 'StartBinding', 'EditPlacement'],
    counterpartyId: 2,
    cedent: { id: 2, name: 'STAR Assurances' },
    currencyId: 1,
    currency: { id: 1, code: 'TND', name: 'Tunisian Dinar', symbol: 'DT', decimalPlaces: 3, isDefault: true },
    receptionDate: '2026-08-20',
    inceptionDate: '2026-09-20',
    expiryDate: '2027-08-10',
    writtenSharePct: 100,
    signedSharePct: 100,
    fees: 10,
    isHighPriority: false,
    sumInsured: 1000000,
    deductible: 5000,
    premiumRate: 1.25,
    grossPremium: 125000,
    cedentCommissionPct: 10,
    cedentCommissionAmount: 12500,
    netPremium: 112500,
    netPremiumCedent: 112500,
    cedentPremiumReference: null,
    isFronting: false,
    frontingReference: null,
    memoText: null,
    createdBy: 'Front Officer',
    createdAt: '2026-08-31T09:15:00',
    coverageSelection: {
      mainCoverId: 1,
      sectionIds: [2],
      extensionIds: [7],
      mainCover: { id: 1, code: 'PD', name: 'Property Damage', hasSlip: true, slipTemplateId: 10 },
      sections: [{ id: 2, code: 'PD-MB', name: 'Machinery Breakdown', hasSlip: false, slipTemplateId: null }],
      extensions: [{ id: 7, code: 'PD-EXT', name: 'Debris Removal', hasSlip: true, slipTemplateId: 11 }]
    }
  };

  const panelsResponse = [
    {
      idPanel: 44,
      idContract: 123,
      idCounterparty: 9,
      reinsurerName: 'Global Re',
      role: 'Lead',
      writtenSharePct: 50,
      signedSharePct: 45,
      tsi: 500000,
      deductible: 2500,
      premiumRatePct: 1.1,
      grossPremium: 55000,
      brokeragePct: 2,
      otherDeductions: 1000,
      netPremium: 52900,
      premiumReference: 'RE-PREM-1',
      status: 'Draft'
    }
  ];

  const invoiceContextResponse = {
    contractId: 123,
    currency: 'TND',
    status: 'Bound',
    contractGrossPremium: 1500,
    pairedAmount: 1500,
    alreadyInvoicedAmount: 250,
    remainingInvoiceableAmount: 1250,
    invoiceableGrossPremium: 1500,
    previousInvoices: [],
    receiptAllocations: [{
      receiptAllocationId: 15,
      receiptReference: 'ENC-2026-001',
      allocatedAmount: 1500,
      alreadyInvoicedAmount: 250,
      availableAmount: 1250,
      currencyCode: 'TND'
    }],
    reinsurerPanels: [{
      panelId: 44,
      counterpartyId: 9,
      reinsurerName: 'Global Re',
      signedSharePct: 45,
      status: 'Confirmed'
    }]
  };

  const invoiceResponse = {
    invoiceId: 91,
    contractId: 123,
    invoiceNumber: 'INV-2026-000001',
    sequence: 1,
    invoiceType: 'CEDENT_PREMIUM_DEBIT_NOTE',
    invoiceDate: '2026-09-23',
    invoiceableGrossPremium: 1500,
    grossAmount: 500,
    alreadyInvoicedAmount: 750,
    remainingAmount: 750,
    totalNetAmount: 440,
    currencyCode: 'TND',
    status: 'Draft',
    label: '',
    allocations: []
  };

  beforeEach(async () => {
    localStorage.clear();
    snackBar = { open: vi.fn() };
    paramMapSubject = new BehaviorSubject(convertToParamMap({}));
    queryParamMapSubject = new BehaviorSubject(convertToParamMap({ contractId: '123' }));

    await TestBed.configureTestingModule({
      imports: [ContractOverviewComponent],
      providers: [
        provideRouter([]),
        provideNoopAnimations(),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: ToastrService, useValue: { success: vi.fn(), error: vi.fn() } },
        {
          provide: ActivatedRoute,
          useValue: {
            paramMap: paramMapSubject.asObservable(),
            queryParamMap: queryParamMapSubject.asObservable(),
            snapshot: {
              data: {},
              paramMap: convertToParamMap({}),
              queryParamMap: convertToParamMap({ contractId: '123' })
            }
          }
        }
      ]
    })
      .overrideProvider(MatSnackBar, { useValue: snackBar })
      .compileComponents();

    router = TestBed.inject(Router);
    vi.spyOn(router, 'navigate').mockResolvedValue(true);
    vi.spyOn(window.URL, 'createObjectURL').mockReturnValue('blob:contract-slip');
    vi.spyOn(window.URL, 'revokeObjectURL').mockImplementation(() => undefined);
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);

    fixture = TestBed.createComponent(ContractOverviewComponent);
    component = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
  });

  afterEach(() => {
    httpMock.verify();
    localStorage.clear();
    vi.restoreAllMocks();
  });

  function flushContract(
    contractId = 123,
    response: Record<string, unknown> = contractResponse,
    panels: Record<string, unknown>[] = panelsResponse
  ): void {
    httpMock.expectOne(`http://localhost:5151/api/contracts/${contractId}/overview`).flush(response);
    httpMock.expectOne(`http://localhost:5151/api/contracts/${contractId}/panels`).flush(panels);
    fixture.detectChanges();
  }

  function normalizedMoney(value: string | undefined): string {
    return (value ?? '').replace(/\u202f/g, '').replace(/\s/g, '').replace(',', '.');
  }

  function enableBackOfficeMode(): void {
    localStorage.setItem('iris_auth_workspace', JSON.stringify({ position: 'BackOfficer' }));
    TestBed.inject(ActivatedRoute).snapshot.data = { workspace: 'back-office' };
    (component as unknown as { isBackOfficeMode: () => boolean }).isBackOfficeMode = () => true;
  }

  function flushInvoiceContextAndHistory(
    context: Record<string, unknown> = invoiceContextResponse,
    history: Record<string, unknown>[] = []
  ): void {
    httpMock.expectOne('http://localhost:5151/api/back-office/contracts/123/invoice-context').flush(context);
    httpMock.expectOne('http://localhost:5151/api/back-office/contracts/123/invoices').flush(history);
  }

  it('loads and renders the saved contract overview from the draft contract ID', () => {
    flushContract();

    const text = fixture.nativeElement.textContent;
    expect(text).toContain('IT26-F-PD-0001');
    expect(text).toContain('Property Facultative Contract STAR');
    expect(text).toContain('STAR Assurances');
    expect(text).toContain('TND');
    expect(text).toContain('PD - Property Damage');
    expect(text).toContain('PD-MB - Machinery Breakdown');
    expect(text).toContain('PD-EXT - Debris Removal');
    expect(text).toContain('Sum Insured');
    expect(text).toContain('Limit of Liability');
    expect(text).toContain('Gross premium');
    expect(text).toContain('Placement in progress');
    expect(text).toContain('Global Re');
    expect(text).toContain('Add Reinsurer');
    expect(text).toContain('Start Binding Phase');
    expect(text).not.toContain('Dashboard / Create Contract');
    expect(text).not.toContain('Step 1');
    expect(text).not.toContain('Save Draft');
    expect(text).not.toContain('Start Placement');
  });

  it('calculates the contract net premium from gross premium minus cedent commission and ignores reinsurer panel net premium', () => {
    flushContract(123, {
      ...contractResponse,
      sumInsured: 100000,
      premiumRate: 2,
      grossPremium: 50000,
      cedentCommissionPct: 5,
      cedentCommissionAmount: 2500,
      netPremium: 47500,
      netPremiumCedent: null
    }, [{
      ...panelsResponse[0],
      tsi: 100000,
      premiumRatePct: 2,
      grossPremium: 2000,
      brokeragePct: 10,
      netPremium: 1900
    }]);

    const rows = component.contractFinancialRows();

    expect(normalizedMoney(rows.find(row => row.label === 'Gross premium')?.value)).toBe('TND2000.000');
    expect(rows.some(row => row.label === 'IRIS Commission')).toBe(false);
    expect(rows.find(row => row.label === 'Premium rate')?.value).toBe('2%');
    expect(rows.find(row => row.label === 'Cedent Commission')?.value).toBe('5%');
    expect(normalizedMoney(rows.find(row => row.label === 'Net Premium')?.value)).toBe('TND1900.000');
  });

  it('calculates contract net premium from the displayed gross premium instead of stale persisted values', () => {
    flushContract(123, {
      ...contractResponse,
      sumInsured: 100000,
      premiumRate: 0.05,
      grossPremium: null,
      cedentCommissionPct: 10,
      cedentCommission: 4000,
      netPremium: 4600,
      netPremiumCedent: 4500
    }, [{
      ...panelsResponse[0],
      tsi: 100000,
      premiumRatePct: 0.05,
      grossPremium: 50,
      brokeragePct: 10
    }]);

    const rows = component.contractFinancialRows();

    expect(normalizedMoney(rows.find(row => row.label === 'Gross premium')?.value)).toBe('TND50.000');
    expect(rows.find(row => row.label === 'Premium rate')?.value).toBe('0.05%');
    expect(rows.find(row => row.label === 'Cedent Commission')?.value).toBe('10%');
    expect(normalizedMoney(rows.find(row => row.label === 'Net Premium')?.value)).toBe('TND45.000');
  });

  it('shows zero cedent commission as a monetary zero', () => {
    flushContract(123, {
      ...contractResponse,
      sumInsured: 100000,
      premiumRate: 2,
      grossPremium: null,
      cedentCommissionPct: 0,
      netPremium: 2000,
      netPremiumCedent: null
    }, [{
      ...panelsResponse[0],
      tsi: 100000,
      premiumRatePct: 2,
      grossPremium: 2000,
      brokeragePct: 10
    }]);

    expect(component.contractFinancialRows().find(row => row.label === 'Cedent Commission')?.value).toBe('0%');
  });

  it('shows a zero contract net premium as a monetary zero', () => {
    flushContract(123, {
      ...contractResponse,
      grossPremium: 4000,
      cedentCommissionPct: 100,
      netPremium: 0,
      netPremiumCedent: 0
    });

    expect(normalizedMoney(component.contractFinancialRows().find(row => row.label === 'Net Premium')?.value)).toBe('TND0.000');
  });

  it('does not render NaN when optional financial values are missing', () => {
    flushContract(123, {
      ...contractResponse,
      sumInsured: null,
      premiumRate: null,
      grossPremium: null,
      cedentCommissionPct: null,
      netPremium: undefined,
      netPremiumCedent: null
    }, []);

    const rows = component.contractFinancialRows();

    expect(rows.find(row => row.label === 'Gross premium')?.value).toBe('Not provided');
    expect(rows.find(row => row.label === 'Cedent Commission')?.value).toBe('Not provided');
    expect(rows.find(row => row.label === 'Net Premium')?.value).toBe('Not provided');
    expect(fixture.nativeElement.textContent).not.toContain('NaN');
  });

  it('shows the same persisted values and formulas after reloading another contract overview', () => {
    flushContract();

    queryParamMapSubject.next(convertToParamMap({ contractId: '456' }));
    httpMock.expectOne('http://localhost:5151/api/contracts/456/overview').flush({
      ...contractResponse,
      id: 456,
      contractId: 456,
      sumInsured: 100000,
      premiumRate: 2,
      grossPremium: null,
      cedentCommissionPct: 5,
      netPremium: 1900,
      netPremiumCedent: null
    });
    httpMock.expectOne('http://localhost:5151/api/contracts/456/panels').flush([{
      ...panelsResponse[0],
      idPanel: 77,
      idContract: 456,
      tsi: 100000,
      premiumRatePct: 2,
      grossPremium: 2000,
      brokeragePct: 10
    }]);
    fixture.detectChanges();

    const rows = component.contractFinancialRows();
    expect(normalizedMoney(rows.find(row => row.label === 'Gross premium')?.value)).toBe('TND2000.000');
    expect(normalizedMoney(rows.find(row => row.label === 'Net Premium')?.value)).toBe('TND1900.000');
  });

  it('routes Back to the Information form with the same contract ID', () => {
    flushContract();

    component.backToInformation();

    expect(router.navigate).toHaveBeenCalledWith(['/workspace/reassurance/front-officer/contracts/new/facultative'], {
      queryParams: { contractId: 123 }
    });
  });

  it('opens the Add Reinsurer form with only Reinsurer counterparties and creates a panel', () => {
    flushContract();

    component.openReinsurerForm();
    const reinsurerLookup = httpMock.expectOne(req =>
      req.url === 'http://localhost:5151/api/counterparties'
      && req.params.get('type') === 'Reinsurer'
      && req.params.get('pageNumber') === '1'
      && req.params.get('pageSize') === '20'
    );
    reinsurerLookup.flush({
      items: [{ id: 9, name: 'Global Re', types: ['Reinsurer'], email: null, status: 'Active', isActive: true, legacyClientId: null, legacyCompanyCode: null }],
      pageNumber: 1,
      pageSize: 20,
      totalCount: 1,
      totalPages: 1
    });

    component.selectReinsurer({ id: 9, name: 'Global Re', types: ['Reinsurer'], email: null, status: 'Active', isActive: true, legacyClientId: null, legacyCompanyCode: null });
    component.panelForm.patchValue({
      writtenSharePct: 40,
      signedSharePct: 35,
      sumInsured: 400000,
      limitOfLiability: 100000,
      deductible: 2000,
      premiumRate: 1.2,
      grossPremium: 48000,
      brokerageIrisPct: 2,
      otherDeductions: 300,
      reinsurancePremiumReference: 'RE-PREM-2'
    });

    component.submitReinsurerPanel();
    const createPanel = httpMock.expectOne('http://localhost:5151/api/contracts/123/panels');
    expect(createPanel.request.method).toBe('POST');
    expect(createPanel.request.body).toEqual({
      idCounterparty: 9,
      writtenSharePct: 40,
      signedSharePct: 35,
      tsi: 400000,
      limitOfLiability: 100000,
      deductible: 2000,
      premiumRatePct: 1.2,
      grossPremium: 4200,
      brokeragePct: 2,
      otherDeductions: 300,
      premiumReference: 'RE-PREM-2'
    });
    createPanel.flush({
      ...contractResponse,
      status: 'PlacementInProgress',
      panels: [
        ...panelsResponse,
        { idPanel: 45, idContract: 123, idCounterparty: 9, reinsurerName: 'Global Re', role: 'Follower', status: 'Draft' }
      ]
    });
    httpMock.expectOne('http://localhost:5151/api/contracts/123/panels').flush([
      ...panelsResponse,
      { idPanel: 45, idContract: 123, idCounterparty: 9, reinsurerName: 'Global Re', role: 'Follower', status: 'Draft' }
    ]);
    fixture.detectChanges();

    expect(component.isReinsurerFormOpen()).toBe(false);
    expect(component.activePanelId()).toBe(45);
  });

  it('prefills Add Reinsurer financials, shows available share and recalculates read-only amounts', () => {
    flushContract(123, {
      ...contractResponse,
      signedSharePct: 100,
      sumInsured: 100000,
      premiumRate: 0.05,
      cedentCommissionPct: 10
    }, [{
      ...panelsResponse[0],
      signedSharePct: 90
    }]);

    component.openReinsurerForm();
    httpMock.expectOne(req =>
      req.url === 'http://localhost:5151/api/counterparties'
      && req.params.get('type') === 'Reinsurer'
    ).flush({ items: [], pageNumber: 1, pageSize: 20, totalCount: 0, totalPages: 0 });
    fixture.detectChanges();

    expect(component.availableShare()).toBe(10);
    expect(component.panelForm.controls.sumInsured.value).toBe(100000);
    expect(component.panelForm.controls.premiumRate.value).toBe(0.05);
    expect(component.panelForm.controls.cedentCommissionPct.value).toBe(10);
    expect(fixture.nativeElement.textContent).toContain('Available Share: 10%');

    component.panelForm.patchValue({
      writtenSharePct: 10,
      signedSharePct: 5,
      brokerageIrisPct: 5,
      deductible: 0
    });

    expect(component.panelForm.controls.grossPremium.value).toBe(25);
    expect(component.panelForm.controls.cedentCommissionAmount.value).toBe(2.5);
    expect(component.panelForm.controls.brokerageIrisAmount.value).toBe(1.25);
    expect(component.panelForm.controls.netPremium.value).toBe(21.25);

    component.panelForm.controls.limitOfLiability.setValue(20000);
    component.panelForm.controls.deductibleMode.setValue('percentage');
    component.panelForm.controls.deductiblePct.setValue(5);

    expect(component.panelForm.controls.limitOfLiability.value).toBe(20000);
    expect(component.panelForm.controls.deductible.value).toBe(1.25);
    expect(component.panelForm.controls.netPremium.value).toBe(21.25);

    component.panelForm.controls.otherDeductions.setValue(7);
    expect(component.panelForm.controls.netPremium.value).toBe(14.25);

    component.panelForm.controls.signedSharePct.setValue(11);
    expect(component.panelForm.controls.signedSharePct.hasError('exceedsWrittenShare')).toBe(true);
    expect(component.panelForm.controls.signedSharePct.hasError('exceedsAvailableShare')).toBe(true);

    component.panelForm.patchValue({
      signedSharePct: 10,
      otherDeductions: 43
    });
    expect(component.panelForm.controls.netPremium.hasError('deductionsExceedGrossPremium')).toBe(true);
    expect(component.panelForm.invalid).toBe(true);
  });

  it('opens the selected reinsurer panel in edit mode and updates it', () => {
    flushContract();
    component.selectPanelTab(component.panels()[0]);
    component.contract.set({ ...component.contract()!, contractId: 0 });

    component.openEditPlacement(component.panels()[0]);
    fixture.detectChanges();

    expect(component.panelFormMode()).toBe('edit');
    expect(component.panelForm.controls.reinsurerId.value).toBe(9);
    expect(component.panelForm.controls.reinsurerId.disabled).toBe(true);
    expect(component.reinsurerSearchControl.value).toBe('Global Re');
    expect(component.reinsurerSearchControl.disabled).toBe(true);
    expect(component.panelForm.controls.netPremium.value).toBe(3356);
    expect(component.panelForm.controls.status.value).toBe('Draft');
    expect(fixture.nativeElement.textContent).not.toContain('No Reinsurer counterparties found.');
    expect(fixture.nativeElement.textContent).not.toContain('Select a Reinsurer from the list.');

    component.panelForm.patchValue({
      signedSharePct: 46,
      status: 'Confirmed'
    });
    component.submitReinsurerPanel();

    const updateRequest = httpMock.expectOne('http://localhost:5151/api/contracts/123/panels/44');
    expect(updateRequest.request.method).toBe('PUT');
    expect(updateRequest.request.body).toEqual(expect.objectContaining({
      idCounterparty: 9,
      signedSharePct: 46,
      tsi: 500000,
      premiumRatePct: 1.1,
      brokeragePct: 2,
      premiumReference: 'RE-PREM-1',
      grossPremium: 5060,
      netPremium: 3452.8,
      status: 'Confirmed'
    }));
    updateRequest.flush({
      ...contractResponse,
      panels: [
        { ...panelsResponse[0], signedSharePct: 46, netPremium: 53000, status: 'Confirmed' }
      ]
    });
    httpMock.expectOne('http://localhost:5151/api/contracts/123/panels').flush([
      { ...panelsResponse[0], signedSharePct: 46, netPremium: 53000, status: 'Confirmed' }
    ]);
    fixture.detectChanges();

    expect(component.isReinsurerFormOpen()).toBe(false);
    expect(component.activePanelId()).toBe(44);
    expect(component.activePanel()?.status).toBe('Confirmed');
  });

  it('clears stale reinsurer tabs immediately when navigating from a contract with panels to one without panels', () => {
    flushContract();
    component.selectPanelTab(component.panels()[0]);

    queryParamMapSubject.next(convertToParamMap({ contractId: '456' }));
    fixture.detectChanges();

    expect(component.panels()).toEqual([]);
    expect(component.activePanelId()).toBeNull();
    expect(component.activePanel()).toBeNull();
    expect(component.invoiceHistory()).toEqual([]);

    const contractB = {
      ...contractResponse,
      id: 456,
      contractId: 456,
      umr: 'IT26-F-PD-0002',
      name: 'Property Facultative Contract STAR B',
      counterpartyId: 2,
      cedent: { id: 2, name: 'STAR Assurances' },
      panels: panelsResponse
    };
    httpMock.expectOne('http://localhost:5151/api/contracts/456/overview').flush(contractB);
    httpMock.expectOne('http://localhost:5151/api/contracts/456/panels').flush([]);
    fixture.detectChanges();

    expect(component.contract()?.contractId).toBe(456);
    expect(component.panels()).toEqual([]);
    expect(component.activePanelId()).toBeNull();
    expect(fixture.nativeElement.textContent).not.toContain('Global Re');
    expect(fixture.nativeElement.textContent).toContain('No reinsurer placement has been added yet.');
  });

  it('loads current-contract tabs when navigating from a contract without panels back to one with panels', () => {
    flushContract(123, contractResponse, []);

    queryParamMapSubject.next(convertToParamMap({ contractId: '456' }));
    const contractB = {
      ...contractResponse,
      id: 456,
      contractId: 456,
      umr: 'IT26-F-PD-0002',
      name: 'Property Facultative Contract STAR B',
      counterpartyId: 2,
      cedent: { id: 2, name: 'STAR Assurances' }
    };
    httpMock.expectOne('http://localhost:5151/api/contracts/456/overview').flush(contractB);
    httpMock.expectOne('http://localhost:5151/api/contracts/456/panels').flush([
      { ...panelsResponse[0], idPanel: 77, idContract: 456, reinsurerName: 'Same Cedent Re' }
    ]);
    fixture.detectChanges();

    expect(component.contract()?.contractId).toBe(456);
    expect(component.panels()).toHaveLength(1);
    expect(component.panels()[0].idContract).toBe(456);
    expect(fixture.nativeElement.textContent).toContain('Same Cedent Re');
  });

  it('cancels stale contract loads when the route ID changes before the previous response returns', () => {
    const oldOverview = httpMock.expectOne('http://localhost:5151/api/contracts/123/overview');
    httpMock.expectNone('http://localhost:5151/api/contracts/123/panels');

    queryParamMapSubject.next(convertToParamMap({ contractId: '456' }));
    fixture.detectChanges();

    expect(oldOverview.cancelled).toBe(true);
    expect(component.panels()).toEqual([]);
    expect(component.activePanelId()).toBeNull();

    httpMock.expectOne('http://localhost:5151/api/contracts/456/overview').flush({
      ...contractResponse,
      id: 456,
      contractId: 456,
      umr: 'IT26-F-PD-0002',
      name: 'Property Facultative Contract STAR B'
    });
    httpMock.expectOne('http://localhost:5151/api/contracts/456/panels').flush([]);
    fixture.detectChanges();

    expect(component.contract()?.contractId).toBe(456);
    expect(component.panels()).toEqual([]);
    expect(fixture.nativeElement.textContent).not.toContain('Global Re');
  });

  it('does not issue duplicate overview requests for the same route contract ID', () => {
    const overview = httpMock.expectOne('http://localhost:5151/api/contracts/123/overview');

    queryParamMapSubject.next(convertToParamMap({ contractId: '123' }));
    paramMapSubject.next(convertToParamMap({}));
    fixture.detectChanges();

    httpMock.expectNone('http://localhost:5151/api/contracts/123/overview');

    overview.flush(contractResponse);
    httpMock.expectOne('http://localhost:5151/api/contracts/123/panels').flush(panelsResponse);
    fixture.detectChanges();

    expect(component.contract()?.contractId).toBe(123);
  });

  it('rejects a panels response that belongs to a different contract', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    httpMock.expectOne('http://localhost:5151/api/contracts/123/overview').flush(contractResponse);
    httpMock.expectOne('http://localhost:5151/api/contracts/123/panels').flush([
      { ...panelsResponse[0], idContract: 999 }
    ]);
    fixture.detectChanges();

    expect(component.panels()).toEqual([]);
    expect(component.contract()?.contractId).toBe(123);
    expect(component.errorMessage()).toBe('');
    expect(component.slipMessage()).toBe('Reinsurer panels could not be refreshed right now.');
    expect(consoleError).toHaveBeenCalledWith('Contract panels response included panels for a different contract.', {
      expectedContractId: 123,
      panels: [{ ...panelsResponse[0], idContract: 999, limitOfLiability: null }]
    });
  });

  it('confirms a reinsurer panel and refreshes the selected tab', () => {
    flushContract();
    const panel = component.panels()[0];
    component.selectPanelTab(panel);

    component.confirmReinsurer(panel);

    const confirmRequest = httpMock.expectOne('http://localhost:5151/api/contracts/123/panels/44/confirm');
    expect(confirmRequest.request.method).toBe('POST');
    confirmRequest.flush({ ...panel, status: 'Confirmed' });

    httpMock.expectOne('http://localhost:5151/api/contracts/123/panels').flush([
      { ...panel, status: 'Confirmed' }
    ]);
    fixture.detectChanges();

    expect(component.activePanelId()).toBe(44);
    expect(component.activePanel()?.status).toBe('Confirmed');
    expect(snackBar.open).toHaveBeenCalledWith('Reinsurer confirmed for this contract.', 'Dismiss', {
      duration: 3000,
      horizontalPosition: 'end',
      verticalPosition: 'top'
    });
  });

  it('shows the backend message when no confirmed reinsurer can start binding', () => {
    httpMock.expectOne('http://localhost:5151/api/contracts/123/overview').flush({
      ...contractResponse,
      status: 'PlacementInProgress',
      allowedActions: ['ModifyContract', 'AddReinsurer', 'CancelContract', 'StartBinding', 'EditPlacement']
    });
    httpMock.expectOne('http://localhost:5151/api/contracts/123/panels').flush([]);
    fixture.detectChanges();

    component.startBindingPhase();
    fixture.detectChanges();

    expect(component.slipMessage()).toBe('Confirm at least one reinsurer before starting the binding phase.');
  });

  it('downloads the slip blob and starts the binding phase', () => {
    flushContract();
    component.contractPanels.set([{ ...panelsResponse[0], status: 'Confirmed' }]);

    component.startBindingPhase();
    const request = httpMock.expectOne('http://localhost:5151/api/contracts/123/slips');
    expect(request.request.method).toBe('GET');
    request.flush(new Blob(['docx'], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }), {
      headers: { 'Content-Disposition': 'attachment; filename="slip.docx"' }
    });

    const bindingRequest = httpMock.expectOne('http://localhost:5151/api/contracts/123/start-binding');
    expect(bindingRequest.request.method).toBe('POST');
    bindingRequest.flush({
      ...contractResponse,
      status: 'Bound',
      allowedActions: [],
      panels: [{ ...panelsResponse[0], status: 'Confirmed' }]
    });
    fixture.detectChanges();

    expect(window.URL.createObjectURL).toHaveBeenCalled();
    expect(HTMLAnchorElement.prototype.click).toHaveBeenCalled();
    expect(snackBar.open).toHaveBeenCalledWith('Slip download started.', 'Dismiss', {
      duration: 3000,
      horizontalPosition: 'end',
      verticalPosition: 'top'
    });
    expect(router.navigate).not.toHaveBeenCalledWith(['/workspace/reassurance/front-officer/contracts']);
  });

  it('shows a non-blocking message and still starts binding when no slip is available', () => {
    flushContract();
    component.contractPanels.set([{ ...panelsResponse[0], status: 'Confirmed' }]);

    component.startBindingPhase();
    httpMock.expectOne('http://localhost:5151/api/contracts/123/slips').flush(new Blob([]));
    httpMock.expectOne('http://localhost:5151/api/contracts/123/start-binding').flush({
      ...contractResponse,
      status: 'Bound',
      allowedActions: [],
      panels: [{ ...panelsResponse[0], status: 'Confirmed' }]
    });
    fixture.detectChanges();

    expect(component.slipMessage()).toBe('Slip is not available for this contract selection.');
    expect(snackBar.open).toHaveBeenCalledWith('Slip is not available for this contract selection.', 'Dismiss', {
      duration: 3500,
      horizontalPosition: 'end',
      verticalPosition: 'top'
    });
    expect(router.navigate).not.toHaveBeenCalledWith(['/workspace/reassurance/front-officer/contracts']);
  });

  it('does not block binding when slip download fails unexpectedly', () => {
    flushContract();
    component.contractPanels.set([{ ...panelsResponse[0], status: 'Confirmed' }]);

    component.startBindingPhase();
    httpMock.expectOne('http://localhost:5151/api/contracts/123/slips').flush(new Blob(['server error']), {
      status: 500,
      statusText: 'Server Error'
    });
    httpMock.expectOne('http://localhost:5151/api/contracts/123/start-binding').flush({
      ...contractResponse,
      status: 'Bound',
      allowedActions: [],
      panels: [{ ...panelsResponse[0], status: 'Confirmed' }]
    });
    fixture.detectChanges();

    expect(component.slipMessage()).toBe('Unable to check or download slips for this contract right now.');
  });

  it('creates a premium invoice with backend preview and refreshes invoice history', () => {
    enableBackOfficeMode();
    flushContract(123, { ...contractResponse, status: 'Bound' }, [{ ...panelsResponse[0], role: 'Reinsurer', status: 'Confirmed' }]);
    component.invoiceContext.set(invoiceContextResponse as any);

    component.openInvoiceModal();
    flushInvoiceContextAndHistory();
    fixture.detectChanges();

    expect(component.invoiceForm.controls.amount.value).toBe(1250);
    component.invoiceForm.controls.amount.setValue(500);
    httpMock.expectOne('http://localhost:5151/api/back-office/contracts/123/invoices/preview').flush({
      contractId: 123,
      invoiceableGrossPremium: 1500,
      alreadyInvoicedAmount: 250,
      grossAmount: 500,
      remainingAmount: 750,
      allocations: [{
        panelId: 44,
        reinsurerCode: 'RE-001',
        reinsurerName: 'Global Re',
        signedSharePct: 45,
        allocationRatio: 1,
        grossPremium: 500,
        cedentCommissionPct: 10,
        cedentCommissionAmount: 50,
        brokeragePct: 2,
        brokerageAmount: 10,
        otherDeductions: 0,
        netAmount: 440,
        currencyCode: 'TND'
      }]
    });
    component.createInvoice();
    expect(component.invoicePreviewAllocations()[0].cedentCommissionPct).toBe(10);
    expect(component.invoicePreviewAllocations()[0].cedentCommissionAmount).toBe(50);

    const createInvoiceRequest = httpMock.expectOne('http://localhost:5151/api/back-office/contracts/123/invoices');
    expect(createInvoiceRequest.request.method).toBe('POST');
    expect(createInvoiceRequest.request.body).toEqual(expect.objectContaining({
      grossAmount: 500,
      invoiceDate: component.invoiceForm.controls.invoiceDate.value,
      label: null
    }));
    expect(createInvoiceRequest.request.body.idempotencyKey).toEqual(expect.any(String));
    expect(createInvoiceRequest.request.body).not.toHaveProperty('allocationId');
    expect(createInvoiceRequest.request.body).not.toHaveProperty('receiptId');
    expect(createInvoiceRequest.request.body).not.toHaveProperty('bankReceiptId');
    expect(createInvoiceRequest.request.body).not.toHaveProperty('receiptAllocationId');
    expect(createInvoiceRequest.request.body).not.toHaveProperty('remittanceRef');
    expect(createInvoiceRequest.request.body).not.toHaveProperty('panelId');

    createInvoiceRequest.flush({
      invoiceId: 91,
      contractId: 123,
      invoiceNumber: 'INV-2026-000001',
      sequence: 1,
      invoiceType: 'CEDENT_PREMIUM_DEBIT_NOTE',
      invoiceDate: '2026-09-23',
      invoiceableGrossPremium: 1500,
      grossAmount: 500,
      alreadyInvoicedAmount: 750,
      remainingAmount: 750,
      totalNetAmount: 440,
      currencyCode: 'TND',
      status: 'Draft',
      label: '',
      allocations: []
    });
    flushInvoiceContextAndHistory({
      ...invoiceContextResponse,
      alreadyInvoicedAmount: 750,
      remainingInvoiceableAmount: 750
    }, [{
        invoiceId: 91,
        contractId: 123,
        invoiceNumber: 'INV-2026-000001',
        sequence: 1,
        invoiceType: 'CEDENT_PREMIUM_DEBIT_NOTE',
        invoiceDate: '2026-09-23',
        invoiceableGrossPremium: 1500,
        grossAmount: 500,
        alreadyInvoicedAmount: 750,
        remainingAmount: 750,
        totalNetAmount: 440,
        currencyCode: 'TND',
        status: 'Draft',
        label: '',
        allocations: []
      }]);
    fixture.detectChanges();

    expect(component.isInvoiceModalOpen()).toBe(false);
    expect(snackBar.open).toHaveBeenCalledWith('Invoice INV-2026-000001 created successfully.', 'Dismiss', {
      duration: 3000,
      horizontalPosition: 'end',
      verticalPosition: 'top'
    });
    expect(component.invoiceHistory()[0].invoiceId).toBe(91);
    expect(component.lastCreatedInvoice()?.invoiceId).toBe(91);
    expect(component.invoiceHistory()[0].invoiceNumber).toBe('INV-2026-000001');
    expect(fixture.nativeElement.textContent).toContain('Invoice History');
    expect(fixture.nativeElement.textContent).toContain('INV-2026-000001');
    expect(fixture.nativeElement.textContent).toContain('View Allocation');
    expect(fixture.nativeElement.textContent).not.toContain('Create an invoice to generate its debit note.');
    httpMock.expectNone('http://localhost:5151/api/back-office/invoices/91/debit-note');
  });

  it('uses invoice-context gross values directly and defaults to the remaining amount', () => {
    enableBackOfficeMode();
    flushContract(123, { ...contractResponse, status: 'Bound', grossPremium: 5000 }, [{ ...panelsResponse[0], role: 'Reinsurer', status: 'Confirmed' }]);
    component.openInvoiceModal();
    flushInvoiceContextAndHistory({
      ...invoiceContextResponse,
      contractGrossPremium: 50,
      invoiceableGrossPremium: 50,
      alreadyInvoicedAmount: 0,
      remainingInvoiceableAmount: 50,
      canCreateInvoice: true
    });
    fixture.detectChanges();

    expect(component.invoiceForm.controls.amount.value).toBe(50);
    expect(component.invoiceContextRows().find(row => row.label === 'Contract gross premium')?.value).toContain('50');
    expect(component.invoiceContextRows().find(row => row.label === 'Invoiceable gross premium')?.value).toContain('50');
    expect(component.invoiceContextRows().find(row => row.label === 'Already invoiced amount')?.value).toContain('0');
    expect(component.invoiceContextRows().find(row => row.label === 'Remaining invoiceable amount')?.value).toContain('50');
  });

  it('keeps invoice history visible, filters other contracts, and does not show invoice debit-note actions', () => {
    enableBackOfficeMode();
    flushContract(123, { ...contractResponse, status: 'Bound' }, [{ ...panelsResponse[0], role: 'Reinsurer', status: 'Confirmed' }]);
    flushInvoiceContextAndHistory(invoiceContextResponse, [
      {
        invoiceId: 91,
        contractId: 123,
        invoiceNumber: 'INV-2026-000001',
        sequence: 1,
        invoiceType: 'PARTIAL_PREMIUM_INVOICE',
        invoiceDate: '2026-09-23',
        invoiceableGrossPremium: 1500,
        grossAmount: 50,
        alreadyInvoicedAmount: 50,
        remainingAmount: 1450,
        totalNetAmount: 999,
        currencyCode: 'USD',
        paymentStatus: 'Unsettled',
        status: 'Draft',
        label: '',
        allocations: [{ panelId: 1, cedentCommissionPct: 14, cedentCommissionAmount: 7, grossPremium: 50, netAmount: 40 }]
      },
      {
        invoiceId: 92,
        contractId: 4,
        invoiceNumber: 'INV-2026-000002',
        sequence: 2,
        invoiceType: 'PARTIAL_PREMIUM_INVOICE',
        invoiceDate: '2026-09-24',
        invoiceableGrossPremium: 1500,
        grossAmount: 60,
        alreadyInvoicedAmount: 60,
        remainingAmount: 1440,
        totalNetAmount: 54,
        currencyCode: 'TND',
        paymentStatus: 'Settled',
        status: 'Draft',
        label: '',
        allocations: []
      }
    ]);
    fixture.detectChanges();

    expect(component.invoiceHistory().map(invoice => invoice.invoiceId)).toEqual([91]);
    expect(fixture.nativeElement.textContent).toContain('Invoice History');
    expect(fixture.nativeElement.textContent).toContain('Invoice type');
    expect(fixture.nativeElement.textContent).toContain('Payment Status');
    expect(fixture.nativeElement.textContent).toContain('INV-2026-000001');
    expect(fixture.nativeElement.textContent).toContain('Unsettled');
    expect(fixture.nativeElement.textContent).not.toContain('Draft');
    const invoice = component.invoiceHistory()[0];
    expect(normalizedMoney(component.formatMoney(component.getInvoiceAmount(invoice), invoice.currencyCode))).toBe('USD43.000');
    const headers = Array.from(fixture.nativeElement.querySelectorAll('th') as NodeListOf<HTMLElement>).map(header => header.textContent?.trim());
    expect(headers).toContain('Amount');
    expect(headers).not.toContain('Gross amount');
    expect(headers).not.toContain('Net amount');
    const amountCell = fixture.nativeElement.querySelector('tbody tr td:nth-child(5)');
    expect(normalizedMoney(amountCell.textContent)).toBe('USD43.000');
    expect(component.getInvoiceAmount({ ...invoice, allocations: [] })).toBe(45);
    expect(component.getInvoiceAmount({ ...invoice, allocations: [{ ...invoice.allocations[0], cedentCommissionAmount: 0 }] })).toBe(50);
    expect(fixture.nativeElement.textContent).not.toContain('999');
    expect(fixture.nativeElement.textContent).not.toContain('INV-2026-000002');
    const rowButtons = Array.from(fixture.nativeElement.querySelectorAll('td button') as NodeListOf<HTMLButtonElement>)
      .map(button => button.textContent?.trim());
    expect(rowButtons).toContain('View Allocation');
    expect(rowButtons).not.toContain('Download Debit Note');
  });

  it('formats invoice payment status values in invoice history', () => {
    enableBackOfficeMode();
    flushContract(123, { ...contractResponse, status: 'Bound' }, [{ ...panelsResponse[0], role: 'Reinsurer', status: 'Confirmed' }]);
    flushInvoiceContextAndHistory(invoiceContextResponse, [
      {
        invoiceId: 91,
        contractId: 123,
        invoiceNumber: 'INV-2026-000001',
        sequence: 1,
        invoiceType: 'CEDENT_PREMIUM_INVOICE',
        invoiceDate: '2026-09-23',
        invoiceableGrossPremium: 1500,
        grossAmount: 50,
        alreadyInvoicedAmount: 50,
        remainingAmount: 1450,
        totalNetAmount: 45,
        currencyCode: 'TND',
        paymentStatus: 'Partially_Settled',
        status: 'Draft',
        label: '',
        allocations: []
      }
    ]);
    fixture.detectChanges();

    expect(component.getInvoicePaymentStatus(component.invoiceHistory()[0])).toBe('Partially settled');
    expect(fixture.nativeElement.textContent).toContain('Partially settled');
    expect(fixture.nativeElement.textContent).not.toContain('Draft');
  });

  it('identifies missing backend payment status fields in invoice history', () => {
    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => undefined);

    enableBackOfficeMode();
    flushContract(123, { ...contractResponse, status: 'Bound' }, [{ ...panelsResponse[0], role: 'Reinsurer', status: 'Confirmed' }]);
    flushInvoiceContextAndHistory(invoiceContextResponse, [
      {
        invoiceId: 91,
        contractId: 123,
        invoiceNumber: 'INV-2026-000001',
        sequence: 1,
        invoiceType: 'CEDENT_PREMIUM_INVOICE',
        invoiceDate: '2026-09-23',
        invoiceableGrossPremium: 1500,
        grossAmount: 50,
        alreadyInvoicedAmount: 50,
        remainingAmount: 1450,
        totalNetAmount: 45,
        currencyCode: 'TND',
        status: 'Draft',
        label: '',
        allocations: []
      }
    ]);
    fixture.detectChanges();

    expect(component.getInvoicePaymentStatus(component.invoiceHistory()[0])).toBe('Missing paymentStatus');
    expect(fixture.nativeElement.textContent).toContain('Missing paymentStatus');
    expect(debugSpy).toHaveBeenCalledWith('Contract overview invoice history response is missing paymentStatus.', {
      invoiceId: 91,
      invoiceNumber: 'INV-2026-000001',
      fields: ['paymentStatus', 'recoveryStatus']
    });
  });

  it('keeps created invoices visible and offers retry when invoice-history reload fails', () => {
    enableBackOfficeMode();
    flushContract(123, { ...contractResponse, status: 'Bound' }, [{ ...panelsResponse[0], role: 'Reinsurer', status: 'Confirmed' }]);
    flushInvoiceContextAndHistory();
    component.invoiceContext.set(invoiceContextResponse as any);
    component.invoiceForm.controls.amount.setValue(50);
    httpMock.expectOne('http://localhost:5151/api/back-office/contracts/123/invoices/preview').flush({
      contractId: 123,
      invoiceableGrossPremium: 1500,
      alreadyInvoicedAmount: 250,
      grossAmount: 50,
      remainingAmount: 1200,
      allocations: []
    });

    component.createInvoice();
    httpMock.expectOne('http://localhost:5151/api/back-office/contracts/123/invoices').flush({
      invoiceId: 93,
      contractId: 123,
      invoiceNumber: 'INV-2026-000003',
      sequence: 3,
      invoiceType: 'PARTIAL_PREMIUM_INVOICE',
      invoiceDate: '2026-09-25',
      invoiceableGrossPremium: 1500,
      grossAmount: 50,
      alreadyInvoicedAmount: 300,
      remainingAmount: 1200,
      totalNetAmount: 45,
      currencyCode: 'TND',
      status: 'Draft',
      label: '',
      allocations: []
    });
    httpMock.expectOne('http://localhost:5151/api/back-office/contracts/123/invoice-context').flush(invoiceContextResponse);
    httpMock.expectOne('http://localhost:5151/api/back-office/contracts/123/invoices').flush({
      message: 'Unable to reload invoices.'
    }, {
      status: 500,
      statusText: 'Server Error'
    });
    fixture.detectChanges();

    expect(component.invoiceHistory()[0].invoiceNumber).toBe('INV-2026-000003');
    expect(fixture.nativeElement.textContent).toContain('INV-2026-000003');
    expect(fixture.nativeElement.textContent).toContain('Unable to reload invoices.');
    expect(fixture.nativeElement.textContent).toContain('Retry');
  });

  it('keeps the Create Invoice button enabled while invoice context loads', () => {
    enableBackOfficeMode();
    flushContract(123, { ...contractResponse, status: ' Bound ' }, [{ ...panelsResponse[0], role: 'Reinsurer', status: 'Confirmed' }]);
    component.retryInvoiceContext();
    fixture.detectChanges();

    const button = Array.from(fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>)
      .find(item => item.textContent?.trim() === 'Create Invoice');

    expect(component.shouldShowInvoiceAction()).toBe(true);
    expect(button).toBeTruthy();
    expect(button?.disabled).toBe(false);

    flushInvoiceContextAndHistory(invoiceContextResponse, []);
  });

  it('keeps the Download Debit Note header button visible for a bound Back Officer contract', () => {
    enableBackOfficeMode();
    flushContract(123, { ...contractResponse, status: ' Bound ' }, [{ ...panelsResponse[0], role: 'Reinsurer', status: 'Confirmed' }]);
    flushInvoiceContextAndHistory(invoiceContextResponse, []);
    fixture.detectChanges();

    const headerButtons = Array.from(fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>)
      .map(button => button.textContent?.trim())
      .filter(Boolean);

    expect(component.shouldShowInvoiceAction()).toBe(true);
    expect(headerButtons).toContain('Create Invoice');
    expect(headerButtons).toContain('Download Debit Note');

    component.invoiceContext.set({
      ...invoiceContextResponse,
      alreadyInvoicedAmount: 1500,
      remainingInvoiceableAmount: 0
    } as any);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Download Debit Note');
  });

  it('downloads the contract debit note directly without checking invoices', () => {
    enableBackOfficeMode();
    flushContract(123, { ...contractResponse, status: 'Bound' }, [{ ...panelsResponse[0], role: 'Reinsurer', status: 'Confirmed' }]);
    flushInvoiceContextAndHistory(invoiceContextResponse, []);

    component.openDebitNoteAction();
    const debitNoteRequest = httpMock.expectOne('http://localhost:5151/api/back-office/contracts/123/debit-note');
    expect(debitNoteRequest.request.method).toBe('GET');
    expect(debitNoteRequest.request.responseType).toBe('blob');
    debitNoteRequest.flush(new Blob(['pdf'], { type: 'application/pdf' }), {
      headers: { 'Content-Disposition': 'attachment; filename="DebitNote-IT26-F-PD-0001.pdf"', 'Content-Type': 'application/pdf' }
    });
    fixture.detectChanges();

    httpMock.expectNone('http://localhost:5151/api/back-office/contracts/123/invoices');
    httpMock.expectNone('http://localhost:5151/api/back-office/invoices/91/debit-note');
  });

  it('keeps the debit note button visible and shows Retry when contract debit-note generation fails', () => {
    enableBackOfficeMode();
    flushContract(123, { ...contractResponse, status: 'Bound' }, [{ ...panelsResponse[0], role: 'Reinsurer', status: 'Confirmed' }]);
    flushInvoiceContextAndHistory(invoiceContextResponse, []);

    component.openDebitNoteAction();
    httpMock.expectOne('http://localhost:5151/api/back-office/contracts/123/debit-note').flush(new Blob(['Debit note PDF is not ready.'], { type: 'text/plain' }), {
      status: 500,
      statusText: 'Server Error'
    });
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Debit note could not be downloaded. HTTP 500 Server Error');
    expect(fixture.nativeElement.textContent).toContain('Retry');
    expect(fixture.nativeElement.textContent).toContain('Download Debit Note');

    component.retryContractDebitNoteDownload();
    const retryRequest = httpMock.expectOne('http://localhost:5151/api/back-office/contracts/123/debit-note');
    expect(retryRequest.request.responseType).toBe('blob');
    retryRequest.flush(new Blob(['pdf'], { type: 'application/pdf' }));
  });

  it('shows a retry action in the modal when invoice context fails', () => {
    enableBackOfficeMode();
    flushContract(123, { ...contractResponse, status: 'Bound' }, [{ ...panelsResponse[0], role: 'Reinsurer', status: 'Confirmed' }]);
    component.openInvoiceModal();
    httpMock.expectOne('http://localhost:5151/api/back-office/contracts/123/invoices').flush([]);
    httpMock.expectOne('http://localhost:5151/api/back-office/contracts/123/invoice-context').flush({
      message: 'Unable to calculate invoiceable amount.'
    }, {
      status: 500,
      statusText: 'Server Error'
    });
    fixture.detectChanges();

    expect(component.canCreateInvoice()).toBe(false);
    expect(fixture.nativeElement.textContent).toContain('Create Invoice');
    expect(fixture.nativeElement.textContent).toContain('Unable to calculate invoiceable amount.');
    expect(fixture.nativeElement.textContent).toContain('Retry');

    component.retryInvoiceContext();
    httpMock.expectOne('http://localhost:5151/api/back-office/contracts/123/invoice-context').flush(invoiceContextResponse);
  });

  it('disables invoice creation when the contract is fully invoiced', () => {
    enableBackOfficeMode();
    flushContract(123, { ...contractResponse, status: 'Bound' }, [{ ...panelsResponse[0], role: 'Reinsurer', status: 'Confirmed' }]);
    flushInvoiceContextAndHistory({
      ...invoiceContextResponse,
      contractGrossPremium: 1500,
      alreadyInvoicedAmount: 1500,
      remainingInvoiceableAmount: 0
    }, []);
    fixture.detectChanges();

    expect(component.canCreateInvoice()).toBe(false);
    expect(fixture.nativeElement.textContent).toContain('Fully Invoiced');
  });

  it('shows backend invoice validation responses', () => {
    enableBackOfficeMode();
    flushContract(123, { ...contractResponse, status: 'Bound' }, [{ ...panelsResponse[0], role: 'Reinsurer', status: 'Confirmed' }]);
    component.invoiceContext.set(invoiceContextResponse as any);

    component.openInvoiceModal();
    flushInvoiceContextAndHistory();
    component.invoiceForm.controls.amount.setValue(1000);
    httpMock.expectOne('http://localhost:5151/api/back-office/contracts/123/invoices/preview').flush({
      contractId: 123,
      invoiceableGrossPremium: 1500,
      alreadyInvoicedAmount: 250,
      grossAmount: 1000,
      remainingAmount: 250,
      allocations: []
    });

    component.createInvoice();
    httpMock.expectOne('http://localhost:5151/api/back-office/contracts/123/invoices').flush({
      errors: ['Gross invoice amount exceeds the remaining invoiceable premium.']
    }, {
      status: 400,
      statusText: 'Bad Request'
    });

    expect(component.invoiceError()).toBe('Gross invoice amount exceeds the remaining invoiceable premium.');
  });
});
