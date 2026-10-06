import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, ElementRef, HostListener, OnInit, ViewChild, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  AbstractControl,
  FormBuilder,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  ValidationErrors,
  ValidatorFn,
  Validators
} from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { catchError, debounceTime, distinctUntilChanged, finalize, forkJoin, map, merge, of, startWith, Subject, switchMap, tap } from 'rxjs';
import { ContractCreationStepperComponent } from '../contract-creation-stepper/contract-creation-stepper.component';
import {
  CedentReference,
  CoverageOption,
  CurrencyReference,
  FacultativeContractResponse,
  UpsertFacultativeContractRequest
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

const optionalNonNegativeValidator: ValidatorFn = (control: AbstractControl): ValidationErrors | null => {
  if (control.value == null || control.value === '') {
    return null;
  }

  return Number(control.value) >= 0 ? null : { nonNegative: true };
};

const nonEmptyNumberArrayValidator: ValidatorFn = (control: AbstractControl): ValidationErrors | null => {
  return Array.isArray(control.value) && control.value.some(value => Number.isInteger(value) && value > 0)
    ? null
    : { required: true };
};

const coverageSelectionValidator: ValidatorFn = (control: AbstractControl): ValidationErrors | null => {
  const group = control as FacultativeFormGroup['controls']['coverageSelection'];
  const primaryMainCoverId = group.controls.primaryMainCoverId.value;
  const coverageIds = group.controls.coverageIds.value;

  if (!coverageIds.length) {
    return { coverageRequired: true };
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

const financialCalculationValidator: ValidatorFn = (control: AbstractControl): ValidationErrors | null => {
  const form = control as FacultativeFormGroup;
  const calculation = calculateFacultativeFinancials({
    sumInsured: form.controls.sumInsured.value,
    premiumRate: form.controls.premiumRate.value,
    cedentCommissionPct: form.controls.cedentCommissionPct.value
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
      commissionsExceedGrossPremium: false
    };
  }

  const grossPremium = roundMoney(tsi * premiumRate / 100);
  const cedentCommission = roundMoney(grossPremium * cedentCommissionPct / 100);

  return {
    grossPremium,
    cedentCommission,
    netPremium: roundMoney(Math.max(0, grossPremium - cedentCommission)),
    commissionsExceedGrossPremium: cedentCommission > grossPremium
  };
}

function toFiniteNumber(value: number | string | null | undefined): number | null {
  if (value == null) {
    return null;
  }

  const normalizedValue = typeof value === 'string'
    ? value.trim().replace(/\s/g, '').replace(',', '.')
    : value;

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
  imports: [CommonModule, ReactiveFormsModule, RouterLink, MatSnackBarModule, ContractCreationStepperComponent],
  templateUrl: './facultative-information.component.html',
  styles: ``
})
export class FacultativeInformationComponent implements OnInit, PendingChangesAware {
  private readonly destroyRef = inject(DestroyRef);
  private readonly elementRef = inject(ElementRef<HTMLElement>);
  private readonly fb = inject(FormBuilder);
  private readonly contractsService = inject(ContractsService);
  private readonly snackBar = inject(MatSnackBar);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  readonly typeRoute = '/workspace/reassurance/front-officer/contracts/new/type';
  readonly overviewRoute = '/workspace/reassurance/front-officer/contracts/new/overview';
  readonly dashboardRoute = '/workspace/reassurance/front-officer';
  readonly cedentSearchControl = new FormControl('', { nonNullable: true });
  readonly isInitialLoading = signal(true);
  readonly isCurrenciesLoading = signal(false);
  readonly isCedentLoading = signal(false);
  readonly isMainCoverLoading = signal(false);
  readonly isSectionsLoading = signal(false);
  readonly isExtensionsLoading = signal(false);
  readonly isCedentDropdownOpen = signal(false);
  readonly isMainCoverDropdownOpen = signal(false);
  readonly isCoverageDropdownOpen = signal(false);
  readonly coverageSearch = signal('');
  readonly sectionSearch = signal('');
  readonly extensionSearch = signal('');
  readonly isSaving = signal(false);
  readonly saveMode = signal<'draft' | 'continue' | null>(null);
  readonly retrySaveMode = signal<'draft' | 'continue' | null>(null);
  readonly contractId = signal<number | null>(null);
  readonly generatedUmr = signal('');
  readonly backendNetPremium = signal<number | null>(null);
  readonly generalError = signal('');
  readonly cedentLookupError = signal(false);
  readonly mainCoverLookupError = signal(false);
  readonly sectionsError = signal('');
  readonly extensionsError = signal('');
  readonly currencies = signal<CurrencyReference[]>([]);
  readonly cedentResults = signal<CedentReference[]>([]);
  readonly coverageCatalog = signal<CoverageOption[]>([]);
  readonly mainCovers = computed(() => this.coverageCatalog().filter(option => this.isMainCoverageLevel(option)));
  readonly sections = signal<CoverageOption[]>([]);
  readonly extensions = signal<CoverageOption[]>([]);
  readonly activeCedentIndex = signal(-1);
  readonly activeMainCoverIndex = signal(-1);
  readonly formSnapshot = signal(this.createEmptySnapshot());
  readonly filteredCoverages = computed(() => {
    const search = this.coverageSearch().trim().toLowerCase();

    if (!search) {
      return this.mainCovers();
    }

    return this.mainCovers().filter(option => {
      const description = option.description ?? option.name;
      return option.code.toLowerCase().includes(search)
        || option.name.toLowerCase().includes(search)
        || description.toLowerCase().includes(search);
    });
  });
  readonly filteredMainCovers = computed(() => this.filteredCoverages());
  readonly selectedCoverageIds = computed(() => this.formSnapshot().coverageSelection.coverageIds);
  readonly selectedSectionIds = computed(() => this.formSnapshot().coverageSelection.sectionIds);
  readonly selectedExtensionIds = computed(() => this.formSnapshot().coverageSelection.extensionIds);
  readonly availableSections = computed(() => {
    const selectedCoverageIds = new Set(this.selectedCoverageIds());
    return this.sections().filter(section =>
      section.level === 'SECTION'
      && section.parentId != null
      && selectedCoverageIds.has(section.parentId)
      && section.relationType === 'HAS_SECTION'
    );
  });
  readonly availableExtensions = computed(() => {
    const selectedCoverageIds = new Set(this.selectedCoverageIds());
    const selectedSectionIds = new Set(this.selectedSectionIds());

    return this.extensions().filter(extension => {
      if (extension.level !== 'EXTENSION' || extension.parentId == null || extension.relationType !== 'HAS_EXTENSION') {
        return false;
      }

      return selectedCoverageIds.has(extension.parentId) || selectedSectionIds.has(extension.parentId);
    });
  });
  readonly groupedSections = computed(() => this.groupCoverageOptionsByParent(this.availableSections()));
  readonly groupedExtensions = computed(() => this.groupCoverageOptionsByParent(this.availableExtensions()));
  readonly filteredSections = computed(() => this.filterCoverageOptions(this.availableSections(), this.sectionSearch()));
  readonly filteredExtensions = computed(() => this.filterCoverageOptions(this.availableExtensions(), this.extensionSearch()));
  readonly groupedFilteredSections = computed(() => this.groupCoverageOptionsByParent(this.filteredSections()));
  readonly groupedFilteredExtensions = computed(() => this.groupCoverageOptionsByParent(this.filteredExtensions()));
  readonly selectedMainCovers = computed(() => this.findCoverageOptions(this.mainCovers(), this.selectedCoverageIds()));
  readonly selectedMainCover = computed(() => this.findCoverageOption(this.mainCovers(), this.formSnapshot().coverageSelection.primaryMainCoverId));
  readonly selectedSections = computed(() => this.findCoverageOptions(this.availableSections(), this.selectedSectionIds()));
  readonly selectedExtensions = computed(() => this.findCoverageOptions(this.availableExtensions(), this.selectedExtensionIds()));
  readonly selectedCurrency = computed(() => {
    const currencyId = this.formSnapshot().currencyId;
    return this.currencies().find(currency => currency.id === currencyId) ?? null;
  });
  readonly summary = computed(() => {
    const snapshot = this.formSnapshot();
    const cedent = this.findCedentName(snapshot.counterpartyId);
    const period = snapshot.inceptionDate && snapshot.expiryDate
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
      mainCover: this.selectedMainCover() ? this.formatCoverageLabel(this.selectedMainCover()!) : 'Not selected',
      coverages: this.selectedMainCovers().length > 0 ? this.selectedMainCovers().map(option => this.formatCoverageLabel(option)).join(', ') : 'Not selected',
      sections: this.selectedSections().length > 0 ? this.selectedSections().map(option => this.formatCoverageLabel(option)).join(', ') : 'None',
      extensions: this.selectedExtensions().length > 0 ? this.selectedExtensions().map(option => this.formatCoverageLabel(option)).join(', ') : 'None',
      status: 'Draft'
    };
  });

  readonly form: FacultativeFormGroup = this.fb.group({
    name: this.fb.nonNullable.control('', [Validators.required, Validators.maxLength(255)]),
    counterpartyId: this.fb.control<number | null>(null, [Validators.required]),
    currencyId: this.fb.control<number | null>(null, [Validators.required]),
    coverageSelection: this.fb.group({
      primaryMainCoverId: this.fb.control<number | null>(null, [Validators.required]),
      coverageIds: this.fb.nonNullable.control<number[]>([], [nonEmptyNumberArrayValidator]),
      mainCoverId: this.fb.control<number | null>(null, [Validators.required]),
      sectionIds: this.fb.nonNullable.control<number[]>([]),
      extensionIds: this.fb.nonNullable.control<number[]>([])
    }, { validators: [coverageSelectionValidator] }),
    receptionDate: this.fb.nonNullable.control(''),
    inceptionDate: this.fb.nonNullable.control('', [Validators.required]),
    expiryDate: this.fb.nonNullable.control('', [Validators.required]),
    writtenSharePct: this.fb.control<number | null>(null, [Validators.min(0), Validators.max(100)]),
    signedSharePct: this.fb.control<number | null>(null, [Validators.min(0), Validators.max(100)]),
    fees: this.fb.control<number | null>(null, [optionalNonNegativeValidator]),
    isHighPriority: this.fb.nonNullable.control(false),
    sumInsured: this.fb.control<number | null>(null, [optionalNonNegativeValidator]),
    limitOfLiability: this.fb.control<number | null>(null, [optionalNonNegativeValidator]),
    deductible: this.fb.control<number | null>(null, [optionalNonNegativeValidator]),
    premiumRate: this.fb.control<number | string | null>(null, [optionalNonNegativeValidator, Validators.max(100)]),
    grossPremium: this.fb.control<number | null>(null, [optionalNonNegativeValidator]),
    cedentCommissionPct: this.fb.control<number | null>(null, [Validators.min(0), Validators.max(100)]),
    netPremium: this.fb.control<number | null>(null, [optionalNonNegativeValidator]),
    cedentPremiumReference: this.fb.nonNullable.control(''),
    isFronting: this.fb.nonNullable.control(false),
    frontingReference: this.fb.nonNullable.control(''),
    memoText: this.fb.nonNullable.control('', [Validators.maxLength(500)])
  }, {
    validators: [dateRangeValidator, shareValidator, deductibleValidator, financialCalculationValidator]
  });

  private selectedCedentName = '';
  private isHydratingCoverage = false;
  private lastSavedSnapshot = this.createEmptySnapshot();
  private readonly cedentOpenRequests = new Subject<void>();
  private readonly mainCoverOpenRequests = new Subject<void>();
  @ViewChild('coveragePicker') coveragePicker?: ElementRef<HTMLElement>;

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
    return this.canLeaveWithoutPrompt() || window.confirm('You have unsaved contract changes. Leave this page?');
  }

  get currentStatus(): string {
    return 'Draft';
  }

  get isBusy(): boolean {
    return this.isSaving() || this.isInitialLoading() || this.isCurrenciesLoading() || this.isMainCoverLoading() || this.isSectionsLoading() || this.isExtensionsLoading();
  }

  get saveDraftLabel(): string {
    return this.isSaving() && this.saveMode() === 'draft' ? 'Saving draft...' : 'Save Draft';
  }

  get continueLabel(): string {
    return this.isSaving() && this.saveMode() === 'continue' ? 'Saving...' : 'Continue to Overview';
  }

  openCedentDropdown(): void {
    const shouldRefresh = !this.isCedentDropdownOpen() || this.cedentLookupError() || this.cedentResults().length === 0;
    this.isCedentDropdownOpen.set(true);

    if (shouldRefresh) {
      this.cedentOpenRequests.next();
    }
  }

  closeCedentDropdown(): void {
    this.isCedentDropdownOpen.set(false);
    this.activeCedentIndex.set(-1);
  }

  openMainCoverDropdown(): void {
    this.openCoverageDropdown();
  }

  openCoverageDropdown(): void {
    const shouldRefresh = !this.isCoverageDropdownOpen() || this.mainCoverLookupError() || this.mainCovers().length === 0;
    this.isCoverageDropdownOpen.set(true);
    this.isMainCoverDropdownOpen.set(true);

    if (shouldRefresh) {
      this.mainCoverOpenRequests.next();
    }
  }

  closeMainCoverDropdown(): void {
    this.closeCoverageDropdown();
  }

  closeCoverageDropdown(): void {
    this.isCoverageDropdownOpen.set(false);
    this.isMainCoverDropdownOpen.set(false);
    this.activeMainCoverIndex.set(-1);
    this.coverageSearch.set('');
  }

  onCoverageSearchInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.coverageSearch.set(input.value);
    this.openCoverageDropdown();
    this.activeMainCoverIndex.set(this.filteredCoverages().length > 0 ? 0 : -1);
  }

  onCoverageFocusOut(event: FocusEvent): void {
    const nextTarget = event.relatedTarget as Node | null;

    if (nextTarget && this.coveragePicker?.nativeElement.contains(nextTarget)) {
      return;
    }

    this.closeCoverageDropdown();
  }

  selectMainCover(mainCover: CoverageOption): void {
    this.toggleMainCover(mainCover);
  }

  toggleMainCover(mainCover: CoverageOption): void {
    const controls = this.form.controls.coverageSelection.controls;
    const selectedIds = controls.coverageIds.value;
    const isSelected = selectedIds.includes(mainCover.id);
    const nextCoverageIds = isSelected
      ? selectedIds.filter(id => id !== mainCover.id)
      : [...selectedIds, mainCover.id];
    let nextPrimaryMainCoverId = controls.primaryMainCoverId.value;

    if (!nextCoverageIds.length) {
      nextPrimaryMainCoverId = null;
    } else if (!nextPrimaryMainCoverId || !nextCoverageIds.includes(nextPrimaryMainCoverId)) {
      nextPrimaryMainCoverId = nextCoverageIds[0];
    }

    controls.coverageIds.setValue(nextCoverageIds);
    controls.primaryMainCoverId.setValue(nextPrimaryMainCoverId);
    controls.mainCoverId.setValue(nextPrimaryMainCoverId);
    controls.coverageIds.markAsDirty();
    controls.coverageIds.markAsTouched();
    controls.primaryMainCoverId.markAsTouched();
  }

  clearMainCoverSelection(): void {
    this.coverageSearch.set('');
    this.form.controls.coverageSelection.controls.coverageIds.setValue([]);
    this.form.controls.coverageSelection.controls.primaryMainCoverId.setValue(null);
    this.form.controls.coverageSelection.controls.mainCoverId.setValue(null);
    this.mainCoverLookupError.set(false);
    this.closeMainCoverDropdown();
  }

  removeMainCover(mainCoverId: number): void {
    const mainCover = this.mainCovers().find(option => option.id === mainCoverId);
    if (mainCover) {
      this.toggleMainCover(mainCover);
    }
  }

  makePrimaryMainCover(mainCoverId: number): void {
    const controls = this.form.controls.coverageSelection.controls;
    if (!controls.coverageIds.value.includes(mainCoverId)) {
      return;
    }

    controls.primaryMainCoverId.setValue(mainCoverId);
    controls.mainCoverId.setValue(mainCoverId);
    controls.primaryMainCoverId.markAsDirty();
    controls.primaryMainCoverId.markAsTouched();
  }

  isMainCoverSelected(mainCoverId: number): boolean {
    return this.form.controls.coverageSelection.controls.coverageIds.value.includes(mainCoverId);
  }

  isPrimaryMainCover(mainCoverId: number): boolean {
    return this.form.controls.coverageSelection.controls.primaryMainCoverId.value === mainCoverId;
  }

  toggleSection(section: CoverageOption): void {
    const control = this.form.controls.coverageSelection.controls.sectionIds;
    const selectedIds = control.value;
    const nextSectionIds = selectedIds.includes(section.id)
      ? selectedIds.filter(id => id !== section.id)
      : [...selectedIds, section.id];

    control.setValue(this.uniquePositiveNumberArray(nextSectionIds));
    control.markAsDirty();
    control.markAsTouched();
  }

  onSectionSearchInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.sectionSearch.set(input.value);
  }

  removeSection(sectionId: number): void {
    const control = this.form.controls.coverageSelection.controls.sectionIds;
    control.setValue(control.value.filter(id => id !== sectionId));
    control.markAsDirty();
    control.markAsTouched();
  }

  isSectionSelected(sectionId: number): boolean {
    return this.form.controls.coverageSelection.controls.sectionIds.value.includes(sectionId);
  }

  toggleExtension(extension: CoverageOption): void {
    const control = this.form.controls.coverageSelection.controls.extensionIds;
    const selectedIds = control.value;
    const nextExtensionIds = selectedIds.includes(extension.id)
      ? selectedIds.filter(id => id !== extension.id)
      : [...selectedIds, extension.id];

    control.setValue(this.uniquePositiveNumberArray(nextExtensionIds));
    control.markAsDirty();
    control.markAsTouched();
  }

  onExtensionSearchInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.extensionSearch.set(input.value);
  }

  removeExtension(extensionId: number): void {
    const control = this.form.controls.coverageSelection.controls.extensionIds;
    control.setValue(control.value.filter(id => id !== extensionId));
    control.markAsDirty();
    control.markAsTouched();
  }

  isExtensionSelected(extensionId: number): boolean {
    return this.form.controls.coverageSelection.controls.extensionIds.value.includes(extensionId);
  }

  handleMainCoverKeydown(event: KeyboardEvent): void {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        if (!this.isCoverageDropdownOpen()) {
          this.openCoverageDropdown();
          return;
        }
        this.moveActiveMainCover(1);
        return;
      case 'ArrowUp':
        event.preventDefault();
        if (!this.isCoverageDropdownOpen()) {
          this.openCoverageDropdown();
          return;
        }
        this.moveActiveMainCover(-1);
        return;
      case 'Enter': {
        if (!this.isCoverageDropdownOpen()) {
          return;
        }

        const activeMainCover = this.filteredCoverages()[this.activeMainCoverIndex()];

        if (!activeMainCover) {
          return;
        }

        event.preventDefault();
        this.toggleMainCover(activeMainCover);
        return;
      }
      case ' ':
      case 'Spacebar': {
        if (!this.isCoverageDropdownOpen()) {
          return;
        }

        const activeMainCover = this.filteredCoverages()[this.activeMainCoverIndex()];

        if (!activeMainCover) {
          return;
        }

        event.preventDefault();
        this.toggleMainCover(activeMainCover);
        return;
      }
      case 'Escape':
        if (!this.isCoverageDropdownOpen()) {
          return;
        }

        event.preventDefault();
        this.closeCoverageDropdown();
        return;
      default:
        return;
    }
  }

  setActiveMainCoverIndex(index: number): void {
    this.activeMainCoverIndex.set(index);
  }

  formatCoverageLabel(option: CoverageOption): string {
    return `${option.code} — ${option.name}`;
  }

  isMandatorySection(section: CoverageOption): boolean {
    return section.isMandatory;
  }

  isMandatoryExtension(extension: CoverageOption): boolean {
    return extension.isMandatory;
  }

  getCoverageParentLabel(option: CoverageOption): string {
    if (option.parentId == null) {
      return 'Coverage';
    }

    const parent = [...this.mainCovers(), ...this.availableSections()].find(item => item.id === option.parentId);
    return parent ? this.formatCoverageLabel(parent) : 'Coverage';
  }

  getSelectedCoverageDescription(option: CoverageOption): string {
    return option.description ?? option.name;
  }

  selectCedent(cedent: CedentReference): void {
    this.selectedCedentName = cedent.name;
    this.cedentSearchControl.setValue(cedent.name, { emitEvent: false });
    this.form.controls.counterpartyId.setValue(cedent.id);
    this.form.controls.counterpartyId.markAsDirty();
    this.form.controls.counterpartyId.markAsTouched();
    this.syncCedentValidation();
    this.closeCedentDropdown();
  }

  clearCedentSelection(): void {
    this.selectedCedentName = '';
    this.cedentSearchControl.setValue('', { emitEvent: false });
    this.form.controls.counterpartyId.setValue(null);
    this.cedentResults.set([]);
    this.cedentLookupError.set(false);
    this.closeCedentDropdown();
  }

  handleCedentKeydown(event: KeyboardEvent): void {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        if (!this.isCedentDropdownOpen()) {
          this.openCedentDropdown();
          return;
        }
        this.moveActiveCedent(1);
        return;
      case 'ArrowUp':
        event.preventDefault();
        if (!this.isCedentDropdownOpen()) {
          this.openCedentDropdown();
          return;
        }
        this.moveActiveCedent(-1);
        return;
      case 'Enter': {
        if (!this.isCedentDropdownOpen()) {
          return;
        }

        const activeCedent = this.cedentResults()[this.activeCedentIndex()];

        if (!activeCedent) {
          return;
        }

        event.preventDefault();
        this.selectCedent(activeCedent);
        return;
      }
      case 'Escape':
        if (!this.isCedentDropdownOpen()) {
          return;
        }

        event.preventDefault();
        this.closeCedentDropdown();
        return;
      default:
        return;
    }
  }

  setActiveCedentIndex(index: number): void {
    this.activeCedentIndex.set(index);
  }

  cedentLocationLabel(cedent: CedentReference): string {
    return [cedent.city, cedent.country].filter((value): value is string => !!value && value.trim().length > 0).join(', ');
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
    this.clearServerErrors();
    this.markDraftFieldsTouched();
    this.normalizeFormValues();

    if (!this.isDraftReady()) {
      return;
    }

    void this.persist('draft');
  }

  continueToOverview(): void {
    if (this.isSaving()) {
      return;
    }

    this.retrySaveMode.set(null);
    this.generalError.set('');
    this.clearServerErrors();
    this.form.markAllAsTouched();
    this.normalizeFormValues();

    if (this.form.invalid || !this.hasSelectedCedent()) {
      this.syncCedentValidation();
      return;
    }

    void this.persist('continue');
  }

  retrySave(): void {
    const mode = this.retrySaveMode();

    if (!mode || this.isSaving()) {
      return;
    }

    this.retrySaveMode.set(null);
    this.generalError.set('');
    this.clearServerErrors();
    void this.persist(mode);
  }

  hasError(path: string, errorName: string): boolean {
    const control = this.form.get(path);
    return !!control && control.hasError(errorName) && (control.touched || control.dirty);
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
      maximumFractionDigits: decimalPlaces
    }).format(value);

    return `${currency.code} ${number}${currency.symbol ? ` (${currency.symbol})` : ''}`;
  }

  preventCalculatedInput(event: Event): void {
    event.preventDefault();
  }

  private bindFormState(): void {
    this.form.valueChanges.pipe(
      startWith(this.form.getRawValue()),
      map(() => this.createSnapshot()),
      takeUntilDestroyed(this.destroyRef)
    ).subscribe(snapshot => {
      this.formSnapshot.set(snapshot);
      this.syncCedentValidation();
    });
  }

  private bindFinancialCalculations(): void {
    const controls = this.form.controls;

    merge(
      controls.sumInsured.valueChanges,
      controls.premiumRate.valueChanges,
      controls.cedentCommissionPct.valueChanges
    ).pipe(
      startWith(null),
      takeUntilDestroyed(this.destroyRef)
    ).subscribe(() => {
      this.syncCalculatedFinancialControls();
    });
  }

  private syncCalculatedFinancialControls(authoritative?: { grossPremium?: number | null; netPremium?: number | null }): void {
    const calculation = calculateFacultativeFinancials({
      sumInsured: this.form.controls.sumInsured.value,
      premiumRate: this.form.controls.premiumRate.value,
      cedentCommissionPct: this.form.controls.cedentCommissionPct.value
    });

    const grossPremium = authoritative?.grossPremium ?? calculation.grossPremium;
    const netPremium = authoritative?.netPremium ?? calculation.netPremium;

    this.form.controls.grossPremium.setValue(grossPremium, { emitEvent: false });
    this.form.controls.netPremium.setValue(netPremium, { emitEvent: false });
    this.form.updateValueAndValidity({ emitEvent: false });
    this.formSnapshot.set(this.createSnapshot());
  }

  private bindCedentSearch(): void {
    const typedSearches$ = this.cedentSearchControl.valueChanges.pipe(
      tap(value => {
        if (value !== this.selectedCedentName && this.form.controls.counterpartyId.value !== null) {
          this.form.controls.counterpartyId.setValue(null);
        }
      }),
      tap(() => {
        this.isCedentDropdownOpen.set(true);
      }),
      map(() => this.getCedentLookupTerm()),
      debounceTime(300),
      distinctUntilChanged()
    );

    const openSearches$ = this.cedentOpenRequests.pipe(
      map(() => this.getCedentLookupTerm())
    );

    merge(openSearches$, typedSearches$).pipe(
      tap(() => {
        this.isCedentLoading.set(true);
        this.cedentLookupError.set(false);
      }),
      switchMap(search => this.contractsService.searchCedents(search, 1, 20).pipe(
        map(response => response.items),
        catchError(() => {
          this.cedentLookupError.set(true);
          return of([] as CedentReference[]);
        }),
        finalize(() => this.isCedentLoading.set(false))
      )),
      takeUntilDestroyed(this.destroyRef)
    ).subscribe(results => {
      this.cedentResults.set(results);
      this.activeCedentIndex.set(results.length > 0 ? 0 : -1);
    });
  }

  private bindMainCoverSearch(): void {
    this.mainCoverOpenRequests.pipe(
      tap(() => {
        this.mainCoverLookupError.set(false);
        this.activeMainCoverIndex.set(this.filteredCoverages().length > 0 ? 0 : -1);
      }),
      takeUntilDestroyed(this.destroyRef)
    ).subscribe();
  }

  private bindCoverageSelection(): void {
    const coverageControls = this.form.controls.coverageSelection.controls;

    coverageControls.coverageIds.valueChanges.pipe(
      distinctUntilChanged((previous, current) => this.areNumberArraysEqual(previous, current)),
      tap(coverageIds => {
        if (this.isHydratingCoverage) {
          return;
        }

        if (!coverageIds.length) {
          this.clearCoverageChildren();
          coverageControls.primaryMainCoverId.setValue(null, { emitEvent: false });
          coverageControls.mainCoverId.setValue(null, { emitEvent: false });
          return;
        }

        const primaryMainCoverId = coverageControls.primaryMainCoverId.value;
        if (!primaryMainCoverId || !coverageIds.includes(primaryMainCoverId)) {
          const nextPrimaryMainCoverId = coverageIds[0];
          coverageControls.primaryMainCoverId.setValue(nextPrimaryMainCoverId, { emitEvent: false });
          coverageControls.mainCoverId.setValue(nextPrimaryMainCoverId, { emitEvent: false });
        }
      }),
      switchMap(coverageIds => {
        if (this.isHydratingCoverage || coverageIds.length === 0) {
          return of(null);
        }

        return this.loadCoverageChildren(
          coverageIds,
          coverageControls.sectionIds.value,
          coverageControls.extensionIds.value
        );
      }),
      takeUntilDestroyed(this.destroyRef)
    ).subscribe();

    coverageControls.primaryMainCoverId.valueChanges.pipe(
      distinctUntilChanged(),
      takeUntilDestroyed(this.destroyRef)
    ).subscribe(primaryMainCoverId => {
      coverageControls.mainCoverId.setValue(primaryMainCoverId, { emitEvent: false });
    });

    coverageControls.sectionIds.valueChanges.pipe(
      distinctUntilChanged((previous, current) => this.areNumberArraysEqual(previous, current)),
      switchMap(sectionIds => {
        if (this.isHydratingCoverage) {
          return of(null);
        }

        const normalizedSectionIds = this.mergeMandatoryIds(sectionIds, this.availableSections());

        if (!this.areNumberArraysEqual(sectionIds, normalizedSectionIds)) {
          coverageControls.sectionIds.setValue(normalizedSectionIds, { emitEvent: false });
        }

        return this.loadExtensionsForSelection(normalizedSectionIds, coverageControls.extensionIds.value);
      }),
      takeUntilDestroyed(this.destroyRef)
    ).subscribe();

    coverageControls.extensionIds.valueChanges.pipe(
      distinctUntilChanged((previous, current) => this.areNumberArraysEqual(previous, current)),
      takeUntilDestroyed(this.destroyRef)
    ).subscribe(extensionIds => {
      if (this.isHydratingCoverage) {
        return;
      }

      const normalizedExtensionIds = this.mergeMandatoryIds(extensionIds, this.availableExtensions());

      if (!this.areNumberArraysEqual(extensionIds, normalizedExtensionIds)) {
        coverageControls.extensionIds.setValue(normalizedExtensionIds, { emitEvent: false });
      }
    });
  }

  private bindFrontingValidation(): void {
    this.form.controls.isFronting.valueChanges.pipe(
      startWith(this.form.controls.isFronting.value),
      takeUntilDestroyed(this.destroyRef)
    ).subscribe(isFronting => {
      const control = this.form.controls.frontingReference;

      if (isFronting) {
        control.addValidators([Validators.required]);
      } else {
        control.removeValidators([Validators.required]);
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
      contract: contractId == null ? of(null) : this.contractsService.getFacultativeContract(contractId)
    }).pipe(
      switchMap(({ currencies, mainCovers, contract }) => {
        this.currencies.set(currencies);
        this.coverageCatalog.set(mainCovers);
        const defaultCurrency = currencies.find(currency => currency.isDefault) ?? currencies[0];

        if (contract) {
          this.applyLoadedContract(contract, contractId);
          return this.hydrateLoadedCoverage(contract);
        }

        if (defaultCurrency && this.form.controls.currencyId.value == null) {
          this.form.controls.currencyId.setValue(defaultCurrency.id);
        }

        return of(null);
      }),
      finalize(() => {
        this.isInitialLoading.set(false);
        this.isCurrenciesLoading.set(false);
        this.isMainCoverLoading.set(false);
      })
    ).subscribe({
      next: () => {
        this.lastSavedSnapshot = this.createSnapshot();
        this.form.markAsPristine();
      },
      error: () => {
        this.generalError.set(contractId == null
          ? 'Currencies could not be loaded. Refresh the page and try again.'
          : 'Contract details could not be loaded. Return to the portfolio and try again.');
      }
    });
  }

  private loadCoverageChildren(mainCoverIds: number[], savedSectionIds: number[], savedExtensionIds: number[]) {
    const validMainCoverIds = this.uniquePositiveNumberArray(mainCoverIds);

    if (!validMainCoverIds.length) {
      this.clearCoverageChildren();
      return of(null);
    }

    this.isSectionsLoading.set(true);
    this.isExtensionsLoading.set(true);
    this.sectionsError.set('');
    this.extensionsError.set('');

    return forkJoin({
      sectionsByCoverage: forkJoin(validMainCoverIds.map(mainCoverId => this.contractsService.getCoverageChildren(mainCoverId, 'SECTION').pipe(
        catchError(() => {
          this.sectionsError.set('Sections could not be loaded for the selected coverages.');
          return of([] as CoverageOption[]);
        })
      ))),
      directExtensionsByCoverage: forkJoin(validMainCoverIds.map(mainCoverId => this.contractsService.getCoverageChildren(mainCoverId, 'EXTENSION').pipe(
        catchError(() => {
          this.extensionsError.set('Extensions could not be loaded for the selected coverages.');
          return of([] as CoverageOption[]);
        })
      )))
    }).pipe(
      switchMap(({ sectionsByCoverage, directExtensionsByCoverage }) => {
        const sections = this.uniqueCoverageOptions(sectionsByCoverage.flat().filter(section =>
          section.level === 'SECTION'
          && section.parentId != null
          && validMainCoverIds.includes(section.parentId)
          && section.relationType === 'HAS_SECTION'
        ));
        const directExtensions = this.uniqueCoverageOptions(directExtensionsByCoverage.flat().filter(extension =>
          extension.level === 'EXTENSION'
          && extension.parentId != null
          && validMainCoverIds.includes(extension.parentId)
          && extension.relationType === 'HAS_EXTENSION'
        ));
        this.sections.set(sections);
        this.setSectionsEnabled(sections.length > 0);

        const sectionIds = this.mergeMandatoryIds(savedSectionIds, sections);
        this.form.controls.coverageSelection.controls.sectionIds.setValue(sectionIds, { emitEvent: false });
        this.formSnapshot.set(this.createSnapshot());

        return this.loadExtensionsForSelection(sectionIds, savedExtensionIds, directExtensions);
      }),
      finalize(() => {
        this.isSectionsLoading.set(false);
        this.isExtensionsLoading.set(false);
      })
    );
  }

  private loadExtensionsForSelection(sectionIds: number[], savedExtensionIds: number[], directExtensions?: CoverageOption[]) {
    const mainCoverIds = this.uniquePositiveNumberArray(this.form.controls.coverageSelection.controls.coverageIds.value);
    const validSectionIds = this.uniquePositiveNumberArray(sectionIds);

    if (!mainCoverIds.length) {
      this.extensions.set([]);
      this.setExtensionsEnabled(false);
      this.form.controls.coverageSelection.controls.extensionIds.setValue([], { emitEvent: false });
      return of(null);
    }

    this.isExtensionsLoading.set(true);
    if (!directExtensions) {
      this.extensionsError.set('');
    }

    const directExtensions$ = directExtensions
      ? of(directExtensions)
      : forkJoin(mainCoverIds.map(mainCoverId => this.contractsService.getCoverageChildren(mainCoverId, 'EXTENSION').pipe(
          catchError(() => {
            this.extensionsError.set('Extensions could not be loaded for the selected coverages.');
            return of([] as CoverageOption[]);
          })
        ))).pipe(map(results => this.uniqueCoverageOptions(results.flat())));

    const sectionExtensionRequests = validSectionIds.map(sectionId =>
      this.contractsService.getCoverageChildren(sectionId, 'EXTENSION').pipe(
        catchError(() => {
          this.extensionsError.set('Some section extensions could not be loaded.');
          return of([] as CoverageOption[]);
        })
      )
    );

    return forkJoin([
      directExtensions$,
      sectionExtensionRequests.length > 0 ? forkJoin(sectionExtensionRequests) : of([] as CoverageOption[][])
    ]).pipe(
      tap(([mainCoverExtensions, sectionExtensions]) => {
        const selectedMainCoverIds = new Set(mainCoverIds);
        const selectedSectionIds = new Set(validSectionIds);
        const extensions = this.uniqueCoverageOptions([...mainCoverExtensions, ...sectionExtensions.flat()].filter(extension => {
          if (extension.level !== 'EXTENSION' || extension.parentId == null || extension.relationType !== 'HAS_EXTENSION') {
            return false;
          }

          return selectedMainCoverIds.has(extension.parentId) || selectedSectionIds.has(extension.parentId);
        }));
        this.extensions.set(extensions);
        this.setExtensionsEnabled(extensions.length > 0);

        const validSavedExtensionIds = savedExtensionIds.filter(id => extensions.some(option => option.id === id));
        const extensionIds = this.mergeMandatoryIds(validSavedExtensionIds, extensions);
        this.form.controls.coverageSelection.controls.extensionIds.setValue(extensionIds, { emitEvent: false });
        this.formSnapshot.set(this.createSnapshot());
      }),
      finalize(() => this.isExtensionsLoading.set(false)),
      map(() => null)
    );
  }

  private hydrateLoadedCoverage(contract: FacultativeContractResponse) {
    const coverage = contract.coverageSelection;

    if (!coverage) {
      return of(null);
    }

    const primaryMainCoverId = coverage.primaryMainCoverId ?? coverage.mainCoverId ?? null;
    const coverageIds = coverage.coverageIds?.length ? coverage.coverageIds : primaryMainCoverId == null ? [] : [primaryMainCoverId];

    if (!primaryMainCoverId || !coverageIds.length) {
      return of(null);
    }

    this.isHydratingCoverage = true;

    const embeddedMainCover = coverage.mainCover;
    const mainCover = this.mainCovers().find(option => option.id === primaryMainCoverId) ?? embeddedMainCover ?? null;

    if (mainCover) {
      this.coverageCatalog.set(this.uniqueCoverageOptions([...this.coverageCatalog(), mainCover]));
      this.coverageSearch.set('');
    }

    this.form.controls.coverageSelection.patchValue({
      coverageIds,
      primaryMainCoverId,
      mainCoverId: primaryMainCoverId
    }, { emitEvent: false });
    this.formSnapshot.set(this.createSnapshot());

    return this.loadCoverageChildren(coverageIds, coverage.sectionIds, coverage.extensionIds).pipe(
      finalize(() => {
        this.isHydratingCoverage = false;
      })
    );
  }

  private applyLoadedContract(contract: FacultativeContractResponse, fallbackContractId: number | null): void {
    this.contractId.set(this.getPositiveId(contract.contractId) ?? fallbackContractId);
    this.generatedUmr.set(contract.umr);
    this.backendNetPremium.set(contract.netPremiumCedent);
    this.form.patchValue({
      name: contract.name,
      counterpartyId: contract.counterpartyId,
      currencyId: contract.currencyId,
      receptionDate: contract.receptionDate ?? '',
      inceptionDate: contract.inceptionDate,
      expiryDate: contract.expiryDate,
      writtenSharePct: contract.writtenSharePct,
      signedSharePct: contract.signedSharePct,
      fees: contract.fees,
      isHighPriority: contract.isHighPriority,
      sumInsured: contract.sumInsured,
      limitOfLiability: contract.limitOfLiability ?? null,
      deductible: contract.deductible,
      premiumRate: contract.premiumRate,
      grossPremium: contract.grossPremium,
      cedentCommissionPct: contract.cedentCommissionPct,
      netPremium: contract.netPremium ?? contract.netPremiumCedent,
      cedentPremiumReference: contract.cedentPremiumReference ?? '',
      isFronting: contract.isFronting,
      frontingReference: contract.frontingReference ?? '',
      memoText: contract.memoText ?? ''
    });
    this.syncCalculatedFinancialControls({
      grossPremium: contract.grossPremium,
      netPremium: contract.netPremium ?? contract.netPremiumCedent
    });

    this.selectedCedentName = contract.counterpartyName?.trim() ?? '';
    this.cedentSearchControl.setValue(this.selectedCedentName, { emitEvent: false });

    if (contract.counterpartyId > 0 && this.selectedCedentName) {
      this.cedentResults.set([{
        id: contract.counterpartyId,
        name: this.selectedCedentName,
        country: null,
        city: null
      }]);
    }
  }

  private async persist(mode: 'draft' | 'continue'): Promise<void> {
    if (this.isSaving()) {
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

    request.pipe(
      finalize(() => {
        this.isSaving.set(false);
        this.saveMode.set(null);
      })
    ).subscribe({
      next: response => {
        this.applySaveResponse(response);
        this.snackBar.open(this.getSaveSuccessMessage(response, isCreating), 'Dismiss', {
          duration: 3000,
          horizontalPosition: 'end',
          verticalPosition: 'top'
        });

        if (mode === 'continue') {
          this.navigateToOverview(this.getCurrentContractId());
        }
      },
      error: (error: HttpErrorResponse) => {
        this.handleSaveError(error);
      }
    });
  }

  private applySaveResponse(response: FacultativeContractResponse): void {
    const responseContractId = this.getPositiveId(response.contractId);

    if (responseContractId != null) {
      this.contractId.set(responseContractId);
    }

    this.generatedUmr.set(response.umr);
    this.backendNetPremium.set(response.netPremiumCedent);
    this.form.patchValue({
      fees: response.fees ?? this.form.controls.fees.value,
      grossPremium: response.grossPremium ?? this.form.controls.grossPremium.value,
      cedentCommissionPct: response.cedentCommissionPct ?? this.form.controls.cedentCommissionPct.value,
      netPremium: response.netPremium ?? response.netPremiumCedent ?? this.form.controls.netPremium.value
    }, { emitEvent: false });
    this.syncCalculatedFinancialControls({
      grossPremium: response.grossPremium ?? this.form.controls.grossPremium.value,
      netPremium: response.netPremium ?? response.netPremiumCedent ?? this.form.controls.netPremium.value
    });
    this.lastSavedSnapshot = this.createSnapshot();
    this.form.markAsPristine();
  }

  private getSaveSuccessMessage(response: FacultativeContractResponse, isCreating: boolean): string {
    const umr = response.umr.trim();
    const message = isCreating ? 'Contract created successfully.' : 'Contract saved successfully.';

    return umr
      ? `${message}\nUMR: ${umr}`
      : message;
  }

  private buildRequest(): UpsertFacultativeContractRequest {
    const raw = this.form.getRawValue();
    const coverageIds = this.uniquePositiveNumberArray(raw.coverageSelection.coverageIds)
      .filter(id => this.mainCovers().some(option => option.id === id));
    const primaryMainCoverId = coverageIds.includes(raw.coverageSelection.primaryMainCoverId ?? 0)
      ? raw.coverageSelection.primaryMainCoverId!
      : coverageIds[0]!;
    const availableSectionIds = new Set(this.availableSections().map(section => section.id));
    const availableExtensionIds = new Set(this.availableExtensions().map(extension => extension.id));
    const sectionIds = this.uniquePositiveNumberArray(raw.coverageSelection.sectionIds)
      .filter(id => availableSectionIds.has(id));
    const extensionIds = this.uniquePositiveNumberArray(raw.coverageSelection.extensionIds)
      .filter(id => availableExtensionIds.has(id));

    return {
      name: raw.name.trim(),
      counterpartyId: raw.counterpartyId!,
      currencyId: raw.currencyId!,
      coverageSelection: {
        primaryMainCoverId,
        coverageIds,
        mainCoverId: primaryMainCoverId,
        sectionIds,
        extensionIds
      },
      receptionDate: this.toNullableText(raw.receptionDate),
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
      cedentPremiumReference: this.toNullableText(raw.cedentPremiumReference),
      isFronting: raw.isFronting,
      frontingReference: raw.isFronting ? this.toNullableText(raw.frontingReference) : null,
      memoText: this.toNullableText(raw.memoText)
    };
  }

  private normalizeFormValues(): void {
    for (const key of Object.keys(this.form.controls) as Array<keyof FacultativeFormGroup['controls']>) {
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

  private isDraftReady(): boolean {
    const requiredControls = [
      this.form.controls.name,
      this.form.controls.counterpartyId,
      this.form.controls.currencyId,
      this.form.controls.coverageSelection.controls.coverageIds,
      this.form.controls.coverageSelection.controls.primaryMainCoverId,
      this.form.controls.inceptionDate,
      this.form.controls.expiryDate
    ];

    this.syncCedentValidation();
    this.form.updateValueAndValidity({ emitEvent: false });

    return requiredControls.every(control => control.valid)
      && !this.form.hasError('expiryBeforeInception')
      && !this.form.hasError('commissionsExceedGrossPremium');
  }

  private markDraftFieldsTouched(): void {
    this.form.controls.name.markAsTouched();
    this.form.controls.counterpartyId.markAsTouched();
    this.form.controls.currencyId.markAsTouched();
    this.form.controls.coverageSelection.controls.coverageIds.markAsTouched();
    this.form.controls.coverageSelection.controls.primaryMainCoverId.markAsTouched();
    this.form.controls.inceptionDate.markAsTouched();
    this.form.controls.expiryDate.markAsTouched();
  }

  private syncCedentValidation(): void {
    if (this.hasSelectedCedent()) {
      if (this.form.controls.counterpartyId.hasError('invalidSelection')) {
        this.clearCedentSelectionError();
      }
      return;
    }

    if (this.cedentSearchControl.value.trim()) {
      this.form.controls.counterpartyId.setErrors({
        ...(this.form.controls.counterpartyId.errors ?? {}),
        invalidSelection: true
      });
      return;
    }

    this.clearCedentSelectionError();
  }

  private hasSelectedCedent(): boolean {
    return this.form.controls.counterpartyId.value != null && this.cedentSearchControl.value.trim() === this.selectedCedentName;
  }

  private getCedentLookupTerm(): string | null {
    const trimmedValue = this.cedentSearchControl.value.trim();

    if (!trimmedValue) {
      return null;
    }

    return this.hasSelectedCedent() ? null : trimmedValue;
  }

  private moveActiveCedent(direction: number): void {
    const results = this.cedentResults();

    if (results.length === 0) {
      this.activeCedentIndex.set(-1);
      return;
    }

    const currentIndex = this.activeCedentIndex();
    const nextIndex = currentIndex < 0
      ? 0
      : (currentIndex + direction + results.length) % results.length;

    this.activeCedentIndex.set(nextIndex);
  }

  private moveActiveMainCover(direction: number): void {
    const results = this.filteredCoverages();

    if (results.length === 0) {
      this.activeMainCoverIndex.set(-1);
      return;
    }

    const currentIndex = this.activeMainCoverIndex();
    const nextIndex = currentIndex < 0
      ? 0
      : (currentIndex + direction + results.length) % results.length;

    this.activeMainCoverIndex.set(nextIndex);
  }

  private groupCoverageOptionsByParent(options: CoverageOption[]): CoverageOptionGroup[] {
    const groups = new Map<string, CoverageOption[]>();

    for (const option of options) {
      const parentLabel = this.getCoverageParentLabel(option);
      groups.set(parentLabel, [...(groups.get(parentLabel) ?? []), option]);
    }

    return Array.from(groups.entries()).map(([parentLabel, items]) => ({ parentLabel, items }));
  }

  private clearCoverageChildren(): void {
    this.sections.set([]);
    this.extensions.set([]);
    this.sectionSearch.set('');
    this.extensionSearch.set('');
    this.sectionsError.set('');
    this.extensionsError.set('');
    this.form.controls.coverageSelection.controls.sectionIds.setValue([], { emitEvent: false });
    this.form.controls.coverageSelection.controls.extensionIds.setValue([], { emitEvent: false });
    this.setSectionsEnabled(false);
    this.setExtensionsEnabled(false);
  }

  private setSectionsEnabled(isEnabled: boolean): void {
    const control = this.form.controls.coverageSelection.controls.sectionIds;

    if (isEnabled) {
      control.enable({ emitEvent: false });
    } else {
      control.disable({ emitEvent: false });
    }
  }

  private setExtensionsEnabled(isEnabled: boolean): void {
    const control = this.form.controls.coverageSelection.controls.extensionIds;

    if (isEnabled) {
      control.enable({ emitEvent: false });
    } else {
      control.disable({ emitEvent: false });
    }
  }

  private mergeMandatoryIds(selectedIds: number[], options: CoverageOption[]): number[] {
    const availableIds = new Set(options.map(option => option.id));
    const selectedAvailableIds = selectedIds.filter(id => availableIds.has(id));
    const mandatoryIds = options.filter(option => option.isMandatory).map(option => option.id);

    return [...new Set([...selectedAvailableIds, ...mandatoryIds])];
  }

  private uniqueCoverageOptions(options: CoverageOption[]): CoverageOption[] {
    const seenIds = new Set<number>();

    return options.filter(option => {
      if (option.id <= 0 || seenIds.has(option.id)) {
        return false;
      }

      seenIds.add(option.id);
      return true;
    });
  }

  private findCoverageOption(options: CoverageOption[], id: number | null): CoverageOption | null {
    if (id == null) {
      return null;
    }

    return options.find(option => option.id === id) ?? null;
  }

  private findCoverageOptions(options: CoverageOption[], ids: number[]): CoverageOption[] {
    const selectedIds = new Set(ids);
    return options.filter(option => selectedIds.has(option.id));
  }

  private filterCoverageOptions(options: CoverageOption[], searchValue: string): CoverageOption[] {
    const search = searchValue.trim().toLowerCase();

    if (!search) {
      return options;
    }

    return options.filter(option => {
      const description = option.description ?? option.name;
      return option.code.toLowerCase().includes(search)
        || option.name.toLowerCase().includes(search)
        || description.toLowerCase().includes(search);
    });
  }

  private isMainCoverageLevel(option: CoverageOption): boolean {
    return option.level === 'MAIN' || option.level === 'MAIN_COVER';
  }

  private areNumberArraysEqual(previous: number[], current: number[]): boolean {
    if (previous.length !== current.length) {
      return false;
    }

    return previous.every((value, index) => value === current[index]);
  }

  private clearCedentSelectionError(): void {
    if (!this.form.controls.counterpartyId.hasError('invalidSelection')) {
      return;
    }

    const errors = { ...(this.form.controls.counterpartyId.errors ?? {}) };
    delete errors['invalidSelection'];
    this.form.controls.counterpartyId.setErrors(Object.keys(errors).length > 0 ? errors : null);
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
        verticalPosition: 'top'
      });
      return;
    }

    const { fieldErrors, generalErrors } = this.extractBackendErrors(error.error);

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
        serverError: messages.join(' ')
      });
      control.markAsTouched();
    }

    const backendFieldMessage = Object.values(fieldErrors).flat().find(message => message.trim().length > 0);
    const genericMessage = backendFieldMessage ?? generalErrors[0] ?? this.getUnexpectedErrorMessage(error);
    this.generalError.set(genericMessage);
    this.snackBar.open(genericMessage, 'Dismiss', {
      duration: 4500,
      horizontalPosition: 'end',
      verticalPosition: 'top'
    });
  }

  private clearServerErrors(): void {
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

  private extractBackendErrors(payload: unknown): { fieldErrors: Record<string, string[]>; generalErrors: string[] } {
    const result: { fieldErrors: Record<string, string[]>; generalErrors: string[] } = {
      fieldErrors: {},
      generalErrors: []
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
    const normalizedField = fieldName.toLowerCase();
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
      sectionids: 'coverageSelection.sectionIds',
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
      memotext: 'memoText'
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

    const cedent = this.cedentResults().find(item => item.id === counterpartyId);
    return cedent?.name ?? this.selectedCedentName;
  }

  private canLeaveWithoutPrompt(): boolean {
    return this.isBusy || !this.hasUnsavedChanges();
  }

  private navigateToOverview(contractId: number | null): void {
    void this.router.navigate([this.overviewRoute], {
      queryParams: { contractId: contractId ?? undefined }
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
        extensionIds: raw.coverageSelection.extensionIds
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
      memoText: raw.memoText
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
        extensionIds: [] as number[]
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
      memoText: ''
    };
  }

  private toNullableText(value: string): string | null {
    const trimmedValue = value.trim();
    return trimmedValue ? trimmedValue : null;
  }

  private uniquePositiveNumberArray(values: number[]): number[] {
    return [...new Set(values.filter(value => Number.isInteger(value) && value > 0))];
  }
}
