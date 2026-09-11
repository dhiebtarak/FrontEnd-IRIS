import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter, Router, convertToParamMap } from '@angular/router';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideHttpClient } from '@angular/common/http';
import { MatSnackBar } from '@angular/material/snack-bar';
import { CoverageOption } from '../../shared/models/contract.model';
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
  const mainCoversResponse: CoverageOption[] = [
    { id: 1, code: 'PD', name: 'Property Damage', level: 'MAIN_COVER', parentId: null, relationType: null, isMandatory: false, hasSlip: true, slipTemplateId: 10 },
    { id: 4, code: 'CAR', name: 'Construction All Risks', level: 'MAIN_COVER', parentId: null, relationType: null, isMandatory: false, hasSlip: false, slipTemplateId: null },
    { id: 6, code: 'PVT', name: 'Political Violence and Terrorism', description: 'Political violence coverage', level: 'MAIN_COVER', parentId: null, relationType: null, isMandatory: false, hasSlip: false, slipTemplateId: null }
  ];
  const sectionsResponse: CoverageOption[] = [
    { id: 2, code: 'PD-MB', name: 'Machinery Breakdown', level: 'SECTION', parentId: 1, relationType: 'HAS_SECTION', isMandatory: true, hasSlip: false, slipTemplateId: null },
    { id: 3, code: 'PD-BI', name: 'Business Interruption', level: 'SECTION', parentId: 1, relationType: 'HAS_SECTION', isMandatory: false, hasSlip: true, slipTemplateId: null }
  ];
  const directExtensionsResponse: CoverageOption[] = [
    { id: 7, code: 'PD-EXT', name: 'Debris Removal', level: 'EXTENSION', parentId: 1, relationType: 'HAS_EXTENSION', isMandatory: true, hasSlip: false, slipTemplateId: null }
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
    httpMock.expectOne('http://localhost:5151/api/coverage-catalog/main-covers').flush([
      ...mainCoversResponse,
      sectionsResponse[0],
      directExtensionsResponse[0]
    ]);
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

  function expectCoverageChildren(parentId: number, level: 'SECTION' | 'EXTENSION') {
    return httpMock.expectOne(req =>
      req.url === `http://localhost:5151/api/coverage-catalog/${parentId}/children`
      && req.params.get('level') === level
    );
  }

  function selectMainCover(
    sections = sectionsResponse,
    directExtensions = directExtensionsResponse
  ): void {
    component.selectMainCover(mainCoversResponse[0]);
    expectCoverageChildren(1, 'SECTION').flush(sections);
    expectCoverageChildren(1, 'EXTENSION').flush(directExtensions);
    for (const section of sections.filter(item => item.isMandatory)) {
      expectCoverageChildren(section.id, 'EXTENSION').flush([]);
    }
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

  it('requires at least one coverage and one Primary Main Cover before saving', async () => {
    fillRequiredFields();
    await selectCedent();

    component.saveDraft();
    fixture.detectChanges();

    expect(component.form.controls.coverageSelection.controls.coverageIds.hasError('required')).toBe(true);
    expect(component.form.controls.coverageSelection.controls.primaryMainCoverId.hasError('required')).toBe(true);
    expect(component.form.controls.coverageSelection.controls.coverageIds.touched).toBe(true);
  });

  function typeCoverageSearch(value: string): void {
    const input = fixture.nativeElement.querySelector('#mainCoverSearch') as HTMLInputElement;
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();
  }

  function clickOutsideCoverage(target: EventTarget): void {
    target.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
    fixture.detectChanges();
  }

  it('opens and filters the searchable Coverage dropdown locally without new API calls', () => {
    const input = fixture.nativeElement.querySelector('#mainCoverSearch') as HTMLInputElement;

    input.dispatchEvent(new Event('focus'));
    fixture.detectChanges();
    expect(component.isCoverageDropdownOpen()).toBe(true);

    typeCoverageSearch('p');

    expect(component.mainCovers()).toEqual(mainCoversResponse);
    expect(component.coverageSearch()).toBe('p');
    expect(component.filteredCoverages()).toEqual([mainCoversResponse[0], mainCoversResponse[2]]);
    expect(fixture.nativeElement.textContent).toContain(component.formatCoverageLabel(mainCoversResponse[0]));
    expect(fixture.nativeElement.textContent).toContain(component.formatCoverageLabel(mainCoversResponse[2]));

    typeCoverageSearch('terror');
    expect(component.filteredCoverages()).toEqual([mainCoversResponse[2]]);

    typeCoverageSearch('');
    expect(component.filteredCoverages()).toEqual(mainCoversResponse);
    expect(httpMock.match(req => req.url.includes('/coverage-catalog/'))).toHaveLength(0);
  });

  it('closes the Coverage dropdown on outside pointerdown but keeps it open for multi-selection', () => {
    component.openCoverageDropdown();
    fixture.detectChanges();

    const firstOption = fixture.nativeElement.querySelector('#main-cover-options button') as HTMLButtonElement;
    firstOption.click();
    expectCoverageChildren(1, 'SECTION').flush(sectionsResponse);
    expectCoverageChildren(1, 'EXTENSION').flush(directExtensionsResponse);
    expectCoverageChildren(2, 'EXTENSION').flush([]);
    fixture.detectChanges();

    expect(component.isCoverageDropdownOpen()).toBe(true);
    expect(component.form.controls.coverageSelection.controls.coverageIds.value).toEqual([1]);

    clickOutsideCoverage(fixture.nativeElement.querySelector('#limitOfLiability'));

    expect(component.isCoverageDropdownOpen()).toBe(false);
  });

  it('loads sections and direct extensions after selecting a Main Cover', () => {
    selectMainCover();

    expect(component.form.controls.coverageSelection.controls.mainCoverId.value).toBe(1);
    expect(component.form.controls.coverageSelection.controls.primaryMainCoverId.value).toBe(1);
    expect(component.form.controls.coverageSelection.controls.coverageIds.value).toEqual([1]);
    expect(component.sections()).toEqual(sectionsResponse);
    expect(component.extensions()).toEqual(directExtensionsResponse);
    expect(component.form.controls.coverageSelection.controls.sectionIds.value).toEqual([2]);
    expect(component.form.controls.coverageSelection.controls.extensionIds.value).toEqual([7]);
  });

  it('loads section extensions, deduplicates them, and removes invalid selections', () => {
    selectMainCover(sectionsResponse, [
      { id: 7, code: 'PD-EXT', name: 'Debris Removal', level: 'EXTENSION', parentId: 1, relationType: 'HAS_EXTENSION', isMandatory: false, hasSlip: false },
      { id: 8, code: 'PD-OLD', name: 'Obsolete Extension', level: 'EXTENSION', parentId: 1, relationType: 'HAS_EXTENSION', isMandatory: false, hasSlip: false }
    ]);

    component.form.controls.coverageSelection.controls.extensionIds.setValue([7, 8]);
    component.form.controls.coverageSelection.controls.sectionIds.setValue([2, 3]);
    expectCoverageChildren(1, 'EXTENSION').flush([
      { id: 7, code: 'PD-EXT', name: 'Debris Removal', level: 'EXTENSION', parentId: 1, relationType: 'HAS_EXTENSION', isMandatory: false, hasSlip: false }
    ]);
    expectCoverageChildren(2, 'EXTENSION').flush([
      { id: 7, code: 'PD-EXT', name: 'Debris Removal', level: 'EXTENSION', parentId: 2, relationType: 'HAS_EXTENSION', isMandatory: false, hasSlip: false }
    ]);
    expectCoverageChildren(3, 'EXTENSION').flush([
      { id: 9, code: 'PD-BI-EXT', name: 'Loss of Rent', level: 'EXTENSION', parentId: 3, relationType: 'HAS_EXTENSION', isMandatory: true, hasSlip: true }
    ]);
    fixture.detectChanges();

    expect(component.extensions().map(extension => extension.id)).toEqual([7, 9]);
    expect(component.form.controls.coverageSelection.controls.extensionIds.value).toEqual([7, 9]);
  });

  it('loads child selections for multiple coverages and reports empty catalog results', () => {
    selectMainCover();

    component.selectMainCover(mainCoversResponse[1]);
    expect(component.form.controls.coverageSelection.controls.coverageIds.value).toEqual([1, 4]);
    expectCoverageChildren(1, 'SECTION').flush(sectionsResponse);
    expectCoverageChildren(4, 'SECTION').flush([]);
    expectCoverageChildren(1, 'EXTENSION').flush(directExtensionsResponse);
    expectCoverageChildren(4, 'EXTENSION').flush([]);
    expectCoverageChildren(2, 'EXTENSION').flush([]);
    fixture.detectChanges();

    expect(component.sections()).toEqual(sectionsResponse);
    expect(component.extensions()).toEqual(directExtensionsResponse);
    expect(fixture.nativeElement.textContent).toContain('PD — Property Damage');
    expect(fixture.nativeElement.textContent).toContain('CAR — Construction All Risks');
  });

  it('surfaces coverage API errors instead of silently discarding them', () => {
    component.selectMainCover(mainCoversResponse[0]);
    expectCoverageChildren(1, 'SECTION').flush('no sections', { status: 500, statusText: 'Server Error' });
    expectCoverageChildren(1, 'EXTENSION').flush('no extensions', { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();

    expect(component.sectionsError()).toBe('Sections could not be loaded for the selected coverages.');
    expect(component.extensionsError()).toBe('Extensions could not be loaded for the selected coverages.');
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
    selectMainCover();

    expect(component.form.contains('umr')).toBe(false);
    expect(fixture.nativeElement.querySelector('#umr')).toBeNull();
    expect(fixture.nativeElement.textContent).toContain('The UMR will be generated automatically when the contract is created.');
    expect(fixture.nativeElement.textContent).toContain('Expected format: IT26-F-PD-XXXX');

    component.saveDraft();
    fixture.detectChanges();

    const request = httpMock.expectOne('http://localhost:5151/api/contracts/facultative');
    expect(request.request.method).toBe('POST');
    expect(request.request.body.netPremiumCedent).toBeUndefined();
    expect(request.request.body.cedentName).toBeUndefined();
    expect(request.request.body).not.toBeInstanceOf(FormData);
    expect(request.request.body.status).toBeUndefined();
    expect(request.request.body.umr).toBeUndefined();
    expect(request.request.body.counterpartyId).toBe(99);
    expect(request.request.body.coverageSelection).toEqual({
      primaryMainCoverId: 1,
      coverageIds: [1],
      mainCoverId: 1,
      sectionIds: [2],
      extensionIds: [7]
    });
    expect(component.isSaving()).toBe(true);

    request.flush({
      contractId: 123,
      umr: 'IT26-F-PD-0001',
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
    expect(component.generatedUmr()).toBe('IT26-F-PD-0001');
    expect(fixture.nativeElement.textContent).toContain('Generated UMR: IT26-F-PD-0001');
    expect(component.isSaving()).toBe(false);
  });

  it('ignores repeated create clicks while the POST is in flight', async () => {
    fillRequiredFields();
    await selectCedent();
    selectMainCover();

    component.continueToOverview();
    component.continueToOverview();
    fixture.detectChanges();

    const requests = httpMock.match('http://localhost:5151/api/contracts/facultative');
    expect(requests).toHaveLength(1);
    expect(requests[0].request.method).toBe('POST');
    expect(component.isSaving()).toBe(true);

    requests[0].flush({
      contractId: 123,
      umr: 'IT26-F-PD-0001',
      status: 'Draft',
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

  it('preserves form values and does not retry automatically when create returns HTTP 500', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    fillRequiredFields();
    await selectCedent();
    selectMainCover();

    component.continueToOverview();
    const request = httpMock.expectOne('http://localhost:5151/api/contracts/facultative');
    request.flush({
      message: 'System.InvalidOperationException: sequence failed'
    }, { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();

    expect(httpMock.match('http://localhost:5151/api/contracts/facultative')).toHaveLength(0);
    expect(component.form.controls.name.value).toBe('FAC 2026');
    expect(component.form.controls.coverageSelection.controls.coverageIds.value).toEqual([1]);
    expect(component.retrySaveMode()).toBe('continue');
    expect(router.navigate).not.toHaveBeenCalled();
    expect(fixture.nativeElement.textContent).toContain('The contract could not be saved because the server returned an error.');
    expect(fixture.nativeElement.textContent).toContain('Retry');
    expect(fixture.nativeElement.textContent).not.toContain('System.InvalidOperationException');
    expect(consoleError).toHaveBeenCalledWith('Facultative contract save failed.', {
      message: 'System.InvalidOperationException: sequence failed'
    });

    consoleError.mockRestore();
  });

  it('uses PUT after a contract ID exists', async () => {
    fillRequiredFields();
    await selectCedent();
    selectMainCover();

    component.saveDraft();
    httpMock.expectOne('http://localhost:5151/api/contracts/facultative').flush({
      contractId: 123,
      umr: 'IT26-F-PD-0001',
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

    component.form.controls.name.setValue('FAC 2026 Updated');
    component.saveDraft();
    fixture.detectChanges();

    const request = httpMock.expectOne('http://localhost:5151/api/contracts/facultative/123');
    expect(request.request.method).toBe('PUT');
    expect(request.request.body.umr).toBeUndefined();
    request.flush({
      contractId: 123,
      umr: 'IT26-F-PD-0001',
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
    selectMainCover();

    component.saveDraft();
    const request = httpMock.expectOne('http://localhost:5151/api/contracts/facultative');
    request.flush({
      title: 'Validation failed',
      errors: {
        name: ['Name is invalid'],
        'coverageSelection.mainCoverId': ['Main Cover is invalid']
      }
    }, { status: 400, statusText: 'Bad Request' });
    fixture.detectChanges();

    expect(component.form.controls.name.errors?.['serverError']).toBe('Name is invalid');
    expect(component.form.controls.coverageSelection.controls.mainCoverId.errors?.['serverError']).toBe('Main Cover is invalid');
  });

  it('surfaces backend UMR generation errors without a local UMR control', async () => {
    fillRequiredFields();
    await selectCedent();
    selectMainCover();

    component.saveDraft();
    const request = httpMock.expectOne('http://localhost:5151/api/contracts/facultative');
    request.flush({
      title: 'Validation failed',
      errors: {
        umr: ['Sequence limit reached for IT26-F-PD.']
      }
    }, { status: 400, statusText: 'Bad Request' });
    fixture.detectChanges();

    expect(component.form.contains('umr')).toBe(false);
    expect(component.generalError()).toBe('Sequence limit reached for IT26-F-PD.');
    expect(fixture.nativeElement.textContent).toContain('Sequence limit reached for IT26-F-PD.');
  });

  it('keeps the saved draft response but marks the contract ready for overview routing', async () => {
    fillRequiredFields();
    await selectCedent();
    selectMainCover();

    component.continueToOverview();
    const request = httpMock.expectOne('http://localhost:5151/api/contracts/facultative');
    request.flush({
      contractId: 123,
      umr: 'IT26-F-PD-0001',
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
    expect(router.navigate).toHaveBeenCalledWith(['/workspace/reassurance/front-officer/contracts/new/overview'], {
      queryParams: { contractId: 123 }
    });
  });
});

describe('FacultativeInformationComponent existing contract', () => {
  let fixture: ComponentFixture<FacultativeInformationComponent>;
  let httpMock: HttpTestingController;
  let router: Router;
  let snackBar: { open: ReturnType<typeof vi.fn> };
  const mainCoversResponse: CoverageOption[] = [
    { id: 1, code: 'PD', name: 'Property Damage', level: 'MAIN_COVER', parentId: null, relationType: null, isMandatory: false, hasSlip: true, slipTemplateId: 10 }
  ];
  const sectionsResponse: CoverageOption[] = [
    { id: 2, code: 'PD-MB', name: 'Machinery Breakdown', level: 'SECTION', parentId: 1, relationType: 'HAS_SECTION', isMandatory: true, hasSlip: false },
    { id: 3, code: 'PD-BI', name: 'Business Interruption', level: 'SECTION', parentId: 1, relationType: 'HAS_SECTION', isMandatory: false, hasSlip: true }
  ];
  const directExtensionsResponse: CoverageOption[] = [
    { id: 7, code: 'PD-EXT', name: 'Debris Removal', level: 'EXTENSION', parentId: 1, relationType: 'HAS_EXTENSION', isMandatory: false, hasSlip: false }
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
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { queryParamMap: convertToParamMap({ contractId: '2' }) } }
        },
        { provide: MatSnackBar, useValue: snackBar }
      ]
    }).compileComponents();

    router = TestBed.inject(Router);
    vi.spyOn(router, 'navigate').mockResolvedValue(true);
    vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);

    fixture = TestBed.createComponent(FacultativeInformationComponent);
    httpMock = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
  });

  afterEach(() => {
    httpMock.verify();
  });

  function flushExistingContract(overrides: Record<string, unknown> = {}): void {
    httpMock.expectOne('http://localhost:5151/api/reference-data/currencies').flush([
      { id: 1, code: 'TND', name: 'Tunisian Dinar', symbol: 'DT', decimalPlaces: 3, isDefault: true }
    ]);
    httpMock.expectOne('http://localhost:5151/api/coverage-catalog/main-covers').flush(mainCoversResponse);
    httpMock.expectOne('http://localhost:5151/api/contracts/facultative/2').flush({
      contractId: 2,
      status: 'Draft',
      netPremiumCedent: 112500,
      umr: 'IT26-F-PD-0001',
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
      memoText: null,
      coverageSelection: {
        mainCoverId: 1,
        sectionIds: [2, 3],
        extensionIds: [7],
        mainCover: mainCoversResponse[0],
        sections: [],
        extensions: []
      },
      ...overrides
    });
    httpMock.expectOne(req =>
      req.url === 'http://localhost:5151/api/coverage-catalog/1/children'
      && req.params.get('level') === 'SECTION'
    ).flush(sectionsResponse);
    httpMock.expectOne(req =>
      req.url === 'http://localhost:5151/api/coverage-catalog/1/children'
      && req.params.get('level') === 'EXTENSION'
    ).flush(directExtensionsResponse);
    httpMock.expectOne(req =>
      req.url === 'http://localhost:5151/api/coverage-catalog/2/children'
      && req.params.get('level') === 'EXTENSION'
    ).flush([]);
    httpMock.expectOne(req =>
      req.url === 'http://localhost:5151/api/coverage-catalog/3/children'
      && req.params.get('level') === 'EXTENSION'
    ).flush([]);
    fixture.detectChanges();
  }

  it('loads the selected draft into the existing form and keeps subsequent saves on PUT', () => {
    flushExistingContract();

    const component = fixture.componentInstance;
    expect(component.contractId()).toBe(2);
    expect(component.generatedUmr()).toBe('IT26-F-PD-0001');
    expect(fixture.nativeElement.querySelector('#umr')).toBeNull();
    expect(fixture.nativeElement.textContent).toContain('Generated UMR: IT26-F-PD-0001');
    expect(component.form.controls.name.value).toBe('Property Facultative Contract STAR');
    expect(component.form.controls.counterpartyId.value).toBe(2);
    expect(component.cedentSearchControl.value).toBe('STAR Assurances');
    expect(component.form.controls.currencyId.value).toBe(1);
    expect(component.coverageSearch()).toBe('');
    expect(fixture.nativeElement.textContent).toContain(component.formatCoverageLabel(mainCoversResponse[0]));
    expect(component.form.controls.coverageSelection.controls.primaryMainCoverId.value).toBe(1);
    expect(component.form.controls.coverageSelection.controls.coverageIds.value).toEqual([1]);
    expect(component.form.controls.coverageSelection.controls.sectionIds.value).toEqual([2, 3]);
    expect(component.form.controls.coverageSelection.controls.extensionIds.value).toEqual([7]);

    component.saveDraft();
    const update = httpMock.expectOne('http://localhost:5151/api/contracts/facultative/2');
    expect(update.request.method).toBe('PUT');
    expect(update.request.body.coverageSelection).toEqual({
      primaryMainCoverId: 1,
      coverageIds: [1],
      mainCoverId: 1,
      sectionIds: [2, 3],
      extensionIds: [7]
    });
    expect(update.request.body.umr).toBeUndefined();
    update.flush({
      contractId: 2,
      umr: 'IT26-F-PD-0001',
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

  it('skips the update and returns to overview when Continue is clicked without changes', () => {
    flushExistingContract();

    const component = fixture.componentInstance;
    component.continueToOverview();
    fixture.detectChanges();

    expect(router.navigate).toHaveBeenCalledWith(['/workspace/reassurance/front-officer/contracts/new/overview'], {
      queryParams: { contractId: 2 }
    });
  });

  it('uses the route contract id for updates when the detail response omits a usable id', () => {
    flushExistingContract({ contractId: 0 });

    const component = fixture.componentInstance;
    expect(component.contractId()).toBe(2);

    component.form.controls.memoText.setValue('Updated note');
    component.saveDraft();
    fixture.detectChanges();

    const update = httpMock.expectOne('http://localhost:5151/api/contracts/facultative/2');
    expect(update.request.method).toBe('PUT');
    expect(update.request.body.panels).toBeUndefined();
    expect(update.request.body.placementPanels).toBeUndefined();
    expect(update.request.body.reinsurerPanels).toBeUndefined();
    update.flush({
      contractId: 2,
      umr: 'IT26-F-PD-0001',
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

  it('shows the backend conflict message returned by the API', () => {
    flushExistingContract();

    const component = fixture.componentInstance;
    component.form.controls.memoText.setValue('Change without touching UMR');
    component.saveDraft();
    fixture.detectChanges();

    const update = httpMock.expectOne('http://localhost:5151/api/contracts/facultative/2');
    update.flush({ message: 'Coverage selection already exists for this contract.' }, { status: 409, statusText: 'Conflict' });
    fixture.detectChanges();

    expect(component.generalError()).toBe('Coverage selection already exists for this contract.');
    expect(fixture.nativeElement.textContent).toContain('Coverage selection already exists for this contract.');
  });
});
