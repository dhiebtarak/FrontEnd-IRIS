import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, OnInit, computed, inject, isDevMode, signal } from '@angular/core';
import { AbstractControl, FormBuilder, ReactiveFormsModule, ValidatorFn, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { catchError, combineLatest, debounceTime, distinctUntilChanged, filter, finalize, from, map, of, Subscription, switchMap, tap, throwError } from 'rxjs';
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
  BackendFileDownload,
  InvoiceContext,
  InvoicePanelOption,
  InvoiceReceiptAllocation,
  PremiumDebitNoteAllocation,
  PremiumDebitNoteRequest,
  PremiumDebitNotePreview,
  PremiumDebitNoteResponse
} from '../../shared/models/financial-workflow.model';
import { getInvoicePaymentStatusClasses, getInvoicePaymentStatusDisplay } from '../../shared/models/payment-status.util';
import { Auth } from '../../shared/services/auth';
import { FinancialWorkflowService } from '../../shared/services/financial-workflow.service';

interface ContractFinancialSummary {
  grossPremium: number | null;
  cedentCommission: number | null;
  netPremium: number | null;
}

type AmountInputMode = 'amount' | 'percentage';

interface InvoiceApiErrorDetails {
  status: number;
  detail: string | null;
  validationErrors: string[];
  traceId: string | null;
}

class InvalidPdfResponseError extends Error {
  constructor(readonly response: BackendFileDownload) {
    super('The server response was not a PDF.');
  }
}

const finiteAmountValidator: ValidatorFn = control => {
  const value = control.value;
  return value == null || value === '' || (typeof value === 'number' && Number.isFinite(value))
    ? null
    : { number: true };
};

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
  readonly isMarkingReady = signal(false);
  readonly isReinsurersTabActive = signal(false);
  readonly errorMessage = signal('');
  readonly slipMessage = signal('');
  readonly statusTransitionErrors = signal<Array<{ field: string; messages: string[] }>>([]);
  readonly isReinsurerFormOpen = signal(false);
  readonly isSubmittingPanel = signal(false);
  readonly isInvoiceModalOpen = signal(false);
  readonly isLoadingInvoiceContext = signal(false);
  readonly isLoadingInvoiceHistory = signal(false);
  readonly isLoadingInvoicePreview = signal(false);
  readonly isSubmittingInvoice = signal(false);
  readonly downloadingDebitNoteInvoiceId = signal<number | null>(null);
  readonly downloadingCreditNoteAvoirId = signal<number | null>(null);
  readonly isDownloadingFinancialNote = signal(false);
  readonly invoiceError = signal('');
  readonly invoiceApiErrorDetails = signal<InvoiceApiErrorDetails | null>(null);
  readonly invoiceContextError = signal('');
  readonly invoiceHistoryError = signal('');
  readonly invoiceSuccessMessage = signal('');
  readonly invoiceDownloadError = signal('');
  readonly invoiceRowDownloadErrors = signal<Record<number, string>>({});
  readonly creditNoteDownloadErrors = signal<Record<number, string>>({});
  readonly invoiceContext = signal<InvoiceContext | null>(null);
  readonly invoiceHistory = signal<PremiumDebitNoteResponse[]>([]);
  readonly avoirHistory = signal<PremiumDebitNoteResponse[]>([]);
  readonly invoicePreview = signal<PremiumDebitNotePreview | null>(null);
  readonly selectedInvoiceAllocationView = signal<PremiumDebitNoteResponse | null>(null);
  readonly lastCreatedInvoice = signal<PremiumDebitNoteResponse | null>(null);
  readonly latestInvoice = computed(() => this.invoiceHistory()[0] ?? null);
  readonly invoiceSubmissionKey = signal<string | null>(null);
  readonly invoiceAmountValue = signal(0);
  private invoicePreviewRequestKey: string | null = null;
  private invoicePreviewReadyKey: string | null = null;
  private invoicePreviewRequestId = 0;
  private invoicePreviewSubscription: Subscription | null = null;
  private invoicePreviewDebounceTimer: ReturnType<typeof setTimeout> | null = null;
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
      cedent: contract?.counterpartyName || (contract?.counterpartyId != null ? `Counterparty #${contract.counterpartyId}` : 'Not provided')
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
  readonly availableAvoirAmount = computed(() => {
    const amount = this.toFiniteNumber(this.invoiceContext()?.availableCreditBalance);
    return amount == null ? null : Math.max(0, amount);
  });
  readonly invoiceUnaffectedAmount = computed(() => {
    if (this.isAvoirSelected()) {
      return this.invoicePreview()?.remainingAmount ?? null;
    }

    const remaining = this.remainingInvoiceableAmount();
    return remaining == null ? null : Math.max(0, remaining - this.invoiceAmount());
  });
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
      { label: 'Cedent', value: contract.counterpartyName || (contract.counterpartyId != null ? `Counterparty #${contract.counterpartyId}` : 'Not provided') },
      { label: 'Contract period', value: `${this.formatDate(contract.inceptionDate)} to ${this.formatDate(contract.expiryDate)}` },
      { label: 'Currency', value: context?.currencyCode || context?.currency || contract.currencyCode || 'Not provided' },
      { label: 'Contract gross premium', value: this.formatMoney(context?.contractGrossPremium ?? null, context?.currencyCode) },
      { label: 'Cedent commission', value: this.formatPercent(context?.cedentCommissionPercentage ?? context?.cedentCommissionPct ?? null) },
      { label: 'Cedent commission amount', value: this.formatMoney(context?.cedentCommissionAmount ?? null, context?.currencyCode) },
      { label: 'Contract signed share', value: this.formatPercent(context?.contractSignedSharePercentage ?? null) },
      { label: 'Invoiceable net premium', value: this.formatMoney(context?.invoiceableNetPremium ?? null, context?.currencyCode) },
      { label: 'Already invoiced amount', value: this.formatMoney(context?.alreadyInvoicedAmount ?? 0, context?.currencyCode) },
      { label: 'Remaining invoiceable amount', value: this.formatMoney(context?.remainingInvoiceableAmount ?? null, context?.currencyCode) },
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
      { label: 'Cedent', value: contract.counterpartyName || (contract.counterpartyId != null ? `Counterparty #${contract.counterpartyId}` : 'Not provided') },
      { label: 'Currency', value: contract.currencyCode || (contract.currencyId != null ? `Currency #${contract.currencyId}` : 'Not provided') },
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
      { label: 'Cedent', value: contract.counterpartyName || (contract.counterpartyId != null ? `Counterparty #${contract.counterpartyId}` : 'Not provided') },
      { label: 'Currency', value: contract.currencyCode || (contract.currencyId != null ? `Currency #${contract.currencyId}` : 'Not provided') },
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
    otherDeductionsPercentage: this.formBuilder.control<number | null>(null, [Validators.min(0), Validators.max(100)]),
    otherDeductionsAmount: this.formBuilder.control<number | null>({ value: null, disabled: true }),
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
    invoiceType: this.formBuilder.control('', { nonNullable: true, validators: [Validators.required] }),
    processingMode: this.formBuilder.control(''),
    invoiceDate: this.formBuilder.control(this.today(), { nonNullable: true, validators: [Validators.required] }),
    amount: this.formBuilder.control<number | null>(null, [Validators.required, finiteAmountValidator, Validators.min(0.01)]),
    label: this.formBuilder.control('', { nonNullable: true }),
    settlementMethod: this.formBuilder.control('', { nonNullable: true })
  });

  ngOnInit(): void {
    this.destroyRef.onDestroy(() => {
      if (this.invoicePreviewDebounceTimer != null) {
        clearTimeout(this.invoicePreviewDebounceTimer);
      }
      this.cancelInvoicePreviewRequest();
    });
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
        if (this.isBackOfficeMode() && normalizeContractStatus(response.contract.status) === 'bound') {
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

  markReadyForPlacement(): void {
    const contractId = this.contractId();
    if (contractId == null || !this.canMarkReadyForPlacement() || this.isMarkingReady()) {
      return;
    }

    this.isMarkingReady.set(true);
    this.slipMessage.set('');
    this.statusTransitionErrors.set([]);
    this.contractsService.completeDraft(contractId).pipe(
      switchMap(updatedContract => {
        this.applyContractOverview(updatedContract);
        return this.contractsService.getContractOverview(contractId);
      }),
      finalize(() => this.isMarkingReady.set(false))
    ).subscribe({
      next: updatedContract => {
        this.applyContractOverview(updatedContract);
        this.loadPanelsForContract(contractId);
        this.showMessage('Contract marked Ready for Placement.');
      },
      error: (error: HttpErrorResponse) => {
        this.statusTransitionErrors.set(this.getFieldValidationErrors(error.error)
          .filter(entry => entry.field.trim().toLowerCase() !== 'isfronting'));
        this.slipMessage.set(this.getBackendMessage(error) ?? this.getStatusTransitionErrorMessage(error));
      }
    });
  }

  editIncompleteField(field: string): void {
    const contractId = this.contractId();
    if (contractId == null) return;
    void this.router.navigate([this.informationRoute], {
      queryParams: { contractId, focusField: field }
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
      otherDeductionsPercentage: null,
      otherDeductionsAmount: null,
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
      otherDeductionsPercentage: panel.otherDeductionsPercentage,
      otherDeductionsAmount: panel.otherDeductionsAmount ?? panel.otherDeductions,
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
    if (this.isSubmittingPanel()) {
      return;
    }

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

    if (!this.isEditMode() && this.panels().some(panel => panel.idCounterparty === this.getSelectedReinsurerId())) {
      this.reinsurerLookupError.set('This reinsurer already has a placement on the contract.');
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
        if (isEditing) {
          this.loadPanels(preferredPanel);
        } else {
          this.activePanelId.set(null);
          this.isReinsurersTabActive.set(true);
          this.loadPanelsForContract(contractId);
        }
      },
      error: (error: HttpErrorResponse) => {
        this.reinsurerLookupError.set(this.getPanelSaveErrorMessage(error));
      }
    });
  }

  selectOverviewTab(): void {
    this.isReinsurersTabActive.set(false);
    this.activePanelId.set(null);
  }

  selectReinsurersTab(): void {
    this.isReinsurersTabActive.set(true);
    this.activePanelId.set(null);
  }

  selectPanelTab(panel: ContractPanelItem): void {
    this.isReinsurersTabActive.set(false);
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
    return this.isFrontOfficer() && ['draft', 'readyforplacement'].includes(this.contractStatus());
  }

  canAddReinsurer(): boolean {
    return this.isFrontOfficer() && ['readyforplacement', 'placementinprogress'].includes(this.contractStatus());
  }

  canStartBinding(): boolean {
    return this.isFrontOfficer() && ['readyforplacement', 'placementinprogress'].includes(this.contractStatus());
  }

  canMarkReadyForPlacement(): boolean {
    return this.isFrontOfficer() && this.contractStatus() === 'draft';
  }

  canCancelContract(): boolean {
    return this.isFrontOfficer() && ['draft', 'readyforplacement', 'placementinprogress'].includes(this.contractStatus());
  }

  canEditPlacements(): boolean {
    return this.isFrontOfficer() && ['readyforplacement', 'placementinprogress'].includes(this.contractStatus());
  }

  canShowReinsurerTabs(): boolean {
    return ['readyforplacement', 'placementinprogress', 'bound'].includes(this.contractStatus());
  }

  private isFrontOfficer(): boolean {
    return !this.isBackOfficeMode() && this.authService.hasWorkspaceRole('FrontOfficer');
  }

  private contractStatus(): string {
    return normalizeContractStatus(this.contract()?.status);
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

  isAvoirSelected(): boolean {
    return this.isAvoirType(this.invoiceForm.controls.invoiceType.value);
  }

  invoiceCreationAvailableAmount(): number | null {
    return this.isAvoirSelected() ? this.availableAvoirAmount() : this.remainingInvoiceableAmount();
  }

  invoiceAmountLimitMessage(): string {
    if (this.isAvoirSelected()) {
      return 'Avoir amount cannot exceed the available net invoiced balance.';
    }

    const remaining = this.remainingInvoiceableAmount();
    const formatted = remaining == null
      ? 'the remaining invoiceable amount'
      : this.formatMoney(remaining, this.invoiceContext()?.currencyCode);
    return `Invoice amount cannot exceed the remaining invoiceable amount of ${formatted}.`;
  }

  contractDocumentActionLabel(): string {
    return 'Download Debit Note';
  }

  isContractBound(): boolean {
    return this.contractStatus() === 'bound';
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

    this.setInvoiceSubmissionState(false);
    this.invalidateInvoicePreview();
    this.invoiceForm.reset({
      receiptAllocationId: null,
      panelId: null,
      invoiceType: '',
      processingMode: '',
      invoiceDate: this.today(),
      amount: null,
      label: '',
      settlementMethod: ''
    });
    this.invoiceAmountValue.set(0);
    this.invoicePreview.set(null);
    this.invoicePreviewReadyKey = null;
    this.invoiceSuccessMessage.set('');
    this.lastCreatedInvoice.set(null);
    this.invoiceSubmissionKey.set(null);
    this.invoiceAllocationSearchControl.setValue('', { emitEvent: false });
    this.invoiceError.set('');
    this.invoiceApiErrorDetails.set(null);
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
    this.invoiceApiErrorDetails.set(null);
    this.invalidateInvoicePreview();
  }

  downloadContractFinancialNote(): void {
    const contractId = this.contractId();
    if (!this.shouldShowInvoiceAction() || contractId == null || this.isDownloadingFinancialNote()) return;

    this.isDownloadingFinancialNote.set(true);
    this.invoiceDownloadError.set('');
    this.financialWorkflowService.downloadContractFinancialNote(contractId).pipe(
      switchMap(download => !download.fileName?.trim() || download.documentType !== 'DEBIT_NOTE'
        ? throwError(() => new Error('The financial-note response is missing its document type or filename.'))
        : of(download)),
      switchMap(download => this.validatePdfDownload(download)),
      finalize(() => this.isDownloadingFinancialNote.set(false))
    ).subscribe({
      next: download => this.downloadBlob(download.blob, download.fileName!),
      error: error => { void this.handleFinancialNoteDownloadError(error); }
    });
  }

  private validatePdfDownload<T extends BackendFileDownload>(download: T) {
    return from(download.blob.slice(0, 5).text()).pipe(
      switchMap(signature => signature === '%PDF-' ? of(download) : throwError(() => new InvalidPdfResponseError(download)))
    );
  }

  private async handleFinancialNoteDownloadError(error: unknown): Promise<void> {
    const invalidPdf = error instanceof InvalidPdfResponseError;
    const httpError = error instanceof HttpErrorResponse ? error : null;
    let payload: unknown = invalidPdf ? error.response.blob : httpError?.error;
    if (payload instanceof Blob) {
      const text = await payload.text();
      try { payload = JSON.parse(text) as unknown; } catch { payload = text; }
    }
    const normalized = new HttpErrorResponse({
      status: httpError?.status ?? 502,
      statusText: httpError?.statusText ?? 'Invalid PDF response',
      error: payload
    });
    const backendMessage = this.getBackendMessage(normalized);
    const message = backendMessage && !/^\s*</.test(backendMessage)
      ? backendMessage
      : invalidPdf ? 'The server response was not a valid PDF. No file was downloaded.' : 'The contract financial note could not be downloaded.';
    const body = payload && typeof payload === 'object' ? payload as Record<string, unknown> : {};
    const traceId = body['traceId'] ?? body['traceID'] ?? body['requestId'];
    this.invoiceDownloadError.set(typeof traceId === 'string' && traceId.trim() ? `${message} (Trace ID: ${traceId.trim()})` : message);
    if (isDevMode()) console.error('Contract financial-note PDF download failed.', {
      contractId: this.contractId(), status: httpError?.status ?? 502,
      code: body['code'] ?? body['error'] ?? null, traceId: traceId ?? null
    });
  }

  selectInvoiceAllocation(option: InvoiceReceiptAllocation): void {
    this.invoiceForm.controls.receiptAllocationId.setValue(option.receiptAllocationId);
    this.invoiceAllocationSearchControl.setValue(this.getInvoiceAllocationLabel(option), { emitEvent: false });
    this.invoiceForm.patchValue({
      amount: option.availableAmount > 0 ? option.availableAmount : null
    });
    this.invoiceAmountValue.set(option.availableAmount > 0 ? option.availableAmount : 0);
  }

  setAvoirProcessingMode(mode: '' | 'PAIR_WITH_ENCAISSEMENT' | 'DIRECT_TO_REMITTANCES'): void {
    if (this.isSubmittingInvoice()) {
      return;
    }

    this.invoiceForm.controls.processingMode.setValue(mode);
    this.invoiceForm.controls.processingMode.markAsTouched();
    this.invoiceSubmissionKey.set(mode ? this.createIdempotencyKey() : null);
    this.updateInvoiceAmountValidators();
    this.invoiceError.set('');
    this.invoiceApiErrorDetails.set(null);
    this.loadInvoicePreview();
  }

  createInvoice(): void {
    const contractId = this.contractId();
    const raw = this.invoiceForm.value;
    const amount = Number(raw.amount);
    const isAvoir = this.isAvoirType(raw.invoiceType ?? '');
    const processingMode = raw.processingMode ?? '';
    const availableAmount = isAvoir ? this.availableAvoirAmount() : this.remainingInvoiceableAmount();

    if (contractId == null || this.invoiceForm.invalid || this.isSubmittingInvoice()
      || (isAvoir && !this.isValidAvoirProcessingMode(processingMode))
      || availableAmount == null || availableAmount <= 0 || !Number.isFinite(amount) || amount <= 0 || amount > availableAmount
      || !this.isInvoiceAllocationValid() || this.isLoadingInvoicePreview()
      || this.invoicePreviewReadyKey == null
      || this.invoicePreviewReadyKey !== this.invoicePreviewRequestKey
      || this.isLoadingInvoiceContext()
      || (!isAvoir && !!this.invoiceContext()?.blockingReason)) {
      this.invoiceForm.markAllAsTouched();
      if (availableAmount != null && amount > availableAmount) {
        this.invoiceForm.controls.amount.setErrors({ exceedsAvailable: true });
      }
      const invalidControls = this.getInvalidInvoiceControlNames();
      if (invalidControls.length > 0) {
        this.invoiceError.set(`Correct these fields before submitting: ${invalidControls.join(', ')}.`);
      } else if (isAvoir && !this.isValidAvoirProcessingMode(processingMode)) {
        this.invoiceError.set('Choose how this Avoir will be processed.');
      } else if (availableAmount == null || availableAmount <= 0 || amount > (availableAmount ?? 0)) {
        this.invoiceError.set(this.invoiceAmountLimitMessage());
      } else if (!this.isInvoiceAllocationValid()) {
        this.invoiceError.set('The backend allocation preview is invalid. Review the allocation rows before submitting.');
      } else if (this.isLoadingInvoicePreview() || this.isLoadingInvoiceContext()) {
        this.invoiceError.set('Wait for the invoice context and allocation preview to finish loading.');
      }
      if (isDevMode()) {
        console.debug('Invoice submission blocked by form validation.', {
          rawValue: this.invoiceForm.value,
          formErrors: this.invoiceForm.errors,
          invalidControls: this.getInvalidInvoiceControlDetails()
        });
      }
      return;
    }

    this.setInvoiceSubmissionState(true);
    this.invoiceError.set('');
    this.invoiceApiErrorDetails.set(null);
    const idempotencyKey = this.invoiceSubmissionKey() ?? this.createIdempotencyKey();
    this.invoiceSubmissionKey.set(idempotencyKey);
    this.financialWorkflowService.createPremiumDebitNote(contractId, {
      invoiceType: (raw.invoiceType ?? '') as 'INVOICE' | 'INVOICE_FEES' | 'AVOIR',
      ...(isAvoir ? { processingMode: processingMode as 'PAIR_WITH_ENCAISSEMENT' | 'DIRECT_TO_REMITTANCES' } : {}),
      grossAmount: amount,
      invoiceDate: raw.invoiceDate ?? this.today(),
      label: raw.label?.trim() || null,
      idempotencyKey
    }).pipe(
      finalize(() => this.setInvoiceSubmissionState(false))
    ).subscribe({
      next: invoice => {
        const invoiceNumber = invoice.documentNumber?.trim() || invoice.invoiceNumber?.trim();
        const isAvoir = this.isAvoirType(invoice.invoiceType);
        const message = isAvoir
          ? (invoiceNumber ? `Avoir ${invoiceNumber} created successfully.` : 'Avoir created successfully.')
          : (invoiceNumber ? `Invoice ${invoiceNumber} created successfully.` : 'Invoice created successfully.');
        const responseMode = invoice.processingMode ?? processingMode;
        this.invoiceSuccessMessage.set(message);
        this.lastCreatedInvoice.set(invoice);
        this.addInvoiceToHistory(invoice);
        if (!isAvoir || responseMode !== 'DIRECT_TO_REMITTANCES') {
          this.showMessage(message);
        }
        this.invoiceSubmissionKey.set(null);
        this.invoicePreview.set(null);
        this.invoiceForm.patchValue({ amount: null, label: '' });
        this.invoiceAmountValue.set(0);
        this.isInvoiceModalOpen.set(false);
        this.loadInvoiceContext();
        this.loadInvoiceHistory();
        if (isAvoir && responseMode === 'DIRECT_TO_REMITTANCES') {
          const createdRemittances = invoice.createdRemittances ?? [];
          this.showMessage(createdRemittances.length > 0
            ? `${message} ${createdRemittances.length} draft reinsurer remittance(s) created.`
            : 'Avoir created, but the backend returned no created remittances. Check Draft Outgoing Remittances.');
          void this.router.navigate(['/workspace/reassurance/back-officer/outgoing-remittances']);
        }
      },
      error: (error: HttpErrorResponse) => {
        if (isDevMode()) {
          console.error('Invoice creation request failed.', {
            status: error.status,
            error: error.error,
            errors: error.error?.errors,
            detail: error.error?.detail,
            traceId: error.error?.traceId
          });
        }
        this.invoiceError.set(this.getInvoiceSubmissionErrorMessage(error));
        this.invoiceApiErrorDetails.set(this.getInvoiceApiErrorDetails(error));
      }
    });
  }

  private setInvoiceSubmissionState(submitting: boolean): void {
    const editableControls = [
      this.invoiceForm.controls.invoiceType,
      this.invoiceForm.controls.amount,
      this.invoiceForm.controls.invoiceDate,
      this.invoiceForm.controls.label
    ];
    for (const control of editableControls) {
      if (submitting && control.enabled) {
        control.disable({ emitEvent: false });
      } else if (!submitting && control.disabled) {
        control.enable({ emitEvent: false });
      }
    }
    this.isSubmittingInvoice.set(submitting);
  }

  private getInvalidInvoiceControlNames(): string[] {
    const labels: Record<string, string> = {
      invoiceType: 'Invoice type',
      processingMode: 'Avoir processing mode',
      invoiceDate: 'Invoice date',
      amount: 'Invoice amount',
      label: 'Label'
    };
    return Object.entries(this.invoiceForm.controls)
      .filter(([, control]) => control.enabled && control.invalid)
      .map(([name]) => labels[name] ?? name);
  }

  private getInvalidInvoiceControlDetails(): Record<string, unknown> {
    return Object.fromEntries(
      Object.entries(this.invoiceForm.controls)
        .filter(([, control]) => control.enabled && control.invalid)
        .map(([name, control]) => [name, control.errors])
    );
  }

  isInvoiceSubmitDisabled(): boolean {
    const isAvoir = this.isAvoirSelected();
    const availableAmount = isAvoir ? this.availableAvoirAmount() : this.remainingInvoiceableAmount();
    const commonInvalid = this.isSubmittingInvoice()
      || this.isLoadingInvoiceContext()
      || this.invoiceForm.invalid
      || this.invoiceAmount() <= 0
      || availableAmount == null
      || availableAmount <= 0
      || this.invoiceAmount() > (availableAmount ?? 0)
      || (isAvoir && !this.isValidAvoirProcessingMode(this.invoiceForm.controls.processingMode.value));

    return commonInvalid
      || this.isLoadingInvoicePreview()
      || !this.isInvoiceAllocationValid()
      || this.hasInvoiceAllocationReconciliationError()
      || (!isAvoir && !!this.invoiceContext()?.blockingReason);
  }

  hasInvoiceAllocationReconciliationError(): boolean {
    const preview = this.invoicePreview();
    return !!preview && (preview.isReconciled === false
      || (preview.reconciliationDifference != null && preview.reconciliationDifference !== 0));
  }

  invoiceAllocationReconciliationMessage(): string | null {
    const preview = this.invoicePreview();
    if (!preview || !this.hasInvoiceAllocationReconciliationError()) return null;
    return preview.reconciliationDifference == null
      ? 'The backend allocation totals do not reconcile. Invoice creation is disabled.'
      : `The backend allocation totals differ by ${this.formatMoney(preview.reconciliationDifference, preview.currencyCode ?? undefined)}. Invoice creation is disabled.`;
  }

  isInvoiceAllocationValid(): boolean {
    const preview = this.invoicePreview();
    const allocations = preview?.allocations ?? [];
    const amount = this.invoiceAmount();
    if (!preview || this.invoicePreviewReadyKey == null
      || this.invoicePreviewReadyKey !== this.invoicePreviewRequestKey
      || allocations.length === 0 || !Number.isFinite(amount) || amount <= 0) {
      return false;
    }

    const allocatedNet = allocations.reduce((total, allocation) => total + (allocation.allocatedNetPremium ?? 0), 0);
    return this.roundMoney(allocatedNet) === this.roundMoney(amount)
      && this.roundMoney(preview.grossAmount) === this.roundMoney(amount);
  }

  formatAllocationAmount(amount: number | null | undefined, _isAvoir: boolean, currencyCode?: string): string {
    if (amount == null) {
      return 'Not provided';
    }
    return this.formatMoney(amount, currencyCode);
  }

  formatSignedNetPayable(allocation: PremiumDebitNoteAllocation, isAvoir: boolean): string {
    if (allocation.signedNetPayableAmount != null) {
      return this.formatMoney(allocation.signedNetPayableAmount, allocation.currencyCode);
    }
    if (isAvoir) {
      return 'Signed payable amount not provided by the backend';
    }
    return this.formatMoney(allocation.netPayableAmount ?? allocation.netAmount, allocation.currencyCode);
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

  downloadInvoiceDocument(invoice: PremiumDebitNoteResponse): void {
    const invoiceId = this.getPositiveId(invoice.invoiceId);
    if (invoiceId == null || this.downloadingDebitNoteInvoiceId() != null) {
      return;
    }

    const isAvoir = this.isAvoirInvoice(invoice);
    this.downloadingDebitNoteInvoiceId.set(invoiceId);
    this.invoiceRowDownloadErrors.update(errors => {
      const next = { ...errors };
      delete next[invoiceId];
      return next;
    });
    const request = isAvoir
      ? this.financialWorkflowService.downloadAvoirPdf(invoiceId)
      : this.financialWorkflowService.downloadPremiumDebitNote(invoiceId);

    request.pipe(
      switchMap(download => from(download.blob.slice(0, 5).text()).pipe(
        switchMap(signature => signature === '%PDF-'
          ? of(download)
          : throwError(() => new InvalidPdfResponseError(download)))
      )),
      finalize(() => this.downloadingDebitNoteInvoiceId.set(null))
    ).subscribe({
      next: download => this.downloadBlob(download.blob, this.getInvoiceDocumentFilename(invoice, download)),
      error: error => { void this.handleInvoiceDocumentDownloadError(invoice, error); }
    });
  }

  downloadCreditNoteDocument(avoir: PremiumDebitNoteResponse): void {
    const avoirId = this.getPositiveId(avoir.invoiceId);
    if (avoirId == null || this.downloadingCreditNoteAvoirId() != null) return;

    this.downloadingCreditNoteAvoirId.set(avoirId);
    this.creditNoteDownloadErrors.update(errors => {
      const next = { ...errors };
      delete next[avoirId];
      return next;
    });

    this.financialWorkflowService.downloadCreditNotePdf(avoirId).pipe(
      switchMap(download => from(download.blob.slice(0, 5).text()).pipe(
        switchMap(signature => signature === '%PDF-'
          ? of(download)
          : throwError(() => new InvalidPdfResponseError(download)))
      )),
      finalize(() => this.downloadingCreditNoteAvoirId.set(null))
    ).subscribe({
      next: download => {
        const number = avoir.documentNumber || avoir.invoiceNumber || String(avoirId);
        this.downloadBlob(download.blob, download.fileName?.trim() || ('Credit_Note_' + number + '.pdf'));
      },
      error: error => { void this.handleCreditNoteDownloadError(avoir, error); }
    });
  }

  private async handleCreditNoteDownloadError(avoir: PremiumDebitNoteResponse, error: unknown): Promise<void> {
    const invalidPdf = error instanceof InvalidPdfResponseError;
    const httpError = error instanceof HttpErrorResponse ? error : null;
    let payload: unknown = invalidPdf ? error.response.blob : httpError?.error;
    if (payload instanceof Blob) {
      const text = await payload.text();
      try { payload = JSON.parse(text) as unknown; } catch { payload = text; }
    }

    const parsedError = new HttpErrorResponse({
      status: httpError?.status ?? 502,
      statusText: httpError?.statusText ?? 'Invalid PDF response',
      error: payload
    });
    const backendMessage = this.getBackendMessage(parsedError);
    const message = backendMessage && !/^\s*</.test(backendMessage)
      ? backendMessage
      : invalidPdf ? 'The server response was not a valid Credit Note PDF.' : 'Credit Note PDF could not be downloaded.';
    const body = payload && typeof payload === 'object' ? payload as Record<string, unknown> : {};
    const traceId = body['traceId'] ?? body['traceID'] ?? body['requestId'];
    const avoirId = this.getPositiveId(avoir.invoiceId);
    if (avoirId != null) {
      this.creditNoteDownloadErrors.update(errors => ({
        ...errors,
        [avoirId]: typeof traceId === 'string' && traceId.trim() ? (message + ' (Trace ID: ' + traceId.trim() + ')') : message
      }));
    }
  }

  private getInvoiceDocumentFilename(invoice: PremiumDebitNoteResponse, download: BackendFileDownload): string {
    const backendFilename = download.fileName?.trim();
    if (backendFilename) {
      return backendFilename.replace(/[\\/:*?"<>|]/g, '_');
    }

    const documentNumber = invoice.documentNumber || invoice.invoiceNumber || String(invoice.invoiceId);
    const prefix = this.isAvoirInvoice(invoice) ? 'Avoir' : 'Invoice';
    return `${prefix}_${documentNumber.replace(/[\\/:*?"<>|]/g, '_')}.pdf`;
  }

  private async handleInvoiceDocumentDownloadError(invoice: PremiumDebitNoteResponse, error: unknown): Promise<void> {
    const invalidPdf = error instanceof InvalidPdfResponseError;
    const httpError = error instanceof HttpErrorResponse ? error : null;
    let payload: unknown = invalidPdf ? error.response.blob : httpError?.error;
    if (payload instanceof Blob) {
      const text = await payload.text();
      try {
        payload = JSON.parse(text) as unknown;
      } catch {
        payload = text;
      }
    }

    const parsedError = new HttpErrorResponse({
      status: httpError?.status ?? 502,
      statusText: httpError?.statusText ?? 'Invalid PDF response',
      error: payload
    });
    const backendMessage = this.getBackendMessage(parsedError);
    const message = backendMessage && !/^\s*</.test(backendMessage)
      ? backendMessage
      : invalidPdf
        ? 'The server response was not a valid PDF. No file was downloaded.'
        : `${this.isAvoirInvoice(invoice) ? 'Avoir' : 'Invoice'} PDF could not be downloaded. HTTP ${httpError?.status ?? 0} ${httpError?.statusText ?? ''}`.trim();
    const body = payload && typeof payload === 'object' ? payload as Record<string, unknown> : {};
    const extensions = body['extensions'] && typeof body['extensions'] === 'object'
      ? body['extensions'] as Record<string, unknown>
      : {};
    const traceIdValue = body['traceId'] ?? body['traceID'] ?? body['requestId'] ?? extensions['traceId'];
    const traceId = typeof traceIdValue === 'string' && traceIdValue.trim() ? traceIdValue.trim() : null;
    const invoiceId = this.getPositiveId(invoice.invoiceId);
    if (invoiceId != null) {
      this.invoiceRowDownloadErrors.update(errors => ({
        ...errors,
        [invoiceId]: traceId ? `${message} (Trace ID: ${traceId})` : message
      }));
    }

    if (isDevMode()) {
      console.error('Invoice document PDF download failed.', {
        invoiceId: invoice.invoiceId,
        status: httpError?.status ?? 502,
        code: body['code'] ?? body['codeKey'] ?? null,
        traceId
      });
    }
  }

  sumPremiumAllocations(allocations: PremiumDebitNoteAllocation[]): PremiumDebitNoteAllocation {
    return allocations.reduce<PremiumDebitNoteAllocation>((total, allocation) => ({
      panelId: 0,
      reinsurerCode: null,
      reinsurerName: 'Total',
      signedSharePct: null,
      allocationRatio: total.allocationRatio + allocation.allocationRatio,
      allocationRatioPercentage: (total.allocationRatioPercentage ?? 0) + (allocation.allocationRatioPercentage ?? 0),
      grossPremium: total.grossPremium + allocation.grossPremium,
      allocatedGrossPremium: (total.allocatedGrossPremium ?? 0) + (allocation.allocatedGrossPremium ?? 0),
      allocatedNetPremium: (total.allocatedNetPremium ?? 0) + (allocation.allocatedNetPremium ?? 0),
      allocationAmount: (total.allocationAmount ?? 0) + (allocation.allocationAmount ?? 0),
      cedentCommissionPct: 0,
      cedentCommissionPercentage: 0,
      cedentCommissionAmount: total.cedentCommissionAmount + (allocation.cedentCommissionAmount ?? 0),
      brokeragePct: 0,
      irisBrokeragePercentage: 0,
      brokerageAmount: total.brokerageAmount + allocation.brokerageAmount,
      irisBrokerageAmount: (total.irisBrokerageAmount ?? 0) + (allocation.irisBrokerageAmount ?? 0),
      otherDeductions: total.otherDeductions + allocation.otherDeductions,
      otherDeductionsAmount: (total.otherDeductionsAmount ?? 0) + (allocation.otherDeductionsAmount ?? allocation.otherDeductions),
      netAmount: total.netAmount + allocation.netAmount,
      netPayableAmount: (total.netPayableAmount ?? 0) + (allocation.netPayableAmount ?? allocation.netAmount),
      signedNetPayableAmount: (total.signedNetPayableAmount ?? 0) + (allocation.signedNetPayableAmount ?? allocation.netPayableAmount ?? allocation.netAmount),
      currencyCode: allocation.currencyCode || total.currencyCode
    }), {
      panelId: 0,
      reinsurerCode: null,
      reinsurerName: 'Total',
      signedSharePct: null,
      allocationRatio: 0,
      allocationRatioPercentage: 0,
      grossPremium: 0,
      allocatedGrossPremium: 0,
      allocatedNetPremium: 0,
      allocationAmount: 0,
      cedentCommissionPct: 0,
      cedentCommissionPercentage: 0,
      cedentCommissionAmount: 0,
      brokeragePct: 0,
      irisBrokeragePercentage: 0,
      brokerageAmount: 0,
      irisBrokerageAmount: 0,
      otherDeductions: 0,
      otherDeductionsAmount: 0,
      netAmount: 0,
      netPayableAmount: 0,
      signedNetPayableAmount: 0,
      currencyCode: this.invoiceContext()?.currency || this.contract()?.currencyCode || ''
    });
  }

  getDisplayStatus(status: string | null | undefined): string {
    return getContractStatusDisplay(status);
  }

  getStatusClasses(status: string | null | undefined): string {
    return getContractStatusClasses(status);
  }

  getInvoiceTypeLabel(invoiceType: string | null | undefined): string {
    const normalized = (invoiceType ?? '').trim().toUpperCase();
    if (normalized === 'AVOIR') return 'Avoir';
    if (normalized === 'INVOICE') return 'Invoice';
    if (normalized === 'INVOICE_FEES') return 'Invoice Fees';
    if (normalized === 'CEDENT_PREMIUM_INVOICE') return 'Cedent Premium Invoice';
    if (normalized === 'REINSURER_PAYABLE') return 'Reinsurer Payable';
    return invoiceType?.trim() || 'Not provided';
  }

  private isAvoirType(invoiceType: string | null | undefined): boolean {
    return invoiceType?.trim().toUpperCase() === 'AVOIR';
  }

  private addInvoiceToHistory(invoice: PremiumDebitNoteResponse): void {
    if (this.isAvoirType(invoice.invoiceType)) {
      this.avoirHistory.update(items => items.some(item => item.invoiceId === invoice.invoiceId) ? items : [invoice, ...items]);
      return;
    }

    const invoiceType = invoice.invoiceType?.trim().toUpperCase();
    if (invoiceType === 'INVOICE' || invoiceType === 'INVOICE_FEES') {
      this.invoiceHistory.update(items => items.some(item => item.invoiceId === invoice.invoiceId) ? items : [invoice, ...items]);
    }
  }

  isAvoirAvailableBalanceMissing(): boolean {
    return this.isAvoirSelected() && this.availableAvoirAmount() == null;
  }

  isAvoirInvoice(invoice: PremiumDebitNoteResponse): boolean {
    return this.isAvoirType(invoice.invoiceType) || invoice.isAvoir === true;
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
      { label: 'Other Deductions %', value: this.formatPercent(panel.otherDeductionsPercentage ?? null) },
      { label: 'Other Deductions Amount', value: this.formatMoney(panel.otherDeductionsAmount ?? panel.otherDeductions) },
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

  formatMoney(value: number | null, currencyCode?: string): string {
    if (value == null || !Number.isFinite(value)) {
      return 'Not provided';
    }

    const contract = this.contract();
    const context = this.invoiceContext();
    const decimalPlaces = context?.currencyDecimalPlaces ?? contract?.currencyDecimalPlaces ?? undefined;
    const numberFormatOptions: Intl.NumberFormatOptions = decimalPlaces == null
      ? {}
      : { minimumFractionDigits: decimalPlaces, maximumFractionDigits: decimalPlaces };
    const number = new Intl.NumberFormat(undefined, numberFormatOptions).format(value);

    return `${currencyCode ?? context?.currencyCode ?? context?.currency ?? contract?.currencyCode ?? ''} ${number}`.trim();
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
    const netPremium = this.resolveContractNetPremium(grossPremium, cedentCommission);

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

  getInvoiceAmount(invoice: PremiumDebitNoteResponse): number | null {
    const signedAmount = this.toFiniteNumber(invoice.signedAmount);
    if (signedAmount != null) {
      return signedAmount;
    }

    if (this.isAvoirType(invoice.invoiceType)) {
      const amount = this.toFiniteNumber(invoice.amount) ?? this.toFiniteNumber(invoice.grossAmount);
      return amount == null ? null : -Math.abs(amount);
    }

    const grossAmount = this.toFiniteNumber(invoice.grossAmount);
    if (grossAmount == null) {
      return null;
    }

    // Saved allocation commissions reflect the invoice's original calculation.
    const commissions = invoice.allocations.map(allocation => this.toFiniteNumber(allocation.cedentCommissionAmount));
    if (commissions.length > 0 && commissions.every(amount => amount != null)) {
      return grossAmount - commissions.reduce<number>((total, amount) => total + (amount ?? 0), 0);
    }

    const cedentCommissionPct = this.toFiniteNumber(this.contract()?.cedentCommissionPct);
    return cedentCommissionPct == null ? null : grossAmount - grossAmount * cedentCommissionPct / 100;
  }

  getInvoicePaymentStatus(invoice: PremiumDebitNoteResponse): string {
    const rawStatus = invoice.paymentStatus?.trim() || invoice.recoveryStatus?.trim();
    const displayStatus = getInvoicePaymentStatusDisplay(rawStatus);
    if (displayStatus) {
      return displayStatus;
    }

    console.debug('Contract overview invoice history response is missing paymentStatus.', {
      invoiceId: invoice.invoiceId,
      invoiceNumber: invoice.invoiceNumber,
      fields: ['paymentStatus', 'recoveryStatus']
    });
    return 'Missing paymentStatus';
  }

  getInvoicePaymentStatusClasses(invoice: PremiumDebitNoteResponse): string {
    return getInvoicePaymentStatusClasses(invoice.paymentStatus ?? invoice.recoveryStatus);
  }

  private resolveContractNetPremium(grossPremium: number | null, cedentCommission: number | null): number | null {
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
    const otherDeductions = this.toFiniteNumber(panel.otherDeductionsAmount ?? panel.otherDeductions) ?? 0;

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
    const otherDeductionsPct = this.toFiniteNumber(raw.otherDeductionsPercentage);
    const otherDeductionsAmount = grossPremium == null
      ? null
      : otherDeductionsPct == null
        ? this.panelForm.controls.otherDeductionsPercentage.dirty
          ? 0
          : this.toFiniteNumber(this.panelForm.controls.otherDeductionsAmount.value) ?? 0
        : this.roundMoney(grossPremium * otherDeductionsPct / 100);
    const otherDeductions = otherDeductionsAmount ?? 0;
    const totalDeductions = (cedentCommissionAmount ?? 0) + (brokerageIrisAmount ?? 0) + otherDeductions;
    const netPremium = grossPremium == null || cedentCommissionAmount == null
      ? null
      : this.roundMoney(Math.max(0, grossPremium - totalDeductions));

    this.selectedDeductibleMode.set(raw.deductibleMode);
    this.setCalculatedControlValue(this.panelForm.controls.grossPremium, grossPremium);
    this.setCalculatedControlValue(this.panelForm.controls.cedentCommissionPct, cedentCommissionPct);
    this.setCalculatedControlValue(this.panelForm.controls.cedentCommissionAmount, cedentCommissionAmount);
    this.setCalculatedControlValue(this.panelForm.controls.brokerageIrisAmount, brokerageIrisAmount);
    this.setCalculatedControlValue(this.panelForm.controls.otherDeductionsAmount, otherDeductionsAmount);
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
    this.setControlError(this.panelForm.controls.otherDeductionsPercentage, 'invalidNumber', !this.isValidOptionalNumber(this.panelForm.controls.otherDeductionsPercentage.value));
    this.setControlError(this.panelForm.controls.otherDeductionsPercentage, 'min', !this.isAtLeast(this.panelForm.controls.otherDeductionsPercentage.value, 0));
    this.setControlError(this.panelForm.controls.otherDeductionsPercentage, 'max', !this.isAtMost(this.panelForm.controls.otherDeductionsPercentage.value, 100));
    this.setControlError(this.panelForm.controls.otherDeductionsAmount, 'deductionsExceedGrossPremium', exceedsGrossPremium);
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
      this.scheduleInvoicePreview();
    });
    this.invoiceForm.controls.invoiceType.valueChanges.subscribe(() => {
      this.invoiceForm.controls.processingMode.setValue('', { emitEvent: false });
      this.invoiceForm.controls.processingMode.markAsUntouched();
      this.invoiceSubmissionKey.set(null);
      this.updateInvoiceAmountValidators();
      const availableAmount = this.invoiceCreationAvailableAmount();
      const currentAmount = Number(this.invoiceForm.controls.amount.value ?? 0);
      if (availableAmount == null) {
        this.invoiceForm.controls.amount.setValue(null, { emitEvent: false });
        this.invoiceAmountValue.set(0);
      } else if (!Number.isFinite(currentAmount) || currentAmount <= 0 || currentAmount > availableAmount) {
        const nextAmount = availableAmount > 0 ? availableAmount : null;
        this.invoiceForm.controls.amount.setValue(nextAmount, { emitEvent: false });
        this.invoiceAmountValue.set(nextAmount ?? 0);
      }
      this.loadInvoicePreview();
    });
    this.invoiceForm.controls.invoiceDate.valueChanges.subscribe(() => this.scheduleInvoicePreview());
    this.invoiceForm.controls.label.valueChanges.subscribe(() => this.scheduleInvoicePreview());
  }

  private loadInvoiceContext(): void {
    const contractId = this.contractId();

    if (contractId == null) {
      this.invoiceContextError.set('Contract id is missing. Please reload the contract overview.');
      return;
    }

    this.isLoadingInvoiceContext.set(true);
    this.invoiceContextError.set('');
    this.invoicePreviewRequestKey = null;
    this.invoicePreviewReadyKey = null;
    this.invoicePreviewRequestId++;
    this.cancelInvoicePreviewRequest();
    this.invoicePreview.set(null);
    this.isLoadingInvoicePreview.set(false);
    this.financialWorkflowService.getInvoiceContext(contractId).pipe(
      finalize(() => this.isLoadingInvoiceContext.set(false))
    ).subscribe({
      next: context => {
        this.invoiceContext.set(context);
        this.updateInvoiceAmountValidators();
        if (this.isInvoiceModalOpen()) {
          const remainingAmount = this.invoiceCreationAvailableAmount();
          this.invoiceForm.controls.amount.setValue(remainingAmount != null && remainingAmount > 0 ? remainingAmount : null, { emitEvent: false });
          this.invoiceAmountValue.set(remainingAmount != null && remainingAmount > 0 ? remainingAmount : 0);
          this.loadInvoicePreview();
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
      next: invoices => {
        const forContract = invoices.filter(invoice => invoice.contractId === contractId);
        this.invoiceHistory.set(forContract.filter(invoice => ['INVOICE', 'INVOICE_FEES'].includes(invoice.invoiceType?.trim().toUpperCase() ?? '')));
        this.avoirHistory.set(forContract.filter(invoice => this.isAvoirType(invoice.invoiceType)));
      },
      error: (error: HttpErrorResponse) => this.invoiceHistoryError.set(this.getInvoiceErrorMessage(error))
    });
  }

  private loadInvoicePreview(): void {
    if (this.invoicePreviewDebounceTimer != null) {
      clearTimeout(this.invoicePreviewDebounceTimer);
      this.invoicePreviewDebounceTimer = null;
    }
    const contractId = this.contractId();
    const raw = this.invoiceForm.getRawValue();
    const amount = Number(raw.amount);
    const remainingAmount = this.invoiceCreationAvailableAmount();

    const isAvoir = this.isAvoirType(raw.invoiceType);
    if (contractId == null || !['INVOICE', 'INVOICE_FEES', 'AVOIR'].includes(raw.invoiceType)
      || (isAvoir && !this.isValidAvoirProcessingMode(raw.processingMode))
      || (!isAvoir && this.invoiceContext()?.blockingReason) || remainingAmount == null || !Number.isFinite(amount) || amount <= 0 || amount > remainingAmount) {
      this.invoicePreviewRequestKey = null;
      this.invoicePreviewReadyKey = null;
      this.invoicePreviewRequestId++;
      this.cancelInvoicePreviewRequest();
      this.invoicePreview.set(null);
      this.isLoadingInvoicePreview.set(false);
      return;
    }

    const request: PremiumDebitNoteRequest = {
      invoiceType: raw.invoiceType as 'INVOICE' | 'INVOICE_FEES' | 'AVOIR',
      ...(isAvoir && this.isValidAvoirProcessingMode(raw.processingMode)
        ? {
            processingMode: raw.processingMode,
            ...(raw.processingMode === 'DIRECT_TO_REMITTANCES'
              ? { idempotencyKey: this.invoiceSubmissionKey() ?? this.createPreviewIdempotencyKey() }
              : {})
          }
        : {}),
      grossAmount: amount,
      invoiceDate: raw.invoiceDate,
      label: raw.label.trim() || null
    };
    if (isAvoir && raw.processingMode === 'DIRECT_TO_REMITTANCES' && !request.idempotencyKey) {
      this.invoiceSubmissionKey.set(this.createIdempotencyKey());
      request.idempotencyKey = this.invoiceSubmissionKey();
    }
    const requestKey = JSON.stringify({ contractId, ...request });
    if (requestKey === this.invoicePreviewRequestKey
      && (this.isLoadingInvoicePreview() || this.invoicePreview() != null)) {
      return;
    }

    this.invoiceError.set('');
    this.invoiceApiErrorDetails.set(null);
    this.invoicePreviewReadyKey = null;
    const requestId = ++this.invoicePreviewRequestId;
    this.cancelInvoicePreviewRequest();
    this.invoicePreviewRequestKey = requestKey;
    this.invoicePreview.set(null);
    this.isLoadingInvoicePreview.set(true);
    this.invoicePreviewSubscription = this.financialWorkflowService.previewPremiumDebitNote(contractId, request).pipe(
      finalize(() => {
        if (requestId === this.invoicePreviewRequestId) {
          this.isLoadingInvoicePreview.set(false);
          this.invoicePreviewSubscription = null;
        }
      })
    ).subscribe({
      next: preview => {
        if (requestId === this.invoicePreviewRequestId) {
          this.invoicePreview.set(preview);
          this.invoicePreviewReadyKey = requestKey;
        }
      },
      error: (error: HttpErrorResponse) => {
        if (requestId === this.invoicePreviewRequestId) {
          this.invoicePreview.set(null);
          this.invoiceError.set(this.getInvoiceErrorMessage(error));
          this.invoiceApiErrorDetails.set(this.getInvoiceApiErrorDetails(error));
          this.invoicePreviewReadyKey = null;
        }
      }
    });
  }

  private scheduleInvoicePreview(): void {
    if (this.invoicePreviewDebounceTimer != null) {
      clearTimeout(this.invoicePreviewDebounceTimer);
    }

    const requestId = ++this.invoicePreviewRequestId;
    this.cancelInvoicePreviewRequest();
    this.invoicePreviewRequestKey = null;
    this.invoicePreviewReadyKey = null;
    this.invoicePreview.set(null);
    this.invoiceError.set('');
    this.invoiceApiErrorDetails.set(null);
    this.isLoadingInvoicePreview.set(false);
    if (this.invoiceForm.controls.processingMode.value === 'DIRECT_TO_REMITTANCES') {
      this.invoiceSubmissionKey.set(null);
    }
    this.invoicePreviewDebounceTimer = setTimeout(() => {
      this.invoicePreviewDebounceTimer = null;
      if (requestId === this.invoicePreviewRequestId) {
        this.loadInvoicePreview();
      }
    }, 250);
  }

  private cancelInvoicePreviewRequest(): void {
    this.invoicePreviewSubscription?.unsubscribe();
    this.invoicePreviewSubscription = null;
  }

  private invalidateInvoicePreview(): void {
    if (this.invoicePreviewDebounceTimer != null) {
      clearTimeout(this.invoicePreviewDebounceTimer);
      this.invoicePreviewDebounceTimer = null;
    }
    this.invoicePreviewRequestId++;
    this.cancelInvoicePreviewRequest();
    this.invoicePreviewRequestKey = null;
    this.invoicePreviewReadyKey = null;
    this.invoicePreview.set(null);
    this.isLoadingInvoicePreview.set(false);
  }

  private updateInvoiceAmountValidators(): void {
    const validators = [Validators.required, finiteAmountValidator, Validators.min(0.01)];
    const availableAmount = this.invoiceCreationAvailableAmount();
    if (availableAmount != null) {
      validators.push(Validators.max(availableAmount));
    }

    const amountControl = this.invoiceForm.controls.amount;
    amountControl.setValidators(validators);
    amountControl.updateValueAndValidity({ emitEvent: false });

    const processingModeControl = this.invoiceForm.controls.processingMode;
    processingModeControl.setValidators(this.isAvoirSelected() ? [Validators.required] : []);
    processingModeControl.updateValueAndValidity({ emitEvent: false });
  }

  private isValidAvoirProcessingMode(value: string | null | undefined): value is 'PAIR_WITH_ENCAISSEMENT' | 'DIRECT_TO_REMITTANCES' {
    return value === 'PAIR_WITH_ENCAISSEMENT' || value === 'DIRECT_TO_REMITTANCES';
  }

  private createPreviewIdempotencyKey(): string {
    const key = this.createIdempotencyKey();
    this.invoiceSubmissionKey.set(key);
    return key;
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
    this.invalidateInvoicePreview();
    this.contract.set(null);
    this.contractPanels.set([]);
    this.activePanelId.set(null);
    this.isReinsurersTabActive.set(false);
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
    this.invoiceContext.set(null);
    this.invoiceHistory.set([]);
    this.avoirHistory.set([]);
    this.invoiceHistoryError.set('');
    this.invoicePreview.set(null);
    this.selectedInvoiceAllocationView.set(null);
    this.invoiceSubmissionKey.set(null);
    this.invoiceSuccessMessage.set('');
    this.invoiceDownloadError.set('');
    this.invoiceError.set('');
    this.invoiceApiErrorDetails.set(null);
    this.invoiceContextError.set('');
    this.invoiceAllocationSearchControl.setValue('', { emitEvent: false });
    this.invoiceAmountValue.set(0);
    this.invoiceForm.reset({
      receiptAllocationId: null,
      panelId: null,
      invoiceType: '',
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
    if (this.isBackOfficeMode() && normalizeContractStatus(contractOverview.status) === 'bound') {
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
      otherDeductionsPercentage: raw.otherDeductionsPercentage == null && this.panelForm.controls.otherDeductionsPercentage.dirty
        ? 0
        : this.toFiniteNumber(raw.otherDeductionsPercentage),
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

  private getStatusTransitionErrorMessage(error: HttpErrorResponse): string {
    if (error.status === 401 || error.status === 403) {
      return 'Your session is not authorized to mark this contract Ready for Placement.';
    }

    if (error.status === 404) {
      return 'The contract could not be found.';
    }

    if (error.status === 0) {
      return 'Unable to reach the contract service.';
    }

    return 'The contract could not be marked Ready for Placement.';
  }

  private getFieldValidationErrors(body: unknown): Array<{ field: string; messages: string[] }> {
    if (!body || typeof body !== 'object') return [];
    const errors = (body as { errors?: unknown }).errors;
    if (!errors || typeof errors !== 'object' || Array.isArray(errors)) return [];
    return Object.entries(errors as Record<string, unknown>).map(([field, value]) => ({
      field,
      messages: Array.isArray(value) ? value.map(String) : [String(value)]
    }));
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
    const backendMessage = this.getBackendMessage(error);
    if (backendMessage) {
      return backendMessage;
    }

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

  private getInvoiceSubmissionErrorMessage(error: HttpErrorResponse): string {
    if (error.status >= 500) {
      return `The invoice request could not be completed (HTTP ${error.status}).`;
    }
    return this.getInvoiceErrorMessage(error);
  }

  private getInvoiceApiErrorDetails(error: HttpErrorResponse): InvoiceApiErrorDetails {
    const body = error.error && typeof error.error === 'object'
      ? error.error as Record<string, unknown>
      : {};
    const rawErrors = body['errors'];
    const validationErrors = Array.isArray(rawErrors)
      ? rawErrors.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
      : rawErrors && typeof rawErrors === 'object'
        ? Object.entries(rawErrors as Record<string, unknown>).flatMap(([field, value]) => {
            const messages = Array.isArray(value) ? value : [value];
            return messages.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
              .map(message => `${field}: ${message}`);
          })
        : [];
    const detail = typeof body['detail'] === 'string' && body['detail'].trim()
      ? body['detail'].trim()
      : typeof error.error === 'string' && error.error.trim()
        ? error.error.trim()
        : null;
    const extensions = body['extensions'] && typeof body['extensions'] === 'object'
      ? body['extensions'] as Record<string, unknown>
      : {};
    const trace = body['traceId'] ?? body['traceID'] ?? body['requestId'] ?? extensions['traceId'];

    return {
      status: error.status,
      detail,
      validationErrors,
      traceId: typeof trace === 'string' && trace.trim() ? trace.trim() : null
    };
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
