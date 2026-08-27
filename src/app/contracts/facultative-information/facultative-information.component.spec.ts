import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter, Router, convertToParamMap } from '@angular/router';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideHttpClient } from '@angular/common/http';
import { MatSnackBar } from '@angular/material/snack-bar';
import { FacultativeInformationComponent } from './facultative-information.component';

describe('FacultativeInformationComponent', () => {
  let fixture: ComponentFixture<FacultativeInformationComponent>;
  let component: FacultativeInformationComponent;
  let httpMock: HttpTestingController;
  let router: Router;
  let snackBar: { open: ReturnType<typeof vi.fn> };

  const currenciesResponse = [
    { id: 1, code: 'MAD', name: 'Moroccan Dirham', symbol: 'DH', decimalPlaces: 2, isDefault: true },
    { id: 2, code: 'EUR', name: 'Euro', symbol: 'EUR', decimalPlaces: 2, isDefault: false }
  ];

  beforeEach(async () => {
    snackBar = {
      open: vi.fn()
    };

    await TestBed.configureTestingModule({
      imports: [FacultativeInformationComponent],
      providers: [
        provideRouter([]),
        provideNoopAnimations(),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: MatSnackBar, useValue: snackBar }
      ]
    }).compileComponents();

    router = TestBed.inject(Router);
    vi.spyOn(router, 'navigate').mockResolvedValue(true);
    vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);

    fixture = TestBed.createComponent(FacultativeInformationComponent);
    component = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);
    fixture.detectChanges();

    httpMock.expectOne('http://localhost:5151/api/reference-data/currencies').flush(currenciesResponse);
    fixture.detectChanges();
  });

  afterEach(() => {
    httpMock.verify();
  });

  function expectCedentLookup(search: string | null) {
    return httpMock.expectOne(req =>
      req.url === 'http://localhost:5151/api/reference-data/cedents'
      && req.params.get('page') === '1'
      && req.params.get('pageSize') === '20'
      && req.params.get('search') === search
    );
  }

  async function selectCedent(
    search = 'acme',
    results = [{ id: 99, name: 'Acme Cedent', city: 'Tunis', country: 'Tunisie' }]
  ): Promise<void> {
    component.cedentSearchControl.setValue(search);
    await new Promise(resolve => setTimeout(resolve, 350));
    await fixture.whenStable();
    const request = expectCedentLookup(search);
    request.flush({
      items: results,
      pageNumber: 1,
      pageSize: 20,
      totalCount: results.length,
      totalPages: 1
    });
    fixture.detectChanges();
    component.selectCedent(results[0]);
    fixture.detectChanges();
  }

  function fillRequiredFields(): void {
    component.form.patchValue({
      name: 'FAC 2026',
      inceptionDate: '2026-08-19',
      expiryDate: '2026-12-31'
    });
    fixture.detectChanges();
  }

  it('selects the default currency returned by the API', () => {
    expect(component.form.controls.currencyId.value).toBe(1);
  });

  it('uses the cedent autocomplete API', async () => {
    await selectCedent();

    expect(component.form.controls.counterpartyId.value).toBe(99);
    expect(component.cedentSearchControl.value).toBe('Acme Cedent');
  });

  it('loads the default cedent list when the input is focused without text', () => {
    component.openCedentDropdown();
    const request = expectCedentLookup(null);
    request.flush({
      items: [{ id: 3, name: 'ami', city: 'Tunis', country: 'Tunisie' }],
      pageNumber: 1,
      pageSize: 20,
      totalCount: 1,
      totalPages: 1
    });
    fixture.detectChanges();

    expect(component.isCedentDropdownOpen()).toBe(true);
    expect(component.cedentResults()).toEqual([{ id: 3, name: 'ami', city: 'Tunis', country: 'Tunisie' }]);
  });

  it('clears counterpartyId when the selected cedent text is edited', async () => {
    await selectCedent();

    component.cedentSearchControl.setValue('Acme Cedent Updated');
    await new Promise(resolve => setTimeout(resolve, 350));
    await fixture.whenStable();
    expectCedentLookup('Acme Cedent Updated').flush({
      items: [],
      pageNumber: 1,
      pageSize: 20,
      totalCount: 0,
      totalPages: 0
    });
    fixture.detectChanges();

    expect(component.form.controls.counterpartyId.value).toBeNull();
    expect(component.summary().cedent).toBe('Not selected');
  });

  it('validates that expiry date cannot be before inception date', () => {
    component.form.patchValue({
      inceptionDate: '2026-09-01',
      expiryDate: '2026-08-31'
    });
    fixture.detectChanges();

    expect(component.form.hasError('expiryBeforeInception')).toBe(true);
  });

  it('validates signed share against written share and percentage limits', () => {
    component.form.patchValue({
      writtenSharePct: 40,
      signedSharePct: 50
    });
    fixture.detectChanges();

    expect(component.form.hasError('signedShareExceedsWrittenShare')).toBe(true);
    component.form.controls.signedSharePct.setValue(120);
    expect(component.form.controls.signedSharePct.hasError('max')).toBe(true);
  });

  it('requires a fronting reference when fronting is enabled', () => {
    component.form.controls.isFronting.setValue(true);
    component.form.controls.frontingReference.markAsTouched();
    fixture.detectChanges();

    expect(component.form.controls.frontingReference.hasError('required')).toBe(true);
  });

  it('calculates the net premium preview using the selected currency metadata', () => {
    component.form.patchValue({
      grossPremium: 1000,
      cedentCommissionPct: 10
    });
    fixture.detectChanges();

    expect(component.summary().estimatedNetPremium).toBe(900);
    expect(component.formatMoney(component.summary().estimatedNetPremium)).toMatch(/^MAD 900[.,]00 \(DH\)$/);
  });

  it('uses POST on the first save and never sends multipart data', async () => {
    fillRequiredFields();
    await selectCedent();

    component.saveDraft();
    fixture.detectChanges();

    const request = httpMock.expectOne('http://localhost:5151/api/contracts/facultative');
    expect(request.request.method).toBe('POST');
    expect(request.request.body.netPremiumCedent).toBeUndefined();
    expect(request.request.body.cedentName).toBeUndefined();
    expect(request.request.body).not.toBeInstanceOf(FormData);
    expect(request.request.body.status).toBeUndefined();
    expect(request.request.body.counterpartyId).toBe(99);
    expect(component.isSaving()).toBe(true);

    request.flush({
      contractId: 123,
      status: 'DRAFT',
      netPremiumCedent: 875,
      name: 'FAC 2026',
      counterpartyId: 99,
      currencyId: 1,
      inceptionDate: '2026-08-19',
      expiryDate: '2026-12-31',
      isHighPriority: false,
      isFronting: false
    });
    fixture.detectChanges();

    expect(component.contractId()).toBe(123);
    expect(component.isSaving()).toBe(false);
  });

  it('uses PUT after a contract ID exists', async () => {
    fillRequiredFields();
    await selectCedent();

    component.saveDraft();
    httpMock.expectOne('http://localhost:5151/api/contracts/facultative').flush({
      contractId: 123,
      status: 'DRAFT',
      netPremiumCedent: 875,
      name: 'FAC 2026',
      counterpartyId: 99,
      currencyId: 1,
      inceptionDate: '2026-08-19',
      expiryDate: '2026-12-31',
      isHighPriority: false,
      isFronting: false
    });

    component.form.controls.umr.setValue('UMR-2');
    component.saveDraft();
    fixture.detectChanges();

    const request = httpMock.expectOne('http://localhost:5151/api/contracts/facultative/123');
    expect(request.request.method).toBe('PUT');
    request.flush({
      contractId: 123,
      status: 'DRAFT',
      netPremiumCedent: 875,
      name: 'FAC 2026',
      counterpartyId: 99,
      currencyId: 1,
      inceptionDate: '2026-08-19',
      expiryDate: '2026-12-31',
      isHighPriority: false,
      isFronting: false
    });
  });

  it('displays backend validation errors on the mapped fields', async () => {
    fillRequiredFields();
    await selectCedent();

    component.saveDraft();
    const request = httpMock.expectOne('http://localhost:5151/api/contracts/facultative');
    request.flush({
      title: 'Validation failed',
      errors: {
        name: ['Name is invalid'],
        umr: ['Duplicate UMR']
      }
    }, { status: 400, statusText: 'Bad Request' });
    fixture.detectChanges();

    expect(component.form.controls.name.errors?.['serverError']).toBe('Name is invalid');
    expect(component.form.controls.umr.errors?.['serverError']).toBe('Duplicate UMR');
  });

  it('keeps the contract in Draft when continuing to the placeholder step', async () => {
    fillRequiredFields();
    await selectCedent();

    component.continueToConditions();
    const request = httpMock.expectOne('http://localhost:5151/api/contracts/facultative');
    request.flush({
      contractId: 123,
      status: 'DRAFT',
      netPremiumCedent: 900,
      name: 'FAC 2026',
      counterpartyId: 99,
      currencyId: 1,
      inceptionDate: '2026-08-19',
      expiryDate: '2026-12-31',
      isHighPriority: false,
      isFronting: false
    });

    expect(component.currentStatus).toBe('Draft');
    expect(router.navigate).toHaveBeenCalledWith(['/workspace/reassurance/front-officer/contracts/new/conditions'], {
      queryParams: { contractId: 123 }
    });
  });
});

describe('FacultativeInformationComponent existing contract', () => {
  let fixture: ComponentFixture<FacultativeInformationComponent>;
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FacultativeInformationComponent],
      providers: [
        provideRouter([]),
        provideNoopAnimations(),
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { queryParamMap: convertToParamMap({ contractId: '2' }) } }
        },
        { provide: MatSnackBar, useValue: { open: vi.fn() } }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(FacultativeInformationComponent);
    httpMock = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('loads the selected draft into the existing form and keeps subsequent saves on PUT', () => {
    httpMock.expectOne('http://localhost:5151/api/reference-data/currencies').flush([
      { id: 1, code: 'TND', name: 'Tunisian Dinar', symbol: 'DT', decimalPlaces: 3, isDefault: true }
    ]);
    httpMock.expectOne('http://localhost:5151/api/contracts/facultative/2').flush({
      contractId: 2,
      status: 'Draft',
      netPremiumCedent: 112500,
      umr: 'B1235FAC2026-X',
      name: 'Property Facultative Contract STAR',
      counterpartyId: 2,
      counterpartyName: 'STAR Assurances',
      currencyId: 1,
      currencyCode: 'TND',
      receptionDate: '2026-08-20',
      inceptionDate: '2026-09-20',
      expiryDate: '2027-08-10',
      writtenSharePct: 100,
      signedSharePct: 100,
      fees: null,
      isHighPriority: false,
      sumInsured: 1000000,
      deductible: null,
      premiumRate: null,
      grossPremium: 125000,
      cedentCommissionPct: 10,
      cedentPremiumReference: null,
      isFronting: false,
      frontingReference: null,
      memoText: null
    });
    fixture.detectChanges();

    const component = fixture.componentInstance;
    expect(component.contractId()).toBe(2);
    expect(component.form.controls.umr.value).toBe('B1235FAC2026-X');
    expect(component.form.controls.name.value).toBe('Property Facultative Contract STAR');
    expect(component.form.controls.counterpartyId.value).toBe(2);
    expect(component.cedentSearchControl.value).toBe('STAR Assurances');
    expect(component.form.controls.currencyId.value).toBe(1);

    component.saveDraft();
    const update = httpMock.expectOne('http://localhost:5151/api/contracts/facultative/2');
    expect(update.request.method).toBe('PUT');
    update.flush({
      contractId: 2,
      status: 'Draft',
      netPremiumCedent: 112500,
      name: 'Property Facultative Contract STAR',
      counterpartyId: 2,
      currencyId: 1,
      inceptionDate: '2026-09-20',
      expiryDate: '2027-08-10',
      isHighPriority: false,
      isFronting: false
    });
  });
});
