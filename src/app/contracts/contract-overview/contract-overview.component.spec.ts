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
    cedentCommissionPct: 0,
    cedentCommissionAmount: 0,
    invoiceableNetPremium: 1500,
    currencyDecimalPlaces: 3,
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
    localStorage.setItem('iris_auth_workspace', JSON.stringify({ position: 'FrontOfficer' }));
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
    return (value ?? '').replace(/\u202f/g, '').replace(/\s/g, '').replace(/,/g, '.');
  }

  function flushPreviewDebounce(): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, 260));
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

  it('marks a Draft contract Ready for Placement once and refreshes from the backend response', () => {
    flushContract(123, { ...contractResponse, status: ' DRAFT ', isFronting: null }, []);

    const text = fixture.nativeElement.textContent;
    expect(text).toContain('Documents');
    expect(text).toContain('Modify Contract');
    expect(text).toContain('Mark as Ready for Placement');
    expect(text).toContain('Cancel Contract');
    expect(text).not.toContain('Start Binding Phase');
    expect(text).not.toContain('Add Reinsurer');

    component.markReadyForPlacement();
    component.markReadyForPlacement();
    const completeRequest = httpMock.expectOne('http://localhost:5151/api/contracts/123/complete');
    expect(completeRequest.request.method).toBe('POST');
    expect(completeRequest.request.body).toEqual({});
    expect(component.isMarkingReady()).toBe(true);
    completeRequest.flush({ ...contractResponse, status: 'READY_FOR_PLACEMENT' });

    httpMock.expectOne('http://localhost:5151/api/contracts/123/overview').flush({
      ...contractResponse,
      status: 'READY_FOR_PLACEMENT'
    });
    httpMock.expectOne('http://localhost:5151/api/contracts/123/panels').flush([]);
    fixture.detectChanges();

    expect(component.contract()?.status).toBe('READY_FOR_PLACEMENT');
    expect(component.isMarkingReady()).toBe(false);
    expect(fixture.nativeElement.textContent).toContain('Reinsurers');
    expect(fixture.nativeElement.textContent).toContain('Add Reinsurer');
    expect(fixture.nativeElement.textContent).toContain('Start Binding Phase');
    expect(fixture.nativeElement.textContent).not.toContain('Mark as Ready for Placement');
  });

  it('does not show an isFronting readiness error or offer a link to edit it', () => {
    flushContract(123, { ...contractResponse, status: 'DRAFT', isFronting: null }, []);

    component.markReadyForPlacement();
    httpMock.expectOne('http://localhost:5151/api/contracts/123/complete').flush({
      message: 'Contract validation failed.',
      errors: { isFronting: ['Select whether this contract is fronting before placement.'] }
    }, { status: 400, statusText: 'Bad Request' });
    fixture.detectChanges();

    expect(component.contract()?.status).toBe('DRAFT');
    expect(component.statusTransitionErrors()).toEqual([]);
    expect(fixture.nativeElement.textContent).not.toContain('Select whether this contract is fronting');
    expect(Array.from(fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>)
      .some(button => button.textContent?.includes('Edit this field'))).toBe(false);
  });

  it('keeps an incomplete Draft on the overview and links readiness errors to the editor', () => {
    flushContract(123, { ...contractResponse, status: 'DRAFT', name: null, currencyId: null }, []);

    component.markReadyForPlacement();
    httpMock.expectOne('http://localhost:5151/api/contracts/123/complete').flush({
      message: 'Contract validation failed.',
      errors: {
        name: ['Contract name is required before placement.'],
        currencyId: ['Currency is required before placement.']
      }
    }, { status: 400, statusText: 'Bad Request' });
    fixture.detectChanges();

    expect(component.contract()?.status).toBe('DRAFT');
    expect(fixture.nativeElement.textContent).toContain('Contract name is required before placement.');
    expect(fixture.nativeElement.textContent).toContain('Currency is required before placement.');

    const editButton = Array.from(fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>)
      .find(button => button.textContent?.includes('Edit this field'))!;
    editButton.click();
    expect(router.navigate).toHaveBeenCalledWith(['/workspace/reassurance/front-officer/contracts/new/facultative'], {
      queryParams: { contractId: 123, focusField: 'name' }
    });
  });

  it('keeps Front Officer workflow actions visible and displays backend authorization errors', () => {
    flushContract(123, { ...contractResponse, status: 'Draft' }, []);

    component.markReadyForPlacement();
    httpMock.expectOne('http://localhost:5151/api/contracts/123/complete').flush(
      { message: 'Front Officer permission is required.' },
      { status: 403, statusText: 'Forbidden' }
    );
    fixture.detectChanges();

    expect(component.canMarkReadyForPlacement()).toBe(true);
    expect(fixture.nativeElement.textContent).toContain('Front Officer permission is required.');
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
      items: [{ id: 10, name: 'Global Re', types: ['Reinsurer'], email: null, status: 'Active', isActive: true, legacyClientId: null, legacyCompanyCode: null }],
      pageNumber: 1,
      pageSize: 20,
      totalCount: 1,
      totalPages: 1
    });

    component.selectReinsurer({ id: 10, name: 'Global Re', types: ['Reinsurer'], email: null, status: 'Active', isActive: true, legacyClientId: null, legacyCompanyCode: null });
    component.panelForm.patchValue({
      writtenSharePct: 40,
      signedSharePct: 35,
      sumInsured: 400000,
      limitOfLiability: 100000,
      deductible: 2000,
      premiumRate: 1.2,
      grossPremium: 48000,
      brokerageIrisPct: 2,
      otherDeductionsPercentage: 7.14285714,
      reinsurancePremiumReference: 'RE-PREM-2'
    });

    component.submitReinsurerPanel();
    const createPanel = httpMock.expectOne('http://localhost:5151/api/contracts/123/panels');
    expect(createPanel.request.method).toBe('POST');
    expect(createPanel.request.body).toEqual({
      idCounterparty: 10,
      writtenSharePct: 40,
      signedSharePct: 35,
      tsi: 400000,
      limitOfLiability: 100000,
      deductible: 2000,
      premiumRatePct: 1.2,
      grossPremium: 4200,
      brokeragePct: 2,
      otherDeductionsPercentage: 7.14285714,
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
    expect(component.activePanelId()).toBe(null);
    expect(component.isReinsurersTabActive()).toBe(true);
    expect(fixture.nativeElement.textContent).toContain('Reinsurers');
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

    component.panelForm.controls.otherDeductionsPercentage.setValue(28);
    expect(component.panelForm.controls.otherDeductionsAmount.value).toBe(7);
    expect(component.panelForm.controls.netPremium.value).toBe(14.25);

    component.panelForm.controls.signedSharePct.setValue(11);
    expect(component.panelForm.controls.signedSharePct.hasError('exceedsWrittenShare')).toBe(true);
    expect(component.panelForm.controls.signedSharePct.hasError('exceedsAvailableShare')).toBe(true);

    component.panelForm.patchValue({
      signedSharePct: 10,
      otherDeductionsPercentage: 100
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

  it('creates a premium invoice with backend preview and refreshes invoice history', async () => {
    enableBackOfficeMode();
    flushContract(123, { ...contractResponse, status: 'Bound' }, [{ ...panelsResponse[0], role: 'Reinsurer', status: 'Confirmed' }]);
    component.invoiceContext.set(invoiceContextResponse as any);

    component.openInvoiceModal();
    flushInvoiceContextAndHistory();
    fixture.detectChanges();

    component.invoiceForm.controls.invoiceType.setValue('INVOICE');
    const invoicePreview = httpMock.expectOne('http://localhost:5151/api/back-office/contracts/123/invoices/preview');
    expect(invoicePreview.request.body).not.toHaveProperty('processingMode');
    invoicePreview.flush({
      contractId: 123,
      invoiceableGrossPremium: 1500,
      alreadyInvoicedAmount: 250,
      grossAmount: 1250,
      remainingAmount: 0,
      allocations: []
    });
    expect(component.invoiceForm.controls.amount.value).toBe(1250);
    component.invoiceForm.controls.amount.setValue(500);
    await flushPreviewDebounce();
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
        allocationRatioPercentage: 100,
        grossPremium: 555.556,
        allocatedGrossPremium: 555.556,
        allocatedNetPremium: 500,
        allocationAmount: 500,
        cedentCommissionPct: 10,
        cedentCommissionPercentage: 10,
        cedentCommissionAmount: 55.556,
        brokeragePct: 2,
        irisBrokeragePercentage: 2,
        brokerageAmount: 10,
        irisBrokerageAmount: 10,
        otherDeductions: 0,
        otherDeductionsAmount: 0,
        netAmount: 490,
        netPayableAmount: 490,
        currencyCode: 'TND'
      }]
    });
    component.createInvoice();
    expect(component.invoicePreviewAllocations()[0].cedentCommissionPct).toBe(10);
    expect(component.invoicePreviewAllocations()[0].cedentCommissionAmount).toBe(55.556);

    const createInvoiceRequest = httpMock.expectOne('http://localhost:5151/api/back-office/contracts/123/invoices');
    expect(createInvoiceRequest.request.method).toBe('POST');
    expect(createInvoiceRequest.request.body).toEqual(expect.objectContaining({
      invoiceType: 'INVOICE',
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
      invoiceType: 'INVOICE',
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
        invoiceType: 'INVOICE',
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
    httpMock.expectNone('http://localhost:5151/api/back-office/invoices/91/document');
  });

  it('renders gross, cedent commission, net and brokerage from backend allocation fields', () => {
    flushContract(123, { ...contractResponse, status: 'Bound' }, []);
    component.invoiceContext.set({ ...invoiceContextResponse, currencyDecimalPlaces: 3 } as any);
    component.isInvoiceModalOpen.set(true);
    const allocation = (panelId: number, reinsurerCode: string, reinsurerName: string, brokeragePct: number, brokerageAmount: number, netPayable: number) => ({
      panelId,
      reinsurerCode,
      reinsurerName,
      signedSharePct: 5,
      allocationRatio: 0.5,
      allocationRatioPercentage: 50,
      grossPremium: 25,
      allocatedGrossPremium: 25,
      allocatedNetPremium: 22.5,
      allocationAmount: 22.5,
      cedentCommissionPct: 10,
      cedentCommissionPercentage: 10,
      cedentCommissionAmount: 2.5,
      brokeragePct,
      irisBrokeragePercentage: brokeragePct,
      brokerageAmount,
      irisBrokerageAmount: brokerageAmount,
      otherDeductions: 0,
      otherDeductionsAmount: 0,
      netAmount: netPayable,
      netPayableAmount: netPayable,
      currencyCode: 'TND'
    });
    component.invoicePreview.set({
      contractId: 123,
      invoiceableGrossPremium: 45,
      alreadyInvoicedAmount: 0,
      grossAmount: 45,
      remainingAmount: 0,
      allocations: [
        allocation(44, 'AMI', 'AMI', 10, 2.5, 20),
        allocation(45, 'STAR', 'STAR Assurances', 20, 5, 17.5)
      ]
    });
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent;
    for (const heading of [
      'Reinsurer code', 'Reinsurer name', 'Signed share %', 'Allocation ratio %',
      'Allocated gross premium', 'Cedent commission %', 'Cedent commission amount',
      'Allocated net premium', 'IRIS brokerage %', 'IRIS brokerage amount',
      'Other deductions', 'Signed net-payable amount'
    ]) {
      expect(text).toContain(heading);
    }
    const formattedText = normalizedMoney(text);
    expect(formattedText).toContain('TND25.000');
    expect(formattedText).toContain('TND2.500');
    expect(formattedText).toContain('TND22.500');
    expect(formattedText).toContain('TND2.500');
    expect(formattedText).toContain('TND5.000');
    expect(formattedText).toContain('TND50.000');
    expect(formattedText).toContain('TND5.000');
    expect(formattedText).toContain('TND45.000');
  });

  it('uses backend gross-based IRIS brokerage consistently in preview and saved allocation details', () => {
    flushContract(123, { ...contractResponse, status: 'Bound' }, []);
    component.invoiceContext.set({ ...invoiceContextResponse, currencyDecimalPlaces: 3 } as any);
    component.isInvoiceModalOpen.set(true);
    const allocation = {
      panelId: 84,
      reinsurerCode: 'R-1',
      reinsurerName: 'Reinsurer',
      signedSharePct: 100,
      allocationRatio: 1,
      allocationRatioPercentage: 100,
      grossPremium: 44.445,
      allocatedGrossPremium: 44.445,
      allocatedNetPremium: 40,
      allocationAmount: 40,
      cedentCommissionPct: 0,
      cedentCommissionPercentage: 0,
      cedentCommissionAmount: 0,
      brokeragePct: 10,
      irisBrokeragePercentage: 10,
      brokerageAmount: 4,
      irisBrokerageAmount: 4.445,
      otherDeductions: 0,
      otherDeductionsAmount: 0,
      netAmount: 40,
      netPayableAmount: 35.555,
      signedNetPayableAmount: 35.555,
      currencyCode: 'TND'
    };
    component.invoicePreview.set({
      contractId: 123,
      invoiceableGrossPremium: 44.445,
      alreadyInvoicedAmount: 0,
      grossAmount: 40,
      remainingAmount: 0,
      isReconciled: true,
      reconciliationDifference: 0,
      currencyCode: 'TND',
      allocations: [allocation]
    } as any);
    fixture.detectChanges();
    const previewText = normalizedMoney(fixture.nativeElement.textContent);
    expect(previewText).toContain('TND4.445');
    expect(previewText).not.toContain('TND4.000');

    component.viewInvoiceAllocation({ allocations: [allocation] } as any);
    fixture.detectChanges();
    const historyText = normalizedMoney(fixture.nativeElement.textContent);
    expect(historyText).toContain('TND4.445');
    expect(historyText).not.toContain('TND4.000');
  });

  it('blocks invoice creation and shows backend allocation reconciliation differences', () => {
    flushContract(123, { ...contractResponse, status: 'Bound' }, []);
    component.invoicePreview.set({
      contractId: 123,
      invoiceableGrossPremium: 100,
      alreadyInvoicedAmount: 0,
      grossAmount: 20,
      remainingAmount: 80,
      isReconciled: false,
      reconciliationDifference: 0.001,
      currencyCode: 'TND',
      allocations: []
    } as any);

    expect(component.hasInvoiceAllocationReconciliationError()).toBe(true);
    expect(component.invoiceAllocationReconciliationMessage()).toContain('0,001');
    expect(component.isInvoiceSubmitDisabled()).toBe(true);
  });

  it('uses invoice-context net values directly and defaults to the remaining amount', () => {
    enableBackOfficeMode();
    flushContract(123, { ...contractResponse, status: 'Bound', grossPremium: 5000 }, [{ ...panelsResponse[0], role: 'Reinsurer', status: 'Confirmed' }]);
    component.openInvoiceModal();
    flushInvoiceContextAndHistory({
      ...invoiceContextResponse,
      contractGrossPremium: 50,
      invoiceableGrossPremium: 50,
      cedentCommissionPct: 0,
      cedentCommissionAmount: 0,
      invoiceableNetPremium: 50,
      alreadyInvoicedAmount: 0,
      remainingInvoiceableAmount: 50,
      canCreateInvoice: true
    });
    fixture.detectChanges();

    expect(component.invoiceForm.controls.amount.value).toBe(50);
    expect(component.invoiceContextRows().find(row => row.label === 'Contract gross premium')?.value).toContain('50');
    expect(component.invoiceContextRows().find(row => row.label === 'Invoiceable net premium')?.value).toContain('50');
    expect(component.invoiceContextRows().find(row => row.label === 'Already invoiced amount')?.value).toContain('0');
    expect(component.invoiceContextRows().find(row => row.label === 'Remaining invoiceable amount')?.value).toContain('50');
  });

  it('uses the backend full-contract invoiceable amount without applying signed share', () => {
    enableBackOfficeMode();
    flushContract(123, { ...contractResponse, status: 'Bound', grossPremium: 2000, cedentCommissionPct: 10, signedSharePct: 20, currencyDecimalPlaces: 3 },
      [{ ...panelsResponse[0], role: 'Reinsurer', status: 'Confirmed' }]);
    component.openInvoiceModal();
    flushInvoiceContextAndHistory({
      ...invoiceContextResponse,
      contractGrossPremium: 2000,
      cedentCommissionPercentage: 10,
      cedentCommissionAmount: 200,
      contractSignedSharePercentage: 20,
      invoiceableNetPremium: 1800,
      alreadyInvoicedAmount: 0,
      remainingInvoiceableAmount: 1800,
      currencyCode: 'TND',
      currencyDecimalPlaces: 3,
      canCreateInvoice: true
    });
    fixture.detectChanges();

    expect(component.invoiceForm.controls.amount.value).toBe(1800);
    expect(component.invoiceCreationAvailableAmount()).toBe(1800);
    const formattedAmount = (value: number) => component.formatMoney(value, 'TND');
    const rows = component.invoiceContextRows();
    expect(rows.find(row => row.label === 'Contract gross premium')?.value).toBe(formattedAmount(2000));
    expect(component.invoiceContextRows().find(row => row.label === 'Cedent commission')?.value).toContain('10');
    expect(rows.find(row => row.label === 'Cedent commission amount')?.value).toBe(formattedAmount(200));
    expect(component.invoiceContextRows().find(row => row.label === 'Contract signed share')?.value).toContain('20');
    expect(rows.find(row => row.label === 'Invoiceable net premium')?.value).toBe(formattedAmount(1800));
    expect(rows.find(row => row.label === 'Remaining invoiceable amount')?.value).toBe(formattedAmount(1800));
    expect(rows.some(row => row.label === 'Signed gross premium' || row.label === 'Signed cedent commission')).toBe(false);
    expect(component.invoiceAmountLimitMessage()).toContain(formattedAmount(1800));

    component.invoiceForm.controls.amount.setValue(1200);
    expect(component.invoiceUnaffectedAmount()).toBe(600);
  });

  it('requires a selected invoice type before creating an invoice', () => {
    enableBackOfficeMode();
    flushContract(123, { ...contractResponse, status: 'Bound' }, [{ ...panelsResponse[0], role: 'Reinsurer', status: 'Confirmed' }]);
    component.openInvoiceModal();
    flushInvoiceContextAndHistory();
    fixture.detectChanges();

    component.invoiceForm.controls.amount.setValue(100);
    component.createInvoice();
    fixture.detectChanges();

    expect(component.invoiceForm.controls.invoiceType.hasError('required')).toBe(true);
    expect(fixture.nativeElement.textContent).toContain('Invoice type is required.');
    httpMock.expectNone('http://localhost:5151/api/back-office/contracts/123/invoices');
  });

  it('allows an Avoir when fully invoiced and uses the backend credit balance', async () => {
    enableBackOfficeMode();
    flushContract(123, { ...contractResponse, status: 'Bound' });
    component.openInvoiceModal();
    flushInvoiceContextAndHistory({
      ...invoiceContextResponse,
      contractGrossPremium: 50,
      cedentCommissionPct: 10,
      alreadyInvoicedAmount: 50,
      remainingInvoiceableAmount: 0,
      availableCreditBalance: 45,
      blockingReason: 'FULLY_INVOICED'
    }, []);
    fixture.detectChanges();

    component.invoiceForm.controls.invoiceType.setValue('AVOIR');
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('How should this Avoir be processed?');
    expect(fixture.nativeElement.textContent).toContain('Pair with an encaissement');
    expect(fixture.nativeElement.textContent).toContain('Generate reinsurer remittances without pairing');
    expect(component.isInvoiceSubmitDisabled()).toBe(true);
    httpMock.expectNone('http://localhost:5151/api/back-office/contracts/123/invoices/preview');
    component.setAvoirProcessingMode('PAIR_WITH_ENCAISSEMENT');
    fixture.detectChanges();
    expect(component.invoiceForm.controls.amount.value).toBe(45);
    expect(fixture.nativeElement.textContent).toContain('Create Avoir for Pairing');
    expect(fixture.nativeElement.textContent).toContain('No outgoing remittances will be generated until it is paired.');
    expect(component.availableAvoirAmount()).toBe(45);
    expect(component.invoiceUnaffectedAmount()).toBe(0);
    httpMock.expectOne('http://localhost:5151/api/back-office/contracts/123/invoices/preview').flush({
      contractId: 123,
      invoiceType: 'AVOIR',
      grossAmount: 45,
      signedAmount: -45,
      allocations: [
        { panelId: 44, reinsurerName: 'AMI', signedSharePct: 60, allocationRatio: 0.6, grossPremium: 27, allocatedGrossPremium: 27, allocatedNetPremium: 27, cedentCommissionPct: 10, cedentCommissionAmount: 2.7, brokeragePct: 10, brokerageAmount: 2.7, otherDeductions: 0, netAmount: 21.6, netPayableAmount: 21.6, signedNetPayableAmount: -21.6, currencyCode: 'TND' },
        { panelId: 45, reinsurerName: 'STAR Assurances', signedSharePct: 40, allocationRatio: 0.4, grossPremium: 18, allocatedGrossPremium: 18, allocatedNetPremium: 18, cedentCommissionPct: 10, cedentCommissionAmount: 1.8, brokeragePct: 20, brokerageAmount: 3.6, otherDeductions: 0, netAmount: 12.6, netPayableAmount: 12.6, signedNetPayableAmount: -12.6, currencyCode: 'TND' }
      ]
    });
    component.invoiceForm.controls.amount.setValue(10);
    await flushPreviewDebounce();
    const amountPreview = httpMock.expectOne('http://localhost:5151/api/back-office/contracts/123/invoices/preview');
    component.invoiceForm.controls.invoiceDate.setValue('2026-10-19');
    component.invoiceForm.controls.label.setValue('retour sur contrat');
    await flushPreviewDebounce();
    expect(amountPreview.cancelled).toBe(true);
    const updatedPreviewRequest = httpMock.expectOne('http://localhost:5151/api/back-office/contracts/123/invoices/preview');
    expect(updatedPreviewRequest.request.body).toEqual(expect.objectContaining({
      invoiceType: 'AVOIR',
      processingMode: 'PAIR_WITH_ENCAISSEMENT',
      grossAmount: 10,
      invoiceDate: '2026-10-19',
      label: 'retour sur contrat'
    }));
    updatedPreviewRequest.flush({
      contractId: 123,
      invoiceType: 'AVOIR',
      grossAmount: 10,
      signedAmount: -10,
      allocations: [
        { panelId: 44, reinsurerName: 'AMI', signedSharePct: 60, allocationRatio: 0.6, grossPremium: 6, allocatedGrossPremium: 6, allocatedNetPremium: 6, cedentCommissionPct: 10, cedentCommissionAmount: 0.6, brokeragePct: 10, brokerageAmount: 0.6, otherDeductions: 0, netAmount: 4.8, netPayableAmount: 4.8, signedNetPayableAmount: -4.8, currencyCode: 'TND' },
        { panelId: 45, reinsurerName: 'STAR Assurances', signedSharePct: 40, allocationRatio: 0.4, grossPremium: 4, allocatedGrossPremium: 4, allocatedNetPremium: 4, cedentCommissionPct: 10, cedentCommissionAmount: 0.4, brokeragePct: 20, brokerageAmount: 0.8, otherDeductions: 0, netAmount: 2.8, netPayableAmount: 2.8, signedNetPayableAmount: -2.8, currencyCode: 'TND' }
      ]
    });
    fixture.detectChanges();
    expect(component.invoiceUnaffectedAmount()).toBe(35);
    expect(component.isInvoiceSubmitDisabled()).toBe(false);
    expect(component.isInvoiceAllocationValid()).toBe(true);
    expect(fixture.nativeElement.textContent).toContain('TND 6,000');
    expect(fixture.nativeElement.textContent).toContain('TND 4,000');
    expect(fixture.nativeElement.textContent).toContain('TND -4,800');
    expect(fixture.nativeElement.textContent).toContain('TND -2,800');
    const submitButton = fixture.nativeElement.querySelector('button[type="submit"]') as HTMLButtonElement;
    expect(submitButton.disabled).toBe(false);
    httpMock.expectNone('http://localhost:5151/api/back-office/contracts/123/invoices/preview');

    submitButton.click();
    fixture.detectChanges();
    const request = httpMock.expectOne('http://localhost:5151/api/back-office/contracts/123/invoices');
    component.createInvoice();
    httpMock.expectNone('http://localhost:5151/api/back-office/contracts/123/invoices');
    expect(request.request.body).toEqual(expect.objectContaining({
      invoiceType: 'AVOIR',
      processingMode: 'PAIR_WITH_ENCAISSEMENT',
      grossAmount: 10,
      invoiceDate: '2026-10-19',
      label: 'retour sur contrat'
    }));
    expect(request.request.body).not.toHaveProperty('allocations');
    expect(request.request.body.grossAmount).toBeGreaterThan(0);
    expect(request.request.body.invoiceType).not.toBe('CREDIT_NOTE');
    const avoir = {
      invoiceId: 92,
      contractId: 123,
      invoiceNumber: 'AV-2026-000001',
      documentNumber: 'AV-2026-000001',
      sequence: 1,
      invoiceType: 'AVOIR',
      invoiceDate: '2026-10-19',
      grossAmount: 10,
      amount: 10,
      signedAmount: -10,
      remainingAmount: 0,
      totalNetAmount: 12,
      currencyCode: 'TND',
      status: 'Draft',
      paymentStatus: 'Unsettled',
      label: 'Credit adjustment',
      allocations: []
    };
    request.flush(avoir);
    flushInvoiceContextAndHistory({ ...invoiceContextResponse, availableCreditBalance: 35, alreadyInvoicedAmount: 50, remainingInvoiceableAmount: 0 }, [avoir]);
    fixture.detectChanges();

    expect(component.invoiceHistory()).toEqual([]);
    expect(component.avoirHistory().map(item => item.invoiceId)).toEqual([92]);
    expect(component.getInvoiceAmount(component.avoirHistory()[0])).toBe(-10);
    expect(fixture.nativeElement.textContent).toContain('Avoir History');
    expect(fixture.nativeElement.textContent).toContain('AV-2026-000001');
    expect(router.navigate).not.toHaveBeenCalledWith(['/workspace/reassurance/back-officer/outgoing-remittances']);
  });

  it('creates direct Avoir remittances only from the backend response and navigates to the existing draft list', async () => {
    enableBackOfficeMode();
    flushContract(123, { ...contractResponse, status: 'Bound' }, [{ ...panelsResponse[0], role: 'Reinsurer', status: 'Confirmed' }]);
    component.openInvoiceModal();
    flushInvoiceContextAndHistory({ ...invoiceContextResponse, availableCreditBalance: 45 }, []);
    component.invoiceForm.controls.invoiceType.setValue('AVOIR');
    component.setAvoirProcessingMode('DIRECT_TO_REMITTANCES');
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('No encaissement will be required.');
    const preview = httpMock.expectOne('http://localhost:5151/api/back-office/contracts/123/invoices/preview');
    expect(preview.request.body.processingMode).toBe('DIRECT_TO_REMITTANCES');
    expect(preview.request.body.idempotencyKey).toEqual(expect.any(String));
    preview.flush({
      contractId: 123,
      invoiceType: 'AVOIR',
      grossAmount: 45,
      signedAmount: -45,
      allocations: [
        { panelId: 44, reinsurerId: 9, reinsurerName: 'AMI', signedSharePct: 60, allocationRatio: 0.6, grossPremium: 27, allocatedGrossPremium: 27, allocatedNetPremium: 27, cedentCommissionPct: 10, cedentCommissionAmount: 2.7, brokeragePct: 10, brokerageAmount: 2.7, otherDeductions: 0, netAmount: 21.6, netPayableAmount: 18.9, currencyCode: 'TND' },
        { panelId: 45, reinsurerId: 10, reinsurerName: 'STAR Assurances', signedSharePct: 40, allocationRatio: 0.4, grossPremium: 18, allocatedGrossPremium: 18, allocatedNetPremium: 18, cedentCommissionPct: 10, cedentCommissionAmount: 1.8, brokeragePct: 20, brokerageAmount: 3.6, otherDeductions: 0, netAmount: 12.6, netPayableAmount: 9, currencyCode: 'TND' }
      ]
    });
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('negative net-payable rows shown above will be created immediately');
    expect(component.isInvoiceSubmitDisabled()).toBe(false);

    component.createInvoice();
    const create = httpMock.expectOne('http://localhost:5151/api/back-office/contracts/123/invoices');
    expect(component.invoiceForm.controls.processingMode.enabled).toBe(true);
    expect(component.invoiceForm.controls.amount.disabled).toBe(true);
    expect(create.request.body.processingMode).toBe('DIRECT_TO_REMITTANCES');
    expect(create.request.body).not.toHaveProperty('bankReceiptId');
    expect(create.request.body).not.toHaveProperty('receiptId');
    expect(create.request.body).not.toHaveProperty('allocations');
    expect(create.request.body.idempotencyKey).toEqual(preview.request.body.idempotencyKey);
    component.createInvoice();
    httpMock.expectNone('http://localhost:5151/api/back-office/contracts/123/invoices');
    const remittance = {
      remittanceId: 81,
      remittanceRef: 81,
      remittanceReference: 'REM-81',
      sourceType: 'AVOIR',
      invoiceId: 96,
      invoiceNumber: 'AV-2026-000004',
      panelId: 44,
      counterpartyId: 9,
      counterpartyName: 'AMI',
      beneficiaryType: 'Reinsurer',
      netPayableAmount: 18.9,
      signedNetPayableAmount: -18.9,
      currencyId: 1,
      currencyCode: 'TND',
      status: 'Draft',
      description: 'Avoir allocation'
    };
    create.flush({
      invoiceId: 96,
      contractId: 123,
      invoiceNumber: 'AV-2026-000004',
      documentNumber: 'AV-2026-000004',
      invoiceType: 'AVOIR',
      processingMode: 'DIRECT_TO_REMITTANCES',
      pairingRequired: false,
      createdRemittances: [remittance],
      invoiceDate: '2026-10-21',
      grossAmount: 45,
      amount: 45,
      signedAmount: -45,
      remainingAmount: 0,
      totalNetAmount: 45,
      currencyCode: 'TND',
      status: 'Draft',
      label: 'Direct Avoir',
      allocations: []
    });
    expect(component.isInvoiceModalOpen()).toBe(false);
    expect(router.navigate).toHaveBeenCalledWith(['/workspace/reassurance/back-officer/outgoing-remittances']);
    flushInvoiceContextAndHistory({ ...invoiceContextResponse, availableCreditBalance: 0 }, []);
  });

  it('blocks Avoir creation when the backend reports no net invoiced balance available to credit', () => {
    enableBackOfficeMode();
    flushContract(123, { ...contractResponse, status: 'Bound' });
    component.openInvoiceModal();
    flushInvoiceContextAndHistory({ ...invoiceContextResponse, availableCreditBalance: 0, alreadyInvoicedAmount: 0 }, []);
    component.invoiceForm.controls.invoiceType.setValue('AVOIR');
    fixture.detectChanges();

    expect(component.availableAvoirAmount()).toBe(0);
    expect(fixture.nativeElement.textContent).toContain('Available credit balance');
    expect(component.isInvoiceSubmitDisabled()).toBe(true);
    component.invoiceForm.controls.amount.setValue(10);
    component.createInvoice();
    httpMock.expectNone('http://localhost:5151/api/back-office/contracts/123/invoices');
  });

  it('keeps invoice history visible, filters other contracts, and offers invoice debit-note actions', () => {
    enableBackOfficeMode();
    flushContract(123, { ...contractResponse, status: 'Bound' }, [{ ...panelsResponse[0], role: 'Reinsurer', status: 'Confirmed' }]);
    flushInvoiceContextAndHistory(invoiceContextResponse, [
      {
        invoiceId: 91,
        contractId: 123,
        invoiceNumber: 'INV-2026-000001',
        sequence: 1,
        invoiceType: 'INVOICE',
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
        invoiceType: 'INVOICE',
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
    expect(rowButtons).toContain('Download Invoice PDF');
  });

  it('labels invoice and Avoir history downloads with their document type', () => {
    enableBackOfficeMode();
    flushContract(123, { ...contractResponse, status: 'Bound' }, [{ ...panelsResponse[0], role: 'Reinsurer', status: 'Confirmed' }]);
    flushInvoiceContextAndHistory(invoiceContextResponse, [
      { ...invoiceResponse, invoiceId: 91, contractId: 123, invoiceType: 'INVOICE' },
      { ...invoiceResponse, invoiceId: 92, contractId: 123, invoiceType: 'AVOIR', invoiceNumber: 'AV-2026-000001' }
    ]);
    fixture.detectChanges();

    const rowButtons = Array.from(fixture.nativeElement.querySelectorAll('td button') as NodeListOf<HTMLButtonElement>)
      .map(button => button.textContent?.trim());
    expect(rowButtons).toContain('Download Invoice PDF');
    expect(rowButtons).toContain('Download Avoir');
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
        invoiceType: 'INVOICE',
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
        invoiceType: 'INVOICE',
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

  it('keeps created invoices visible and offers retry when invoice-history reload fails', async () => {
    enableBackOfficeMode();
    flushContract(123, { ...contractResponse, status: 'Bound' }, [{ ...panelsResponse[0], role: 'Reinsurer', status: 'Confirmed' }]);
    flushInvoiceContextAndHistory();
    component.invoiceContext.set(invoiceContextResponse as any);
    component.invoiceForm.controls.invoiceType.setValue('INVOICE');
    httpMock.expectOne('http://localhost:5151/api/back-office/contracts/123/invoices/preview').flush({
      contractId: 123,
      invoiceableGrossPremium: 1500,
      alreadyInvoicedAmount: 250,
      grossAmount: 1250,
      remainingAmount: 0,
      allocations: []
    });
    component.invoiceForm.controls.amount.setValue(50);
    await flushPreviewDebounce();
    httpMock.expectOne('http://localhost:5151/api/back-office/contracts/123/invoices/preview').flush({
      contractId: 123,
      invoiceableGrossPremium: 1500,
      alreadyInvoicedAmount: 250,
      grossAmount: 50,
      remainingAmount: 1200,
      allocations: [{ panelId: 44, grossPremium: 55.556, allocatedGrossPremium: 55.556, allocatedNetPremium: 50, allocationRatio: 1, cedentCommissionPct: 10, cedentCommissionAmount: 5.556, netAmount: 45, currencyCode: 'TND' }]
    });

    component.createInvoice();
    httpMock.expectOne('http://localhost:5151/api/back-office/contracts/123/invoices').flush({
      invoiceId: 93,
      contractId: 123,
      invoiceNumber: 'INV-2026-000003',
      sequence: 3,
      invoiceType: 'INVOICE',
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
    expect(headerButtons).toContain('Create an invoice first');

    component.invoiceContext.set({
      ...invoiceContextResponse,
      alreadyInvoicedAmount: 1500,
      remainingInvoiceableAmount: 0
    } as any);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Create an invoice first');
  });

  it('downloads the contract Credit Note using the contract ID, independent of invoice history', () => {
    enableBackOfficeMode();
    flushContract(123, {
      ...contractResponse,
      status: 'Bound',
      hasAvoir: true,
      contractDocumentType: 'CREDIT_NOTE',
      contractDocumentDownloadUrl: '/api/back-office/contracts/123/financial-note/pdf'
    });
    flushInvoiceContextAndHistory(invoiceContextResponse, []);
    expect(component.contractDocumentActionLabel()).toBe('Download Credit Note');
    component.downloadContractFinancialNote();
    const request = httpMock.expectOne('http://localhost:5151/api/back-office/contracts/123/financial-note/pdf');
    expect(request.request.method).toBe('GET');
    expect(request.request.responseType).toBe('blob');
    request.flush(new Blob(['%PDF-1.4'], { type: 'application/pdf' }), { headers: {
      'Content-Disposition': 'attachment; filename="CreditNote_CN-IT26-F-PD-0001.pdf"',
      'Content-Type': 'application/pdf', 'X-Financial-Note-Type': 'CREDIT_NOTE',
      'X-Financial-Note-Reference': 'CN-IT26-F-PD-0001'
    } });
  });

  it('downloads a contract Debit Note without reading or selecting Invoice History', () => {
    enableBackOfficeMode();
    flushContract(123, { ...contractResponse, status: 'Bound', hasAvoir: false, contractDocumentType: 'DEBIT_NOTE' });
    flushInvoiceContextAndHistory(invoiceContextResponse, [
      { ...invoiceResponse, invoiceId: 91, invoiceType: 'INVOICE' },
      { ...invoiceResponse, invoiceId: 92, invoiceType: 'INVOICE_FEES' }
    ]);
    expect(component.contractDocumentActionLabel()).toBe('Download Debit Note');
    component.downloadContractFinancialNote();
    component.downloadContractFinancialNote();
    const request = httpMock.expectOne('http://localhost:5151/api/back-office/contracts/123/financial-note/pdf');
    expect(request.request.responseType).toBe('blob');
    request.flush(new Blob(['%PDF-1.4'], { type: 'application/pdf' }), { headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'attachment; filename="DebitNote_DN-IT26-F-PD-0001.pdf"',
      'X-Financial-Note-Type': 'DEBIT_NOTE'
    }
    });
  });

  it('keeps the Bound contract note action available when there are no invoices', () => {
    enableBackOfficeMode();
    flushContract(123, { ...contractResponse, status: 'Bound' }, [{ ...panelsResponse[0], role: 'Reinsurer', status: 'Confirmed' }]);
    flushInvoiceContextAndHistory(invoiceContextResponse, []);

    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Download Debit Note');
    expect(fixture.nativeElement.textContent).not.toContain('Select an invoice');
    httpMock.expectNone(request => request.url.includes('/financial-note/pdf'));
  });

  it('downloads an invoice debit note once using the invoice ID and backend filename', async () => {
    flushContract();
    const downloadBlob = vi.spyOn(
      component as unknown as { downloadBlob: (blob: Blob, filename: string) => void },
      'downloadBlob'
    );
    const invoice = { ...invoiceResponse, invoiceId: 91, invoiceType: 'INVOICE' };
    component.downloadInvoiceDocument(invoice);
    component.downloadInvoiceDocument(invoice);

    const request = httpMock.expectOne('http://localhost:5151/api/back-office/invoices/91/pdf');
    expect(request.request.method).toBe('GET');
    expect(request.request.responseType).toBe('blob');
    expect(component.downloadingDebitNoteInvoiceId()).toBe(91);
    const pdf = new Blob(['%PDF-1.7'], { type: 'application/pdf' });
    request.flush(pdf, {
      headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': 'attachment; filename="Invoice-INV-2026-000001.pdf"' }
    });

    await vi.waitFor(() => expect(downloadBlob).toHaveBeenCalledWith(pdf, 'Invoice-INV-2026-000001.pdf'));
    expect(component.downloadingDebitNoteInvoiceId()).toBeNull();
  });

  it('uses the Avoir ID for its credit note and rejects a non-PDF response with trace details', async () => {
    flushContract();
    const downloadBlob = vi.spyOn(
      component as unknown as { downloadBlob: (blob: Blob, filename: string) => void },
      'downloadBlob'
    );
    const avoir = { ...invoiceResponse, invoiceId: 92, invoiceType: 'AVOIR', invoiceNumber: 'AV-2026-000001' };
    component.downloadInvoiceDocument(avoir);

    const request = httpMock.expectOne('http://localhost:5151/api/back-office/avoirs/92/pdf');
    expect(request.request.responseType).toBe('blob');
    request.flush(new Blob([JSON.stringify({ message: 'Credit note is unavailable.', traceId: 'trace-avoir-92' })], { type: 'application/problem+json' }), {
      status: 500,
      statusText: 'Server Error'
    });

    await vi.waitFor(() => expect(component.invoiceRowDownloadErrors()[92]).toContain('Credit note is unavailable.'));
    expect(component.invoiceRowDownloadErrors()[92]).toContain('trace-avoir-92');
    expect(downloadBlob).not.toHaveBeenCalled();
  });

  it('does not download a successful HTML response as a PDF', async () => {
    flushContract();
    const downloadBlob = vi.spyOn(
      component as unknown as { downloadBlob: (blob: Blob, filename: string) => void },
      'downloadBlob'
    );
    component.downloadInvoiceDocument({ ...invoiceResponse, invoiceId: 93, invoiceType: 'INVOICE' });
    const request = httpMock.expectOne('http://localhost:5151/api/back-office/invoices/93/pdf');
    request.flush(new Blob(['<html>not a PDF</html>'], { type: 'text/html' }), {
      headers: { 'Content-Type': 'text/html' }
    });

    await vi.waitFor(() => expect(component.invoiceRowDownloadErrors()[93]).toContain('not a valid PDF'));
    expect(downloadBlob).not.toHaveBeenCalled();
  });

  it('enables the contract note action independently of Invoice History', () => {
    enableBackOfficeMode();
    flushContract(123, { ...contractResponse, status: 'Bound' }, [{ ...panelsResponse[0], role: 'Reinsurer', status: 'Confirmed' }]);
    flushInvoiceContextAndHistory(invoiceContextResponse, []);

    fixture.detectChanges();

    const button = Array.from(fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>)
      .find(item => item.textContent?.trim() === 'Download Debit Note');
    expect(button?.disabled).toBe(false);
    component.downloadContractFinancialNote();
    const request = httpMock.expectOne('http://localhost:5151/api/back-office/contracts/123/financial-note/pdf');
    request.flush(new Blob(['%PDF-1.4'], { type: 'application/pdf' }), { headers: {
      'Content-Type': 'application/pdf', 'X-Financial-Note-Type': 'DEBIT_NOTE',
      'Content-Disposition': 'attachment; filename="DebitNote_DN-IT26-F-PD-0001.pdf"'
    } });
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

  it('shows backend invoice validation responses', async () => {
    enableBackOfficeMode();
    flushContract(123, { ...contractResponse, status: 'Bound' }, [{ ...panelsResponse[0], role: 'Reinsurer', status: 'Confirmed' }]);
    component.invoiceContext.set(invoiceContextResponse as any);

    component.openInvoiceModal();
    flushInvoiceContextAndHistory();
    component.invoiceForm.controls.invoiceType.setValue('INVOICE');
    httpMock.expectOne('http://localhost:5151/api/back-office/contracts/123/invoices/preview').flush({
      contractId: 123,
      invoiceableGrossPremium: 1500,
      alreadyInvoicedAmount: 250,
      grossAmount: 1250,
      remainingAmount: 0,
      allocations: []
    });
    component.invoiceForm.controls.amount.setValue(1000);
    await flushPreviewDebounce();
    httpMock.expectOne('http://localhost:5151/api/back-office/contracts/123/invoices/preview').flush({
      contractId: 123,
      invoiceableGrossPremium: 1500,
      alreadyInvoicedAmount: 250,
      grossAmount: 1000,
      remainingAmount: 250,
      allocations: [{ panelId: 44, grossPremium: 1111.111, allocatedGrossPremium: 1111.111, allocatedNetPremium: 1000, allocationRatio: 1, cedentCommissionPct: 10, cedentCommissionAmount: 111.111, netAmount: 900, currencyCode: 'TND' }]
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

  it('clears stale Avoir allocations on preview 400 and blocks creation while preserving form values', async () => {
    enableBackOfficeMode();
    flushContract(123, { ...contractResponse, status: 'Bound' });
    component.openInvoiceModal();
    flushInvoiceContextAndHistory({ ...invoiceContextResponse, availableCreditBalance: 45 }, []);
    component.invoiceForm.controls.invoiceType.setValue('AVOIR');
    component.setAvoirProcessingMode('DIRECT_TO_REMITTANCES');

    const firstPreview = httpMock.expectOne('http://localhost:5151/api/back-office/contracts/123/invoices/preview');
    firstPreview.flush({
      contractId: 123,
      invoiceType: 'AVOIR',
      grossAmount: 45,
      allocations: [{ panelId: 44, reinsurerName: 'AMI', allocatedGrossPremium: 45, allocatedNetPremium: 45, cedentCommissionPct: 0, cedentCommissionAmount: 0, signedNetPayableAmount: -45, currencyCode: 'TND' }]
    });
    component.invoiceForm.controls.amount.setValue(10);
    await flushPreviewDebounce();

    const failedPreview = httpMock.expectOne('http://localhost:5151/api/back-office/contracts/123/invoices/preview');
    expect(failedPreview.request.body).toEqual(expect.objectContaining({
      invoiceType: 'AVOIR',
      processingMode: 'DIRECT_TO_REMITTANCES',
      grossAmount: 10
    }));
    failedPreview.flush({
      message: 'Avoir allocation validation failed.',
      detail: 'The Avoir allocation for reinsurer AMI exceeds its available invoiced allocation.',
      errors: { allocations: ['The Avoir allocation for reinsurer AMI exceeds its available invoiced allocation.'] },
      traceId: 'preview-trace-123'
    }, { status: 400, statusText: 'Bad Request' });
    fixture.detectChanges();

    expect(component.invoicePreview()).toBeNull();
    expect(component.invoicePreviewAllocations()).toEqual([]);
    expect(component.invoiceForm.controls.amount.value).toBe(10);
    expect(component.isInvoiceSubmitDisabled()).toBe(true);
    expect(fixture.nativeElement.textContent).toContain('Avoir allocation validation failed.');
    expect(fixture.nativeElement.textContent).toContain('HTTP 400');
    expect(fixture.nativeElement.textContent).toContain('The Avoir allocation for reinsurer AMI exceeds its available invoiced allocation.');
    expect(fixture.nativeElement.textContent).toContain('allocations: The Avoir allocation for reinsurer AMI exceeds its available invoiced allocation.');
    expect(fixture.nativeElement.textContent).toContain('preview-trace-123');

    component.createInvoice();
    httpMock.expectNone('http://localhost:5151/api/back-office/contracts/123/invoices');
  });

  it('shows HTTP status, backend exception detail and trace ID for direct Avoir creation errors', () => {
    enableBackOfficeMode();
    flushContract(123, { ...contractResponse, status: 'Bound' });
    component.openInvoiceModal();
    flushInvoiceContextAndHistory({ ...invoiceContextResponse, availableCreditBalance: 45 }, []);
    component.invoiceForm.controls.invoiceType.setValue('AVOIR');
    component.setAvoirProcessingMode('DIRECT_TO_REMITTANCES');
    httpMock.expectOne('http://localhost:5151/api/back-office/contracts/123/invoices/preview').flush({
      contractId: 123,
      invoiceType: 'AVOIR',
      grossAmount: 45,
      allocations: [{ panelId: 44, reinsurerName: 'AMI', allocatedGrossPremium: 45, allocatedNetPremium: 45, cedentCommissionPct: 0, cedentCommissionAmount: 0, signedNetPayableAmount: -45, currencyCode: 'TND' }]
    });
    expect(component.invoicePreviewAllocations()).toHaveLength(1);
    expect(component.isInvoiceAllocationValid()).toBe(true);

    component.createInvoice();
    const create = httpMock.expectOne('http://localhost:5151/api/back-office/contracts/123/invoices');
    expect(create.request.body.invoiceType).toBe('AVOIR');
    expect(create.request.body.processingMode).toBe('DIRECT_TO_REMITTANCES');
    expect(create.request.body).not.toHaveProperty('receiptId');
    expect(create.request.body).not.toHaveProperty('bankReceiptId');
    expect(create.request.body).not.toHaveProperty('encaissementId');
    create.flush({
      title: 'Server error',
      detail: 'System.NullReferenceException: object reference was null.',
      traceId: 'create-trace-456'
    }, { status: 500, statusText: 'Internal Server Error' });
    fixture.detectChanges();

    expect(component.invoiceError()).toContain('HTTP 500');
    expect(component.invoiceError()).not.toContain('NullReferenceException');
    expect(fixture.nativeElement.textContent).toContain('HTTP 500');
    expect(fixture.nativeElement.textContent).toContain('System.NullReferenceException: object reference was null.');
    expect(fixture.nativeElement.textContent).toContain('create-trace-456');
  });
});
