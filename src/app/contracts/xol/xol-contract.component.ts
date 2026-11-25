import { ContractStyleDirective } from '../shared/contract-style.directive';
import { CommonModule } from '@angular/common';
import {
  Component,
  DestroyRef,
  HostListener,
  inject,
  OnInit,
  computed,
  signal,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormArray, FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { ContractReferenceState } from '../shared/contract-reference-state';
import {
  ContractCedentSelectorComponent,
  ContractCoverageSelectorComponent,
} from '../shared/contract-reference-selectors';
import {
  getContractStatusClasses,
  getContractStatusDisplay,
} from '../../shared/models/contract-status.util';
import { Subscription, finalize, forkJoin } from 'rxjs';
import { ContractsService } from '../../shared/services/contracts.service';
import { CurrencyReference } from '../../shared/models/contract.model';
import {
  emptyXolLayer,
  XolContractRequest,
  XolContractResponse,
  XolDecimal,
  XolLayer,
  XolLayerResponse,
} from '../../shared/models/xol.model';
import { DocumentAttachmentsComponent } from '../../shared/components/document-attachments/document-attachments.component';
import { ContractCreationStepperComponent } from '../contract-creation-stepper/contract-creation-stepper.component';
import { XolLayerModalComponent } from './xol-layer-modal.component';
import { XolLayersComponent } from './xol-layers.component';
import { xolDecimalLabel, xolPreview, xolSharePreview } from './xol-preview';
import { COUNTRY_NAMES } from '../../shared/data/countries';
const text = () => new FormControl('', { nonNullable: true });
const money = () =>
  new FormControl<XolDecimal | null>(null, [
    Validators.min(0),
    Validators.max(100),
    Validators.pattern(/^\d+(\.\d{1,8})?$/),
  ]);
@Component({
  selector: 'app-xol-contract',
  standalone: true,
  imports: [
    ContractStyleDirective,
    CommonModule,
    ReactiveFormsModule,
    RouterLink,
    MatDialogModule,
    ContractCedentSelectorComponent,
    ContractCoverageSelectorComponent,
    DocumentAttachmentsComponent,
    ContractCreationStepperComponent,
    XolLayersComponent,
  ],
  templateUrl: './xol-contract.component.html',
})
export class XolContractComponent implements OnInit {
  private readonly destroy = inject(DestroyRef);
  private readonly api = inject(ContractsService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly dialog = inject(MatDialog);
  private loadRequest?: Subscription;
  readonly contract = signal<XolContractResponse | null>(null);
  readonly editing = signal(false);
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly error = signal('');
  readonly referenceError = signal('');
  readonly currencies = signal<CurrencyReference[]>([]);
  readonly countrySearch = signal('');
  readonly selectedPanel = signal<number | null>(null);
  readonly lossBases = signal<string[]>([]);
  readonly numberLabel = xolDecimalLabel;
  readonly form = new FormGroup(
    {
      name: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(255)] }),
      counterpartyId: new FormControl<number | null>(null),
      currencyId: new FormControl<number | null>(null),
      coverageSelection: new FormGroup({
        primaryMainCoverId: new FormControl<number | null>(null),
        coverageIds: new FormControl<number[]>([], { nonNullable: true }),
        mainCoverId: new FormControl<number | null>(null),
        sectionIds: new FormControl<number[]>([], { nonNullable: true }),
        extensionIds: new FormControl<number[]>([], { nonNullable: true }),
      }),
      inceptionDate: new FormControl<string | null>(null),
      expiryDate: new FormControl<string | null>(null),
      receptionDate: new FormControl<string | null>(null),
      lossBasis: text(),
      treatyYear: new FormControl<number | null>(null),
      territoriesExcluded: text(),
      eventDefinition: text(),
      eventWindow: text(),
      hours: new FormControl<number | null>(null, [Validators.min(1), Validators.max(8760)]),
      writtenSharePct: money(),
      signedSharePct: money(),
      memo: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(500)] }),
      layers: new FormArray<FormControl<XolLayer>>([]),
    },
    {
      validators: (group) => {
        const start = group.get('inceptionDate')?.value,
          end = group.get('expiryDate')?.value;
        return start && end && end < start ? { periodOrder: true } : null;
      },
    },
  );
  readonly references = new ContractReferenceState(() => this.form, this.api, this.destroy);
  readonly referenceBusy = computed(
    () =>
      this.references.isMainCoverLoading() ||
      this.references.isSectionsLoading() ||
      this.references.isExtensionsLoading(),
  );
  readonly cedentSearch = this.references.cedentSearchControl;
  readonly cedents = this.references.cedentResults;
  readonly statusClasses = getContractStatusClasses;
  readonly statusDisplay = getContractStatusDisplay;
  readonly backRoute = computed(() =>
    this.route.snapshot.data['workspace'] === 'back-office'
      ? '/workspace/reassurance/back-officer/contracts'
      : '/workspace/reassurance/front-officer/contracts',
  );
  // Bridge reactive-form emissions to Angular's zoneless change detection.
  readonly formValue = toSignal(this.form.valueChanges, { initialValue: this.form.value });
  readonly excludedCountries = computed(() => {
    const raw = (this.formValue().territoriesExcluded ?? '').trim();
    if (!raw) return [];
    // Preserve historical free text, including country names containing commas.
    if (COUNTRY_NAMES.includes(raw)) return [raw];
    const parts = raw
      .split(/[;\r\n]+/)
      .map((value) => value.trim())
      .filter(Boolean);
    if (parts.length === 1) {
      const commaParts = raw.split(',').map((value) => value.trim());
      if (commaParts.every((value) => COUNTRY_NAMES.includes(value)))
        return [...new Set(commaParts)];
    }
    return [...new Set(parts)];
  });
  readonly visibleCountries = computed(() => {
    const query = this.countrySearch().trim().toLowerCase();
    return [...new Set([...COUNTRY_NAMES, ...this.excludedCountries()])]
      .sort((a, b) => a.localeCompare(b))
      .filter((country) => country.toLowerCase().includes(query));
  });
  searchCountries(event: Event): void {
    this.countrySearch.set((event.target as HTMLInputElement).value);
  }
  toggleExcludedCountry(country: string): void {
    const selected = this.excludedCountries();
    const next = selected.includes(country)
      ? selected.filter((value) => value !== country)
      : [...selected, country];
    this.form.controls.territoriesExcluded.setValue(next.join('; '));
    this.form.controls.territoriesExcluded.markAsDirty();
  }
  get layers() {
    return this.form.controls.layers;
  }
  get currency(): string {
    const id = this.form.controls.currencyId.value;
    if (id === null) return '';
    return (
      this.currencies().find((c) => c.id === id)?.code ??
      (id === this.contract()?.details.currencyId ? (this.contract()?.currencyCode ?? '') : '')
    );
  }
  get cedent(): string {
    const id = this.form.controls.counterpartyId.value;
    if (id === null) return 'Not selected';
    return (
      this.cedents().find((c) => c.id === id)?.name ??
      (id === this.contract()?.details.counterpartyId
        ? (this.contract()?.cedentName ?? 'Not selected')
        : 'Not selected')
    );
  }
  get canEdit() {
    return !this.contract() || this.contract()!.canEdit;
  }
  get panels() {
    return this.contract()?.panels ?? [];
  }
  ngOnInit(): void {
    this.editing.set(!this.route.snapshot.paramMap.get('contractId'));
    this.references.bindCedentSearch();
    this.cedentSearch.valueChanges
      .pipe(takeUntilDestroyed(this.destroy))
      .subscribe(() => this.form.markAsDirty());
    this.references.bindMainCoverSearch();
    this.references.bindCoverageSelection();
    this.loadReferences();
    this.route.paramMap.pipe(takeUntilDestroyed(this.destroy)).subscribe((params) => {
      const id = Number(params.get('contractId'));
      if (id > 0) this.load(id);
    });
  }
  loadReferences(): void {
    this.referenceError.set('');
    this.references.isMainCoverLoading.set(true);
    forkJoin({
      currencies: this.api.getCurrencies(),
      options: this.api.getXolOptions(),
      mainCovers: this.api.getMainCovers(),
    })
      .pipe(
        finalize(() => this.references.isMainCoverLoading.set(false)),
        takeUntilDestroyed(this.destroy),
      )
      .subscribe({
        next: (r) => {
          this.currencies.set(r.currencies);
          this.references.coverageCatalog.set(r.mainCovers);
          this.lossBases.set(r.options.lossBases);
        },
        error: () =>
          this.referenceError.set(
            'Contract reference data could not be loaded. Retry to select cedent, currency and coverages.',
          ),
      });
  }
  load(id: number): void {
    this.loadRequest?.unsubscribe();
    this.selectedPanel.set(null);
    this.loading.set(true);
    this.error.set('');
    this.loadRequest = this.api
      .getXolContract(id)
      .pipe(
        finalize(() => this.loading.set(false)),
        takeUntilDestroyed(this.destroy),
      )
      .subscribe({ next: (r) => this.hydrate(r), error: (e) => this.showError(e) });
  }
  private hydrate(r: XolContractResponse): void {
    this.form.enable({ emitEvent: false });
    this.contract.set(r);
    const d = r.details;
    const { coverageSelection, ...values } = d;
    this.references.isHydratingCoverage = true;
    this.form.patchValue({
      ...values,
      name: d.name ?? '',
      lossBasis: d.lossBasis ?? '',
      territoriesExcluded: d.territoriesExcluded ?? '',
      eventDefinition: d.eventDefinition ?? '',
      eventWindow: d.eventWindow ?? '',
      memo: d.memo ?? '',
    });
    this.layers.clear();
    d.layers.forEach((l) => this.layers.push(new FormControl(l, { nonNullable: true })));
    const selected = coverageSelection;
    this.form.controls.coverageSelection.setValue(
      {
        primaryMainCoverId: selected?.primaryMainCoverId ?? null,
        coverageIds: selected?.coverageIds ?? [],
        mainCoverId: selected?.mainCoverId ?? selected?.primaryMainCoverId ?? null,
        sectionIds: selected?.sectionIds ?? [],
        extensionIds: selected?.extensionIds ?? [],
      },
      { emitEvent: false },
    );
    this.references.refreshSnapshot();
    this.references.selectedCedentName = r.cedentName ?? '';
    if (d.counterpartyId && r.cedentName)
      this.cedents.set([{ id: d.counterpartyId, name: r.cedentName, city: null, country: null }]);
    this.references
      .loadCoverageChildren(
        selected?.coverageIds ?? [],
        selected?.sectionIds ?? [],
        selected?.extensionIds ?? [],
      )
      .pipe(
        finalize(() => (this.references.isHydratingCoverage = false)),
        takeUntilDestroyed(this.destroy),
      )
      .subscribe();
    this.cedentSearch.setValue(r.cedentName ?? '', { emitEvent: false });
    this.form.markAsPristine();
    this.editing.set(false);
    if (!r.canEdit) this.form.disable();
  }
  editLayer(layer?: XolLayer): void {
    if (!this.canEdit) return;
    this.dialog
      .open(XolLayerModalComponent, {
        width: '1000px',
        maxWidth: '95vw',
        disableClose: true,
        data: {
          layer: structuredClone(layer ?? emptyXolLayer()),
          inception: this.form.controls.inceptionDate.value,
          expiry: this.form.controls.expiryDate.value,
        },
      })
      .afterClosed()
      .pipe(takeUntilDestroyed(this.destroy))
      .subscribe((result: XolLayer | undefined) => {
        if (!result) return;
        const index = layer
          ? this.layers.controls.findIndex(
              (c) => c.value === layer || (layer.id > 0 && c.value.id === layer.id),
            )
          : -1;
        if (index >= 0) this.layers.at(index).setValue(result);
        else this.layers.push(new FormControl(result, { nonNullable: true }));
        this.form.markAsDirty();
        if (!this.editing()) this.save(true);
      });
  }
  removeLayer(layer: XolLayer): void {
    if (!this.canEdit) return;
    const i = this.layers.controls.findIndex(
      (c) => c.value === layer || (layer.id > 0 && c.value.id === layer.id),
    );
    if (i >= 0) {
      this.layers.removeAt(i);
      this.form.markAsDirty();
      if (!this.editing()) this.save(true);
    }
  }
  readonly previewLayers = computed<XolLayerResponse[]>(() => {
    this.formValue();
    if (!this.editing()) return this.contract()?.layers ?? [];
    const input = this.form.controls.signedSharePct.value;
    const share = input === '' ? null : input;
    const precision =
      this.currencies().find((currency) => currency.id === this.form.controls.currencyId.value)
        ?.decimalPlaces ??
      this.contract()?.currencyDecimalPlaces ??
      2;
    const due = (amount: XolDecimal | null) => xolSharePreview(amount, share, precision);
    return this.layers.controls.map((c, i) => {
      const l = c.value,
        p = xolPreview(l.cover, l.retention, l.adjustablePremiumRatePct, l.epi);
      return {
        id: l.id,
        version: l.version,
        number: i + 1,
        details: l,
        capacity: p.capacity,
        rolPct: p.rolPct,
        ourSharePct: share,
        ourShareAmount: due(p.capacity),
        dueToUsCover: due(l.cover),
        dueToUsRetention: due(l.retention),
        dueToUsEpi: due(l.epi),
        dueToUsMdp: due(l.mdp),
        dueToUsCashLoss: due(l.cashLoss),
        installments: l.installments.map((row) => ({
          details: row,
          status: row.settlementDate
            ? 'Paid'
            : row.expectedSettlementDate &&
                row.expectedSettlementDate < new Date().toISOString().slice(0, 10)
              ? 'Overdue'
              : 'Pending',
          dueToUsAmount: due(row.amount),
        })),
      };
    });
  });
  save(draft: boolean): void {
    if (this.saving() || this.referenceBusy() || !this.canEdit) return;
    this.error.set('');
    this.form.markAllAsTouched();
    if (this.form.invalid) {
      this.error.set('Correct invalid dates, percentages, amounts or memo length.');
      return;
    }
    const f = this.form.getRawValue();
    const selection = f.coverageSelection;
    const primary = selection.primaryMainCoverId ?? selection.coverageIds[0];
    const request: XolContractRequest = {
      ...f,
      saveDraft: draft,
      xolType: null,
      version: this.contract()?.details.version ?? 0,
      participationShareBasis: 'Signed',
      inceptionDate: f.inceptionDate || null,
      expiryDate: f.expiryDate || null,
      receptionDate: f.receptionDate || null,
      writtenSharePct: f.writtenSharePct === '' ? null : f.writtenSharePct,
      signedSharePct: f.signedSharePct === '' ? null : f.signedSharePct,
      layers: this.layers.getRawValue(),
      coverageSelection: primary
        ? { ...selection, primaryMainCoverId: primary, mainCoverId: primary }
        : null,
    };
    this.saving.set(true);
    this.api
      .saveXolContract(this.contract()?.contractId ?? null, request)
      .pipe(
        finalize(() => this.saving.set(false)),
        takeUntilDestroyed(this.destroy),
      )
      .subscribe({
        next: (r) => {
          this.hydrate(r);
          if (!this.route.snapshot.paramMap.get('contractId'))
            void this.router.navigate([
              '/workspace/reassurance/front-officer/contracts/xol',
              r.contractId,
            ]);
        },
        error: (e) => this.showError(e),
      });
  }
  private showError(e: { error?: { message?: string; errors?: unknown }; status?: number }): void {
    if (this.form.dirty) this.editing.set(true);
    const body = e.error;
    const details = Array.isArray(body?.errors) ? body.errors.join('\n') : '';
    this.error.set(
      [
        body?.message ?? 'The request failed. Your entered information is preserved.',
        details,
        e.status === 409 ? 'Reload the contract before retrying a conflicting update.' : '',
      ]
        .filter(Boolean)
        .join('\n'),
    );
  }
  canDeactivate(): boolean {
    return !this.form.dirty || confirm('Leave this page and discard unsaved XOL changes?');
  }
  @HostListener('window:beforeunload', ['$event']) beforeUnload(event: BeforeUnloadEvent): void {
    if (this.form.dirty) event.preventDefault();
  }
}
