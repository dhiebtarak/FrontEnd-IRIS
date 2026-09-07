import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { catchError, debounceTime, distinctUntilChanged, finalize, forkJoin, of, switchMap, tap } from 'rxjs';
import {
  ContractPanelItem,
  CoverageOption,
  CreateContractPanelRequest,
  FacultativeContractResponse,
  UpdateContractPanelRequest
} from '../../shared/models/contract.model';
import { CounterpartyListItem } from '../../shared/models/counterparty.model';
import { CounterpartiesService } from '../../shared/services/counterparties.service';
import { ContractsService } from '../../shared/services/contracts.service';

@Component({
  selector: 'app-contract-overview',
  standalone: true,
  imports: [CommonModule, MatSnackBarModule, ReactiveFormsModule],
  templateUrl: './contract-overview.component.html',
  styles: ``
})
export class ContractOverviewComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly contractsService = inject(ContractsService);
  private readonly counterpartiesService = inject(CounterpartiesService);
  private readonly snackBar = inject(MatSnackBar);
  private readonly formBuilder = inject(FormBuilder);

  readonly dashboardRoute = '/workspace/reassurance/front-officer';
  readonly typeRoute = '/workspace/reassurance/front-officer/contracts/new/type';
  readonly informationRoute = '/workspace/reassurance/front-officer/contracts/new/facultative';
  readonly contractsRoute = '/workspace/reassurance/front-officer/contracts';
  readonly contract = signal<FacultativeContractResponse | null>(null);
  readonly contractPanels = signal<ContractPanelItem[]>([]);
  readonly isLoading = signal(true);
  readonly isDownloadingSlips = signal(false);
  readonly isStartingBinding = signal(false);
  readonly errorMessage = signal('');
  readonly slipMessage = signal('');
  readonly isReinsurerFormOpen = signal(false);
  readonly isSubmittingPanel = signal(false);
  readonly panelFormMode = signal<'create' | 'edit'>('create');
  readonly editingPanelId = signal<number | null>(null);
  readonly confirmingPanelId = signal<number | null>(null);
  readonly reinsurerResults = signal<CounterpartyListItem[]>([]);
  readonly isLoadingReinsurers = signal(false);
  readonly reinsurerLookupError = signal('');
  readonly selectedReinsurerLabel = signal('');
  readonly selectedReinsurerId = signal<number | null>(null);
  readonly activePanelId = signal<number | null>(null);
  readonly loadedContractId = signal<number | null>(null);
  readonly contractId = computed(() => this.getPositiveId(this.contract()?.contractId) ?? this.loadedContractId() ?? this.getRouteContractId());
  readonly coverage = computed(() => this.contract()?.coverageSelection ?? null);
  readonly panels = computed(() => this.contractPanels());
  readonly activePanel = computed(() => this.panels().find(panel => panel.idPanel === this.activePanelId()) ?? null);
  readonly hero = computed(() => {
    const contract = this.contract();

    return {
      name: contract?.name || 'Contract overview',
      umr: contract?.umr || 'UMR not provided',
      contractType: contract?.contractType || 'Facultative',
      status: contract?.status || 'Not provided',
      period: contract ? `${this.formatDate(contract.inceptionDate)} to ${this.formatDate(contract.expiryDate)}` : 'Not provided',
      cedent: contract?.counterpartyName || (contract ? `Counterparty #${contract.counterpartyId}` : 'Not provided')
    };
  });

  readonly contractInformationRows = computed(() => {
    const contract = this.contract();

    if (!contract) {
      return [];
    }

    return [
      { label: 'Contract name', value: contract.name || 'Not provided' },
      { label: 'UMR', value: contract.umr || 'Not provided' },
      { label: 'Contract type', value: contract.contractType || 'Facultative' },
      { label: 'Cedent', value: contract.counterpartyName || `Counterparty #${contract.counterpartyId}` },
      { label: 'Currency', value: contract.currencyCode || `Currency #${contract.currencyId}` },
      { label: 'Type of business', value: contract.contractType || 'Facultative' },
      { label: 'Reception date', value: this.formatDate(contract.receptionDate) },
      { label: 'Inception date', value: this.formatDate(contract.inceptionDate) },
      { label: 'Expiry date', value: this.formatDate(contract.expiryDate) },
      { label: 'Contract period', value: `${this.formatDate(contract.inceptionDate)} to ${this.formatDate(contract.expiryDate)}` },
      { label: 'Status', value: contract.status || 'Not provided' }
    ];
  });

  readonly quickSummaryRows = computed(() => {
    const contract = this.contract();

    if (!contract) {
      return [];
    }

    return [
      { label: 'Cedent', value: contract.counterpartyName || `Counterparty #${contract.counterpartyId}` },
      { label: 'Currency', value: contract.currencyCode || `Currency #${contract.currencyId}` },
      { label: 'Main cover', value: this.formatCoverage(this.coverage()?.mainCover) },
      { label: 'Created by', value: contract.createdBy || 'Not provided' },
      { label: 'Created date', value: this.formatDate(contract.createdAt) }
    ];
  });

  readonly contractFinancialRows = computed(() => {
    const contract = this.contract();

    if (!contract) {
      return [];
    }

    return [
      { label: 'Written share', value: this.formatPercent(contract.writtenSharePct) },
      { label: 'Signed share', value: this.formatPercent(contract.signedSharePct) },
      { label: 'TSI', value: this.formatMoney(contract.sumInsured) },
      { label: 'Deductible', value: this.formatMoney(contract.deductible) },
      { label: 'Premium rate', value: this.formatPercent(contract.premiumRate) },
      { label: 'Gross premium', value: this.formatMoney(contract.grossPremium) }
    ];
  });

  readonly financialRows = computed(() => {
    const contract = this.contract();

    if (!contract) {
      return [];
    }

    return [
      { label: 'Written share', value: this.formatPercent(contract.writtenSharePct) },
      { label: 'Signed share', value: this.formatPercent(contract.signedSharePct) },
      { label: 'TSI / Total Sum Insured', value: this.formatMoney(contract.sumInsured) },
      { label: 'Deductible', value: this.formatMoney(contract.deductible) },
      { label: 'Gross premium', value: this.formatMoney(contract.grossPremium) },
      { label: 'Cedent commission', value: this.formatPercent(contract.cedentCommissionPct) },
      { label: 'Net premium cedent', value: this.formatMoney(contract.netPremiumCedent) },
      { label: 'Fees', value: this.formatMoney(contract.fees) },
      { label: 'Fronting', value: this.frontingLabel(contract) },
      { label: 'High priority', value: contract.isHighPriority ? 'Yes' : 'No' }
    ];
  });

  readonly reinsurerSearchControl = this.formBuilder.control('', { nonNullable: true });
  readonly panelForm = this.formBuilder.group({
    reinsurerId: this.formBuilder.control<number | null>(null, Validators.required),
    writtenSharePct: this.formBuilder.control<number | null>(null),
    signedSharePct: this.formBuilder.control<number | null>(null),
    sumInsured: this.formBuilder.control<number | null>(null),
    deductible: this.formBuilder.control<number | null>(null),
    premiumRate: this.formBuilder.control<number | null>(null),
    grossPremium: this.formBuilder.control<number | null>(null),
    brokerageIrisPct: this.formBuilder.control<number | null>(null),
    otherDeductions: this.formBuilder.control<number | null>(null),
    netPremium: this.formBuilder.control<number | null>(null),
    reinsurancePremiumReference: this.formBuilder.control('', { nonNullable: true }),
    status: this.formBuilder.control('', { nonNullable: true })
  });

  ngOnInit(): void {
    this.bindReinsurerSearch();
    this.loadContract();
  }

  loadContract(): void {
    const contractId = this.getRouteContractId();

    if (contractId == null) {
      this.isLoading.set(false);
      this.errorMessage.set('Contract draft ID is missing. Return to the Information step and save the draft first.');
      return;
    }

    this.isLoading.set(true);
    this.errorMessage.set('');
    this.loadedContractId.set(contractId);

    forkJoin({
      contract: this.contractsService.getContractOverview(contractId),
      panels: this.contractsService.getContractPanels(contractId)
    }).pipe(
      finalize(() => this.isLoading.set(false))
    ).subscribe({
      next: response => {
        console.log('Contract overview loaded', response);
        this.contract.set(response.contract);
        this.loadedContractId.set(this.getPositiveId(response.contract.contractId) ?? contractId);
        this.contractPanels.set(response.panels);
        this.ensureActivePanelExists();
      },
      error: (error: HttpErrorResponse) => this.errorMessage.set(this.getLoadErrorMessage(error))
    });
  }

  loadPanels(preferredPanel?: ContractPanelItem): void {
    const contractId = this.contractId();

    if (contractId == null) {
      return;
    }

    this.contractsService.getContractPanels(contractId).subscribe({
      next: panels => {
        this.contractPanels.set(panels);
        const selectedPanel = this.findPanelAfterRefresh(panels, preferredPanel);
        this.activePanelId.set(selectedPanel?.idPanel ?? null);
      },
      error: (error: HttpErrorResponse) => {
        this.slipMessage.set(this.getLoadPanelsErrorMessage(error));
        this.ensureActivePanelExists();
      }
    });
  }

  backToInformation(): void {
    void this.router.navigate([this.informationRoute], {
      queryParams: { contractId: this.contractId() ?? undefined }
    });
  }

  startBindingPhase(): void {
    const contractId = this.contractId();

    if (contractId == null) {
      this.slipMessage.set('Contract draft ID is missing. Return to the Information step and save the draft first.');
      return;
    }

    this.isDownloadingSlips.set(true);
    this.isStartingBinding.set(true);
    this.slipMessage.set('');

    this.downloadSlipsIfAvailable(contractId).pipe(
      switchMap(() => this.contractsService.startBindingPhase(contractId)),
      finalize(() => {
        this.isDownloadingSlips.set(false);
        this.isStartingBinding.set(false);
      })
    ).subscribe({
      next: () => {
        this.snackBar.open('Binding phase started.', 'Dismiss', {
          duration: 3000,
          horizontalPosition: 'end',
          verticalPosition: 'top'
        });
        this.loadContract();
      },
      error: (error: HttpErrorResponse) => {
        this.slipMessage.set(this.getStartBindingErrorMessage(error));
      }
    });
  }

  openReinsurerForm(): void {
    this.panelFormMode.set('create');
    this.editingPanelId.set(null);
    this.selectedReinsurerId.set(null);
    this.reinsurerSearchControl.enable({ emitEvent: false });
    this.panelForm.controls.reinsurerId.enable({ emitEvent: false });
    this.panelForm.reset({
      reinsurerId: null,
      writtenSharePct: null,
      signedSharePct: null,
      sumInsured: null,
      deductible: null,
      premiumRate: null,
      grossPremium: null,
      brokerageIrisPct: null,
      otherDeductions: null,
      netPremium: null,
      reinsurancePremiumReference: '',
      status: ''
    });
    this.reinsurerSearchControl.setValue('', { emitEvent: false });
    this.selectedReinsurerLabel.set('');
    this.reinsurerLookupError.set('');
    this.isReinsurerFormOpen.set(true);
    this.loadReinsurers('');
  }

  openEditPlacement(panel: ContractPanelItem): void {
    this.panelFormMode.set('edit');
    this.editingPanelId.set(panel.idPanel);
    this.selectedReinsurerId.set(panel.idCounterparty > 0 ? panel.idCounterparty : null);
    this.reinsurerSearchControl.enable({ emitEvent: false });
    this.panelForm.controls.reinsurerId.enable({ emitEvent: false });
    this.panelForm.reset({
      reinsurerId: panel.idCounterparty > 0 ? panel.idCounterparty : null,
      writtenSharePct: panel.writtenSharePct,
      signedSharePct: panel.signedSharePct,
      sumInsured: panel.tsi,
      deductible: panel.deductible,
      premiumRate: panel.premiumRatePct,
      grossPremium: panel.grossPremium,
      brokerageIrisPct: panel.brokeragePct,
      otherDeductions: panel.otherDeductions,
      netPremium: panel.netPremium,
      reinsurancePremiumReference: panel.premiumReference ?? '',
      status: panel.status ?? ''
    });
    this.reinsurerSearchControl.setValue(panel.reinsurerName, { emitEvent: false });
    this.reinsurerSearchControl.disable({ emitEvent: false });
    this.panelForm.controls.reinsurerId.disable({ emitEvent: false });
    this.selectedReinsurerLabel.set(panel.reinsurerName);
    this.reinsurerResults.set([]);
    this.reinsurerLookupError.set('');
    this.isReinsurerFormOpen.set(true);
  }

  closeReinsurerForm(): void {
    if (this.isSubmittingPanel()) {
      return;
    }

    this.isReinsurerFormOpen.set(false);
    this.panelFormMode.set('create');
    this.editingPanelId.set(null);
    this.selectedReinsurerId.set(null);
    this.reinsurerSearchControl.enable({ emitEvent: false });
    this.panelForm.controls.reinsurerId.enable({ emitEvent: false });
  }

  selectReinsurer(reinsurer: CounterpartyListItem): void {
    if (this.isEditMode()) {
      return;
    }

    const reinsurerId = Number(reinsurer.id);

    if (!Number.isInteger(reinsurerId) || reinsurerId <= 0) {
      return;
    }

    this.selectedReinsurerId.set(reinsurerId);
    this.panelForm.controls.reinsurerId.setValue(reinsurerId);
    this.selectedReinsurerLabel.set(reinsurer.name);
    this.reinsurerSearchControl.setValue(reinsurer.name, { emitEvent: false });
  }

  submitReinsurerPanel(): void {
    const contractId = this.contractId();

    if (contractId == null) {
      this.reinsurerLookupError.set('Contract id is missing. Please reload the contract overview.');
      return;
    }

    this.panelForm.markAllAsTouched();

    if (this.panelForm.invalid) {
      return;
    }

    if (this.getSelectedReinsurerId() == null) {
      if (this.isEditMode()) {
        this.reinsurerLookupError.set('This placement is missing its reinsurer ID and cannot be updated.');
      } else {
        this.panelForm.controls.reinsurerId.setErrors({ required: true });
        this.panelForm.controls.reinsurerId.markAsTouched();
      }

      return;
    }

    this.isSubmittingPanel.set(true);
    const editingPanelId = this.editingPanelId();
    const isEditing = this.isEditMode();

    if (isEditing && (editingPanelId == null || editingPanelId <= 0)) {
      this.isSubmittingPanel.set(false);
      this.reinsurerLookupError.set('Panel id is missing.');
      return;
    }

    if (isEditing) {
      console.log('Editing panel', {
        contractId,
        panelId: editingPanelId
      });
    }

    const request = isEditing
      ? this.contractsService.updateContractPanel(contractId, editingPanelId!, this.buildUpdatePanelRequest())
      : this.contractsService.createContractPanel(contractId, this.buildCreatePanelRequest());

    request.pipe(
      finalize(() => this.isSubmittingPanel.set(false))
    ).subscribe({
      next: panel => {
        this.isReinsurerFormOpen.set(false);
        if (panel.idPanel > 0) {
          this.activePanelId.set(panel.idPanel);
        }
        this.showMessage(this.panelFormMode() === 'edit'
          ? 'Reinsurer placement updated.'
          : 'Reinsurer added to the placement panel.');
        this.loadPanels(panel);
      },
      error: (error: HttpErrorResponse) => {
        this.reinsurerLookupError.set(this.getPanelSaveErrorMessage(error));
      }
    });
  }

  selectOverviewTab(): void {
    this.activePanelId.set(null);
  }

  selectPanelTab(panel: ContractPanelItem): void {
    this.activePanelId.set(panel.idPanel);
  }

  confirmReinsurer(panel: ContractPanelItem): void {
    const contractId = this.contractId();

    if (contractId == null || panel.idPanel <= 0 || this.isPanelConfirmed(panel)) {
      return;
    }

    this.confirmingPanelId.set(panel.idPanel);
    this.contractsService.confirmContractPanel(contractId, panel.idPanel).pipe(
      finalize(() => this.confirmingPanelId.set(null))
    ).subscribe({
      next: confirmedPanel => {
        this.showMessage('Reinsurer confirmed for this contract.');
        this.loadPanels(confirmedPanel.idPanel > 0 ? confirmedPanel : panel);
      },
      error: (error: HttpErrorResponse) => {
        this.slipMessage.set(this.getConfirmPanelErrorMessage(error));
      }
    });
  }

  isPanelConfirmed(panel: ContractPanelItem): boolean {
    return panel.status.trim().toLowerCase() === 'confirmed';
  }

  isEditMode(): boolean {
    return this.panelFormMode() === 'edit';
  }

  getPanelStatusClasses(panel: ContractPanelItem): string {
    const normalizedStatus = panel.status.trim().toLowerCase();

    if (normalizedStatus === 'confirmed') {
      return 'border-emerald-200 bg-emerald-50 text-emerald-800';
    }

    if (normalizedStatus.includes('binding')) {
      return 'border-sky-200 bg-sky-50 text-sky-800';
    }

    return 'border-amber-200 bg-amber-50 text-amber-800';
  }

  getPanelRows(panel: ContractPanelItem): Array<{ label: string; value: string }> {
    return [
      { label: 'Reinsurance company name', value: panel.reinsurerName || 'Not provided' },
      { label: 'Role', value: panel.role || 'Not provided' },
      { label: 'Written share', value: this.formatPercent(panel.writtenSharePct) },
      { label: 'Signed share', value: this.formatPercent(panel.signedSharePct) },
      { label: 'TSI', value: this.formatMoney(panel.tsi) },
      { label: 'Deductible', value: this.formatMoney(panel.deductible) },
      { label: 'Premium rate', value: this.formatPercent(panel.premiumRatePct) },
      { label: 'Gross premium', value: this.formatMoney(panel.grossPremium) },
      { label: 'Brokerage IRIS', value: this.formatPercent(panel.brokeragePct) },
      { label: 'Other deductions', value: this.formatMoney(panel.otherDeductions) },
      { label: 'Net premium', value: this.formatMoney(panel.netPremium) },
      { label: 'Reinsurance premium reference', value: panel.premiumReference || 'Not provided' },
      { label: 'Panel status', value: panel.status || 'Not provided' }
    ];
  }

  formatMoney(value: number | null): string {
    if (value == null) {
      return 'Not provided';
    }

    const contract = this.contract();
    const decimalPlaces = contract?.currencyDecimalPlaces ?? 2;
    const number = new Intl.NumberFormat(undefined, {
      minimumFractionDigits: decimalPlaces,
      maximumFractionDigits: decimalPlaces
    }).format(value);

    return `${contract?.currencyCode ?? ''} ${number}`.trim();
  }

  formatCoverage(option: CoverageOption | null | undefined): string {
    return option ? `${option.code} - ${option.name}` : 'Not selected';
  }

  formatCoverageList(options: CoverageOption[] | null | undefined): string {
    return options && options.length > 0
      ? options.map(option => this.formatCoverage(option)).join(', ')
      : 'None';
  }

  slipStatus(option: CoverageOption | null | undefined): string {
    return option?.hasSlip ? 'Slip available' : 'Slip not available';
  }

  formatPercent(value: number | null): string {
    return value == null ? 'Not provided' : `${value}%`;
  }

  formatDate(value: string | null | undefined): string {
    if (!value) {
      return 'Not provided';
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return value;
    }

    return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(date);
  }

  private getRouteContractId(): number | null {
    return this.getPositiveId(
      this.route.snapshot.paramMap?.get('contractId')
      ?? this.route.snapshot.paramMap?.get('id')
      ?? this.route.snapshot.queryParamMap?.get('contractId')
      ?? this.route.snapshot.queryParamMap?.get('id')
    );
  }

  private downloadBlob(blob: Blob, filename: string): void {
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    window.URL.revokeObjectURL(url);
  }

  private bindReinsurerSearch(): void {
    this.reinsurerSearchControl.valueChanges.pipe(
      debounceTime(250),
      distinctUntilChanged()
    ).subscribe(search => {
      if (this.isEditMode()) {
        return;
      }

      if (search !== this.selectedReinsurerLabel()) {
        this.selectedReinsurerId.set(null);
        this.panelForm.controls.reinsurerId.setValue(null);
      }

      if (this.isReinsurerFormOpen()) {
        this.loadReinsurers(search);
      }
    });
  }

  private loadReinsurers(search: string): void {
    if (this.isEditMode()) {
      this.isLoadingReinsurers.set(false);
      this.reinsurerResults.set([]);
      this.reinsurerLookupError.set('');
      return;
    }

    this.isLoadingReinsurers.set(true);
    this.reinsurerLookupError.set('');

    this.counterpartiesService.getCounterparties({
      pageNumber: 1,
      pageSize: 20,
      search,
      type: 'Reinsurer'
    }).pipe(
      finalize(() => this.isLoadingReinsurers.set(false))
    ).subscribe({
      next: response => this.reinsurerResults.set(response.items),
      error: () => this.reinsurerLookupError.set('Reinsurer counterparties could not be loaded.')
    });
  }

  private buildCreatePanelRequest(): CreateContractPanelRequest {
    const raw = this.panelForm.getRawValue();

    return {
      idCounterparty: this.getSelectedReinsurerId()!,
      writtenSharePct: raw.writtenSharePct,
      signedSharePct: raw.signedSharePct,
      tsi: raw.sumInsured,
      deductible: raw.deductible,
      premiumRatePct: raw.premiumRate,
      grossPremium: raw.grossPremium,
      brokeragePct: raw.brokerageIrisPct,
      otherDeductions: raw.otherDeductions,
      premiumReference: raw.reinsurancePremiumReference.trim() || null
    };
  }

  private buildUpdatePanelRequest(): UpdateContractPanelRequest {
    const raw = this.panelForm.getRawValue();

    return {
      ...this.buildCreatePanelRequest(),
      netPremium: raw.netPremium,
      status: raw.status.trim() || null
    };
  }

  private getSelectedReinsurerId(): number | null {
    const value = this.isEditMode()
      ? this.selectedReinsurerId()
      : this.panelForm.controls.reinsurerId.value;

    return this.getPositiveId(value);
  }

  private getPositiveId(value: number | string | null | undefined): number | null {
    const numberValue = Number(value);
    return Number.isInteger(numberValue) && numberValue > 0 ? numberValue : null;
  }

  private downloadSlipsIfAvailable(contractId: number) {
    return this.contractsService.downloadContractSlips(contractId).pipe(
      tap(result => {
        if (!result.hasSlip || !result.blob) {
          this.showSlipUnavailableMessage();
          return;
        }

        this.downloadBlob(result.blob, result.filename ?? `contract-${contractId}-slips`);
        this.showMessage('Slip download started.');
      }),
      catchError((error: HttpErrorResponse) => {
        if (error.status === 404 || error.status === 204) {
          this.showSlipUnavailableMessage();
        } else {
          this.slipMessage.set('Unable to check or download slips for this contract right now.');
        }

        return of(null);
      })
    );
  }

  private frontingLabel(contract: FacultativeContractResponse): string {
    if (!contract.isFronting) {
      return 'No';
    }

    return contract.frontingReference ? `Yes - ${contract.frontingReference}` : 'Yes';
  }

  private showSlipUnavailableMessage(): void {
    const message = 'Slip is not available for this contract selection.';
    this.showMessage(message, 3500);
  }

  private showMessage(message: string, duration = 3000): void {
    this.slipMessage.set(message);
    this.snackBar.open(message, 'Dismiss', {
      duration,
      horizontalPosition: 'end',
      verticalPosition: 'top'
    });
  }

  private ensureActivePanelExists(): void {
    const activePanelId = this.activePanelId();

    if (activePanelId == null) {
      return;
    }

    if (!this.panels().some(panel => panel.idPanel === activePanelId)) {
      this.activePanelId.set(null);
    }
  }

  private findPanelAfterRefresh(panels: ContractPanelItem[], preferredPanel: ContractPanelItem | undefined): ContractPanelItem | null {
    if (!preferredPanel) {
      return this.activePanel();
    }

    if (preferredPanel.idPanel > 0) {
      const panelById = panels.find(panel => panel.idPanel === preferredPanel.idPanel);

      if (panelById) {
        return panelById;
      }
    }

    return panels.find(panel => panel.idCounterparty === preferredPanel.idCounterparty) ?? panels.at(-1) ?? null;
  }

  private getLoadErrorMessage(error: HttpErrorResponse): string {
    if (error.status === 401 || error.status === 403) {
      return 'Your session is not authorized to load this contract overview.';
    }

    if (error.status === 404) {
      return 'The contract draft could not be found.';
    }

    if (error.status === 0) {
      return 'Unable to reach the contract service.';
    }

    return 'Contract overview could not be loaded right now.';
  }

  private getLoadPanelsErrorMessage(error: HttpErrorResponse): string {
    if (error.status === 401 || error.status === 403) {
      return 'Your session is not authorized to load reinsurer panels.';
    }

    if (error.status === 0) {
      return 'Unable to reach the contract service.';
    }

    return 'Reinsurer panels could not be refreshed right now.';
  }

  private getPanelSaveErrorMessage(error: HttpErrorResponse): string {
    if (error.status === 400) {
      return 'The reinsurer placement values were rejected by the backend.';
    }

    if (error.status === 401 || error.status === 403) {
      return 'Your session is not authorized to add a reinsurer placement.';
    }

    if (error.status === 0) {
      return 'Unable to reach the contract service.';
    }

    return 'Reinsurer placement could not be saved right now.';
  }

  private getStartBindingErrorMessage(error: HttpErrorResponse): string {
    const backendMessage = this.getBackendMessage(error);

    if (backendMessage) {
      return backendMessage;
    }

    if (error.status === 400) {
      return 'Please confirm at least one reinsurer before starting the binding phase.';
    }

    if (error.status === 401 || error.status === 403) {
      return 'Your session is not authorized to start the binding phase.';
    }

    if (error.status === 0) {
      return 'Unable to reach the contract service.';
    }

    return 'Binding phase could not be started right now.';
  }

  private getConfirmPanelErrorMessage(error: HttpErrorResponse): string {
    const backendMessage = this.getBackendMessage(error);

    if (backendMessage) {
      return backendMessage;
    }

    if (error.status === 401 || error.status === 403) {
      return 'Your session is not authorized to confirm this reinsurer.';
    }

    if (error.status === 0) {
      return 'Unable to reach the contract service.';
    }

    return 'Reinsurer could not be confirmed right now.';
  }

  private getBackendMessage(error: HttpErrorResponse): string | null {
    if (typeof error.error === 'string' && error.error.trim()) {
      return error.error.trim();
    }

    if (error.error && typeof error.error === 'object') {
      const record = error.error as Record<string, unknown>;
      const message = record['message'] ?? record['title'] ?? record['detail'];

      if (typeof message === 'string' && message.trim()) {
        return message.trim();
      }
    }

    return null;
  }
}
