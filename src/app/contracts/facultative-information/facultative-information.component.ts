import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, ElementRef, HostListener, OnInit, computed, inject, signal } from '@angular/core';
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
import { Router, RouterLink } from '@angular/router';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { catchError, debounceTime, distinctUntilChanged, finalize, map, merge, of, startWith, Subject, switchMap, tap } from 'rxjs';
import { ContractCreationStepperComponent } from '../contract-creation-stepper/contract-creation-stepper.component';
import {
  CedentReference,
  CurrencyReference,
  FacultativeContractResponse,
  UpsertFacultativeContractRequest
} from '../../shared/models/contract.model';
import { PendingChangesAware } from '../../shared/guards/pending-changes.guard';
import { ContractsService } from '../../shared/services/contracts.service';

type FacultativeFormGroup = FormGroup<{
  umr: FormControl<string>;
  name: FormControl<string>;
  counterpartyId: FormControl<number | null>;
  currencyId: FormControl<number | null>;
  receptionDate: FormControl<string>;
  inceptionDate: FormControl<string>;
  expiryDate: FormControl<string>;
  writtenSharePct: FormControl<number | null>;
  signedSharePct: FormControl<number | null>;
  fees: FormControl<number | null>;
  isHighPriority: FormControl<boolean>;
  sumInsured: FormControl<number | null>;
  deductible: FormControl<number | null>;
  premiumRate: FormControl<number | null>;
  grossPremium: FormControl<number | null>;
  cedentCommissionPct: FormControl<number | null>;
  cedentPremiumReference: FormControl<string>;
  isFronting: FormControl<boolean>;
  frontingReference: FormControl<string>;
  memoText: FormControl<string>;
}>;

const optionalNonNegativeValidator: ValidatorFn = (control: AbstractControl): ValidationErrors | null => {
  if (control.value == null || control.value === '') {
    return null;
  }

  return Number(control.value) >= 0 ? null : { nonNegative: true };
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
  private readonly router = inject(Router);
  readonly typeRoute = '/workspace/reassurance/front-officer/contracts/new/type';
  readonly conditionsRoute = '/workspace/reassurance/front-officer/contracts/new/conditions';
  readonly dashboardRoute = '/workspace/reassurance/front-officer';
  readonly cedentSearchControl = new FormControl('', { nonNullable: true });
  readonly isInitialLoading = signal(true);
  readonly isCurrenciesLoading = signal(false);
  readonly isCedentLoading = signal(false);
  readonly isCedentDropdownOpen = signal(false);
  readonly isSaving = signal(false);
  readonly saveMode = signal<'draft' | 'continue' | null>(null);
  readonly contractId = signal<number | null>(null);
  readonly backendNetPremium = signal<number | null>(null);
  readonly generalError = signal('');
  readonly duplicateUmrMessage = signal('');
  readonly cedentLookupError = signal(false);
  readonly currencies = signal<CurrencyReference[]>([]);
  readonly cedentResults = signal<CedentReference[]>([]);
  readonly activeCedentIndex = signal(-1);
  readonly formSnapshot = signal(this.createEmptySnapshot());
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
      umr: snapshot.umr || 'Not provided',
      name: snapshot.name || 'Not provided',
      cedent: cedent || 'Not selected',
      currency: this.selectedCurrency()?.code || 'Not selected',
      period,
      writtenSharePct: snapshot.writtenSharePct,
      signedSharePct: snapshot.signedSharePct,
      sumInsured: snapshot.sumInsured,
      grossPremium: snapshot.grossPremium,
      estimatedNetPremium: this.getNetPremiumPreview(snapshot.grossPremium, snapshot.cedentCommissionPct),
      status: 'Draft'
    };
  });

  readonly form: FacultativeFormGroup = this.fb.group({
    umr: this.fb.nonNullable.control('', [Validators.maxLength(100)]),
    name: this.fb.nonNullable.control('', [Validators.required, Validators.maxLength(255)]),
    counterpartyId: this.fb.control<number | null>(null, [Validators.required]),
    currencyId: this.fb.control<number | null>(null, [Validators.required]),
    receptionDate: this.fb.nonNullable.control(''),
    inceptionDate: this.fb.nonNullable.control('', [Validators.required]),
    expiryDate: this.fb.nonNullable.control('', [Validators.required]),
    writtenSharePct: this.fb.control<number | null>(null, [Validators.min(0), Validators.max(100)]),
    signedSharePct: this.fb.control<number | null>(null, [Validators.min(0), Validators.max(100)]),
    fees: this.fb.control<number | null>(null, [optionalNonNegativeValidator]),
    isHighPriority: this.fb.nonNullable.control(false),
    sumInsured: this.fb.control<number | null>(null, [optionalNonNegativeValidator]),
    deductible: this.fb.control<number | null>(null, [optionalNonNegativeValidator]),
    premiumRate: this.fb.control<number | null>(null, [optionalNonNegativeValidator]),
    grossPremium: this.fb.control<number | null>(null, [optionalNonNegativeValidator]),
    cedentCommissionPct: this.fb.control<number | null>(null, [Validators.min(0), Validators.max(100)]),
    cedentPremiumReference: this.fb.nonNullable.control(''),
    isFronting: this.fb.nonNullable.control(false),
    frontingReference: this.fb.nonNullable.control(''),
    memoText: this.fb.nonNullable.control('', [Validators.maxLength(500)])
  }, {
    validators: [dateRangeValidator, shareValidator, deductibleValidator]
  });

  private selectedCedentName = '';
  private lastSavedSnapshot = this.createEmptySnapshot();
  private readonly cedentOpenRequests = new Subject<void>();

  ngOnInit(): void {
    this.bindFormState();
    this.bindCedentSearch();
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
    }
  }

  canDeactivate(): boolean {
    return this.canLeaveWithoutPrompt() || window.confirm('You have unsaved contract changes. Leave this page?');
  }

  get currentStatus(): string {
    return 'Draft';
  }

  get isBusy(): boolean {
    return this.isSaving() || this.isInitialLoading() || this.isCurrenciesLoading();
  }

  get saveDraftLabel(): string {
    return this.isSaving() && this.saveMode() === 'draft' ? 'Saving draft...' : 'Save Draft';
  }

  get continueLabel(): string {
    return this.isSaving() && this.saveMode() === 'continue' ? 'Saving...' : 'Continue to Conditions';
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
    this.generalError.set('');
    this.clearServerErrors();
    this.markDraftFieldsTouched();
    this.normalizeFormValues();

    if (!this.isDraftReady()) {
      return;
    }

    void this.persist('draft');
  }

  continueToConditions(): void {
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

    this.contractsService.getCurrencies().pipe(
      finalize(() => {
        this.isInitialLoading.set(false);
        this.isCurrenciesLoading.set(false);
      })
    ).subscribe({
      next: currencies => {
        this.currencies.set(currencies);
        const defaultCurrency = currencies.find(currency => currency.isDefault) ?? currencies[0];

        if (defaultCurrency && this.form.controls.currencyId.value == null) {
          this.form.controls.currencyId.setValue(defaultCurrency.id);
        }

        this.lastSavedSnapshot = this.createSnapshot();
      },
      error: () => {
        this.generalError.set('Currencies could not be loaded. Refresh the page and try again.');
      }
    });
  }

  private async persist(mode: 'draft' | 'continue'): Promise<void> {
    this.isSaving.set(true);
    this.saveMode.set(mode);

    const request = this.contractId() == null
      ? this.contractsService.createFacultativeContract(this.buildRequest())
      : this.contractsService.updateFacultativeContract(this.contractId()!, this.buildRequest());

    request.pipe(
      finalize(() => {
        this.isSaving.set(false);
        this.saveMode.set(null);
      })
    ).subscribe({
      next: response => {
        this.applySaveResponse(response);
        this.snackBar.open('Facultative contract draft saved successfully.', 'Dismiss', {
          duration: 3000,
          horizontalPosition: 'end',
          verticalPosition: 'top'
        });

        if (mode === 'continue') {
          void this.router.navigate([this.conditionsRoute], {
            queryParams: { contractId: this.contractId() ?? undefined }
          });
        }
      },
      error: (error: HttpErrorResponse) => {
        this.handleSaveError(error);
      }
    });
  }

  private applySaveResponse(response: FacultativeContractResponse): void {
    if (response.contractId) {
      this.contractId.set(response.contractId);
    }

    this.backendNetPremium.set(response.netPremiumCedent);
    this.lastSavedSnapshot = this.createSnapshot();
    this.form.markAsPristine();
  }

  private buildRequest(): UpsertFacultativeContractRequest {
    const raw = this.form.getRawValue();

    return {
      umr: this.toNullableText(raw.umr),
      name: raw.name.trim(),
      counterpartyId: raw.counterpartyId!,
      currencyId: raw.currencyId!,
      receptionDate: this.toNullableText(raw.receptionDate),
      inceptionDate: raw.inceptionDate,
      expiryDate: raw.expiryDate,
      writtenSharePct: raw.writtenSharePct,
      signedSharePct: raw.signedSharePct,
      fees: raw.fees,
      isHighPriority: raw.isHighPriority,
      sumInsured: raw.sumInsured,
      deductible: raw.deductible,
      premiumRate: raw.premiumRate,
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
      this.form.controls.inceptionDate,
      this.form.controls.expiryDate
    ];

    this.syncCedentValidation();
    this.form.updateValueAndValidity({ emitEvent: false });

    return requiredControls.every(control => control.valid) && !this.form.hasError('expiryBeforeInception');
  }

  private markDraftFieldsTouched(): void {
    this.form.controls.name.markAsTouched();
    this.form.controls.counterpartyId.markAsTouched();
    this.form.controls.currencyId.markAsTouched();
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

  private clearCedentSelectionError(): void {
    if (!this.form.controls.counterpartyId.hasError('invalidSelection')) {
      return;
    }

    const errors = { ...(this.form.controls.counterpartyId.errors ?? {}) };
    delete errors['invalidSelection'];
    this.form.controls.counterpartyId.setErrors(Object.keys(errors).length > 0 ? errors : null);
  }

  private handleSaveError(error: HttpErrorResponse): void {
    const { fieldErrors, generalErrors } = this.extractBackendErrors(error.error);

    for (const [backendField, messages] of Object.entries(fieldErrors)) {
      const controlPath = this.mapBackendField(backendField);

      if (controlPath === 'umr' && error.status === 409) {
        this.duplicateUmrMessage.set(messages.join(' ') || 'This UMR already exists.');
      }

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

    if (error.status === 409 && !this.duplicateUmrMessage()) {
      this.duplicateUmrMessage.set('This UMR already exists.');
    }

    const genericMessage = generalErrors[0] ?? this.getUnexpectedErrorMessage(error);
    this.generalError.set(genericMessage);
    this.snackBar.open(genericMessage, 'Dismiss', {
      duration: 4500,
      horizontalPosition: 'end',
      verticalPosition: 'top'
    });
  }

  private clearServerErrors(): void {
    this.duplicateUmrMessage.set('');
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

    const message = record['title'] ?? record['detail'] ?? record['message'];

    if (typeof message === 'string' && message.trim()) {
      result.generalErrors.push(message);
    }

    return result;
  }

  private mapBackendField(fieldName: string): string | null {
    const normalizedField = fieldName.toLowerCase();
    const map: Record<string, string> = {
      umr: 'umr',
      name: 'name',
      counterpartyid: 'counterpartyId',
      currencyid: 'currencyId',
      receptiondate: 'receptionDate',
      inceptiondate: 'inceptionDate',
      expirydate: 'expiryDate',
      writtensharepct: 'writtenSharePct',
      signedsharepct: 'signedSharePct',
      fees: 'fees',
      ishighpriority: 'isHighPriority',
      suminsured: 'sumInsured',
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
        return 'The contract could not be saved due to an unexpected server error.';
    }
  }

  private findCedentName(counterpartyId: number | null): string {
    if (counterpartyId == null) {
      return '';
    }

    const cedent = this.cedentResults().find(item => item.id === counterpartyId);
    return cedent?.name ?? this.selectedCedentName;
  }

  private getNetPremiumPreview(grossPremium: number | null, cedentCommissionPct: number | null): number | null {
    if (grossPremium == null) {
      return null;
    }

    const commission = cedentCommissionPct ?? 0;
    return grossPremium - ((grossPremium * commission) / 100);
  }

  private canLeaveWithoutPrompt(): boolean {
    return this.isBusy || JSON.stringify(this.createSnapshot()) === JSON.stringify(this.lastSavedSnapshot);
  }

  private createSnapshot() {
    const raw = this.form.getRawValue();

    return {
      umr: raw.umr,
      name: raw.name,
      counterpartyId: raw.counterpartyId,
      currencyId: raw.currencyId,
      receptionDate: raw.receptionDate,
      inceptionDate: raw.inceptionDate,
      expiryDate: raw.expiryDate,
      writtenSharePct: raw.writtenSharePct,
      signedSharePct: raw.signedSharePct,
      fees: raw.fees,
      isHighPriority: raw.isHighPriority,
      sumInsured: raw.sumInsured,
      deductible: raw.deductible,
      premiumRate: raw.premiumRate,
      grossPremium: raw.grossPremium,
      cedentCommissionPct: raw.cedentCommissionPct,
      cedentPremiumReference: raw.cedentPremiumReference,
      isFronting: raw.isFronting,
      frontingReference: raw.frontingReference,
      memoText: raw.memoText
    };
  }

  private createEmptySnapshot() {
    return {
      umr: '',
      name: '',
      counterpartyId: null as number | null,
      currencyId: null as number | null,
      receptionDate: '',
      inceptionDate: '',
      expiryDate: '',
      writtenSharePct: null as number | null,
      signedSharePct: null as number | null,
      fees: null as number | null,
      isHighPriority: false,
      sumInsured: null as number | null,
      deductible: null as number | null,
      premiumRate: null as number | null,
      grossPremium: null as number | null,
      cedentCommissionPct: null as number | null,
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
}
