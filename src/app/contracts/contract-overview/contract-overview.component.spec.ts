import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ContractOverviewComponent } from './contract-overview.component';

describe('ContractOverviewComponent', () => {
  let fixture: ComponentFixture<ContractOverviewComponent>;
  let component: ContractOverviewComponent;
  let httpMock: HttpTestingController;
  let router: Router;
  let snackBar: { open: ReturnType<typeof vi.fn> };

  const contractResponse = {
    id: 123,
    umr: 'B1235FAC2026-X',
    name: 'Property Facultative Contract STAR',
    contractType: 'Facultative',
    status: 'Draft',
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

  beforeEach(async () => {
    snackBar = { open: vi.fn() };

    await TestBed.configureTestingModule({
      imports: [ContractOverviewComponent],
      providers: [
        provideRouter([]),
        provideNoopAnimations(),
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { queryParamMap: convertToParamMap({ contractId: '123' }) } }
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
    vi.restoreAllMocks();
  });

  function flushContract(): void {
    httpMock.expectOne('http://localhost:5151/api/contracts/123/overview').flush(contractResponse);
    httpMock.expectOne('http://localhost:5151/api/contracts/123/panels').flush(panelsResponse);
    fixture.detectChanges();
  }

  it('loads and renders the saved contract overview from the draft contract ID', () => {
    flushContract();

    const text = fixture.nativeElement.textContent;
    expect(text).toContain('B1235FAC2026-X');
    expect(text).toContain('Property Facultative Contract STAR');
    expect(text).toContain('STAR Assurances');
    expect(text).toContain('TND');
    expect(text).toContain('PD - Property Damage');
    expect(text).toContain('PD-MB - Machinery Breakdown');
    expect(text).toContain('PD-EXT - Debris Removal');
    expect(text).toContain('TSI');
    expect(text).toContain('Gross premium');
    expect(text).toContain('Draft');
    expect(text).toContain('Global Re');
    expect(text).toContain('Add Reinsurer');
    expect(text).toContain('Start Binding Phase');
    expect(text).not.toContain('Dashboard / Create Contract');
    expect(text).not.toContain('Step 1');
    expect(text).not.toContain('Save Draft');
    expect(text).not.toContain('Start Placement');
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
      items: [{ id: 9, name: 'Global Re', type: 'Reinsurer', email: null, status: 'Active', isActive: true, legacyClientId: null, legacyCompanyCode: null }],
      pageNumber: 1,
      pageSize: 20,
      totalCount: 1,
      totalPages: 1
    });

    component.selectReinsurer({ id: 9, name: 'Global Re', type: 'Reinsurer', email: null, status: 'Active', isActive: true, legacyClientId: null, legacyCompanyCode: null });
    component.panelForm.patchValue({
      writtenSharePct: 40,
      signedSharePct: 35,
      sumInsured: 400000,
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
      deductible: 2000,
      premiumRatePct: 1.2,
      grossPremium: 48000,
      brokeragePct: 2,
      otherDeductions: 300,
      premiumReference: 'RE-PREM-2'
    });
    createPanel.flush({ idPanel: 45, idContract: 123, idCounterparty: 9, reinsurerName: 'Global Re', status: 'Draft' });

    httpMock.expectOne('http://localhost:5151/api/contracts/123/panels').flush([
      ...panelsResponse,
      { idPanel: 45, idContract: 123, idCounterparty: 9, reinsurerName: 'Global Re', role: 'Follower', status: 'Draft' }
    ]);
    fixture.detectChanges();

    expect(component.isReinsurerFormOpen()).toBe(false);
    expect(component.activePanelId()).toBe(45);
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
    expect(component.panelForm.controls.netPremium.value).toBe(52900);
    expect(component.panelForm.controls.status.value).toBe('Draft');
    expect(fixture.nativeElement.textContent).not.toContain('No Reinsurer counterparties found.');
    expect(fixture.nativeElement.textContent).not.toContain('Select a Reinsurer from the list.');

    component.panelForm.patchValue({
      signedSharePct: 46,
      netPremium: 53000,
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
      netPremium: 53000,
      status: 'Confirmed'
    }));
    updateRequest.flush({ ...panelsResponse[0], signedSharePct: 46, netPremium: 53000, status: 'Confirmed' });

    httpMock.expectOne('http://localhost:5151/api/contracts/123/panels').flush([
      { ...panelsResponse[0], signedSharePct: 46, netPremium: 53000, status: 'Confirmed' }
    ]);
    fixture.detectChanges();

    expect(component.isReinsurerFormOpen()).toBe(false);
    expect(component.activePanelId()).toBe(44);
    expect(component.activePanel()?.status).toBe('Confirmed');
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
    httpMock.expectOne('http://localhost:5151/api/contracts/123/overview').flush(contractResponse);
    httpMock.expectOne('http://localhost:5151/api/contracts/123/panels').flush([]);
    fixture.detectChanges();

    component.startBindingPhase();

    httpMock.expectOne('http://localhost:5151/api/contracts/123/slips').flush(new Blob([]));
    httpMock.expectOne('http://localhost:5151/api/contracts/123/start-binding').flush({
      message: 'Please confirm at least one reinsurer before starting the binding phase.'
    }, {
      status: 400,
      statusText: 'Bad Request'
    });
    fixture.detectChanges();

    expect(component.slipMessage()).toBe('Please confirm at least one reinsurer before starting the binding phase.');
  });

  it('downloads the slip blob and starts the binding phase', () => {
    flushContract();

    component.startBindingPhase();
    const request = httpMock.expectOne('http://localhost:5151/api/contracts/123/slips');
    expect(request.request.method).toBe('GET');
    request.flush(new Blob(['docx'], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }), {
      headers: { 'Content-Disposition': 'attachment; filename="slip.docx"' }
    });

    const bindingRequest = httpMock.expectOne('http://localhost:5151/api/contracts/123/start-binding');
    expect(bindingRequest.request.method).toBe('POST');
    bindingRequest.flush({});

    httpMock.expectOne('http://localhost:5151/api/contracts/123/overview').flush(contractResponse);
    httpMock.expectOne('http://localhost:5151/api/contracts/123/panels').flush(panelsResponse);
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

    component.startBindingPhase();
    httpMock.expectOne('http://localhost:5151/api/contracts/123/slips').flush(new Blob([]));
    httpMock.expectOne('http://localhost:5151/api/contracts/123/start-binding').flush({});
    httpMock.expectOne('http://localhost:5151/api/contracts/123/overview').flush(contractResponse);
    httpMock.expectOne('http://localhost:5151/api/contracts/123/panels').flush(panelsResponse);
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

    component.startBindingPhase();
    httpMock.expectOne('http://localhost:5151/api/contracts/123/slips').flush(new Blob(['server error']), {
      status: 500,
      statusText: 'Server Error'
    });
    httpMock.expectOne('http://localhost:5151/api/contracts/123/start-binding').flush({});
    httpMock.expectOne('http://localhost:5151/api/contracts/123/overview').flush(contractResponse);
    httpMock.expectOne('http://localhost:5151/api/contracts/123/panels').flush(panelsResponse);
    fixture.detectChanges();

    expect(component.slipMessage()).toBe('Unable to check or download slips for this contract right now.');
  });
});
