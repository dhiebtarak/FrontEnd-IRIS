import { ContractStyleDirective } from '../shared/contract-style.directive';
import { ContractReferenceState } from '../shared/contract-reference-state';
import {
  ContractCedentSelectorComponent,
  ContractCoverageSelectorComponent,
} from '../shared/contract-reference-selectors';
import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import {
  Component,
  DestroyRef,
  ElementRef,
  HostListener,
  OnInit,
  ViewChild,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  AbstractControl,
  FormBuilder,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  ValidationErrors,
  ValidatorFn,
  Validators,
} from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import {
  catchError,
  debounceTime,
  distinctUntilChanged,
  finalize,
  forkJoin,
  map,
  merge,
  of,
  startWith,
  Subject,
  switchMap,
  take,
  tap,
} from 'rxjs';
import { ContractCreationStepperComponent } from '../contract-creation-stepper/contract-creation-stepper.component';
import {
  CedentReference,
  CoverageOption,
  CurrencyReference,
  FacultativeContractResponse,
  UpsertFacultativeContractRequest,
} from '../../shared/models/contract.model';
import { PendingChangesAware } from '../../shared/guards/pending-changes.guard';
import { ContractsService } from '../../shared/services/contracts.service';

type FacultativeFormGroup = FormGroup<{
  name: FormControl<string>;
  counterpartyId: FormControl<number | null>;
  currencyId: FormControl<number | null>;
  coverageSelection: FormGroup<{
    primaryMainCoverId: FormControl<number | null>;
    coverageIds: FormControl<number[]>;
    mainCoverId: FormControl<number | null>;
    sectionIds: FormControl<number[]>;
    extensionIds: FormControl<number[]>;
  }>;
  receptionDate: FormControl<string>;
  inceptionDate: FormControl<string>;
  expiryDate: FormControl<string>;
  writtenSharePct: FormControl<number | null>;
  signedSharePct: FormControl<number | null>;
  fees: FormControl<number | null>;
  isHighPriority: FormControl<boolean>;
  sumInsured: FormControl<number | null>;
  limitOfLiability: FormControl<number | null>;
  deductible: FormControl<number | null>;
  premiumRate: FormControl<number | string | null>;
  grossPremium: FormControl<number | null>;
  cedentCommissionPct: FormControl<number | null>;
  netPremium: FormControl<number | null>;
  cedentPremiumReference: FormControl<string>;
  isFronting: FormControl<boolean>;
  frontingReference: FormControl<string>;
  memoText: FormControl<string>;
}>;

type CoverageOptionGroup = {
  parentLabel: string;
  items: CoverageOption[];
};

interface FacultativeFinancialCalculation {
  grossPremium: number | null;
  cedentCommission: number;
  netPremium: number | null;
  commissionsExceedGrossPremium: boolean;
}

const optionalNonNegativeValidator: ValidatorFn = (
  control: AbstractControl,
): ValidationErrors | null => {
  if (control.value == null || control.value === '') {
    return null;
  }

  return Number(control.value) >= 0 ? null : { nonNegative: true };
};

const coverageSelectionValidator: ValidatorFn = (
  control: AbstractControl,
): ValidationErrors | null => {
  const group = control as FacultativeFormGroup['controls']['coverageSelection'];
  const primaryMainCoverId = group.controls.primaryMainCoverId.value;
  const coverageIds = group.controls.coverageIds.value;

  if (!coverageIds.length) {
    return null;
  }

  if (primaryMainCoverId == null) {
    return { primaryCoverageRequired: true };
  }

  return coverageIds.includes(primaryMainCoverId) ? null : { primaryCoverageNotSelected: true };
};

const dateRangeValidator: ValidatorFn = (control: AbstractControl): ValidationErrors | null => {
  const form = control as FacultativeFormGroup;
  const inceptionDate = form.controls.inceptionDate.value;
  const expiryDate = form.controls.expiryDate.value;

  if (!inceptionDate || !expiryDate) {
    return null;
  }

  return expiryDate >= inceptionDate ? null : { expiryBeforeInception: true };
};

const shareValidator: ValidatorFn = (control: AbstractControl): ValidationErrors | null => {
  const form = control as FacultativeFormGroup;
  const writtenShare = form.controls.writtenSharePct.value;
  const signedShare = form.controls.signedSharePct.value;

  if (writtenShare == null || signedShare == null) {
    return null;
  }

  return signedShare <= writtenShare ? null : { signedShareExceedsWrittenShare: true };
};

const deductibleValidator: ValidatorFn = (control: AbstractControl): ValidationErrors | null => {
  const form = control as FacultativeFormGroup;
  const sumInsured = form.controls.sumInsured.value;
  const deductible = form.controls.deductible.value;

  if (sumInsured == null || deductible == null) {
    return null;
  }

  return deductible <= sumInsured ? null : { deductibleExceedsSumInsured: true };
};

const financialCalculationValidator: ValidatorFn = (
  control: AbstractControl,
): ValidationErrors | null => {
  const form = control as FacultativeFormGroup;
  const calculation = calculateFacultativeFinancials({
    sumInsured: form.controls.sumInsured.value,
    premiumRate: form.controls.premiumRate.value,
    cedentCommissionPct: form.controls.cedentCommissionPct.value,
  });

  return calculation.commissionsExceedGrossPremium ? { commissionsExceedGrossPremium: true } : null;
};

function calculateFacultativeFinancials(values: {
  sumInsured: number | null | undefined;
  premiumRate: number | string | null | undefined;
  cedentCommissionPct: number | null | undefined;
}): FacultativeFinancialCalculation {
  const tsi = toFiniteNumber(values.sumInsured);
  const premiumRate = toFiniteNumber(values.premiumRate);
  const cedentCommissionPct = toFiniteNumber(values.cedentCommissionPct) ?? 0;

  if (tsi == null || premiumRate == null) {
    return {
      grossPremium: null,
      cedentCommission: 0,
      netPremium: null,
      commissionsExceedGrossPremium: false,
    };
  }

  const grossPremium = roundMoney((tsi * premiumRate) / 100);
  const cedentCommission = roundMoney((grossPremium * cedentCommissionPct) / 100);

  return {
    grossPremium,
    cedentCommission,
    netPremium: roundMoney(Math.max(0, grossPremium - cedentCommission)),
    commissionsExceedGrossPremium: cedentCommission > grossPremium,
  };
}

function toFiniteNumber(value: number | string | null | undefined): number | null {
  if (value == null) {
    return null;
  }

  const normalizedValue =
    typeof value === 'string' ? value.trim().replace(/\s/g, '').replace(',', '.') : value;

  if (normalizedValue === '') {
    return null;
  }

  const numericValue = Number(normalizedValue);
  return Number.isFinite(numericValue) ? numericValue : null;
}

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 10000) / 10000;
}

@Component({
  selector: 'app-facultative-information',
  standalone: true,
  imports: [
    ContractStyleDirective,
    ContractCedentSelectorComponent,
    ContractCoverageSelectorComponent,
    CommonModule,
    ReactiveFormsModule,
    RouterLink,
    MatSnackBarModule,
    ContractCreationStepperComponent,
  ],
  templateUrl: './facultative-information.component.html',
  styles: ``,
})
export class FacultativeInformationComponent implements OnInit, PendingChangesAware {
  private readonly destroyRef = inject(DestroyRef);
  private readonly elementRef = inject(ElementRef<HTMLElement>);
  private readonly fb = inject(FormBuilder);
  private readonly contractsService = inject(ContractsService);
  private readonly snackBar = inject(MatSnackBar);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  readonly references = new ContractReferenceState(
    () => this.form,
    this.contractsService,
    this.destroyRef,
  );
  readonly typeRoute = '/workspace/reassurance/front-officer/contracts/new/type';
  readonly overviewRoute = '/workspace/reassurance/front-officer/contracts/new/overview';
  readonly dashboardRoute = '/workspace/reassurance/front-officer';
  readonly cedentSearchControl = this.references.cedentSearchControl;
  readonly isInitialLoading = signal(true);
  readonly isCurrenciesLoading = signal(false);
  readonly isCedentLoading = this.references.isCedentLoading;
  readonly isMainCoverLoading = this.references.isMainCoverLoading;
  readonly isSectionsLoading = this.references.isSectionsLoading;
  readonly isExtensionsLoading = this.references.isExtensionsLoading;
  readonly isCedentDropdownOpen = this.references.isCedentDropdownOpen;
  readonly isMainCoverDropdownOpen = this.references.isMainCoverDropdownOpen;
  readonly isCoverageDropdownOpen = this.references.isCoverageDropdownOpen;
  readonly coverageSearch = this.references.coverageSearch;
  readonly sectionSearch = this.references.sectionSearch;
  readonly extensionSearch = this.references.extensionSearch;
  readonly isSaving = signal(false);
  readonly saveMode = signal<'draft' | 'continue' | null>(null);
  readonly retrySaveMode = signal<'draft' | 'continue' | null>(null);
  readonly contractId = signal<number | null>(null);
  readonly generatedUmr = signal('');
  readonly backendNetPremium = signal<number | null>(null);
  readonly generalError = signal('');
  readonly serverFieldErrors = signal<Record<string, string[]>>({});
  readonly cedentLookupError = this.references.cedentLookupError;
  readonly mainCoverLookupError = this.references.mainCoverLookupError;
  readonly sectionsError = this.references.sectionsError;
  readonly extensionsError = this.references.extensionsError;
  readonly currencies = signal<CurrencyReference[]>([]);
  readonly cedentResults = this.references.cedentResults;
  readonly coverageCatalog = this.references.coverageCatalog;
  readonly mainCovers = this.references.mainCovers;
  readonly sections = this.references.sections;
  readonly extensions = this.references.extensions;
  readonly activeCedentIndex = this.references.activeCedentIndex;
  readonly activeMainCoverIndex = this.references.activeMainCoverIndex;
  readonly formSnapshot = signal(this.createEmptySnapshot());
  readonly filteredCoverages = this.references.filteredCoverages;
  readonly filteredMainCovers = this.references.filteredMainCovers;
  readonly selectedCoverageIds = this.references.selectedCoverageIds;
  readonly selectedSectionIds = this.references.selectedSectionIds;
  readonly selectedExtensionIds = this.references.selectedExtensionIds;
  readonly availableSections = this.references.availableSections;
  readonly availableExtensions = this.references.availableExtensions;
  readonly groupedSections = this.references.groupedSections;
  readonly groupedExtensions = this.references.groupedExtensions;
  readonly filteredSections = this.references.filteredSections;
  readonly filteredExtensions = this.references.filteredExtensions;
  readonly groupedFilteredSections = this.references.groupedFilteredSections;
  readonly groupedFilteredExtensions = this.references.groupedFilteredExtensions;
  readonly selectedMainCovers = this.references.selectedMainCovers;
  readonly selectedMainCover = this.references.selectedMainCover;
  readonly selectedSections = this.references.selectedSections;
  readonly selectedExtensions = this.references.selectedExtensions;
  readonly selectedCurrency = computed(() => {
    const currencyId = this.formSnapshot().currencyId;
    return this.currencies().find((currency) => currency.id === currencyId) ?? null;
  });
  readonly summary = computed(() => {
    const snapshot = this.formSnapshot();
    const cedent = this.findCedentName(snapshot.counterpartyId);
    const period =
      snapshot.inceptionDate && snapshot.expiryDate
        ? `${snapshot.inceptionDate} to ${snapshot.expiryDate}`
        : 'Not set';

    return {
      umr: this.generatedUmr() || 'Not generated yet',
      name: snapshot.name || 'Not provided',
      cedent: cedent || 'Not selected',
      currency: this.selectedCurrency()?.code || 'Not selected',
      period,
      writtenSharePct: snapshot.writtenSharePct,
      signedSharePct: snapshot.signedSharePct,
      sumInsured: snapshot.sumInsured,
      limitOfLiability: snapshot.limitOfLiability,
      grossPremium: snapshot.grossPremium,
      estimatedNetPremium: snapshot.netPremium,
      mainCover: this.selectedMainCover()
        ? this.formatCoverageLabel(this.selectedMainCover()!)
        : 'Not selected',
      coverages:
        this.selectedMainCovers().length > 0
          ? this.selectedMainCovers()
              .map((option) => this.formatCoverageLabel(option))
              .join(', ')
          : 'Not selected',
      sections:
        this.selectedSections().length > 0
          ? this.selectedSections()
              .map((option) => this.formatCoverageLabel(option))
              .join(', ')
          : 'None',
      extensions:
        this.selectedExtensions().length > 0
          ? this.selectedExtensions()
              .map((option) => this.formatCoverageLabel(option))
              .join(', ')
          : 'None',
      status: 'Draft',
    };
  });

  readonly form: FacultativeFormGroup = this.fb.group(
    {
      name: this.fb.nonNullable.control('', [Validators.maxLength(255)]),
      counterpartyId: this.fb.control<number | null>(null),
      currencyId: this.fb.control<number | null>(null),
      coverageSelection: this.fb.group(
        {
          primaryMainCoverId: this.fb.control<number | null>(null),
          coverageIds: this.fb.nonNullable.control<number[]>([]),
          mainCoverId: this.fb.control<number | null>(null),
          sectionIds: this.fb.nonNullable.control<number[]>([]),
          extensionIds: this.fb.nonNullable.control<number[]>([]),
        },
        { validators: [coverageSelectionValidator] },
      ),
      receptionDate: this.fb.nonNullable.control(''),
      inceptionDate: this.fb.nonNullable.control(''),
      expiryDate: this.fb.nonNullable.control(''),
      writtenSharePct: this.fb.control<number | null>(null, [
        Validators.min(0),
        Validators.max(100),
      ]),
      signedSharePct: this.fb.control<number | null>(null, [
        Validators.min(0),
        Validators.max(100),
      ]),
      fees: this.fb.control<number | null>(null, [optionalNonNegativeValidator]),
      isHighPriority: this.fb.nonNullable.control(false),
      sumInsured: this.fb.control<number | null>(null, [optionalNonNegativeValidator]),
      limitOfLiability: this.fb.control<number | null>(null, [optionalNonNegativeValidator]),
      deductible: this.fb.control<number | null>(null, [optionalNonNegativeValidator]),
      premiumRate: this.fb.control<number | string | null>(null, [
        optionalNonNegativeValidator,
        Validators.max(100),
      ]),
      grossPremium: this.fb.control<number | null>(null, [optionalNonNegativeValidator]),
      cedentCommissionPct: this.fb.control<number | null>(null, [
        Validators.min(0),
        Validators.max(100),
      ]),
      netPremium: this.fb.control<number | null>(null, [optionalNonNegativeValidator]),
      cedentPremiumReference: this.fb.nonNullable.control(''),
      isFronting: this.fb.nonNullable.control(false),
      frontingReference: this.fb.nonNullable.control(''),
      memoText: this.fb.nonNullable.control('', [Validators.maxLength(500)]),
    },
    {
      validators: [
        dateRangeValidator,
        shareValidator,
        deductibleValidator,
        financialCalculationValidator,
      ],
    },
  );

  private get selectedCedentName() {
    return this.references.selectedCedentName;
  }
  private set selectedCedentName(value: string) {
    this.references.selectedCedentName = value;
  }
  private get isHydratingCoverage() {
    return this.references.isHydratingCoverage;
  }
  private set isHydratingCoverage(value: boolean) {
    this.references.isHydratingCoverage = value;
  }
  private lastSavedSnapshot = this.createEmptySnapshot();
  readonly cedentOpenRequests = this.references.cedentOpenRequests;
  readonly mainCoverOpenRequests = this.references.mainCoverOpenRequests;
  private pendingFocusField = this.route.snapshot.queryParamMap.get('focusField');
  get coveragePicker() {
    return this.references.coveragePicker;
  }

  ngOnInit(): void {
    this.setSectionsEnabled(false);
    this.setExtensionsEnabled(false);
    this.bindFinancialCalculations();
    this.bindFormState();
    this.bindCedentSearch();
    this.bindMainCoverSearch();
    this.bindCoverageSelection();
    this.bindFrontingValidation();
    this.loadCurrencies();
  }

  @HostListener('window:beforeunload', ['$event'])
  handleBeforeUnload(event: BeforeUnloadEvent): void {
    if (!this.canLeaveWithoutPrompt()) {
      event.preventDefault();
      event.returnValue = '';
    }
  }

  @HostListener('document:click', ['$event'])
  handleDocumentClick(event: MouseEvent): void {
    if (!this.elementRef.nativeElement.contains(event.target as Node)) {
      this.closeCedentDropdown();
      this.closeMainCoverDropdown();
    }
  }

  @HostListener('document:pointerdown', ['$event'])
  onDocumentPointerDown(event: PointerEvent): void {
    const target = event.target as Node | null;

    if (!target || !this.isCoverageDropdownOpen() || !this.coveragePicker) {
      return;
    }

    if (!this.coveragePicker.nativeElement.contains(target)) {
      this.closeCoverageDropdown();
    }
  }

  canDeactivate(): boolean {
    return (
      this.canLeaveWithoutPrompt() ||
      window.confirm('You have unsaved contract changes. Leave this page?')
    );
  }

  get currentStatus(): string {
    return 'Draft';
  }

  get isBusy(): boolean {
    return (
      this.isSaving() ||
      this.isInitialLoading() ||
      this.isCurrenciesLoading() ||
      this.isMainCoverLoading() ||
      this.isSectionsLoading() ||
      this.isExtensionsLoading()
    );
  }

  get saveDraftLabel(): string {
    return this.isSaving() && this.saveMode() === 'draft' ? 'Saving draft...' : 'Save Draft';
  }

  get continueLabel(): string {
    return this.isSaving() && this.saveMode() === 'continue' ? 'Saving...' : 'Continue to Overview';
  }

  openCedentDropdown() {
    return this.references.openCedentDropdown();
  }

  closeCedentDropdown() {
    return this.references.closeCedentDropdown();
  }

  openMainCoverDropdown() {
    return this.references.openMainCoverDropdown();
  }

  openCoverageDropdown() {
    return this.references.openCoverageDropdown();
  }

  closeMainCoverDropdown() {
    return this.references.closeMainCoverDropdown();
  }

  closeCoverageDropdown() {
    return this.references.closeCoverageDropdown();
  }

  onCoverageSearchInput(event: Event) {
    return this.references.onCoverageSearchInput(event);
  }

  onCoverageFocusOut(event: FocusEvent) {
    return this.references.onCoverageFocusOut(event);
  }

  selectMainCover(mainCover: CoverageOption) {
    return this.references.selectMainCover(mainCover);
  }

  toggleMainCover(mainCover: CoverageOption) {
    return this.references.toggleMainCover(mainCover);
  }

  clearMainCoverSelection() {
    return this.references.clearMainCoverSelection();
  }

  removeMainCover(mainCoverId: number) {
    return this.references.removeMainCover(mainCoverId);
  }

  makePrimaryMainCover(mainCoverId: number) {
    return this.references.makePrimaryMainCover(mainCoverId);
  }

  isMainCoverSelected(mainCoverId: number) {
    return this.references.isMainCoverSelected(mainCoverId);
  }

  isPrimaryMainCover(mainCoverId: number) {
    return this.references.isPrimaryMainCover(mainCoverId);
  }

  toggleSection(section: CoverageOption) {
    return this.references.toggleSection(section);
  }

  onSectionSearchInput(event: Event) {
    return this.references.onSectionSearchInput(event);
  }

  removeSection(sectionId: number) {
    return this.references.removeSection(sectionId);
  }

  isSectionSelected(sectionId: number) {
    return this.references.isSectionSelected(sectionId);
  }

  toggleExtension(extension: CoverageOption) {
    return this.references.toggleExtension(extension);
  }

  onExtensionSearchInput(event: Event) {
    return this.references.onExtensionSearchInput(event);
  }

  removeExtension(extensionId: number) {
    return this.references.removeExtension(extensionId);
  }

  isExtensionSelected(extensionId: number) {
    return this.references.isExtensionSelected(extensionId);
  }

  handleMainCoverKeydown(event: KeyboardEvent) {
    return this.references.handleMainCoverKeydown(event);
  }

  setActiveMainCoverIndex(index: number) {
    return this.references.setActiveMainCoverIndex(index);
  }

  formatCoverageLabel(option: CoverageOption) {
    return this.references.formatCoverageLabel(option);
  }

  isMandatorySection(section: CoverageOption) {
    return this.references.isMandatorySection(section);
  }

  isMandatoryExtension(extension: CoverageOption) {
    return this.references.isMandatoryExtension(extension);
  }

  getCoverageParentLabel(option: CoverageOption) {
    return this.references.getCoverageParentLabel(option);
  }

  getSelectedCoverageDescription(option: CoverageOption) {
    return this.references.getSelectedCoverageDescription(option);
  }

  selectCedent(cedent: CedentReference) {
    return this.references.selectCedent(cedent);
  }

  clearCedentSelection() {
    return this.references.clearCedentSelection();
  }

  handleCedentKeydown(event: KeyboardEvent) {
    return this.references.handleCedentKeydown(event);
  }

  setActiveCedentIndex(index: number) {
    return this.references.setActiveCedentIndex(index);
  }

  cedentLocationLabel(cedent: CedentReference) {
    return this.references.cedentLocationLabel(cedent);
  }

  navigateBackToType(): void {
    if (!this.canDeactivate()) {
      return;
    }

    void this.router.navigateByUrl(this.typeRoute);
  }

  saveDraft(): void {
    if (this.isSaving()) {
      return;
    }

    this.retrySaveMode.set(null);
    this.generalError.set('');
    this.serverFieldErrors.set({});
    this.clearServerErrors();
    this.normalizeFormValues();
    void this.persist('draft');
  }

  continueToOverview(): void {
    if (this.isSaving()) {
      return;
    }

    this.retrySaveMode.set(null);
    this.generalError.set('');
    this.serverFieldErrors.set({});
    this.clearServerErrors();
    this.normalizeFormValues();
    void this.persist('continue');
  }

  retrySave(): void {
    const mode = this.retrySaveMode();

    if (!mode || this.isSaving()) {
      return;
    }

    this.retrySaveMode.set(null);
    this.generalError.set('');
    this.serverFieldErrors.set({});
    this.clearServerErrors();
    void this.persist(mode);
  }

  hasError(path: string, errorName: string): boolean {
    const control = this.form.get(path);
    return !!control && control.hasError(errorName) && (control.touched || control.dirty);
  }

  serverFieldErrorEntries(): Array<{ field: string; messages: string[] }> {
    return Object.entries(this.serverFieldErrors()).map(([field, messages]) => ({
      field,
      messages,
    }));
  }

  formatMoney(value: number | null): string {
    if (value == null) {
      return 'Not provided';
    }

    const currency = this.selectedCurrency();

    if (!currency) {
      return value.toString();
    }

    const decimalPlaces = currency.decimalPlaces ?? 2;
    const number = new Intl.NumberFormat(undefined, {
      minimumFractionDigits: decimalPlaces,
      maximumFractionDigits: decimalPlaces,
    }).format(value);

    return `${currency.code} ${number}${currency.symbol ? ` (${currency.symbol})` : ''}`;
  }

  preventCalculatedInput(event: Event): void {
    event.preventDefault();
  }

  private bindFormState(): void {
    this.form.valueChanges
      .pipe(
        startWith(this.form.getRawValue()),
        map(() => this.createSnapshot()),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((snapshot) => {
        this.formSnapshot.set(snapshot);
        this.syncCedentValidation();
      });
  }

  private bindFinancialCalculations(): void {
    const controls = this.form.controls;

    merge(
      controls.sumInsured.valueChanges,
      controls.premiumRate.valueChanges,
      controls.cedentCommissionPct.valueChanges,
    )
      .pipe(startWith(null), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.syncCalculatedFinancialControls();
      });
  }

  private syncCalculatedFinancialControls(authoritative?: {
    grossPremium?: number | null;
    netPremium?: number | null;
  }): void {
    const calculation = calculateFacultativeFinancials({
      sumInsured: this.form.controls.sumInsured.value,
      premiumRate: this.form.controls.premiumRate.value,
      cedentCommissionPct: this.form.controls.cedentCommissionPct.value,
    });

    const grossPremium = authoritative?.grossPremium ?? calculation.grossPremium;
    const netPremium = authoritative?.netPremium ?? calculation.netPremium;

    this.form.controls.grossPremium.setValue(grossPremium, { emitEvent: false });
    this.form.controls.netPremium.setValue(netPremium, { emitEvent: false });
    this.form.updateValueAndValidity({ emitEvent: false });
    this.formSnapshot.set(this.createSnapshot());
  }

  private bindCedentSearch() {
    return this.references.bindCedentSearch();
  }

  private bindMainCoverSearch() {
    return this.references.bindMainCoverSearch();
  }

  private bindCoverageSelection() {
    return this.references.bindCoverageSelection();
  }

  private bindFrontingValidation(): void {
    this.form.controls.isFronting.valueChanges
      .pipe(startWith(this.form.controls.isFronting.value), takeUntilDestroyed(this.destroyRef))
      .subscribe((isFronting) => {
        const control = this.form.controls.frontingReference;

        if (!isFronting) {
          control.setValue('', { emitEvent: false });
        }

        control.updateValueAndValidity({ emitEvent: false });
      });
  }

  private loadCurrencies(): void {
    this.isInitialLoading.set(true);
    this.isCurrenciesLoading.set(true);
    this.isMainCoverLoading.set(true);
    const contractId = this.getRouteContractId();

    forkJoin({
      currencies: this.contractsService.getCurrencies(),
      mainCovers: this.contractsService.getMainCovers(),
      contract:
        contractId == null ? of(null) : this.contractsService.getFacultativeContract(contractId),
    })
      .pipe(
        switchMap(({ currencies, mainCovers, contract }) => {
          this.currencies.set(currencies);
          this.coverageCatalog.set(mainCovers);
          if (contract) {
            this.applyLoadedContract(contract, contractId);
            return this.hydrateLoadedCoverage(contract);
          }

          return of(null);
        }),
        finalize(() => {
          this.isInitialLoading.set(false);
          this.isCurrenciesLoading.set(false);
          this.isMainCoverLoading.set(false);
        }),
      )
      .subscribe({
        next: () => {
          this.lastSavedSnapshot = this.createSnapshot();
          this.form.markAsPristine();
          this.focusPendingField();
        },
        error: () => {
          this.generalError.set(
            contractId == null
              ? 'Currencies could not be loaded. Refresh the page and try again.'
              : 'Contract details could not be loaded. Return to the portfolio and try again.',
          );
        },
      });
  }

  private loadCoverageChildren(
    mainCoverIds: number[],
    savedSectionIds: number[],
    savedExtensionIds: number[],
  ) {
    return this.references.loadCoverageChildren(mainCoverIds, savedSectionIds, savedExtensionIds);
  }

  private loadExtensionsForSelection(
    sectionIds: number[],
    savedExtensionIds: number[],
    directExtensions?: CoverageOption[],
  ) {
    return this.references.loadExtensionsForSelection(
      sectionIds,
      savedExtensionIds,
      directExtensions,
    );
  }

  private hydrateLoadedCoverage(contract: FacultativeContractResponse) {
    const coverage = contract.coverageSelection;

    if (!coverage) {
      return of(null);
    }

    const primaryMainCoverId = coverage.primaryMainCoverId ?? coverage.mainCoverId ?? null;
    const coverageIds = coverage.coverageIds?.length
      ? coverage.coverageIds
      : primaryMainCoverId == null
        ? []
        : [primaryMainCoverId];

    if (!primaryMainCoverId || !coverageIds.length) {
      return of(null);
    }

    this.isHydratingCoverage = true;

    const embeddedMainCover = coverage.mainCover;
    const mainCover =
      this.mainCovers().find((option) => option.id === primaryMainCoverId) ??
      embeddedMainCover ??
      null;

    if (mainCover) {
      this.coverageCatalog.set(this.uniqueCoverageOptions([...this.coverageCatalog(), mainCover]));
      this.coverageSearch.set('');
    }

    this.form.controls.coverageSelection.patchValue(
      {
        coverageIds,
        primaryMainCoverId,
        mainCoverId: primaryMainCoverId,
      },
      { emitEvent: false },
    );
    this.formSnapshot.set(this.createSnapshot());

    return this.loadCoverageChildren(coverageIds, coverage.sectionIds, coverage.extensionIds).pipe(
      finalize(() => {
        this.isHydratingCoverage = false;
      }),
    );
  }

  private applyLoadedContract(
    contract: FacultativeContractResponse,
    fallbackContractId: number | null,
  ): void {
    this.contractId.set(this.getPositiveId(contract.contractId) ?? fallbackContractId);
    this.generatedUmr.set(contract.umr ?? '');
    this.backendNetPremium.set(contract.netPremiumCedent);
    this.form.patchValue({
      name: contract.name ?? '',
      counterpartyId: contract.counterpartyId,
      currencyId: contract.currencyId,
      receptionDate: contract.receptionDate ?? '',
      inceptionDate: contract.inceptionDate ?? '',
      expiryDate: contract.expiryDate ?? '',
      writtenSharePct: contract.writtenSharePct,
      signedSharePct: contract.signedSharePct,
      fees: contract.fees,
      isHighPriority: contract.isHighPriority ?? false,
      sumInsured: contract.sumInsured,
      limitOfLiability: contract.limitOfLiability ?? null,
      deductible: contract.deductible,
      premiumRate: contract.premiumRate,
      grossPremium: contract.grossPremium,
      cedentCommissionPct: contract.cedentCommissionPct,
      netPremium: contract.netPremium ?? contract.netPremiumCedent,
      cedentPremiumReference: contract.cedentPremiumReference ?? '',
      isFronting: contract.isFronting ?? false,
      frontingReference: contract.frontingReference ?? '',
      memoText: contract.memoText ?? '',
    });
    this.syncCalculatedFinancialControls({
      grossPremium: contract.grossPremium,
      netPremium: contract.netPremium ?? contract.netPremiumCedent,
    });

    this.selectedCedentName = contract.counterpartyName?.trim() ?? '';
    this.cedentSearchControl.setValue(this.selectedCedentName, { emitEvent: false });

    if (contract.counterpartyId != null && contract.counterpartyId > 0 && this.selectedCedentName) {
      this.cedentResults.set([
        {
          id: contract.counterpartyId,
          name: this.selectedCedentName,
          country: null,
          city: null,
        },
      ]);
    }
  }

  private focusPendingField(): void {
    const field = this.pendingFocusField;
    if (!field) return;

    const targetIds: Record<string, string> = {
      name: 'contractName',
      counterpartyId: 'cedentSearch',
      currencyId: 'currencyId',
      inceptionDate: 'inceptionDate',
      expiryDate: 'expiryDate',
      coverageSelection: 'mainCoverSearch',
      sumInsured: 'sumInsured',
      premiumRate: 'premiumRate',
      cedentCommissionPct: 'cedentCommissionPct',
      writtenSharePct: 'writtenSharePct',
      signedSharePct: 'signedSharePct',
      frontingReference: 'frontingReference',
    };
    const root = this.elementRef.nativeElement as HTMLElement;
    const element = root.querySelector<HTMLElement>(`#${targetIds[field] ?? 'contractName'}`);
    this.pendingFocusField = null;
    element?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    element?.focus({ preventScroll: true });
  }

  private async persist(mode: 'draft' | 'continue'): Promise<void> {
    if (this.isSaving()) {
      return;
    }

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const contractId = this.getCurrentContractId();

    if (mode === 'continue' && contractId != null && !this.hasUnsavedChanges()) {
      this.navigateToOverview(contractId);
      return;
    }

    this.isSaving.set(true);
    this.saveMode.set(mode);
    const isCreating = contractId == null;

    const request = isCreating
      ? this.contractsService.createFacultativeContract(this.buildRequest())
      : this.contractsService.updateFacultativeContract(contractId, this.buildRequest());

    request
      .pipe(
        take(1),
        finalize(() => {
          this.isSaving.set(false);
          this.saveMode.set(null);
        }),
      )
      .subscribe({
        next: (response) => {
          if (isCreating && this.getPositiveId(response.contractId) == null) {
            const message =
              'The server did not return the new contract ID. The contract was not opened in Overview.';
            this.generalError.set(message);
            this.snackBar.open(message, 'Dismiss', {
              duration: 4500,
              horizontalPosition: 'end',
              verticalPosition: 'top',
            });
            return;
          }
          this.applySaveResponse(response);
          this.snackBar.open(this.getSaveSuccessMessage(response, isCreating), 'Dismiss', {
            duration: 3000,
            horizontalPosition: 'end',
            verticalPosition: 'top',
          });

          if (mode === 'continue') {
            const savedContractId = this.getCurrentContractId();
            if (savedContractId != null) this.navigateToOverview(savedContractId);
          }
        },
        error: (error: HttpErrorResponse) => {
          this.handleSaveError(error);
        },
      });
  }

  private applySaveResponse(response: FacultativeContractResponse): void {
    const responseContractId = this.getPositiveId(response.contractId);

    if (responseContractId != null) {
      this.contractId.set(responseContractId);
    }

    this.generatedUmr.set(response.umr ?? '');
    this.backendNetPremium.set(response.netPremiumCedent);
    this.form.patchValue(
      {
        fees: response.fees ?? this.form.controls.fees.value,
        grossPremium: response.grossPremium ?? this.form.controls.grossPremium.value,
        cedentCommissionPct:
          response.cedentCommissionPct ?? this.form.controls.cedentCommissionPct.value,
        netPremium:
          response.netPremium ?? response.netPremiumCedent ?? this.form.controls.netPremium.value,
      },
      { emitEvent: false },
    );
    this.syncCalculatedFinancialControls({
      grossPremium: response.grossPremium ?? this.form.controls.grossPremium.value,
      netPremium:
        response.netPremium ?? response.netPremiumCedent ?? this.form.controls.netPremium.value,
    });
    this.lastSavedSnapshot = this.createSnapshot();
    this.form.markAsPristine();
  }

  private getSaveSuccessMessage(
    response: FacultativeContractResponse,
    isCreating: boolean,
  ): string {
    const umr = response.umr?.trim() ?? '';
    const message = isCreating ? 'Contract created successfully.' : 'Contract saved successfully.';

    return umr ? `${message}\nUMR: ${umr}` : message;
  }

  private buildRequest(): UpsertFacultativeContractRequest {
    const raw = this.form.getRawValue();
    const coverageIds = this.uniquePositiveNumberArray(raw.coverageSelection.coverageIds).filter(
      (id) => this.mainCovers().some((option) => option.id === id),
    );
    const primaryMainCoverId = coverageIds.includes(raw.coverageSelection.primaryMainCoverId ?? 0)
      ? raw.coverageSelection.primaryMainCoverId
      : (coverageIds[0] ?? null);
    const availableSectionIds = new Set(this.availableSections().map((section) => section.id));
    const availableExtensionIds = new Set(
      this.availableExtensions().map((extension) => extension.id),
    );
    const sectionIds = this.uniquePositiveNumberArray(raw.coverageSelection.sectionIds).filter(
      (id) => availableSectionIds.has(id),
    );
    const extensionIds = this.uniquePositiveNumberArray(raw.coverageSelection.extensionIds).filter(
      (id) => availableExtensionIds.has(id),
    );

    return {
      name: this.toNullableText(raw.name),
      counterpartyId: this.toFiniteNumber(raw.counterpartyId),
      currencyId: this.toFiniteNumber(raw.currencyId),
      coverageSelection:
        primaryMainCoverId == null
          ? null
          : {
              primaryMainCoverId,
              coverageIds,
              mainCoverId: primaryMainCoverId,
              sectionIds,
              extensionIds,
            },
      receptionDate: this.toDateOnlyOrNull(raw.receptionDate),
      inceptionDate: this.toDateOnlyOrNull(raw.inceptionDate),
      expiryDate: this.toDateOnlyOrNull(raw.expiryDate),
      writtenSharePct: this.toFiniteNumber(raw.writtenSharePct),
      signedSharePct: this.toFiniteNumber(raw.signedSharePct),
      fees: this.toFiniteNumber(raw.fees),
      isHighPriority: raw.isHighPriority
        ? true
        : this.form.controls.isHighPriority.dirty
          ? false
          : null,
      sumInsured: this.toFiniteNumber(raw.sumInsured),
      limitOfLiability: this.toFiniteNumber(raw.limitOfLiability),
      deductible: this.toFiniteNumber(raw.deductible),
      premiumRate: this.toFiniteNumber(raw.premiumRate),
      cedentCommissionPct: this.toFiniteNumber(raw.cedentCommissionPct),
      cedentPremiumReference: this.toNullableText(raw.cedentPremiumReference),
      isFronting: raw.isFronting ? true : this.form.controls.isFronting.dirty ? false : null,
      frontingReference: raw.isFronting ? this.toNullableText(raw.frontingReference) : null,
      memoText: this.toNullableText(raw.memoText),
    };
  }

  private normalizeFormValues(): void {
    for (const key of Object.keys(this.form.controls) as Array<
      keyof FacultativeFormGroup['controls']
    >) {
      const control = this.form.controls[key];

      if (typeof control.value === 'string') {
        control.setValue(control.value.trim() as never, { emitEvent: false });
      }
    }

    if (!this.form.controls.isFronting.value) {
      this.form.controls.frontingReference.setValue('', { emitEvent: false });
    }

    if (this.cedentSearchControl.value.trim() !== this.selectedCedentName) {
      this.form.controls.counterpartyId.setValue(null, { emitEvent: false });
    }
  }

  private syncCedentValidation() {
    return this.references.syncCedentValidation();
  }

  private hasSelectedCedent() {
    return this.references.hasSelectedCedent();
  }

  private getCedentLookupTerm() {
    return this.references.getCedentLookupTerm();
  }

  private moveActiveCedent(direction: number) {
    return this.references.moveActiveCedent(direction);
  }

  private moveActiveMainCover(direction: number) {
    return this.references.moveActiveMainCover(direction);
  }

  private groupCoverageOptionsByParent(options: CoverageOption[]) {
    return this.references.groupCoverageOptionsByParent(options);
  }

  private clearCoverageChildren() {
    return this.references.clearCoverageChildren();
  }

  private setSectionsEnabled(isEnabled: boolean) {
    return this.references.setSectionsEnabled(isEnabled);
  }

  private setExtensionsEnabled(isEnabled: boolean) {
    return this.references.setExtensionsEnabled(isEnabled);
  }

  private mergeMandatoryIds(selectedIds: number[], options: CoverageOption[]) {
    return this.references.mergeMandatoryIds(selectedIds, options);
  }

  private uniqueCoverageOptions(options: CoverageOption[]) {
    return this.references.uniqueCoverageOptions(options);
  }

  private findCoverageOption(options: CoverageOption[], id: number | null) {
    return this.references.findCoverageOption(options, id);
  }

  private findCoverageOptions(options: CoverageOption[], ids: number[]) {
    return this.references.findCoverageOptions(options, ids);
  }

  private filterCoverageOptions(options: CoverageOption[], searchValue: string) {
    return this.references.filterCoverageOptions(options, searchValue);
  }

  private isMainCoverageLevel(option: CoverageOption) {
    return this.references.isMainCoverageLevel(option);
  }

  private areNumberArraysEqual(previous: number[], current: number[]) {
    return this.references.areNumberArraysEqual(previous, current);
  }

  private clearCedentSelectionError() {
    return this.references.clearCedentSelectionError();
  }

  private handleSaveError(error: HttpErrorResponse): void {
    if (error.status >= 500) {
      console.error('Facultative contract save failed.', error.error);
      this.retrySaveMode.set(this.saveMode());
      const message = this.getUnexpectedErrorMessage(error);
      this.generalError.set(message);
      this.snackBar.open(message, 'Dismiss', {
        duration: 4500,
        horizontalPosition: 'end',
        verticalPosition: 'top',
      });
      return;
    }

    const { fieldErrors, generalErrors } = this.extractBackendErrors(error.error);
    this.serverFieldErrors.set(fieldErrors);

    for (const [backendField, messages] of Object.entries(fieldErrors)) {
      const controlPath = this.mapBackendField(backendField);

      if (!controlPath) {
        continue;
      }

      const control = this.form.get(controlPath);

      if (!control) {
        continue;
      }

      control.setErrors({
        ...(control.errors ?? {}),
        serverError: messages.join(' '),
      });
      control.markAsTouched();
    }

    const backendFieldMessage = Object.values(fieldErrors)
      .flat()
      .find((message) => message.trim().length > 0);
    const genericMessage =
      backendFieldMessage ?? generalErrors[0] ?? this.getUnexpectedErrorMessage(error);
    this.generalError.set(genericMessage);
    this.snackBar.open(genericMessage, 'Dismiss', {
      duration: 4500,
      horizontalPosition: 'end',
      verticalPosition: 'top',
    });
  }

  private clearServerErrors(): void {
    this.serverFieldErrors.set({});
    this.clearServerErrorsRecursive(this.form);
  }

  private clearServerErrorsRecursive(control: AbstractControl): void {
    const errors = { ...(control.errors ?? {}) };

    delete errors['serverError'];
    delete errors['invalidSelection'];

    control.setErrors(Object.keys(errors).length ? errors : null);

    if (control instanceof FormGroup) {
      for (const childControl of Object.values(control.controls)) {
        this.clearServerErrorsRecursive(childControl);
      }
    }
  }

  private extractBackendErrors(payload: unknown): {
    fieldErrors: Record<string, string[]>;
    generalErrors: string[];
  } {
    const result: { fieldErrors: Record<string, string[]>; generalErrors: string[] } = {
      fieldErrors: {},
      generalErrors: [],
    };

    if (typeof payload === 'string' && payload.trim()) {
      result.generalErrors.push(payload);
      return result;
    }

    if (!payload || typeof payload !== 'object') {
      return result;
    }

    const record = payload as Record<string, unknown>;
    const errors = record['errors'];

    if (errors && typeof errors === 'object' && !Array.isArray(errors)) {
      for (const [key, value] of Object.entries(errors as Record<string, unknown>)) {
        result.fieldErrors[key] = Array.isArray(value)
          ? value.filter((entry): entry is string => typeof entry === 'string')
          : [String(value)];
      }
    }

    const message = record['message'] ?? record['detail'] ?? record['title'];

    if (typeof message === 'string' && message.trim()) {
      result.generalErrors.push(message);
    }

    return result;
  }

  private mapBackendField(fieldName: string): string | null {
    const normalizedField = fieldName.replace(/\[(\d+)\]/g, '').toLowerCase();
    const map: Record<string, string> = {
      name: 'name',
      counterpartyid: 'counterpartyId',
      currencyid: 'currencyId',
      coverageselection: 'coverageSelection',
      'coverageselection.primarymaincoverid': 'coverageSelection.primaryMainCoverId',
      primarymaincoverid: 'coverageSelection.primaryMainCoverId',
      'coverageselection.coverageids': 'coverageSelection.coverageIds',
      coverageids: 'coverageSelection.coverageIds',
      'coverageselection.maincoverid': 'coverageSelection.mainCoverId',
      maincoverid: 'coverageSelection.mainCoverId',
      'coverageselection.sectionids': 'coverageSelection.sectionIds',
      sectionids: 'coverageSelection.sectionIds',
      'coverageselection.extensionids': 'coverageSelection.extensionIds',
      extensionids: 'coverageSelection.extensionIds',
      receptiondate: 'receptionDate',
      inceptiondate: 'inceptionDate',
      expirydate: 'expiryDate',
      writtensharepct: 'writtenSharePct',
      signedsharepct: 'signedSharePct',
      fees: 'fees',
      ishighpriority: 'isHighPriority',
      suminsured: 'sumInsured',
      limitofliability: 'limitOfLiability',
      deductible: 'deductible',
      premiumrate: 'premiumRate',
      grosspremium: 'grossPremium',
      cedentcommissionpct: 'cedentCommissionPct',
      cedentpremiumreference: 'cedentPremiumReference',
      isfronting: 'isFronting',
      frontingreference: 'frontingReference',
      memotext: 'memoText',
    };

    return map[normalizedField] ?? null;
  }

  private getUnexpectedErrorMessage(error: HttpErrorResponse): string {
    switch (error.status) {
      case 0:
        return 'The contract service is unreachable right now. Please try again.';
      case 400:
        return 'The contract could not be saved because some values are invalid.';
      case 401:
        return 'Your session has expired. Please sign in again.';
      case 403:
        return 'You are not authorized to create or update this contract.';
      case 404:
        return 'The requested contract draft could not be found.';
      case 409:
        return 'A duplicate contract value was detected. Review the highlighted fields.';
      default:
        return error.status >= 500
          ? 'The contract could not be saved because the server returned an error. Please retry after the backend issue is resolved.'
          : 'The contract could not be saved due to an unexpected server error.';
    }
  }

  private findCedentName(counterpartyId: number | null): string {
    if (counterpartyId == null) {
      return '';
    }

    const cedent = this.cedentResults().find((item) => item.id === counterpartyId);
    return cedent?.name ?? this.selectedCedentName;
  }

  private canLeaveWithoutPrompt(): boolean {
    return this.isBusy || !this.hasUnsavedChanges();
  }

  private navigateToOverview(contractId: number | null): void {
    void this.router.navigate([this.overviewRoute], {
      queryParams: { contractId: contractId ?? undefined },
    });
  }

  private hasUnsavedChanges(): boolean {
    return JSON.stringify(this.createSnapshot()) !== JSON.stringify(this.lastSavedSnapshot);
  }

  private getCurrentContractId(): number | null {
    return this.getPositiveId(this.contractId());
  }

  private getRouteContractId(): number | null {
    return this.getPositiveId(Number(this.route.snapshot.queryParamMap.get('contractId')));
  }

  private getPositiveId(value: number | null): number | null {
    return Number.isInteger(value) && value != null && value > 0 ? value : null;
  }

  private createSnapshot() {
    const raw = this.form.getRawValue();

    return {
      name: raw.name,
      counterpartyId: raw.counterpartyId,
      currencyId: raw.currencyId,
      coverageSelection: {
        primaryMainCoverId: raw.coverageSelection.primaryMainCoverId,
        coverageIds: raw.coverageSelection.coverageIds,
        mainCoverId: raw.coverageSelection.mainCoverId,
        sectionIds: raw.coverageSelection.sectionIds,
        extensionIds: raw.coverageSelection.extensionIds,
      },
      receptionDate: raw.receptionDate,
      inceptionDate: raw.inceptionDate,
      expiryDate: raw.expiryDate,
      writtenSharePct: raw.writtenSharePct,
      signedSharePct: raw.signedSharePct,
      fees: raw.fees,
      isHighPriority: raw.isHighPriority,
      sumInsured: raw.sumInsured,
      limitOfLiability: raw.limitOfLiability,
      deductible: raw.deductible,
      premiumRate: toFiniteNumber(raw.premiumRate),
      grossPremium: raw.grossPremium,
      cedentCommissionPct: raw.cedentCommissionPct,
      netPremium: raw.netPremium,
      cedentPremiumReference: raw.cedentPremiumReference,
      isFronting: raw.isFronting,
      frontingReference: raw.frontingReference,
      memoText: raw.memoText,
    };
  }

  private createEmptySnapshot() {
    return {
      name: '',
      counterpartyId: null as number | null,
      currencyId: null as number | null,
      coverageSelection: {
        primaryMainCoverId: null as number | null,
        coverageIds: [] as number[],
        mainCoverId: null as number | null,
        sectionIds: [] as number[],
        extensionIds: [] as number[],
      },
      receptionDate: '',
      inceptionDate: '',
      expiryDate: '',
      writtenSharePct: null as number | null,
      signedSharePct: null as number | null,
      fees: null as number | null,
      isHighPriority: false,
      sumInsured: null as number | null,
      limitOfLiability: null as number | null,
      deductible: null as number | null,
      premiumRate: null as number | null,
      grossPremium: null as number | null,
      cedentCommissionPct: null as number | null,
      netPremium: null as number | null,
      cedentPremiumReference: '',
      isFronting: false,
      frontingReference: '',
      memoText: '',
    };
  }

  private toNullableText(value: string): string | null {
    const trimmedValue = value.trim();
    return trimmedValue ? trimmedValue : null;
  }

  private toFiniteNumber(value: number | string | null | undefined): number | null {
    return toFiniteNumber(value);
  }

  private toDateOnlyOrNull(value: string): string | null {
    const date = value.trim();
    return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null;
  }

  private uniquePositiveNumberArray(values: number[]) {
    return this.references.uniquePositiveNumberArray(values);
  }
}
