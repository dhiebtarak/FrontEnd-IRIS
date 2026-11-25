import { FormControl } from '@angular/forms';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { of, throwError, Subject } from 'rxjs';
import { ContractsService } from '../../shared/services/contracts.service';
import { XolContractComponent } from './xol-contract.component';
import { XolLayersComponent } from './xol-layers.component';
import { XolContractResponse, emptyXolLayer } from '../../shared/models/xol.model';
describe('XOL contract form', () => {
  const api = {
    getCurrencies: vi.fn(() => of([])),
    searchCedents: vi.fn(() => of({ items: [] })),
    getXolContract: vi.fn(),
    getXolOptions: vi.fn(() => of({ xolTypes: [], lossBases: [] })),
    getMainCovers: vi.fn(() => of([])),
    getCoverageChildren: vi.fn(() => of([])),
    saveXolContract: vi.fn(),
  };
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [XolContractComponent],
      providers: [
        provideRouter([]),
        provideNoopAnimations(),
        { provide: ContractsService, useValue: api },
      ],
    }).compileComponents();
  });
  it('uses the requested section order and omits contract type from General Information', () => {
    const fixture = TestBed.createComponent(XolContractComponent);
    fixture.detectChanges();
    const text = fixture.nativeElement.textContent;
    expect(
      [...fixture.nativeElement.querySelectorAll('form h2')].map((x: any) => x.textContent),
    ).toEqual([
      'General Information',
      'Treaty Terms',
      'Participation',
      'Contract Layers',
      'Internal Memo',
    ]);
    expect(text).not.toContain('Type of business');
    expect(text).not.toContain('XOL type');
    expect(fixture.nativeElement.querySelector('[formControlName="xolType"]')).toBeNull();
    expect(fixture.componentInstance.form.valid).toBe(true);
    fixture.componentInstance.form.patchValue({
      inceptionDate: '2026-12-01',
      expiryDate: '2026-01-01',
    });
    expect(fixture.componentInstance.form.invalid).toBe(true);
  });
  it('preserves draft data after an API failure and prevents overlapping submissions', () => {
    const fixture = TestBed.createComponent(XolContractComponent);
    fixture.detectChanges();
    const c = fixture.componentInstance;
    c.form.controls.name.setValue('Unsaved treaty');
    api.saveXolContract.mockReturnValue(
      throwError(() => ({
        status: 400,
        error: { message: 'Invalid dates', errors: ['Expiry must follow inception'] },
      })),
    );
    c.save(true);
    expect(c.form.controls.name.value).toBe('Unsaved treaty');
    expect(c.error()).toContain('Invalid dates');
    expect(c.saving()).toBe(false);
    api.saveXolContract.mockClear();
    c.saving.set(true);
    c.save(true);
    expect(api.saveXolContract).not.toHaveBeenCalled();
  });
  it('clears the selected cedent immediately when search text changes', () => {
    const fixture = TestBed.createComponent(XolContractComponent);
    fixture.detectChanges();
    const c = fixture.componentInstance;
    c.form.controls.counterpartyId.setValue(123);
    c.cedentSearch.setValue('Different cedent');
    expect(c.form.controls.counterpartyId.value).toBeNull();
  });
  it('renders a newly added layer immediately after the dialog closes', async () => {
    const fixture = TestBed.createComponent(XolContractComponent);
    fixture.detectChanges();
    const closed = new Subject<any>();
    vi.spyOn(fixture.debugElement.injector.get(MatDialog), 'open').mockReturnValue({
      afterClosed: () => closed,
    } as any);
    fixture.componentInstance.editLayer();
    closed.next({ ...emptyXolLayer(), cover: '1400000', retention: '200000' });
    await fixture.whenStable();
    fixture.checkNoChanges();
    expect(fixture.nativeElement.textContent).not.toContain('No layers yet.');
    expect(fixture.componentInstance.previewLayers()).toHaveLength(1);
  });
  it('uses the Facultative coverage selector and maps its selected hierarchy to the XOL payload', async () => {
    const fixture = TestBed.createComponent(XolContractComponent);
    fixture.detectChanges();
    const c = fixture.componentInstance;
    const cover = {
      id: 1,
      code: 'PD',
      name: 'Property',
      level: 'MAIN_COVER',
      parentId: null,
      relationType: null,
      isMandatory: false,
      hasSlip: false,
    } as const;
    c.references.coverageCatalog.set([cover]);
    c.references.openCoverageDropdown();
    c.references.toggleMainCover(cover);
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('app-contract-coverage-selector')).not.toBeNull();
    expect(c.form.controls.coverageSelection.getRawValue()).toEqual({
      primaryMainCoverId: 1,
      coverageIds: [1],
      mainCoverId: 1,
      sectionIds: [],
      extensionIds: [],
    });
    api.saveXolContract.mockReturnValue(throwError(() => ({ status: 400 })));
    c.save(true);
    expect(api.saveXolContract).toHaveBeenLastCalledWith(
      null,
      expect.objectContaining({
        coverageSelection: {
          primaryMainCoverId: 1,
          coverageIds: [1],
          mainCoverId: 1,
          sectionIds: [],
          extensionIds: [],
        },
      }),
    );
    c.references.removeMainCover(1);
    expect(c.references.selectedCoverageIds()).toEqual([]);
  });
  it('opens a searchable country checklist and saves the selected exclusions', async () => {
    const fixture = TestBed.createComponent(XolContractComponent);
    fixture.detectChanges();
    const c = fixture.componentInstance;
    const picker = fixture.nativeElement.querySelector('.country-picker') as HTMLDetailsElement;
    expect(picker.open).toBe(false);
    (picker.querySelector('summary') as HTMLElement).click();
    expect(picker.open).toBe(true);
    c.countrySearch.set('Tunisia');
    await fixture.whenStable();
    const checkbox = picker.querySelector('input[type="checkbox"]') as HTMLInputElement;
    expect(picker.querySelectorAll('input[type="checkbox"]')).toHaveLength(1);
    checkbox.click();
    await fixture.whenStable();
    expect(c.form.controls.territoriesExcluded.value).toBe('Tunisia');
    c.countrySearch.set('France');
    await fixture.whenStable();
    (picker.querySelector('input[type="checkbox"]') as HTMLInputElement).click();
    await fixture.whenStable();
    expect(c.excludedCountries()).toEqual(['Tunisia', 'France']);
    expect(c.form.dirty).toBe(true);
    api.saveXolContract.mockReturnValue(throwError(() => ({ status: 400 })));
    c.save(true);
    expect(api.saveXolContract).toHaveBeenLastCalledWith(
      null,
      expect.objectContaining({ territoriesExcluded: 'Tunisia; France' }),
    );
    c.toggleExcludedCountry('Tunisia');
    expect(c.form.controls.territoriesExcluded.value).toBe('France');
  });
  it('restores saved country selections and preserves historical free-text exclusions', () => {
    const fixture = TestBed.createComponent(XolContractComponent);
    fixture.detectChanges();
    const c = fixture.componentInstance;
    c.form.controls.territoriesExcluded.setValue('Tunisia; France');
    expect(c.excludedCountries()).toEqual(['Tunisia', 'France']);
    c.form.controls.territoriesExcluded.setValue('Tunisia, France');
    expect(c.excludedCountries()).toEqual(['Tunisia', 'France']);
    c.form.controls.territoriesExcluded.setValue('Legacy region, special wording');
    c.toggleExcludedCountry('Tunisia');
    expect(c.form.controls.territoriesExcluded.value).toBe(
      'Legacy region, special wording; Tunisia',
    );
    expect(c.visibleCountries()).toContain('Legacy region, special wording');
  });
  it('loads a saved overview by its real ID and cancels a stale route request', () => {
    const fixture = TestBed.createComponent(XolContractComponent);
    fixture.detectChanges();
    const c = fixture.componentInstance;
    const first = new Subject<XolContractResponse>();
    const second = new Subject<XolContractResponse>();
    api.getXolContract.mockReturnValueOnce(first).mockReturnValueOnce(second);
    c.load(73);
    c.load(74);
    const raw = c.form.getRawValue();
    const response: XolContractResponse = {
      contractId: 74,
      umr: 'IT26-X-PD-0074',
      status: 'Draft',
      cedentName: 'Saved cedent',
      currencyCode: 'TND',
      currencyDecimalPlaces: 3,
      canEdit: true,
      coverages: [],
      layers: [],
      panels: [],
      details: {
        ...raw,
        counterpartyId: 9,
        name: 'Saved XOL',
        saveDraft: true,
        version: 1,
        xolType: null,
        participationShareBasis: null,
        coverageSelection: null,
      },
    };
    second.next(response);
    first.next({ ...response, contractId: 73 });
    expect(c.contract()?.contractId).toBe(74);
    expect(c.cedent).toBe('Saved cedent');
    expect(c.editing()).toBe(false);
    expect(c.form.pristine).toBe(true);
  });
  it('uses signed share rather than written share for layer and installment previews', () => {
    const fixture = TestBed.createComponent(XolContractComponent);
    fixture.detectChanges();
    const c = fixture.componentInstance;
    c.form.patchValue({ writtenSharePct: '15', signedSharePct: '10' });
    c.layers.push(
      new FormControl(
        {
          ...emptyXolLayer(),
          cover: '4000000',
          retention: '1000000',
          installments: [
            { sequence: 1, expectedSettlementDate: null, settlementDate: null, amount: '32000' },
          ],
        },
        { nonNullable: true },
      ),
    );
    expect(c.previewLayers()[0].ourShareAmount).toBe('500000.00000000');
    expect(c.previewLayers()[0].installments[0].dueToUsAmount).toBe('3200.00000000');
    c.form.controls.signedSharePct.setValue('0');
    expect(c.previewLayers()[0].ourShareAmount).toBe('0.00000000');
    c.form.controls.signedSharePct.setValue(null);
    expect(c.previewLayers()[0].ourShareAmount).toBeNull();
    api.saveXolContract.mockReturnValue(throwError(() => ({ status: 400 })));
    c.save(true);
    expect(api.saveXolContract).toHaveBeenLastCalledWith(
      null,
      expect.objectContaining({ participationShareBasis: 'Signed' }),
    );
  });
  it('does not generate a UMR on the client', () => {
    const fixture = TestBed.createComponent(XolContractComponent);
    fixture.detectChanges();
    expect(fixture.componentInstance.contract()).toBeNull();
    expect(fixture.nativeElement.textContent).toContain('Not generated yet');
  });
});
describe('XOL installment table', () => {
  it('expands saved installments and displays server statuses and missing settlement date', async () => {
    await TestBed.configureTestingModule({ imports: [XolLayersComponent] }).compileComponents();
    const fixture = TestBed.createComponent(XolLayersComponent);
    fixture.componentRef.setInput('layers', [
      {
        id: 1,
        number: 1,
        details: { ...emptyXolLayer(), numberOfInstallments: 1 },
        capacity: 5000000,
        ourSharePct: null,
        ourShareAmount: null,
        dueToUsCover: null,
        dueToUsRetention: null,
        dueToUsEpi: null,
        dueToUsMdp: null,
        dueToUsCashLoss: null,
        rolPct: 2.63,
        installments: [
          {
            details: {
              sequence: 1,
              expectedSettlementDate: '2026-01-01',
              settlementDate: null,
              amount: 32000,
            },
            status: 'Overdue',
            dueToUsAmount: null,
          },
        ],
      },
    ]);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).not.toContain('Not paid');
    (fixture.nativeElement.querySelector('tbody tr') as HTMLTableRowElement).click();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Not paid');
    expect(fixture.nativeElement.textContent).toContain('Overdue');
    expect(fixture.nativeElement.textContent).toContain('Signed share not provided');
  });
});
