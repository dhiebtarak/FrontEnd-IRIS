import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { AbstractControl, FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { catchError, combineLatest, debounceTime, distinctUntilChanged, filter, finalize, map, of, switchMap, tap } from 'rxjs';
import {
  ContractPanelItem,
  CoverageOption,
  CreateContractPanelRequest,
  FacultativeContractResponse,
  UpdateContractPanelRequest
} from '../../shared/models/contract.model';
import { getContractStatusClasses, getContractStatusDisplay, normalizeContractStatus } from '../../shared/models/contract-status.util';
import { CounterpartyListItem } from '../../shared/models/counterparty.model';
import { DocumentAttachmentsComponent } from '../../shared/components/document-attachments/document-attachments.component';
import { DocumentContext } from '../../shared/models/document.model';
import { CounterpartiesService } from '../../shared/services/counterparties.service';
import { ContractsService } from '../../shared/services/contracts.service';
import {
  InvoiceContext,
  InvoicePanelOption,
  InvoiceReceiptAllocation,
  PremiumDebitNoteAllocation,
  PremiumDebitNotePreview,
  PremiumDebitNoteResponse
} from '../../shared/models/financial-workflow.model';
import { Auth } from '../../shared/services/auth';
import { FinancialWorkflowService } from '../../shared/services/financial-workflow.service';

interface ContractFinancialSummary {
  grossPremium: number | null;
  cedentCommission: number | null;
  netPremium: number | null;
}

type AmountInputMode = 'amount' | 'percentage';

@Component({
  selector: 'app-contract-overview',
  standalone: true,
  imports: [CommonModule, MatSnackBarModule, ReactiveFormsModule, DocumentAttachmentsComponent],
  templateUrl: './contract-overview.component.html',
  styles: ``
})
export class ContractOverviewComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly contractsService = inject(ContractsService);
  private readonly counterpartiesService = inject(CounterpartiesService);
  private readonly authService = inject(Auth);
  private readonly financialWorkflowService = inject(FinancialWorkflowService);
  private readonly snackBar = inject(MatSnackBar);
  private readonly formBuilder = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);

  readonly dashboardRoute = '/workspace/reassurance/front-officer';
  readonly typeRoute = '/workspace/reassurance/front-officer/contracts/new/type';
  readonly informationRoute = '/workspace/reassurance/front-officer/contracts/new/facultative';
  readonly contractsRoute = computed(() => this.isBackOfficeMode()
    ? '/workspace/reassurance/back-officer/contracts'
    : '/workspace/reassurance/front-officer/contracts');
  readonly isBackOfficeMode = () => this.authService.hasWorkspaceRole('BackOfficer') || this.route.snapshot.data?.['workspace'] === 'back-office';
  readonly contract = signal<FacultativeContractResponse | null>(null);
  readonly contractPanels = signal<ContractPanelItem[]>([]);
  readonly isLoading = signal(true);
  readonly isDownloadingSlips = signal(false);
  readonly isStartingBinding = signal(false);
  readonly errorMessage = signal('');
  readonly slipMessage = signal('');
  readonly isReinsurerFormOpen = signal(false);
  readonly isSubmittingPanel = signal(false);
  readonly isInvoiceModalOpen = signal(false);
  readonly isLoadingInvoiceContext = signal(false);
  readonly isLoadingInvoiceHistory = signal(false);
  readonly isLoadingInvoicePreview = signal(false);
  readonly isDownloadingContractDebitNote = signal(false);
  readonly isSubmittingInvoice = signal(false);
  readonly downloadingDebitNoteInvoiceId = signal<number | null>(null);
  readonly invoiceError = signal('');
  readonly invoiceContextError = signal('');
  readonly invoiceHistoryError = signal('');
  readonly invoiceSuccessMessage = signal('');
  readonly invoiceDownloadError = signal('');
  readonly contractDebitNoteError = signal('');
  readonly invoiceContext = signal<InvoiceContext | null>(null);
  readonly invoiceHistory = signal<PremiumDebitNoteResponse[]>([]);
  readonly invoicePreview = signal<PremiumDebitNotePreview | null>(null);
  readonly selectedInvoiceAllocationView = signal<PremiumDebitNoteResponse | null>(null);
  readonly lastCreatedInvoice = signal<PremiumDebitNoteResponse | null>(null);
  readonly latestInvoice = computed(() => this.invoiceHistory()[0] ?? null);
  readonly invoiceSubmissionKey = signal<string | null>(null);
  readonly invoiceAmountValue = signal(0);
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
  readonly contractId = computed(() => this.loadedContractId() ?? this.getPositiveId(this.contract()?.contractId) ?? this.getRouteContractId());
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
      statusDisplay: getContractStatusDisplay(contract?.status),
      statusClasses: getContractStatusClasses(contract?.status),
      period: contract ? `${this.formatDate(contract.inceptionDate)} to ${this.formatDate(contract.expiryDate)}` : 'Not provided',
      cedent: contract?.counterpartyName || (contract ? `Counterparty #${contract.counterpartyId}` : 'Not provided')
    };
  });
  readonly hasConfirmedPanel = computed(() => this.panels().some(panel => this.isPanelConfirmed(panel)));
  readonly startBindingBlockedMessage = 'Confirm at least one reinsurer before starting the binding phase.';
  readonly isStartBindingDisabled = computed(() => this.isStartingBinding() || !this.hasConfirmedPanel());
  readonly contractDocumentContext = computed<DocumentContext | null>(() => {
    const contractId = this.contractId();
    return contractId == null ? null : { scope: 'contract', contractId };
  });
  readonly invoiceAllocationOptions = computed<InvoiceReceiptAllocation[]>(() =>
    (this.invoiceContext()?.receiptAllocations ?? []).filter(allocation => allocation.availableAmount > 0)
  );
  readonly filteredInvoiceAllocationOptions = computed(() => {
    const query = this.invoiceAllocationSearchControl.value.trim().toLowerCase();
    if (!query) {
      return this.invoiceAllocationOptions();
    }

    return this.invoiceAllocationOptions().filter(option => this.getInvoiceAllocationLabel(option).toLowerCase().includes(query));
  });
  readonly selectedInvoiceAllocation = computed(() => {
    const receiptAllocationId = this.invoiceForm.controls.receiptAllocationId.value;
    return this.invoiceAllocationOptions().find(option => option.receiptAllocationId === receiptAllocationId) ?? null;
  });
  readonly invoicePanelOptions = computed<InvoicePanelOption[]>(() => this.invoiceContext()?.reinsurerPanels ?? []);
  readonly selectedInvoicePanel = computed(() => {
    const panelId = this.invoiceForm.controls.panelId.value;
    return this.invoicePanelOptions().find(panel => panel.panelId === panelId) ?? null;
  });
  readonly invoiceAmount = computed(() => this.invoiceAmountValue());
  readonly remainingInvoiceableAmount = computed(() => {
    const amount = this.invoiceContext()?.remainingInvoiceableAmount;
    return amount == null ? null : amount;
  });
  readonly invoiceUnaffectedAmount = computed(() => Math.max(0, (this.remainingInvoiceableAmount() ?? 0) - this.invoiceAmount()));
  readonly invoicePreviewAllocations = computed(() => this.invoicePreview()?.allocations ?? []);
  readonly invoicePreviewTotals = computed(() => this.sumPremiumAllocations(this.invoicePreviewAllocations()));
  readonly invoiceContextRows = computed(() => {
    const contract = this.contract();
    const context = this.invoiceContext();

    if (!contract) {
      return [];
    }

    return [
      { label: 'Contract name', value: contract.name || 'Not provided' },
      { label: 'UMR', value: contract.umr || 'Not provided' },
      { label: 'Cedent', value: contract.counterpartyName || `Counterparty #${contract.counterpartyId}` },
      { label: 'Contract period', value: `${this.formatDate(contract.inceptionDate)} to ${this.formatDate(contract.expiryDate)}` },
      { label: 'Currency', value: context?.currency || contract.currencyCode || 'Not provided' },
      { label: 'Contract gross premium', value: this.formatMoney(context?.contractGrossPremium ?? null) },
      { label: 'Cedent commission', value: this.formatPercent(context?.cedentCommissionPct ?? null) },
      { label: 'Invoiceable gross premium', value: this.formatMoney(context?.invoiceableGrossPremium ?? null) },
      { label: 'Already invoiced amount', value: this.formatMoney(context?.alreadyInvoicedAmount ?? 0) },
      { label: 'Remaining invoiceable amount', value: this.formatMoney(context?.remainingInvoiceableAmount ?? null) },
      { label: 'Confirmed reinsurers', value: this.getConfirmedReinsurersSummary(context) }
    ];
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
      { label: 'Status', value: getContractStatusDisplay(contract.status) }
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

    const summary = this.calculateFinancialSummary(contract);

    return [
      { label: 'Written share', value: this.formatPercent(contract.writtenSharePct) },
      { label: 'Signed share', value: this.formatPercent(contract.signedSharePct) },
      { label: 'Sum Insured', value: this.formatMoney(contract.sumInsured) },
      { label: 'Limit of Liability', value: this.formatMoney(contract.limitOfLiability ?? null) },
      { label: 'Deductible', value: this.formatMoney(contract.deductible) },
      { label: 'Premium rate', value: this.formatContractPremiumRate(contract.premiumRate) },
      { label: 'Gross premium', value: this.formatMoney(summary.grossPremium) },
      { label: 'Cedent Commission', value: this.formatPercent(contract.cedentCommissionPct) },
      { label: 'Net Premium', value: this.formatMoney(summary.netPremium) }
    ];
  });

  readonly financialRows = computed(() => {
    const contract = this.contract();

    if (!contract) {
      return [];
    }

    const summary = this.calculateFinancialSummary(contract);

    return [
      { label: 'Written share', value: this.formatPercent(contract.writtenSharePct) },
      { label: 'Signed share', value: this.formatPercent(contract.signedSharePct) },
      { label: 'Sum Insured', value: this.formatMoney(contract.sumInsured) },
      { label: 'Limit of Liability', value: this.formatMoney(contract.limitOfLiability ?? null) },
      { label: 'Deductible', value: this.formatMoney(contract.deductible) },
      { label: 'Gross premium', value: this.formatMoney(summary.grossPremium) },
      { label: 'Cedent commission', value: this.formatMoney(summary.cedentCommission) },
      { label: 'Net premium cedent', value: this.formatMoney(summary.netPremium) },
      { label: 'Fees', value: this.formatMoney(contract.fees) },
      { label: 'Fronting', value: this.frontingLabel(contract) },
      { label: 'High priority', value: contract.isHighPriority ? 'Yes' : 'No' }
    ];
  });

  readonly reinsurerSearchControl = this.formBuilder.control('', { nonNullable: true });
  readonly invoiceAllocationSearchControl = this.formBuilder.control('', { nonNullable: true });
  readonly panelForm = this.formBuilder.group({
    reinsurerId: this.formBuilder.control<number | null>(null, Validators.required),
    writtenSharePct: this.formBuilder.control<number | null>(null, [Validators.min(0.000001), Validators.max(100)]),
    signedSharePct: this.formBuilder.control<number | null>(null, [Validators.min(0), Validators.max(100)]),
    sumInsured: this.formBuilder.control<number | null>(null, [Validators.min(0)]),
    limitOfLiability: this.formBuilder.control<number | null>(null, [Validators.min(0)]),
    deductibleMode: this.formBuilder.control<AmountInputMode>('amount', { nonNullable: true }),
    deductible: this.formBuilder.control<number | null>(null, [Validators.min(0)]),
    deductiblePct: this.formBuilder.control<number | null>(null, [Validators.min(0), Validators.max(100)]),
    premiumRate: this.formBuilder.control<number | string | null>(null),
    grossPremium: this.formBuilder.control<number | null>(null),
    cedentCommissionPct: this.formBuilder.control<number | null>(null),
    cedentCommissionAmount: this.formBuilder.control<number | null>(null),
    brokerageIrisPct: this.formBuilder.control<number | null>(null, [Validators.min(0), Validators.max(100)]),
    brokerageIrisAmount: this.formBuilder.control<number | null>(null),
    otherDeductions: this.formBuilder.control<number | null>(null, [Validators.min(0)]),
    netPremium: this.formBuilder.control<number | null>(null),
    reinsurancePremiumReference: this.formBuilder.control('', { nonNullable: true }),
    status: this.formBuilder.control('', { nonNullable: true })
  });
  readonly availableShare = computed(() => {
    const contractSignedShare = this.toFiniteNumber(this.contract()?.signedSharePct) ?? 0;
    const editingPanelId = this.editingPanelId();
    const usedSignedShare = this.panels()
      .filter(panel => panel.idPanel !== editingPanelId && this.isActiveReinsurerPanel(panel))
      .map(panel => this.toFiniteNumber(panel.signedSharePct) ?? 0)
      .reduce((total, value) => total + value, 0);

    return this.roundMoney(Math.max(0, contractSignedShare - usedSignedShare));
  });
  readonly selectedDeductibleMode = signal<AmountInputMode>('amount');
  readonly invoiceForm = this.formBuilder.group({
    receiptAllocationId: this.formBuilder.control<number | null>(null),
    panelId: this.formBuilder.control<number | null>(null),
    invoiceType: this.formBuilder.control('CEDENT_PREMIUM_DEBIT_NOTE', { nonNullable: true }),
    invoiceDate: this.formBuilder.control(this.today(), { nonNullable: true, validators: [Validators.required] }),
    amount: this.formBuilder.control<number | null>(null, [Validators.required, Validators.min(0.01)]),
    label: this.formBuilder.control('', { nonNullable: true }),
    settlementMethod: this.formBuilder.control('', { nonNullable: true })
  });

  ngOnInit(): void {
    this.bindReinsurerSearch();
    this.bindPanelFinancialControls();
    this.bindInvoiceControls();
    this.loadContract();
  }

  loadContract(): void {
    this.routeContractIdChanges().pipe(
      tap(() => this.resetForContractLoad()),
      switchMap(contractId => {
        this.isLoading.set(true);
        this.errorMessage.set('');

        return this.contractsService.getContractOverview(contractId).pipe(
          map(contract => ({ contract, contractId })),
          catchError((error: HttpErrorResponse) => {
            this.errorMessage.set(this.getLoadErrorMessage(error));
            return of(null);
          }),
          finalize(() => this.isLoading.set(false))
        );
      }),
      takeUntilDestroyed(this.destroyRef)
    ).subscribe({
      next: response => {
        if (!response) {
          return;
        }

        this.contract.set(response.contract);
        this.loadedContractId.set(this.getPositiveId(response.contract.contractId) ?? response.contractId);
        this.ensureActivePanelExists();
        if (this.isBackOfficeMode() && response.contract.status?.trim().toLowerCase() === 'bound') {
          this.loadInvoiceContext();
          this.loadInvoiceHistory();
        }
        this.loadPanelsForContract(response.contractId);
      }
    });
  }

  loadPanels(preferredPanel?: ContractPanelItem): void {
    const contractId = this.contractId();

    if (contractId == null) {
      return;
    }

    this.loadPanelsForContract(contractId, preferredPanel, true);
  }

  private loadPanelsForContract(contractId: number, preferredPanel?: ContractPanelItem, selectPanelAfterLoad = false): void {
    this.contractsService.getContractPanels(contractId).pipe(
      map(panels => this.requirePanelsForContract(panels, contractId))
    ).subscribe({
      next: panels => {
        if (contractId !== this.contractId()) {
          return;
        }

        this.contractPanels.set(panels);
        if (selectPanelAfterLoad) {
          const selectedPanel = this.findPanelAfterRefresh(panels, preferredPanel);
          this.activePanelId.set(selectedPanel?.idPanel ?? null);
        } else {
          this.ensureActivePanelExists();
        }
      },
      error: (error: HttpErrorResponse) => {
        this.slipMessage.set(this.getLoadPanelsErrorMessage(error));
        this.ensureActivePanelExists();
      }
    });
  }

  backToInformation(): void {
    if (this.isBackOfficeMode()) {
      void this.router.navigate([this.contractsRoute()]);
      return;
    }

    void this.router.navigate([this.informationRoute], {
      queryParams: { contractId: this.contractId() ?? undefined }
    });
  }

  startBindingPhase(): void {
    const contractId = this.contractId();

    if (!this.canStartBinding()) {
      return;
    }

    if (!this.hasConfirmedPanel()) {
      this.slipMessage.set(this.startBindingBlockedMessage);
      return;
    }

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
      next: contractOverview => {
        this.snackBar.open('Binding phase started.', 'Dismiss', {
          duration: 3000,
          horizontalPosition: 'end',
          verticalPosition: 'top'
        });
        this.applyContractOverview(contractOverview);
      },
      error: (error: HttpErrorResponse) => {
        this.slipMessage.set(this.getStartBindingErrorMessage(error));
      }
    });
  }

  openReinsurerForm(): void {
    if (!this.canAddReinsurer()) {
      return;
    }

    this.panelFormMode.set('create');
    this.editingPanelId.set(null);
    this.selectedReinsurerId.set(null);
    this.reinsurerSearchControl.enable({ emitEvent: false });
    this.panelForm.controls.reinsurerId.enable({ emitEvent: false });
    this.panelForm.reset({
      reinsurerId: null,
      writtenSharePct: null,
      signedSharePct: null,
      sumInsured: this.contract()?.sumInsured ?? null,
      limitOfLiability: null,
      deductibleMode: 'amount',
      deductible: null,
      deductiblePct: null,
      premiumRate: this.contract()?.premiumRate ?? null,
      grossPremium: null,
      cedentCommissionPct: this.contract()?.cedentCommissionPct ?? null,
      cedentCommissionAmount: null,
      brokerageIrisPct: null,
      brokerageIrisAmount: null,
      otherDeductions: null,
      netPremium: null,
      reinsurancePremiumReference: '',
      status: ''
    });
    this.reinsurerSearchControl.setValue('', { emitEvent: false });
    this.selectedReinsurerLabel.set('');
    this.reinsurerLookupError.set('');
    this.isReinsurerFormOpen.set(true);
    this.syncPanelFinancials();
    this.loadReinsurers('');
  }

  openEditPlacement(panel: ContractPanelItem): void {
    if (!this.canEditPlacements()) {
      return;
    }

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
      limitOfLiability: panel.limitOfLiability ?? null,
      deductibleMode: 'amount',
      deductible: panel.deductible,
      deductiblePct: null,
      premiumRate: panel.premiumRatePct,
      grossPremium: panel.grossPremium,
      cedentCommissionPct: this.contract()?.cedentCommissionPct ?? null,
      cedentCommissionAmount: null,
      brokerageIrisPct: panel.brokeragePct,
      brokerageIrisAmount: null,
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
    this.syncPanelFinancials();
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

    this.syncPanelFinancials();
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
      next: contractOverview => {
        this.isReinsurerFormOpen.set(false);
        const preferredPanel = isEditing ? this.activePanel() ?? undefined : undefined;
        this.showMessage(this.panelFormMode() === 'edit'
          ? 'Reinsurer placement updated.'
          : 'Reinsurer added to the placement panel.');
        this.applyContractOverview(contractOverview);
        this.loadPanels(preferredPanel);
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

  placementDocumentContext(panel: ContractPanelItem): DocumentContext | null {
    const contractId = this.contractId();
    return contractId == null || panel.idPanel <= 0
      ? null
      : { scope: 'placement', contractId, panelId: panel.idPanel };
  }

  confirmReinsurer(panel: ContractPanelItem): void {
    const contractId = this.contractId();

    if (contractId == null || panel.idPanel <= 0 || this.isPanelConfirmed(panel) || !this.canEditPlacements()) {
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

  isActiveReinsurerPanel(panel: ContractPanelItem): boolean {
    const displayStatus = this.getPanelDisplayStatus(panel).trim().toLowerCase();

    return displayStatus !== 'not taken up'
      && displayStatus !== 'cancelled'
      && displayStatus !== 'canceled'
      && displayStatus !== 'declined';
  }

  isEditMode(): boolean {
    return this.panelFormMode() === 'edit';
  }

  canModifyContract(): boolean {
    if (this.isBackOfficeMode()) {
      return false;
    }

    return this.canUseAction(['ModifyContract', 'UpdateContract', 'EditContract', 'Modify']);
  }

  canAddReinsurer(): boolean {
    if (this.isBackOfficeMode()) {
      return false;
    }

    return this.canUseAction(['AddReinsurer', 'AddPlacement', 'CreatePanel', 'AddContractPanel']);
  }

  canStartBinding(): boolean {
    if (this.isBackOfficeMode()) {
      return false;
    }

    return this.canUseAction(['StartBinding', 'StartBindingPhase']);
  }

  canCancelContract(): boolean {
    if (this.isBackOfficeMode()) {
      return false;
    }

    return this.canUseAction(['CancelContract', 'Cancel']);
  }

  canEditPlacements(): boolean {
    if (this.isBackOfficeMode()) {
      return false;
    }

    return this.canUseAction(['EditPlacement', 'UpdatePlacement', 'EditPanel', 'UpdatePanel']);
  }

  cancelContract(): void {
    if (!this.canCancelContract()) {
      return;
    }

    this.slipMessage.set('Contract cancellation is not available from the current API contract.');
  }

  canCreateInvoice(): boolean {
    const remainingAmount = this.remainingInvoiceableAmount();
    return this.shouldShowInvoiceAction()
      && !this.isLoadingInvoiceContext()
      && !this.invoiceContextError()
      && remainingAmount != null
      && remainingAmount > 0;
  }

  shouldShowInvoiceAction(): boolean {
    return this.isBackOfficeMode() && this.isContractBound();
  }

  isContractBound(): boolean {
    return this.contract()?.status?.trim().toLowerCase() === 'bound';
  }

  isFullyInvoiced(): boolean {
    const remainingAmount = this.remainingInvoiceableAmount();
    return this.shouldShowInvoiceAction()
      && !this.isLoadingInvoiceContext()
      && !this.invoiceContextError()
      && remainingAmount != null
      && remainingAmount <= 0;
  }

  retryInvoiceContext(): void {
    if (!this.shouldShowInvoiceAction() || this.isLoadingInvoiceContext()) {
      return;
    }

    this.loadInvoiceContext();
  }

  retryInvoiceHistory(): void {
    if (!this.shouldShowInvoiceAction()) {
      return;
    }

    this.loadInvoiceHistory();
  }

  openInvoiceModal(): void {
    if (!this.shouldShowInvoiceAction()) {
      return;
    }

    this.invoiceForm.reset({
      receiptAllocationId: null,
      panelId: null,
      invoiceType: 'CEDENT_PREMIUM_DEBIT_NOTE',
      invoiceDate: this.today(),
      amount: null,
      label: '',
      settlementMethod: ''
    });
    this.invoiceAmountValue.set(0);
    this.invoicePreview.set(null);
    this.invoiceSuccessMessage.set('');
    this.lastCreatedInvoice.set(null);
    this.invoiceSubmissionKey.set(null);
    this.invoiceAllocationSearchControl.setValue('', { emitEvent: false });
    this.invoiceError.set('');
    this.invoiceContextError.set('');
    this.isInvoiceModalOpen.set(true);
    if (!this.isLoadingInvoiceContext()) {
      this.loadInvoiceContext();
    }
  }

  closeInvoiceModal(): void {
    if (this.isSubmittingInvoice()) {
      return;
    }

    this.isInvoiceModalOpen.set(false);
    this.invoiceError.set('');
  }

  openDebitNoteAction(): void {
    if (!this.shouldShowInvoiceAction() || this.isDownloadingContractDebitNote()) {
      return;
    }

    this.downloadContractDebitNote();
  }

  selectInvoiceAllocation(option: InvoiceReceiptAllocation): void {
    this.invoiceForm.controls.receiptAllocationId.setValue(option.receiptAllocationId);
    this.invoiceAllocationSearchControl.setValue(this.getInvoiceAllocationLabel(option), { emitEvent: false });
    this.invoiceForm.patchValue({
      amount: option.availableAmount > 0 ? option.availableAmount : null
    });
    this.invoiceAmountValue.set(option.availableAmount > 0 ? option.availableAmount : 0);
  }

  createInvoice(): void {
    const contractId = this.contractId();
    const raw = this.invoiceForm.getRawValue();
    const amount = Number(raw.amount);
    const remainingAmount = this.remainingInvoiceableAmount();

    if (contractId == null || remainingAmount == null || this.invoiceForm.invalid || this.isSubmittingInvoice() || !Number.isFinite(amount) || amount <= 0 || amount > remainingAmount) {
      if (remainingAmount != null && amount > remainingAmount) {
        this.invoiceForm.controls.amount.setErrors({ exceedsAvailable: true });
      }
      this.invoiceForm.markAllAsTouched();
      return;
    }

    this.isSubmittingInvoice.set(true);
    this.invoiceError.set('');
    const idempotencyKey = this.invoiceSubmissionKey() ?? this.createIdempotencyKey();
    this.invoiceSubmissionKey.set(idempotencyKey);
    this.financialWorkflowService.createPremiumDebitNote(contractId, {
      grossAmount: amount,
      invoiceDate: raw.invoiceDate,
      label: raw.label.trim() || null,
      idempotencyKey
    }).pipe(
      finalize(() => this.isSubmittingInvoice.set(false))
    ).subscribe({
      next: invoice => {
        const invoiceNumber = invoice.invoiceNumber?.trim();
        const message = invoiceNumber ? `Invoice ${invoiceNumber} created successfully.` : 'Invoice created successfully.';
        this.invoiceSuccessMessage.set(message);
        this.lastCreatedInvoice.set(invoice);
        this.invoiceHistory.update(items => items.some(item => item.invoiceId === invoice.invoiceId) ? items : [invoice, ...items]);
        this.showMessage(message);
        this.invoiceSubmissionKey.set(null);
        this.invoicePreview.set(null);
        this.invoiceForm.patchValue({ amount: null, label: '' });
        this.invoiceAmountValue.set(0);
        this.isInvoiceModalOpen.set(false);
        this.loadInvoiceContext();
        this.loadInvoiceHistory();
      },
      error: (error: HttpErrorResponse) => this.invoiceError.set(this.getInvoiceErrorMessage(error))
    });
  }

  isInvoiceSubmitDisabled(): boolean {
    const remainingAmount = this.remainingInvoiceableAmount();
    return this.isSubmittingInvoice()
      || this.isLoadingInvoiceContext()
      || this.isLoadingInvoicePreview()
      || !!this.invoiceContext()?.blockingReason
      || this.invoiceForm.invalid
      || this.invoiceAmount() <= 0
      || remainingAmount == null
      || this.invoiceAmount() > remainingAmount;
  }

  getInvoiceAllocationLabel(allocation: InvoiceReceiptAllocation): string {
    return `${allocation.receiptReference || `Allocation ${allocation.receiptAllocationId}`} - allocated ${this.formatMoney(allocation.allocatedAmount)} - available ${this.formatMoney(allocation.availableAmount)}`;
  }

  getInvoiceAmountStep(): string {
    const decimalPlaces = this.toFiniteNumber(this.contract()?.currencyDecimalPlaces);
    const places = decimalPlaces == null ? 2 : Math.max(0, Math.min(6, Math.trunc(decimalPlaces)));
    return places === 0 ? '1' : `0.${'0'.repeat(Math.max(0, places - 1))}1`;
  }

  getConfirmedReinsurersSummary(context: InvoiceContext | null): string {
    const reinsurers = context?.reinsurerPanels ?? [];
    if (reinsurers.length === 0) {
      return 'None confirmed';
    }

    const names = reinsurers
      .map(panel => panel.reinsurerName)
      .filter(name => name.trim().length > 0);
    return names.length > 0 ? `${reinsurers.length} - ${names.join(', ')}` : String(reinsurers.length);
  }

  viewInvoiceAllocation(invoice: PremiumDebitNoteResponse): void {
    this.selectedInvoiceAllocationView.set(invoice);
  }

  closeInvoiceAllocationView(): void {
    this.selectedInvoiceAllocationView.set(null);
  }

  retryContractDebitNoteDownload(): void {
    this.downloadContractDebitNote();
  }

  private downloadContractDebitNote(): void {
    const contractId = this.contractId();
    if (contractId == null) {
      this.contractDebitNoteError.set('Contract id is missing. Please reload the contract overview.');
      return;
    }

    this.isDownloadingContractDebitNote.set(true);
    this.contractDebitNoteError.set('');
    this.financialWorkflowService.downloadContractDebitNote(contractId).pipe(
      finalize(() => this.isDownloadingContractDebitNote.set(false))
    ).subscribe({
      next: download => this.downloadBlob(download.blob, download.fileName || `DebitNote-${contractId}.pdf`),
      error: (error: HttpErrorResponse) => this.contractDebitNoteError.set(this.getDebitNoteDownloadErrorMessage(error))
    });
  }

  sumPremiumAllocations(allocations: PremiumDebitNoteAllocation[]): PremiumDebitNoteAllocation {
    return allocations.reduce<PremiumDebitNoteAllocation>((total, allocation) => ({
      panelId: 0,
      reinsurerCode: null,
      reinsurerName: 'Total',
      signedSharePct: null,
      allocationRatio: total.allocationRatio + allocation.allocationRatio,
      grossPremium: total.grossPremium + allocation.grossPremium,
      cedentCommissionPct: 0,
      cedentCommissionAmount: total.cedentCommissionAmount + (allocation.cedentCommissionAmount ?? 0),
      brokeragePct: 0,
      brokerageAmount: total.brokerageAmount + allocation.brokerageAmount,
      otherDeductions: total.otherDeductions + allocation.otherDeductions,
      netAmount: total.netAmount + allocation.netAmount,
      currencyCode: allocation.currencyCode || total.currencyCode
    }), {
      panelId: 0,
      reinsurerCode: null,
      reinsurerName: 'Total',
      signedSharePct: null,
      allocationRatio: 0,
      grossPremium: 0,
      cedentCommissionPct: 0,
      cedentCommissionAmount: 0,
      brokeragePct: 0,
      brokerageAmount: 0,
      otherDeductions: 0,
      netAmount: 0,
      currencyCode: this.invoiceContext()?.currency || this.contract()?.currencyCode || ''
    });
  }

  getDisplayStatus(status: string | null | undefined): string {
    return getContractStatusDisplay(status);
  }

  getStatusClasses(status: string | null | undefined): string {
    return getContractStatusClasses(status);
  }

  getPanelStatusClasses(panel: ContractPanelItem): string {
    const normalizedStatus = this.getPanelDisplayStatus(panel).trim().toLowerCase();

    if (normalizedStatus === 'confirmed') {
      return 'border-emerald-200 bg-emerald-50 text-emerald-800';
    }

    if (normalizedStatus === 'not taken up') {
      return 'border-slate-200 bg-slate-50 text-slate-700';
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
      { label: 'Sum Insured', value: this.formatMoney(panel.tsi) },
      { label: 'Limit of Liability', value: this.formatMoney(panel.limitOfLiability ?? null) },
      { label: 'Deductible', value: this.formatMoney(panel.deductible) },
      { label: 'Premium rate', value: this.formatPercent(panel.premiumRatePct) },
      { label: 'Gross premium', value: this.formatMoney(this.calculatePanelGrossPremium(panel)) },
      { label: 'Brokerage IRIS', value: this.formatPercent(panel.brokeragePct) },
      { label: 'Other deductions', value: this.formatMoney(panel.otherDeductions) },
      { label: 'Net premium', value: this.formatMoney(this.calculatePanelNetPremium(panel)) },
      { label: 'Reinsurance premium reference', value: panel.premiumReference || 'Not provided' },
      { label: 'Panel status', value: this.getPanelDisplayStatus(panel) }
    ];
  }

  getPanelDisplayStatus(panel: ContractPanelItem): string {
    if (normalizeContractStatus(this.contract()?.status) === 'bound' && !this.isPanelConfirmed(panel)) {
      return 'Not taken up';
    }

    return panel.status || 'Not provided';
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

  formatContractPremiumRate(value: number | null): string {
    const premiumRate = this.toFiniteNumber(value);
    return premiumRate == null ? 'Not provided' : this.formatPercent(premiumRate);
  }

  getPanelDeductibleAmount(): number | null {
    return this.toFiniteNumber(this.panelForm.controls.deductible.value);
  }

  private bindPanelFinancialControls(): void {
    this.panelForm.valueChanges.pipe(
      takeUntilDestroyed(this.destroyRef)
    ).subscribe(() => this.syncPanelFinancials());
  }

  private calculateFinancialSummary(contract: FacultativeContractResponse): ContractFinancialSummary {
    const grossPremium = this.calculateGrossPremium(contract.sumInsured, contract.premiumRate, contract.grossPremium);
    const cedentCommission = this.calculateCommissionAmount(grossPremium, contract.cedentCommission, contract.cedentCommissionPct);
    const netPremium = this.resolveContractNetPremium(contract, grossPremium, cedentCommission);

    return {
      grossPremium,
      cedentCommission,
      netPremium
    };
  }

  private calculateGrossPremium(tsi: number | null, premiumRate: number | null, persistedGrossPremium: number | null): number | null {
    const safeTsi = this.toFiniteNumber(tsi);
    const safePremiumRate = this.toFiniteNumber(premiumRate);

    if (safeTsi == null || safePremiumRate == null) {
      return this.toFiniteNumber(persistedGrossPremium);
    }

    const grossPremium = safeTsi * safePremiumRate / 100;

    return this.toFiniteNumber(grossPremium);
  }

  private calculateCommissionAmount(grossPremium: number | null, amount: number | null | undefined, pct: number | null | undefined): number | null {
    const safeGrossPremium = this.toFiniteNumber(grossPremium);
    const safePct = this.toFiniteNumber(pct);
    if (safeGrossPremium != null && safePct != null) {
      return safeGrossPremium * (safePct / 100);
    }

    return this.toFiniteNumber(amount);
  }

  private resolveContractNetPremium(contract: FacultativeContractResponse, grossPremium: number | null, cedentCommission: number | null): number | null {
    const calculatedNetPremium = this.calculateNetPremium(grossPremium, cedentCommission);
    if (calculatedNetPremium != null) {
      return calculatedNetPremium;
    }

    const persistedNetPremium = this.toFiniteNumber(contract.netPremiumCedent);
    if (persistedNetPremium != null) {
      return persistedNetPremium;
    }

    const legacyNetPremium = this.toFiniteNumber(contract.netPremium);
    if (legacyNetPremium != null) {
      return legacyNetPremium;
    }

    return null;
  }

  private calculateNetPremium(grossPremium: number | null, cedentCommission: number | null): number | null {
    const safeGrossPremium = this.toFiniteNumber(grossPremium);
    const safeCedentCommission = this.toFiniteNumber(cedentCommission);

    if (safeGrossPremium == null || safeCedentCommission == null) {
      return null;
    }

    return Math.max(0, safeGrossPremium - safeCedentCommission);
  }

  private calculatePanelGrossPremium(panel: ContractPanelItem): number | null {
    const sumInsured = this.toFiniteNumber(panel.tsi);
    const premiumRate = this.toFiniteNumber(panel.premiumRatePct);
    const participationRatio = this.calculateParticipationRatio(panel.writtenSharePct, panel.signedSharePct);

    if (sumInsured != null && premiumRate != null && participationRatio != null) {
      const contractGrossPremium = sumInsured * premiumRate / 100;
      return this.roundMoney(contractGrossPremium * participationRatio);
    }

    return this.toFiniteNumber(panel.grossPremium);
  }

  private calculateParticipationRatio(writtenShare: number | null | undefined, signedShare: number | null | undefined): number | null {
    const safeWrittenShare = this.toFiniteNumber(writtenShare);
    const safeSignedShare = this.toFiniteNumber(signedShare);

    if (safeWrittenShare == null || safeWrittenShare <= 0 || safeSignedShare == null || safeSignedShare < 0) {
      return null;
    }

    return safeSignedShare / safeWrittenShare;
  }

  private calculatePanelNetPremium(panel: ContractPanelItem): number | null {
    const grossPremium = this.calculatePanelGrossPremium(panel);
    const cedentCommissionPct = this.toFiniteNumber(this.contract()?.cedentCommissionPct);

    if (grossPremium == null || cedentCommissionPct == null) {
      return this.toFiniteNumber(panel.netPremium);
    }

    const cedentCommissionAmount = grossPremium * cedentCommissionPct / 100;
    const brokeragePct = this.toFiniteNumber(panel.brokeragePct) ?? 0;
    const brokerageAmount = grossPremium * brokeragePct / 100;
    const otherDeductions = this.toFiniteNumber(panel.otherDeductions) ?? 0;

    return this.roundMoney(Math.max(0, grossPremium - cedentCommissionAmount - brokerageAmount - otherDeductions));
  }

  private syncPanelFinancials(): void {
    const raw = this.panelForm.getRawValue();
    const sumInsured = this.toFiniteNumber(raw.sumInsured);
    const premiumRate = this.toFiniteNumber(raw.premiumRate);
    const writtenShare = this.toFiniteNumber(raw.writtenSharePct);
    const signedShare = this.toFiniteNumber(raw.signedSharePct);
    const participationRatio = this.calculateParticipationRatio(writtenShare, signedShare);
    const contractGrossPremium = sumInsured == null || premiumRate == null
      ? null
      : this.roundMoney(sumInsured * premiumRate / 100);
    const grossPremium = contractGrossPremium == null || participationRatio == null
      ? null
      : this.roundMoney(contractGrossPremium * participationRatio);
    const cedentCommissionPct = this.toFiniteNumber(this.contract()?.cedentCommissionPct);
    const cedentCommissionAmount = grossPremium == null || cedentCommissionPct == null
      ? null
      : this.roundMoney(grossPremium * cedentCommissionPct / 100);
    const brokerageIrisPct = this.toFiniteNumber(raw.brokerageIrisPct) ?? 0;
    const brokerageIrisAmount = grossPremium == null
      ? null
      : this.roundMoney(grossPremium * brokerageIrisPct / 100);
    const limitOfLiability = this.toFiniteNumber(raw.limitOfLiability);
    const deductible = raw.deductibleMode === 'percentage' && grossPremium != null && raw.deductiblePct != null
      ? this.roundMoney(grossPremium * Number(raw.deductiblePct) / 100)
      : this.toFiniteNumber(raw.deductible);
    const otherDeductions = this.toFiniteNumber(raw.otherDeductions) ?? 0;
    const totalDeductions = (cedentCommissionAmount ?? 0) + (brokerageIrisAmount ?? 0) + otherDeductions;
    const netPremium = grossPremium == null || cedentCommissionAmount == null
      ? null
      : this.roundMoney(Math.max(0, grossPremium - totalDeductions));

    this.selectedDeductibleMode.set(raw.deductibleMode);
    this.setCalculatedControlValue(this.panelForm.controls.grossPremium, grossPremium);
    this.setCalculatedControlValue(this.panelForm.controls.cedentCommissionPct, cedentCommissionPct);
    this.setCalculatedControlValue(this.panelForm.controls.cedentCommissionAmount, cedentCommissionAmount);
    this.setCalculatedControlValue(this.panelForm.controls.brokerageIrisAmount, brokerageIrisAmount);
    this.setCalculatedControlValue(this.panelForm.controls.limitOfLiability, limitOfLiability);
    this.setCalculatedControlValue(this.panelForm.controls.deductible, deductible);
    this.setCalculatedControlValue(this.panelForm.controls.netPremium, netPremium);
    this.validatePanelBusinessRules(grossPremium, totalDeductions);
  }

  private validatePanelBusinessRules(grossPremium: number | null, totalDeductions: number): void {
    const writtenShare = this.toFiniteNumber(this.panelForm.controls.writtenSharePct.value);
    const signedShare = this.toFiniteNumber(this.panelForm.controls.signedSharePct.value);
    const exceedsGrossPremium = grossPremium != null && totalDeductions > grossPremium;

    this.setControlError(this.panelForm.controls.writtenSharePct, 'positiveShare', writtenShare != null && writtenShare <= 0);
    this.setControlError(this.panelForm.controls.signedSharePct, 'exceedsWrittenShare', signedShare != null && writtenShare != null && signedShare > writtenShare);
    this.setControlError(this.panelForm.controls.signedSharePct, 'exceedsAvailableShare', signedShare != null && signedShare > this.availableShare());
    this.setControlError(this.panelForm.controls.premiumRate, 'invalidNumber', !this.isValidOptionalNumber(this.panelForm.controls.premiumRate.value));
    this.setControlError(this.panelForm.controls.premiumRate, 'min', !this.isAtLeast(this.panelForm.controls.premiumRate.value, 0));
    this.setControlError(this.panelForm.controls.premiumRate, 'max', !this.isAtMost(this.panelForm.controls.premiumRate.value, 100));
    this.setControlError(this.panelForm.controls.netPremium, 'deductionsExceedGrossPremium', exceedsGrossPremium);
    this.setControlError(this.panelForm.controls.otherDeductions, 'deductionsExceedGrossPremium', exceedsGrossPremium);
  }

  private setCalculatedControlValue(control: AbstractControl<number | null>, value: number | null): void {
    if (control.value === value) {
      return;
    }

    control.setValue(value, { emitEvent: false });
  }

  private setControlError(control: AbstractControl, key: string, active: boolean): void {
    const errors = { ...(control.errors ?? {}) };

    if (active) {
      errors[key] = true;
    } else {
      delete errors[key];
    }

    control.setErrors(Object.keys(errors).length > 0 ? errors : null);
  }

  private isValidOptionalNumber(value: number | string | null | undefined): boolean {
    return value == null || value === '' || this.toFiniteNumber(value) != null;
  }

  private isAtLeast(value: number | string | null | undefined, min: number): boolean {
    const numericValue = this.toFiniteNumber(value);
    return numericValue == null || numericValue >= min;
  }

  private isAtMost(value: number | string | null | undefined, max: number): boolean {
    const numericValue = this.toFiniteNumber(value);
    return numericValue == null || numericValue <= max;
  }

  private toFiniteNumber(value: number | string | null | undefined): number | null {
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

  private roundMoney(value: number): number {
    return Math.round((value + Number.EPSILON) * 10000) / 10000;
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

  private bindInvoiceControls(): void {
    this.invoiceForm.controls.amount.valueChanges.subscribe(value => {
      const amount = Number(value ?? 0);
      this.invoiceAmountValue.set(Number.isFinite(amount) ? amount : 0);
      this.loadInvoicePreview();
    });
  }

  private loadInvoiceContext(): void {
    const contractId = this.contractId();

    if (contractId == null) {
      this.invoiceContextError.set('Contract id is missing. Please reload the contract overview.');
      return;
    }

    this.isLoadingInvoiceContext.set(true);
    this.invoiceContextError.set('');
    this.financialWorkflowService.getInvoiceContext(contractId).pipe(
      finalize(() => this.isLoadingInvoiceContext.set(false))
    ).subscribe({
      next: context => {
        this.invoiceContext.set(context);
        if (this.isInvoiceModalOpen()) {
          const remainingAmount = context.remainingInvoiceableAmount;
          this.invoiceForm.controls.amount.setValue(remainingAmount > 0 ? remainingAmount : null, { emitEvent: false });
          this.invoiceAmountValue.set(remainingAmount > 0 ? remainingAmount : 0);
        }
      },
      error: (error: HttpErrorResponse) => {
        this.invoiceContext.set(null);
        this.invoiceContextError.set(this.getInvoiceErrorMessage(error));
      }
    });
  }

  private loadInvoiceHistory(): void {
    const contractId = this.contractId();

    if (contractId == null) {
      this.invoiceHistoryError.set('Contract id is missing. Please reload the contract overview.');
      return;
    }

    this.isLoadingInvoiceHistory.set(true);
    this.invoiceHistoryError.set('');
    this.financialWorkflowService.getContractPremiumDebitNotes(contractId).pipe(
      finalize(() => this.isLoadingInvoiceHistory.set(false))
    ).subscribe({
      next: invoices => this.invoiceHistory.set(invoices.filter(invoice => invoice.contractId === contractId)),
      error: (error: HttpErrorResponse) => this.invoiceHistoryError.set(this.getInvoiceErrorMessage(error))
    });
  }

  private loadInvoicePreview(): void {
    const contractId = this.contractId();
    const raw = this.invoiceForm.getRawValue();
    const amount = Number(raw.amount);
    const remainingAmount = this.remainingInvoiceableAmount();

    this.invoicePreview.set(null);
    if (contractId == null || this.invoiceContext()?.blockingReason || remainingAmount == null || !Number.isFinite(amount) || amount <= 0 || amount > remainingAmount) {
      return;
    }

    this.isLoadingInvoicePreview.set(true);
    this.financialWorkflowService.previewPremiumDebitNote(contractId, {
      grossAmount: amount,
      invoiceDate: raw.invoiceDate,
      label: raw.label.trim() || null
    }).pipe(
      finalize(() => this.isLoadingInvoicePreview.set(false))
    ).subscribe({
      next: preview => this.invoicePreview.set(preview),
      error: (error: HttpErrorResponse) => this.invoiceError.set(this.getInvoiceErrorMessage(error))
    });
  }

  private syncInvoicePanelSelection(): void {
    const selectedPanelId = this.invoiceForm.controls.panelId.value;
    if (selectedPanelId != null && this.invoicePanelOptions().some(panel => panel.panelId === selectedPanelId)) {
      return;
    }

    this.invoiceForm.controls.panelId.setValue(this.invoicePanelOptions()[0]?.panelId ?? null);
  }

  private getSelectedInvoiceAllocationLabel(allocation: InvoiceReceiptAllocation | null): string {
    if (!allocation) {
      return '';
    }

    return this.getInvoiceAllocationLabel(allocation);
  }

  private today(): string {
    return new Date().toISOString().slice(0, 10);
  }

  private createIdempotencyKey(): string {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }

    return `invoice-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }

  private getRouteContractId(): number | null {
    return this.getPositiveId(
      this.route.snapshot.paramMap?.get('contractId')
      ?? this.route.snapshot.paramMap?.get('id')
      ?? this.route.snapshot.queryParamMap?.get('contractId')
      ?? this.route.snapshot.queryParamMap?.get('id')
    );
  }

  private routeContractIdChanges() {
    return combineLatest([
      this.route.paramMap,
      this.route.queryParamMap
    ]).pipe(
      map(([paramMap, queryParamMap]) => this.getPositiveId(
        paramMap.get('contractId')
        ?? paramMap.get('id')
        ?? queryParamMap.get('contractId')
        ?? queryParamMap.get('id')
      )),
      tap(contractId => {
        if (contractId == null) {
          this.isLoading.set(false);
          this.contract.set(null);
          this.loadedContractId.set(null);
          this.contractPanels.set([]);
          this.errorMessage.set('Contract draft ID is missing. Return to the Information step and save the draft first.');
        }
      }),
      filter((contractId): contractId is number => contractId != null),
      distinctUntilChanged()
    );
  }

  private resetForContractLoad(): void {
    this.contract.set(null);
    this.contractPanels.set([]);
    this.activePanelId.set(null);
    this.isReinsurerFormOpen.set(false);
    this.panelFormMode.set('create');
    this.editingPanelId.set(null);
    this.confirmingPanelId.set(null);
    this.selectedReinsurerId.set(null);
    this.selectedReinsurerLabel.set('');
    this.reinsurerResults.set([]);
    this.reinsurerLookupError.set('');
    this.slipMessage.set('');
    this.isInvoiceModalOpen.set(false);
    this.isDownloadingContractDebitNote.set(false);
    this.invoiceContext.set(null);
    this.invoiceHistory.set([]);
    this.invoiceHistoryError.set('');
    this.invoicePreview.set(null);
    this.selectedInvoiceAllocationView.set(null);
    this.invoiceSubmissionKey.set(null);
    this.invoiceSuccessMessage.set('');
    this.invoiceDownloadError.set('');
    this.contractDebitNoteError.set('');
    this.invoiceError.set('');
    this.invoiceContextError.set('');
    this.invoiceAllocationSearchControl.setValue('', { emitEvent: false });
    this.invoiceAmountValue.set(0);
    this.invoiceForm.reset({
      receiptAllocationId: null,
      panelId: null,
      invoiceType: 'CEDENT_PREMIUM_DEBIT_NOTE',
      invoiceDate: this.today(),
      amount: null,
      label: '',
      settlementMethod: ''
    });
    this.loadedContractId.set(null);
  }

  private requirePanelsForContract(panels: ContractPanelItem[], contractId: number): ContractPanelItem[] {
    const mismatchedPanels = panels.filter(panel => panel.idContract !== contractId);

    if (mismatchedPanels.length > 0) {
      console.error('Contract panels response included panels for a different contract.', {
        expectedContractId: contractId,
        panels: mismatchedPanels
      });

      throw new HttpErrorResponse({
        status: 502,
        statusText: 'Bad Gateway',
        error: { message: 'The contract panels response did not match the active contract.' }
      });
    }

    return panels;
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

  private applyContractOverview(contractOverview: FacultativeContractResponse): void {
    this.contract.set(contractOverview);
    this.loadedContractId.set(this.getPositiveId(contractOverview.contractId) ?? this.loadedContractId());
    this.ensureActivePanelExists();
    if (this.isBackOfficeMode() && contractOverview.status?.trim().toLowerCase() === 'bound') {
      this.loadInvoiceContext();
      this.loadInvoiceHistory();
    }
  }

  private buildCreatePanelRequest(): CreateContractPanelRequest {
    const raw = this.panelForm.getRawValue();

    return {
      idCounterparty: this.getSelectedReinsurerId()!,
      writtenSharePct: raw.writtenSharePct,
      signedSharePct: raw.signedSharePct,
      tsi: raw.sumInsured,
      limitOfLiability: this.toFiniteNumber(raw.limitOfLiability),
      deductible: raw.deductible,
      premiumRatePct: this.toFiniteNumber(raw.premiumRate),
      grossPremium: raw.grossPremium,
      brokeragePct: this.toFiniteNumber(raw.brokerageIrisPct) ?? 0,
      otherDeductions: this.toFiniteNumber(raw.otherDeductions) ?? 0,
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
      return this.activePanel() ?? panels.at(-1) ?? null;
    }

    if (preferredPanel.idPanel > 0) {
      const panelById = panels.find(panel => panel.idPanel === preferredPanel.idPanel);

      if (panelById) {
        return panelById;
      }
    }

    return panels.find(panel => panel.idCounterparty === preferredPanel.idCounterparty) ?? panels.at(-1) ?? null;
  }

  private canUseAction(aliases: string[]): boolean {
    const contract = this.contract();

    if (!contract) {
      return false;
    }

    const status = normalizeContractStatus(contract.status);

    if (status === 'bound' || status === 'expired' || status === 'cancelled') {
      return false;
    }

    if (contract.allowedActions.length > 0) {
      const normalizedAliases = new Set(aliases.map(action => this.normalizeAction(action)));
      return contract.allowedActions.some(action => normalizedAliases.has(this.normalizeAction(action)));
    }

    return this.canUseFallbackAction(status, aliases);
  }

  private canUseFallbackAction(status: string, aliases: string[]): boolean {
    const normalizedAliases = aliases.map(action => this.normalizeAction(action));
    const wants = (action: string) => normalizedAliases.includes(action);

    if (status === 'draft') {
      return wants('modifycontract') || wants('updatecontract') || wants('editcontract') || wants('modify') || wants('cancelcontract') || wants('cancel');
    }

    if (status === 'readyforplacement') {
      return !normalizedAliases.some(action => action === 'startbinding' || action === 'startbindingphase' || action === 'editplacement' || action === 'updateplacement' || action === 'editpanel' || action === 'updatepanel');
    }

    if (status === 'placementinprogress') {
      return true;
    }

    return false;
  }

  private normalizeAction(action: string): string {
    return action.trim().replace(/[\s_-]+/g, '').toLowerCase();
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

  private getInvoiceErrorMessage(error: HttpErrorResponse): string {
    if (error instanceof Error && error.message.startsWith('Invoice calculation data error:')) {
      return error.message;
    }

    const backendMessage = this.getBackendMessage(error);

    if (backendMessage) {
      return backendMessage;
    }

    if (error.status === 400 || error.status === 409) {
      return 'The invoice request was rejected by the backend.';
    }

    if (error.status === 401 || error.status === 403) {
      return 'Your session is not authorized to create invoices.';
    }

    if (error.status === 404) {
      return 'The invoice context could not be found.';
    }

    if (error.status === 0) {
      return 'Unable to reach the contract service.';
    }

    return 'Invoice could not be created right now.';
  }

  private getDebitNoteDownloadErrorMessage(error: HttpErrorResponse): string {
    const backendMessage = this.getBackendMessage(error);

    if (backendMessage) {
      return backendMessage;
    }

    return error.status > 0
      ? `Debit note could not be downloaded. HTTP ${error.status} ${error.statusText || ''}`.trim()
      : 'Debit note could not be downloaded. Unable to reach the contract service.';
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

      const errors = record['errors'];
      if (Array.isArray(errors)) {
        const messages = errors.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
        if (messages.length > 0) {
          return messages.join(' ');
        }
      }

      if (errors && typeof errors === 'object') {
        const messages = Object.values(errors as Record<string, unknown>)
          .flatMap(value => Array.isArray(value) ? value : [value])
          .filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
        if (messages.length > 0) {
          return messages.join(' ');
        }
      }
    }

    return null;
  }
}
