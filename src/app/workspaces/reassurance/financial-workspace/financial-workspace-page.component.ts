import { CommonModule, DatePipe, NgClass } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, HostListener, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AbstractControl, FormControl, FormGroup, ReactiveFormsModule, ValidationErrors, ValidatorFn, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { finalize, forkJoin, Observable, Subscription, debounceTime, distinctUntilChanged, merge, of, take } from 'rxjs';
import { Counterparty, FinanceCounterpartyListItem } from '../../../shared/models/counterparty.model';
import { CurrencyReference } from '../../../shared/models/contract.model';
import {
  BankAccountResponse,
  BankAccountSnapshot,
  BankReceiptResponse,
  BackendFileDownload,
  DisbursementCommandResponse,
  DisbursementContext,
  ClosingDisbursementContext,
  DisbursementResponse,
  EligibleInvoice,
  InvoiceResponse,
  RemittanceResponse
} from '../../../shared/models/financial-workflow.model';
import {
  getInvoicePaymentStatusClasses,
  getInvoicePaymentStatusValue,
  InvoicePaymentStatus,
  normalizePaymentStatus
} from '../../../shared/models/payment-status.util';
import { DocumentAttachmentsComponent } from '../../../shared/components/document-attachments/document-attachments.component';
import { DocumentContext } from '../../../shared/models/document.model';
import { CounterpartiesService } from '../../../shared/services/counterparties.service';
import { ContractsService } from '../../../shared/services/contracts.service';
import { FinancialWorkflowService } from '../../../shared/services/financial-workflow.service';

type FinancialRole = 'finance' | 'back-office';
type EligibleInvoicesLoadState = 'idle' | 'loading' | 'loaded' | 'empty' | 'failed';
type FinancialPage =
  | 'dashboard'
  | 'receipts'
  | 'bank-accounts'
  | 'disbursements'
  | 'remittances'
  | 'invoices'
  | 'notifications';

enum RemittanceWorkflowStatus {
  AwaitingFinanceDisbursement = 'awaitingfinancedisbursement',
  Closed = 'closed',
  Disbursed = 'disbursed',
  Draft = 'draft',
  PaymentInProgress = 'paymentinprogress',
  ReadyForDisbursement = 'readyfordisbursement'
}

@Component({
  selector: 'app-financial-workspace-page',
  standalone: true,
  imports: [CommonModule, DatePipe, NgClass, ReactiveFormsModule, DocumentAttachmentsComponent],
  templateUrl: './financial-workspace-page.component.html',
  styles: `:host { display: block; }`
})
export class FinancialWorkspacePageComponent implements OnInit {
  private readonly destroyRef = inject(DestroyRef);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly workflowService = inject(FinancialWorkflowService);
  private readonly counterpartiesService = inject(CounterpartiesService);
  private readonly contractsService = inject(ContractsService);

  readonly role = signal<FinancialRole>('finance');
  readonly page = signal<FinancialPage>('dashboard');
  readonly receipts = signal<BankReceiptResponse[]>([]);
  readonly totalReceipts = signal(0);
  readonly remittances = signal<RemittanceResponse[]>([]);
  readonly remittancePageNumber = signal(1);
  readonly remittancePageSize = signal(20);
  readonly remittanceTotalCount = signal(0);
  readonly remittanceTotalPages = signal(0);
  readonly invoices = signal<InvoiceResponse[]>([]);
  readonly invoicePageNumber = signal(1);
  readonly invoicePageSize = signal(20);
  readonly invoiceTotalCount = signal(0);
  readonly invoiceTotalPages = signal(0);
  readonly disbursements = signal<DisbursementResponse[]>([]);
  readonly counterparties = signal<FinanceCounterpartyListItem[]>([]);
  readonly bankAccounts = signal<BankAccountResponse[]>([]);
  readonly allReceiptBankAccounts = signal<BankAccountResponse[]>([]);
  readonly currencies = signal<CurrencyReference[]>([]);
  readonly eligibleInvoices = signal<EligibleInvoice[]>([]);
  readonly eligibleInvoicesLoadState = signal<EligibleInvoicesLoadState>('idle');
  readonly eligibleInvoicesError = signal('');
  readonly eligibleInvoicesHttpStatus = signal<number | null>(null);
  readonly generatedRemittances = signal<RemittanceResponse[]>([]);
  readonly selectedReceipt = signal<BankReceiptResponse | null>(null);
  readonly selectedPairingBankAccount = signal<BankAccountResponse | null>(null);
  readonly selectedCounterparty = signal<FinanceCounterpartyListItem | null>(null);
  readonly selectedCounterpartyDetails = signal<Counterparty | null>(null);
  readonly selectedBankAccount = signal<BankAccountResponse | null>(null);
  readonly selectedRemittance = signal<RemittanceResponse | null>(null);
  readonly remittanceToConfirm = signal<RemittanceResponse | null>(null);
  readonly completedDisbursement = signal<DisbursementResponse | null>(null);
  readonly disbursementContext = signal<DisbursementContext | null>(null);
  readonly closingContext = signal<ClosingDisbursementContext | null>(null);
  readonly selectedClosingId = signal<number | null>(null);
  readonly isLoading = signal(false);
  readonly isBankAccountLoading = signal(false);
  readonly isReceiptBankAccountLoading = signal(false);
  readonly hasLoadedReceiptBankAccounts = signal(false);
  readonly isReceiptBankAccountDropdownOpen = signal(false);
  readonly highlightedReceiptBankAccountIndex = signal(0);
  readonly receiptBankAccountQuery = signal('');
  private lastReceiptBankAccountSearch = '';
  readonly isInvoiceDropdownOpen = signal(false);
  readonly highlightedInvoiceIndex = signal(0);
  readonly invoiceQuery = signal('');
  readonly proposedAllocations = signal<Record<number, number>>({});
  readonly pendingReceiptId = signal<number | null>(null);
  readonly pendingRemittanceRef = signal<number | null>(null);
  readonly pendingNotificationId = signal<number | null>(null);
  readonly isTransferConfirmationOpen = signal(false);
  readonly isBeneficiaryLoading = signal(false);
  readonly receiptError = signal('');
  readonly remittanceError = signal('');
  readonly invoiceError = signal('');
  readonly downloadingInvoiceIds = signal<Set<number>>(new Set());
  readonly isSubmitting = signal(false);
  readonly isDownloadingInvoice = signal(false);
  readonly isGeneratingClosing = signal(false);
  readonly isDownloadingClosing = signal(false);
  readonly isConfirmingTransfer = signal(false);
  readonly isLoadingContext = signal(false);
  readonly disbursementLoadError = signal('');
  readonly errorMessage = signal('');
  readonly successMessage = signal('');
  readonly modal = signal<'receipt' | 'bank-account' | 'pairing' | 'disbursement' | 'remittance-confirmation' | null>(null);
  private disbursementContextSubscription: Subscription | null = null;
  private disbursementBankAccountsSubscription: Subscription | null = null;
  private loadingDisbursementContextRef: number | null = null;
  private loadingDisbursementBankAccountsCounterpartyId: number | null = null;

  readonly unpairedReceipts = computed(() => this.receipts().filter(receipt => this.normalizeStatus(receipt.pairingStatus) === 'unpaired'));
  readonly pendingInvoices = computed(() => this.invoices().filter(invoice => this.normalizeStatus(invoice.status).includes('pending')));
  readonly readyRemittances = computed(() => this.remittances().filter(remittance => this.normalizeStatus(remittance.status).includes('ready')));
  readonly selectedRemittanceIds = signal<Set<number>>(new Set());
  readonly selectedRemittanceLock = computed(() => {
    const selected = this.remittances().filter(remittance => this.selectedRemittanceIds().has(this.getRemittanceId(remittance)));
    const first = selected[0];
    return first ? { reinsurerId: this.getRemittanceReinsurerId(first), currencyCode: first.currencyCode } : null;
  });
  readonly selectedRemittanceRows = computed(() => this.remittances().filter(remittance => this.selectedRemittanceIds().has(this.getRemittanceId(remittance))));
  readonly selectedRemittanceTotal = computed(() => this.selectedRemittanceRows()
    .reduce((total, remittance) => total + (remittance.remainingPayableAmount ?? remittance.netPayableAmount ?? 0), 0));
  readonly selectedRemittanceCurrency = computed(() => this.selectedRemittanceRows()[0]?.currencyCode ?? '');
  readonly activeBankAccounts = computed(() => this.bankAccounts().filter(account => account.isActive));
  readonly selectedDisbursementBankAccount = computed(() => {
    return this.activeBankAccounts().find(account => this.isValidDisbursementBankAccount(account)) ?? null;
  });
  readonly activeReceiptBankAccounts = computed(() => this.allReceiptBankAccounts().filter(account => account.isActive));
  readonly filteredReceiptBankAccounts = computed(() => {
    const query = this.normalizeSearchText(this.receiptBankAccountQuery());
    const ibanQuery = query.replace(/\s+/g, '');

    if (!query) {
      return this.activeReceiptBankAccounts();
    }

    return this.activeReceiptBankAccounts().filter(account => {
      const searchableText = this.normalizeSearchText([
        this.getReceiptBankAccountOptionLabel(account),
        account.beneficiaryName,
        account.bankName,
        account.maskedIban,
        account.iban,
        account.swiftBic,
        account.currencyCode
      ].filter(Boolean).join(' '));
      const iban = this.normalizeSearchText(account.iban ?? '').replace(/\s+/g, '');

      return searchableText.includes(query) || (!!ibanQuery && iban.includes(ibanQuery));
    });
  });
  selectedReceiptBankAccount(): BankAccountResponse | null {
    const bankAccountId = this.receiptForm.controls.bankAccountId.value;
    return this.activeReceiptBankAccounts().find(account => account.idBankAccount === bankAccountId) ?? null;
  }
  receiptValidationMessages(): string[] {
    if (!this.receiptForm.touched) {
      return [];
    }

    const messages: string[] = [];
    const controls = this.receiptForm.controls;

    if (controls.bankAccountId.invalid) {
      messages.push('Select a bank account from the search results.');
    }

    if (controls.receiptMonth.invalid) {
      messages.push('Enter the receipt month in YYYY-MM format.');
    }

    if (controls.amountReceived.invalid) {
      messages.push('Enter an amount greater than zero.');
    }

    return messages;
  }
  readonly invoiceContractOptions = computed(() => {
    const options = new Map<number, { contractId: number; label: string }>();
    this.invoices().forEach(invoice => {
      const contractId = this.getPositiveId(invoice.contractId);
      if (contractId == null || options.has(contractId)) {
        return;
      }

      options.set(contractId, {
        contractId,
        label: this.getInvoiceContractDisplay(invoice)
      });
    });

    return [...options.values()].sort((a, b) => a.label.localeCompare(b.label));
  });
  readonly invoiceCedentOptions = computed(() => {
    const options = new Map<number, { counterpartyId: number; label: string }>();
    this.invoices().forEach(invoice => {
      const counterpartyId = this.getPositiveId(invoice.counterpartyId);
      const label = this.getInvoiceCounterpartyName(invoice);
      if (counterpartyId == null || !label || label === 'Not provided' || options.has(counterpartyId)) {
        return;
      }

      options.set(counterpartyId, { counterpartyId, label });
    });

    return [...options.values()].sort((a, b) => a.label.localeCompare(b.label));
  });
  readonly remittanceReinsurerOptions = computed(() => {
    const options = new Map<number, { reinsurerId: number; label: string }>();
    this.remittances().forEach(remittance => {
      const reinsurerId = this.getRemittanceReinsurerId(remittance);
      const label = this.getRemittanceReinsurerName(remittance);
      if (!reinsurerId || !label || options.has(reinsurerId)) {
        return;
      }

      options.set(reinsurerId, { reinsurerId, label });
    });

    return [...options.values()].sort((a, b) => a.label.localeCompare(b.label));
  });
  readonly remittanceContractOptions = computed(() => {
    const options = new Map<number, { contractId: number; label: string }>();
    this.remittances().forEach(remittance => {
      const contractId = this.getPositiveId(remittance.contractId);
      if (contractId == null || options.has(contractId)) {
        return;
      }

      options.set(contractId, {
        contractId,
        label: this.getRemittanceContractDisplay(remittance)
      });
    });

    return [...options.values()].sort((a, b) => a.label.localeCompare(b.label));
  });
  readonly filteredEligibleInvoices = computed(() => {
    const query = this.normalizeSearchText(this.invoiceQuery());

    return this.eligibleInvoices().filter(invoice => {
      if (!query) {
        return true;
      }

      const searchableText = this.normalizeSearchText([
        invoice.invoiceNumber,
        invoice.label,
        invoice.umr,
        invoice.contractName,
        invoice.cedentName,
        invoice.invoiceId
      ].filter(value => value != null).join(' '));

      return searchableText.includes(query);
    });
  });
  selectedInvoice(): EligibleInvoice | null {
    const invoiceId = this.getPositiveId(this.pairingForm.controls.invoiceId.value);
    return this.filteredEligibleInvoices().find(invoice => invoice.invoiceId === invoiceId) ?? null;
  }
  readonly selectedReceiptDocumentContext = computed<DocumentContext | null>(() => this.receiptDocumentContext(this.selectedReceipt()));
  readonly proposedAllocationItems = computed(() => Object.entries(this.proposedAllocations())
    .map(([invoiceId, allocatedAmount]) => ({ invoiceId: Number(invoiceId), allocatedAmount }))
    .filter(item => Number.isInteger(item.invoiceId) && item.invoiceId > 0));
  readonly allocatedAmountInForm = computed(() => this.proposedAllocationItems()
    .reduce((sum, item) => sum + (Number.isFinite(item.allocatedAmount) ? item.allocatedAmount : 0), 0));
  readonly pairingRemainingAmount = computed(() => Math.max((this.selectedReceipt()?.availableAmount ?? 0) - this.allocatedAmountInForm(), 0));
  readonly isPairingFormValid = computed(() => {
    const receipt = this.selectedReceipt();
    const allocations = this.proposedAllocationItems();

    return !!receipt
      && allocations.length > 0
      && allocations.every(item => Number.isFinite(item.allocatedAmount)
        && item.allocatedAmount > 0
        && item.allocatedAmount <= this.getEligibleInvoiceOutstandingAmountById(item.invoiceId))
      && this.allocatedAmountInForm() <= receipt.availableAmount;
  });
  readonly beneficiaryInfo = computed(() => {
    const details = this.selectedCounterpartyDetails();
    const counterparty = this.selectedCounterparty();
    const account = this.selectedBankAccount();

    return {
      name: account?.beneficiaryName || details?.name || counterparty?.name || '',
      address: account?.beneficiaryAddress ?? details?.addressLine ?? '',
      city: account?.beneficiaryCity ?? details?.city ?? '',
      country: account?.beneficiaryCountry ?? details?.country ?? ''
    };
  });
  readonly bankAccountModeLabel = computed(() => this.selectedBankAccount() ? 'Update account' : 'Add account');
  readonly pageTitle = computed(() => {
    switch (this.page()) {
      case 'dashboard':
        return 'Dashboard';
      case 'receipts':
        return this.role() === 'finance' ? 'Incoming Remittances' : 'Receipt Pairing';
      case 'bank-accounts':
        return 'Counterparty Bank Accounts';
      case 'disbursements':
        return 'Disbursement Queue';
      case 'remittances':
        return 'Draft Outgoing Remittances';
      case 'invoices':
        return 'Invoices';
      default:
        return 'Notifications';
    }
  });
  readonly modalTitle = computed(() => {
    switch (this.modal()) {
      case 'receipt':
        return 'Create Encaissement';
      case 'bank-account':
        return 'Bank Accounts';
      case 'pairing':
        return 'Pair Encaissement';
      case 'disbursement':
        return 'Make Disbursement';
      case 'remittance-confirmation':
        return 'Confirm Remittance';
      default:
        return '';
    }
  });

  readonly receiptFilters = new FormGroup({
    search: new FormControl('', { nonNullable: true }),
    pairingStatus: new FormControl('', { nonNullable: true }),
    counterpartyId: new FormControl<number | null>(null),
    currencyId: new FormControl<number | null>(null),
    collectionType: new FormControl('', { nonNullable: true }),
    operationFrom: new FormControl('', { nonNullable: true }),
    operationTo: new FormControl('', { nonNullable: true })
  });

  readonly receiptForm = new FormGroup({
    bankAccountSearch: new FormControl('', { nonNullable: true }),
    bankAccountId: new FormControl<number | null>(null, [Validators.required]),
    receiptMonth: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.pattern(/^\d{4}-\d{2}$/)] }),
    amountReceived: new FormControl<number | null>(null, [Validators.required, Validators.min(0.01)]),
    settlementMethod: new FormControl('BankTransfer', { nonNullable: true }),
    collectionType: new FormControl('Premium', { nonNullable: true })
  });

  readonly bankAccountForm = new FormGroup({
    currencyId: new FormControl<number | null>(null, [Validators.required]),
    currencySearch: new FormControl('', { nonNullable: true }),
    bankName: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    bankCity: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    bankCountry: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    agencyCode: new FormControl('', { nonNullable: true }),
    rib: new FormControl('', { nonNullable: true }),
    iban: new FormControl('', { nonNullable: true, validators: [Validators.required, this.ibanValidator()] }),
    swiftBic: new FormControl('', { nonNullable: true, validators: [Validators.required, this.swiftBicValidator()] }),
    accountLabel: new FormControl('', { nonNullable: true }),
    hasCorrespondentBank: new FormControl(false, { nonNullable: true }),
    correspondentBankName: new FormControl('', { nonNullable: true }),
    correspondentSwiftBic: new FormControl('', { nonNullable: true }),
    isActive: new FormControl(true, { nonNullable: true })
  });

  readonly pairingForm = new FormGroup({
    invoiceSearch: new FormControl('', { nonNullable: true }),
    invoiceId: new FormControl<number | null>(null),
    allocatedAmount: new FormControl<number | null>(null)
  });

  readonly disbursementForm = new FormGroup({
    bankAccountId: new FormControl<number | null>(null, [Validators.required]),
    operationDate: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    paymentMethod: new FormControl('BANK_TRANSFER', { nonNullable: true, validators: [Validators.required] }),
    bankReference: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    description: new FormControl('', { nonNullable: true })
  });

  readonly invoiceFilters = new FormGroup({
    search: new FormControl('', { nonNullable: true }),
    contractSearch: new FormControl('', { nonNullable: true }),
    contractId: new FormControl<number | null>(null),
    cedentSearch: new FormControl('', { nonNullable: true }),
    counterpartyId: new FormControl<number | null>(null),
    invoiceType: new FormControl('', { nonNullable: true }),
    recoveryStatus: new FormControl('', { nonNullable: true }),
    currencyId: new FormControl<number | null>(null),
    from: new FormControl('', { nonNullable: true }),
    to: new FormControl('', { nonNullable: true })
  });

  readonly remittanceFilters = new FormGroup({
    search: new FormControl('', { nonNullable: true }),
    reinsurerSearch: new FormControl('', { nonNullable: true }),
    reinsurerId: new FormControl<number | null>(null),
    contractSearch: new FormControl('', { nonNullable: true }),
    contractId: new FormControl<number | null>(null),
    status: new FormControl('', { nonNullable: true }),
    currencyId: new FormControl<number | null>(null),
    from: new FormControl('', { nonNullable: true }),
    to: new FormControl('', { nonNullable: true })
  });

  ngOnInit(): void {
    this.route.data.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(data => {
      this.role.set(data['role'] === 'back-office' ? 'back-office' : 'finance');
      this.page.set((data['page'] as FinancialPage) ?? 'dashboard');
      this.loadPage();
    });

    merge(
      this.receiptFilters.controls.search.valueChanges.pipe(debounceTime(350), distinctUntilChanged()),
      this.receiptFilters.controls.pairingStatus.valueChanges,
      this.receiptFilters.controls.counterpartyId.valueChanges,
      this.receiptFilters.controls.currencyId.valueChanges,
      this.receiptFilters.controls.collectionType.valueChanges,
      this.receiptFilters.controls.operationFrom.valueChanges,
      this.receiptFilters.controls.operationTo.valueChanges
    ).pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      if (this.page() === 'receipts') {
        this.loadReceipts();
      }
    });

    merge(
      this.invoiceFilters.controls.search.valueChanges.pipe(debounceTime(350), distinctUntilChanged()),
      this.invoiceFilters.controls.contractId.valueChanges,
      this.invoiceFilters.controls.counterpartyId.valueChanges,
      this.invoiceFilters.controls.invoiceType.valueChanges,
      this.invoiceFilters.controls.recoveryStatus.valueChanges,
      this.invoiceFilters.controls.currencyId.valueChanges,
      this.invoiceFilters.controls.from.valueChanges,
      this.invoiceFilters.controls.to.valueChanges
    ).pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      if (this.page() === 'invoices') {
        this.invoicePageNumber.set(1);
        this.loadInvoices();
      }
    });

    merge(
      this.remittanceFilters.controls.search.valueChanges.pipe(debounceTime(350), distinctUntilChanged()),
      this.remittanceFilters.controls.reinsurerSearch.valueChanges.pipe(debounceTime(350), distinctUntilChanged()),
      this.remittanceFilters.controls.reinsurerId.valueChanges,
      this.remittanceFilters.controls.contractSearch.valueChanges.pipe(debounceTime(350), distinctUntilChanged()),
      this.remittanceFilters.controls.contractId.valueChanges,
      this.remittanceFilters.controls.status.valueChanges,
      this.remittanceFilters.controls.currencyId.valueChanges,
      this.remittanceFilters.controls.from.valueChanges,
      this.remittanceFilters.controls.to.valueChanges
    ).pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      if (this.page() === 'remittances') {
        this.remittancePageNumber.set(1);
        this.clearRemittanceSelection();
        this.loadRemittances();
      }
    });

    this.bankAccountForm.controls.hasCorrespondentBank.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(hasCorrespondentBank => this.syncCorrespondentBankValidators(hasCorrespondentBank));

    this.receiptForm.controls.bankAccountSearch.valueChanges
      .pipe(debounceTime(300), distinctUntilChanged(), takeUntilDestroyed(this.destroyRef))
      .subscribe(value => this.handleReceiptBankAccountSearch(value));

    this.pairingForm.controls.invoiceSearch.valueChanges
      .pipe(debounceTime(300), distinctUntilChanged(), takeUntilDestroyed(this.destroyRef))
      .subscribe(value => this.handleInvoiceSearch(value));

    this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(params => {
      this.pendingReceiptId.set(this.getPositiveId(params.get('receiptId')));
      this.pendingRemittanceRef.set(this.getPositiveId(params.get('remittanceRef')));
      this.pendingNotificationId.set(this.getPositiveId(params.get('notificationId')));
      const closingId = this.getPositiveId(params.get('closingId'));
      if (closingId != null && this.role() === 'finance' && this.page() === 'disbursements') {
        this.pendingRemittanceRef.set(null);
        this.openClosingDisbursementModal(closingId);
      }
      this.openPendingReceiptIfAvailable();
      this.openPendingRemittanceIfAvailable();
    });
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.isReceiptBankAccountDropdownOpen()) {
      this.isReceiptBankAccountDropdownOpen.set(false);
      return;
    }

    if (this.isInvoiceDropdownOpen()) {
      this.isInvoiceDropdownOpen.set(false);
      return;
    }

    this.closeModal();
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }

    if (this.modal() === 'receipt' && !target.closest('[data-receipt-bank-account-combobox]')) {
      this.isReceiptBankAccountDropdownOpen.set(false);
    }

    if (this.modal() === 'pairing' && !target.closest('[data-invoice-combobox]')) {
      this.isInvoiceDropdownOpen.set(false);
    }
  }

  loadPage(): void {
    this.successMessage.set('');

    if (this.page() === 'dashboard') {
      this.loadCounterparties();
      this.loadReceipts();
      this.loadRemittances();
      if (this.role() === 'back-office') {
        this.loadInvoices();
      } else {
        this.invoices.set([]);
        this.invoiceError.set('');
      }
      return;
    }

    if (this.page() === 'receipts') {
      this.loadCounterparties();
      this.loadReceipts();
      return;
    }

    if (this.page() === 'bank-accounts') {
      this.loadCounterparties();
      return;
    }

    if (this.page() === 'disbursements' || this.page() === 'remittances') {
      if (this.page() === 'remittances') {
        this.loadCurrencies();
      }
      this.loadRemittances();
      return;
    }

    if (this.page() === 'invoices') {
      if (this.role() !== 'back-office') {
        this.invoices.set([]);
        this.invoiceError.set('Invoice listing is not available for the Finance Officer API.');
        return;
      }

      this.loadCurrencies();
      this.loadInvoices();
    }
  }

  loadReceipts(): void {
    this.isLoading.set(true);
    this.errorMessage.set('');
    this.receiptError.set('');
    const query = {
      pageNumber: 1,
      pageSize: 25,
      sortBy: this.role() === 'back-office' ? 'pairingStatus' : 'operationDate',
      sortDirection: 'asc' as const,
      search: this.receiptFilters.controls.search.value,
      pairingStatus: this.receiptFilters.controls.pairingStatus.value,
      counterpartyId: this.receiptFilters.controls.counterpartyId.value,
      currencyId: this.receiptFilters.controls.currencyId.value,
      collectionType: this.receiptFilters.controls.collectionType.value,
      operationFrom: this.receiptFilters.controls.operationFrom.value,
      operationTo: this.receiptFilters.controls.operationTo.value
    };

    const request = this.role() === 'finance'
      ? this.workflowService.getFinanceReceipts(query)
      : this.workflowService.getBackOfficeReceipts(query);

    request.subscribe({
      next: response => {
        const receipts = Array.isArray(response.items) ? response.items : [];
        this.receipts.set(this.role() === 'back-office' ? this.sortReceiptsForBackOffice(receipts) : receipts);
        this.totalReceipts.set(response.totalCount ?? receipts.length);
        this.isLoading.set(false);
        this.openPendingReceiptIfAvailable();
      },
      error: error => this.handleLoadError(error, 'Receipts could not be loaded.', this.receiptError)
    });
  }

  loadRemittances(): void {
    this.isLoading.set(true);
    this.errorMessage.set('');
    this.remittanceError.set('');
    if (this.role() === 'finance') {
      this.workflowService.getDisbursementQueue().subscribe({
        next: remittances => {
          this.remittances.set(Array.isArray(remittances) ? remittances : []);
          this.remittanceTotalCount.set(remittances.length);
          this.remittanceTotalPages.set(1);
          this.isLoading.set(false);
          this.openPendingRemittanceIfAvailable();
        },
        error: error => this.handleLoadError(error, 'Remittances could not be loaded.', this.remittanceError)
      });
      return;
    }

    this.workflowService.getBackOfficeRemittances({
      search: this.remittanceFilters.controls.search.value,
      reinsurer: this.remittanceFilters.controls.reinsurerSearch.value,
      reinsurerId: this.remittanceFilters.controls.reinsurerId.value,
      contract: this.remittanceFilters.controls.contractSearch.value,
      contractId: this.remittanceFilters.controls.contractId.value,
      status: this.remittanceFilters.controls.status.value,
      currencyId: this.remittanceFilters.controls.currencyId.value,
      dateFrom: this.remittanceFilters.controls.from.value,
      dateTo: this.remittanceFilters.controls.to.value,
      pageNumber: this.remittancePageNumber(),
      pageSize: this.remittancePageSize(),
      sortBy: 'createdAt',
      sortDirection: 'desc'
    }).subscribe({
      next: response => {
        const items = Array.isArray(response?.items) ? response.items : [];
        this.remittances.set(items);
        this.remittancePageNumber.set(response.pageNumber || 1);
        this.remittancePageSize.set(response.pageSize || 20);
        this.remittanceTotalCount.set(response.totalCount || 0);
        this.remittanceTotalPages.set(response.totalPages || Math.ceil((response.totalCount || 0) / (response.pageSize || 20)));
        this.isLoading.set(false);
        this.openPendingRemittanceIfAvailable();
      },
      error: error => this.handleLoadError(error, 'Remittances could not be loaded.', this.remittanceError)
    });
  }

  loadInvoices(): void {
    if (this.role() !== 'back-office') {
      this.invoices.set([]);
      this.invoiceError.set('Invoice listing is not available for the Finance Officer API.');
      return;
    }

    this.isLoading.set(true);
    this.errorMessage.set('');
    this.invoiceError.set('');
    this.workflowService.getInvoices({
      search: this.invoiceFilters.controls.search.value.trim()
        || this.invoiceFilters.controls.contractSearch.value.trim()
        || this.invoiceFilters.controls.cedentSearch.value.trim(),
      contractId: this.invoiceFilters.controls.contractId.value,
      cedentId: this.invoiceFilters.controls.counterpartyId.value,
      invoiceType: this.invoiceFilters.controls.invoiceType.value,
      paymentStatus: this.invoiceFilters.controls.recoveryStatus.value,
      currencyId: this.invoiceFilters.controls.currencyId.value,
      dateFrom: this.invoiceFilters.controls.from.value,
      dateTo: this.invoiceFilters.controls.to.value,
      pageNumber: this.invoicePageNumber(),
      pageSize: this.invoicePageSize()
    }).subscribe({
      next: response => {
        const items = Array.isArray(response?.items) ? response.items : [];
        this.invoices.set(items.map(invoice => ({
          ...invoice,
          idInvoice: invoice.idInvoice || invoice.invoiceId || 0,
          paymentStatus: invoice.paymentStatus?.trim() || invoice.recoveryStatus?.trim() || 'Unsettled',
          recoveryStatus: invoice.recoveryStatus?.trim() || invoice.paymentStatus?.trim() || 'Unsettled'
        })));
        this.invoicePageNumber.set(response.pageNumber || 1);
        this.invoicePageSize.set(response.pageSize || 20);
        this.invoiceTotalCount.set(response.totalCount || 0);
        this.invoiceTotalPages.set(response.totalPages || 0);
        this.isLoading.set(false);
      },
      error: error => {
        const body = error instanceof HttpErrorResponse && error.error && typeof error.error === 'object'
          ? error.error as Record<string, unknown>
          : null;
        const backendMessage = body?.['message'] ?? body?.['title'] ?? body?.['detail'];
        const status = error instanceof HttpErrorResponse ? error.status : null;
        const fallback = status === 500
          ? 'Invoice list request failed on the backend.'
          : status === 404
            ? 'The invoice list endpoint was not found.'
            : 'Invoices could not be loaded.';
        const message = typeof backendMessage === 'string' && backendMessage.trim()
          ? backendMessage
          : this.getErrorMessage(error, fallback);
        this.invoiceError.set(status === null ? message : `HTTP ${status}: ${message}`);
        this.errorMessage.set(message);
        this.isLoading.set(false);
      }
    });
  }

  hasInvoiceFilters(): boolean {
    const filters = this.invoiceFilters.getRawValue();
    return Boolean(
      filters.search.trim() || filters.contractSearch.trim() || filters.cedentSearch.trim() ||
      filters.contractId || filters.counterpartyId ||
      filters.invoiceType.trim() || filters.recoveryStatus.trim() || filters.currencyId ||
      filters.from.trim() || filters.to.trim()
    );
  }

  goToInvoicePage(pageNumber: number): void {
    const target = Math.min(Math.max(pageNumber, 1), Math.max(this.invoiceTotalPages(), 1));
    if (target === this.invoicePageNumber()) return;
    this.invoicePageNumber.set(target);
    this.loadInvoices();
  }

  hasRemittanceFilters(): boolean {
    const filters = this.remittanceFilters.getRawValue();
    return Boolean(
      filters.search.trim() || filters.reinsurerSearch.trim() || filters.reinsurerId ||
      filters.contractSearch.trim() || filters.contractId || filters.status.trim() ||
      filters.currencyId || filters.from.trim() || filters.to.trim()
    );
  }

  clearRemittanceFilters(): void {
    this.remittanceFilters.reset({
      search: '',
      reinsurerSearch: '',
      reinsurerId: null,
      contractSearch: '',
      contractId: null,
      status: '',
      currencyId: null,
      from: '',
      to: ''
    });
    this.remittancePageNumber.set(1);
    this.clearRemittanceSelection();
    this.loadRemittances();
  }

  goToRemittancePage(pageNumber: number): void {
    const target = Math.min(Math.max(pageNumber, 1), Math.max(this.remittanceTotalPages(), 1));
    if (target === this.remittancePageNumber()) return;
    this.remittancePageNumber.set(target);
    this.clearRemittanceSelection();
    this.loadRemittances();
  }

  onRemittanceReinsurerFilterInput(): void {
    const label = this.remittanceFilters.controls.reinsurerSearch.value.trim();
    const match = this.remittanceReinsurerOptions().find(option => option.label === label);
    this.remittanceFilters.controls.reinsurerId.setValue(match?.reinsurerId ?? null);
  }

  onRemittanceContractFilterInput(): void {
    const label = this.remittanceFilters.controls.contractSearch.value.trim();
    const match = this.remittanceContractOptions().find(option => option.label === label);
    this.remittanceFilters.controls.contractId.setValue(match?.contractId ?? null);
  }

  loadCounterparties(): void {
    this.errorMessage.set('');
    this.counterpartiesService.getFinanceCounterparties({ pageNumber: 1, pageSize: 50 }).subscribe({
      next: response => this.counterparties.set(response.items ?? []),
      error: error => {
        this.counterparties.set([]);
        this.errorMessage.set(this.getErrorMessage(error, 'Counterparties could not be loaded.'));
      }
    });
  }

  openReceiptModal(): void {
    this.loadReceiptBankAccountOptions();
    this.receiptForm.reset({
      bankAccountSearch: '',
      bankAccountId: null,
      receiptMonth: this.currentMonth(),
      amountReceived: null,
      settlementMethod: 'BankTransfer',
      collectionType: 'Premium'
    });
    this.receiptBankAccountQuery.set('');
    this.highlightedReceiptBankAccountIndex.set(0);
    this.modal.set('receipt');
  }

  openReceiptBankAccountDropdown(): void {
    this.isReceiptBankAccountDropdownOpen.set(true);
    this.loadReceiptBankAccountOptions();
  }

  onReceiptBankAccountKeydown(event: KeyboardEvent): void {
    const options = this.filteredReceiptBankAccounts();
    if (!options.length) {
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      this.isReceiptBankAccountDropdownOpen.set(true);
      this.highlightedReceiptBankAccountIndex.update(index => Math.min(index + 1, options.length - 1));
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      this.highlightedReceiptBankAccountIndex.update(index => Math.max(index - 1, 0));
      return;
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      this.selectReceiptBankAccount(options[this.highlightedReceiptBankAccountIndex()] ?? options[0]);
    }
  }

  selectReceiptBankAccount(account: BankAccountResponse): void {
    this.receiptForm.patchValue({
      bankAccountSearch: this.getReceiptBankAccountOptionLabel(account),
      bankAccountId: account.idBankAccount
    }, { emitEvent: false });
    this.receiptBankAccountQuery.set(this.getReceiptBankAccountOptionLabel(account));
    this.isReceiptBankAccountDropdownOpen.set(false);
    this.highlightedReceiptBankAccountIndex.set(0);
  }

  clearReceiptBankAccountSelection(): void {
    this.receiptForm.patchValue({
      bankAccountSearch: '',
      bankAccountId: null
    }, { emitEvent: false });
    this.receiptBankAccountQuery.set('');
    this.isReceiptBankAccountDropdownOpen.set(true);
  }

  private handleReceiptBankAccountSearch(value: string): void {
    const selectedAccount = this.selectedReceiptBankAccount();
    const selectedLabel = selectedAccount ? this.getReceiptBankAccountOptionLabel(selectedAccount) : '';
    this.receiptBankAccountQuery.set(value);
    this.highlightedReceiptBankAccountIndex.set(0);

    if (!value.trim()) {
      this.receiptForm.controls.bankAccountId.setValue(null, { emitEvent: false });
      this.isReceiptBankAccountDropdownOpen.set(true);
      return;
    }

    if (selectedLabel && value !== selectedLabel) {
      this.receiptForm.controls.bankAccountId.setValue(null, { emitEvent: false });
    }

    const exactAccount = this.findReceiptBankAccountBySearch(value);
    if (exactAccount) {
      this.receiptForm.controls.bankAccountId.setValue(exactAccount.idBankAccount, { emitEvent: false });
    }

    if (this.lastReceiptBankAccountSearch !== value) {
      this.lastReceiptBankAccountSearch = value;
      this.loadReceiptBankAccountOptions();
    }
  }

  private resolveReceiptBankAccountSelection(): BankAccountResponse | null {
    const selectedAccount = this.selectedReceiptBankAccount();
    if (selectedAccount) {
      return selectedAccount;
    }

    const account = this.findReceiptBankAccountBySearch(this.receiptForm.controls.bankAccountSearch.value);
    if (!account) {
      return null;
    }

    this.receiptForm.controls.bankAccountId.setValue(account.idBankAccount, { emitEvent: false });
    this.receiptForm.controls.bankAccountId.updateValueAndValidity({ emitEvent: false });
    return account;
  }

  private findReceiptBankAccountBySearch(value: string): BankAccountResponse | null {
    const normalizedValue = this.normalizeSearchText(value);
    const compactValue = normalizedValue.replace(/\s+/g, '');

    if (!normalizedValue) {
      return null;
    }

    return this.activeReceiptBankAccounts().find(account => {
      const label = this.normalizeSearchText(this.getReceiptBankAccountOptionLabel(account));
      return label === normalizedValue || label.replace(/\s+/g, '') === compactValue;
    }) ?? null;
  }

  private loadReceiptBankAccountOptions(): void {
    if (this.hasLoadedReceiptBankAccounts() || this.isReceiptBankAccountLoading()) {
      return;
    }

    const counterpartyIds = this.counterparties()
      .map(counterparty => this.getPositiveId(counterparty.id))
      .filter((id): id is number => id != null);

    if (!counterpartyIds.length) {
      this.allReceiptBankAccounts.set([]);
      this.hasLoadedReceiptBankAccounts.set(true);
      return;
    }

    this.isReceiptBankAccountLoading.set(true);
    this.errorMessage.set('');

    forkJoin(counterpartyIds.map(counterpartyId => this.workflowService.getBankAccounts(counterpartyId))).subscribe({
      next: accountGroups => {
        const uniqueAccounts = new Map<number, BankAccountResponse>();
        accountGroups.flat().forEach(account => {
          const accountId = this.getPositiveId(account.idBankAccount);
          if (accountId != null) {
            uniqueAccounts.set(accountId, account);
          }
        });

        this.allReceiptBankAccounts.set([...uniqueAccounts.values()]);
        this.hasLoadedReceiptBankAccounts.set(true);
        this.isReceiptBankAccountLoading.set(false);
      },
      error: error => {
        this.errorMessage.set(this.getErrorMessage(error, 'Active bank accounts could not be loaded.'));
        this.isReceiptBankAccountLoading.set(false);
      }
    });
  }

  private clearReceiptBankAccountCache(): void {
    this.allReceiptBankAccounts.set([]);
    this.hasLoadedReceiptBankAccounts.set(false);
    this.lastReceiptBankAccountSearch = '';
  }

  openInvoiceDropdown(): void {
    this.isInvoiceDropdownOpen.set(true);
  }

  onInvoiceKeydown(event: KeyboardEvent): void {
    const options = this.filteredEligibleInvoices();
    if (!options.length) {
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      this.isInvoiceDropdownOpen.set(true);
      this.highlightedInvoiceIndex.update(index => Math.min(index + 1, options.length - 1));
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      this.highlightedInvoiceIndex.update(index => Math.max(index - 1, 0));
      return;
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      this.selectInvoice(options[this.highlightedInvoiceIndex()] ?? options[0]);
    }
  }

  selectInvoice(invoice: EligibleInvoice): void {
    const invoiceId = this.getPositiveId(invoice.invoiceId ?? invoice.idInvoice);
    if (invoiceId == null) {
      this.pairingForm.controls.invoiceId.setValue(null, { emitEvent: false });
      this.pairingForm.controls.invoiceId.setErrors({ required: true });
      return;
    }

    this.pairingForm.patchValue({
      invoiceSearch: this.getEligibleInvoiceLabel(invoice),
      invoiceId,
      allocatedAmount: this.proposedAllocations()[invoiceId] ?? this.getSuggestedAllocationAmount(invoice)
    }, { emitEvent: false });
    this.toggleInvoiceAllocation(invoice, true);
    this.invoiceQuery.set(this.getEligibleInvoiceLabel(invoice));
    this.isInvoiceDropdownOpen.set(false);
    this.highlightedInvoiceIndex.set(0);
  }

  isInvoiceChecked(invoice: EligibleInvoice): boolean {
    return this.proposedAllocations()[invoice.invoiceId] != null;
  }

  toggleInvoiceAllocation(invoice: EligibleInvoice, checked: boolean): void {
    const invoiceId = this.getPositiveId(invoice.invoiceId);
    if (invoiceId == null) {
      return;
    }

    const next = { ...this.proposedAllocations() };
    if (checked) {
      next[invoiceId] = next[invoiceId] ?? this.getSuggestedAllocationAmount(invoice);
    } else {
      delete next[invoiceId];
    }
    this.proposedAllocations.set(next);
  }

  updateInvoiceAllocation(invoice: EligibleInvoice, event: Event): void {
    const invoiceId = this.getPositiveId(invoice.invoiceId);
    if (invoiceId == null || !(event.target instanceof HTMLInputElement)) {
      return;
    }

    const next = { ...this.proposedAllocations() };
    const requestedAmount = Number(event.target.value);
    const outstandingAmount = this.getEligibleInvoiceOutstandingAmount(invoice);
    next[invoiceId] = Number.isFinite(requestedAmount)
      ? Math.min(Math.max(requestedAmount, 0), outstandingAmount)
      : 0;
    this.proposedAllocations.set(next);
  }

  getProposedAllocationAmount(invoice: EligibleInvoice): number | null {
    return this.proposedAllocations()[invoice.invoiceId] ?? null;
  }

  clearInvoiceSelection(): void {
    this.pairingForm.patchValue({
      invoiceSearch: '',
      invoiceId: null
    }, { emitEvent: false });
    this.invoiceQuery.set('');
    this.isInvoiceDropdownOpen.set(true);
  }

  private handleInvoiceSearch(value: string): void {
    const selectedInvoice = this.selectedInvoice();
    const selectedLabel = selectedInvoice ? this.getEligibleInvoiceLabel(selectedInvoice) : '';
    this.invoiceQuery.set(value);
    this.highlightedInvoiceIndex.set(0);

    if (!value.trim()) {
      this.pairingForm.controls.invoiceId.setValue(null, { emitEvent: false });
      this.isInvoiceDropdownOpen.set(true);
      return;
    }

    if (selectedLabel && value !== selectedLabel) {
      this.pairingForm.controls.invoiceId.setValue(null, { emitEvent: false });
    }

    this.isInvoiceDropdownOpen.set(true);
  }

  private openPendingReceiptIfAvailable(): void {
    const receiptId = this.pendingReceiptId();
    if (!receiptId || this.role() !== 'back-office' || this.modal() === 'pairing') {
      return;
    }

    const receipt = this.receipts().find(item => item.idBankReceipt === receiptId);
    if (receipt) {
      this.pendingReceiptId.set(null);
      this.openPairingModal(receipt);
      return;
    }

    if (this.receipts().length) {
      this.pendingReceiptId.set(null);
      this.workflowService.getReceipt(receiptId, 'back-office').subscribe({
        next: loadedReceipt => this.openPairingModal(loadedReceipt),
        error: error => this.errorMessage.set(this.getErrorMessage(error, 'Receipt could not be loaded for pairing.'))
      });
    }
  }

  private openPendingRemittanceIfAvailable(): void {
    const remittanceRef = this.pendingRemittanceRef();
    if (!remittanceRef || this.page() !== 'disbursements') {
      return;
    }

    const remittance = this.remittances().find(item => item.remittanceRef === remittanceRef);
    if (!remittance) {
      return;
    }

    this.pendingRemittanceRef.set(null);
    if (this.pendingNotificationId() != null) {
      this.workflowService.markNotificationRead(this.pendingNotificationId()!).subscribe({
        next: () => this.pendingNotificationId.set(null),
        error: error => this.errorMessage.set(this.getErrorMessage(error, 'Notification could not be marked as read.'))
      });
    }
    this.openDisbursementModal(remittance);
  }

  openBankAccounts(counterparty: FinanceCounterpartyListItem): void {
    const counterpartyId = this.getPositiveId(counterparty.id);

    if (counterpartyId == null) {
      this.errorMessage.set('This counterparty is missing a valid backend ID.');
      return;
    }

    this.selectedCounterparty.set(counterparty);
    this.selectedCounterpartyDetails.set(null);
    this.selectedBankAccount.set(null);
    this.resetBankAccountForm();
    this.modal.set('bank-account');
    this.loadCurrencies();
    this.loadCounterpartyDetails(counterpartyId);
    this.loadBankAccounts(counterpartyId);
  }

  loadBankAccounts(counterpartyId: number): void {
    if (this.modal() === 'disbursement' && this.loadingDisbursementBankAccountsCounterpartyId === counterpartyId) {
      return;
    }

    this.disbursementBankAccountsSubscription?.unsubscribe();
    this.loadingDisbursementBankAccountsCounterpartyId = this.modal() === 'disbursement' ? counterpartyId : null;
    this.isBankAccountLoading.set(true);
    const subscription = this.workflowService.getBankAccounts(counterpartyId).pipe(
      take(1),
      finalize(() => {
        this.isBankAccountLoading.set(false);
        this.disbursementBankAccountsSubscription = null;
        this.loadingDisbursementBankAccountsCounterpartyId = null;
      })
    ).subscribe({
      next: accounts => {
        this.bankAccounts.set(accounts);
      },
      error: error => {
        const message = this.getErrorMessage(error, 'Bank accounts could not be loaded.');
        this.errorMessage.set(message);
        if (this.modal() === 'disbursement') {
          this.disbursementLoadError.set(message);
        }
      }
    });
    this.disbursementBankAccountsSubscription = this.modal() === 'disbursement' && !subscription.closed ? subscription : null;
  }

  loadDisbursementContext(remittanceRef: number): void {
    if (this.loadingDisbursementContextRef === remittanceRef) {
      return;
    }

    this.disbursementContextSubscription?.unsubscribe();
    this.loadingDisbursementContextRef = remittanceRef;
    this.isLoadingContext.set(true);
    const subscription = this.workflowService.getDisbursementContext(remittanceRef).pipe(
      take(1),
      finalize(() => {
        this.isLoadingContext.set(false);
        this.loadingDisbursementContextRef = null;
      })
    ).subscribe({
      next: context => {
        this.disbursementContextSubscription = null;
        if (context.closingId != null && context.closingId > 0) {
          this.openClosingDisbursementModal(context.closingId);
          return;
        }
        this.disbursementContext.set(context);
        const current = this.selectedRemittance();
        if (!current || this.getRemittanceId(current) !== remittanceRef) {
          return;
        }

        const updated: RemittanceResponse = {
          ...current,
          contractId: context.contractId ?? current.contractId,
          contractName: context.contractName ?? current.contractName,
          umr: context.umr ?? current.umr,
          cedentName: context.cedentName ?? current.cedentName,
          panelId: context.panelId ?? current.panelId,
          counterpartyId: context.reinsurerId ?? current.counterpartyId,
          counterpartyName: context.reinsurerName || current.counterpartyName,
          grossPremium: context.grossPremium ?? current.grossPremium,
          otherDeductions: context.deductions ?? current.otherDeductions,
          netPayableAmount: context.netPayableAmount ?? current.netPayableAmount,
          currencyCode: context.currencyCode || current.currencyCode,
          status: context.status || current.status,
          disbursementId: context.disbursementId ?? current.disbursementId,
          invoiceId: context.invoiceId ?? current.invoiceId,
          invoiceDownloadUrl: context.invoiceDownloadUrl ?? current.invoiceDownloadUrl,
          transferCompletedAt: context.closedAt ?? current.transferCompletedAt
        };
        this.selectedRemittance.set(updated);
        this.remittances.update(items => items.map(item => item.remittanceRef === remittanceRef ? updated : item));
        if (this.isPaymentInProgress(updated.status) && this.getActualDisbursementId(updated) === null) {
          const message = 'Backend disbursement DTO did not include a real disbursementId for this payment in progress remittance.';
          this.disbursementLoadError.set(message);
          this.errorMessage.set(message);
        }
      },
      error: error => {
        this.disbursementContextSubscription = null;
        const message = this.getErrorMessage(error, 'Disbursement context could not be loaded.');
        this.disbursementLoadError.set(message);
        this.errorMessage.set(message);
      }
    });
    this.disbursementContextSubscription = subscription.closed ? null : subscription;
  }

  loadCounterpartyDetails(counterpartyId: number): void {
    this.isBeneficiaryLoading.set(true);
    this.counterpartiesService.getCounterpartyById(counterpartyId).subscribe({
      next: counterparty => {
        this.selectedCounterpartyDetails.set(counterparty);
        this.isBeneficiaryLoading.set(false);
      },
      error: error => {
        this.errorMessage.set(this.getErrorMessage(error, 'Beneficiary information could not be loaded.'));
        this.isBeneficiaryLoading.set(false);
      }
    });
  }

  openPairingModal(receipt: BankReceiptResponse): void {
    this.selectedReceipt.set(receipt);
    this.selectedPairingBankAccount.set(null);
    this.generatedRemittances.set([]);
    this.proposedAllocations.set({});
    this.invoiceQuery.set('');
    this.highlightedInvoiceIndex.set(0);
    this.pairingForm.reset({
      invoiceSearch: '',
      invoiceId: null,
      allocatedAmount: null
    });
    this.modal.set('pairing');
    this.loadEligibleInvoices(receipt);
    this.workflowService.getBankAccounts(receipt.counterpartyId).subscribe({
      next: accounts => this.selectedPairingBankAccount.set(accounts.find(account => account.idBankAccount === receipt.bankAccountId) ?? null),
      error: error => this.errorMessage.set(this.getErrorMessage(error, 'Bank account details could not be loaded.'))
    });
  }

  receiptDocumentContext(receipt: BankReceiptResponse | null): DocumentContext | null {
    const receiptId = this.getPositiveId(receipt?.idBankReceipt);
    return receiptId == null ? null : { scope: 'receipt', receiptId };
  }

  retryEligibleInvoices(): void {
    this.loadEligibleInvoices();
  }

  private loadEligibleInvoices(receipt = this.selectedReceipt()): void {
    if (!receipt) {
      return;
    }

    this.eligibleInvoicesLoadState.set('loading');
    this.eligibleInvoicesError.set('');
    this.eligibleInvoicesHttpStatus.set(null);
    this.eligibleInvoices.set([]);
    this.proposedAllocations.set({});

    this.workflowService.getEligibleInvoices(receipt.idBankReceipt).subscribe({
      next: result => {
        this.eligibleInvoices.set(result.items);
        this.eligibleInvoicesHttpStatus.set(result.status);
        this.eligibleInvoicesLoadState.set(result.items.length ? 'loaded' : 'empty');
      },
      error: (error: HttpErrorResponse) => {
        this.eligibleInvoices.set([]);
        this.eligibleInvoicesHttpStatus.set(error.status);
        this.eligibleInvoicesLoadState.set('failed');
        const message = error.status === 0
          ? 'Unable to load invoices because the backend is unavailable.'
          : this.getErrorMessage(error, 'Unable to load eligible invoices.');
        this.eligibleInvoicesError.set(message);
        console.error('Eligible invoices request failed', {
          status: error.status,
          url: error.url,
          message: error.message
        });
      }
    });
  }

  openDisbursementModal(remittance: RemittanceResponse): void {
    if (remittance.closingId != null && remittance.closingId > 0) {
      this.openClosingDisbursementModal(remittance.closingId);
      return;
    }
    this.selectedClosingId.set(null);
    this.closingContext.set(null);
    const remittanceId = this.getRemittanceId(remittance);
    const selected = this.selectedRemittance();
    if (this.modal() === 'disbursement'
      && selected
      && this.getRemittanceId(selected) === remittanceId
      && (this.disbursementContext()?.remittanceId === remittanceId || this.loadingDisbursementContextRef === remittanceId)) {
      return;
    }

    this.cancelDisbursementModalRequests();
    this.selectedRemittance.set(remittance);
    this.completedDisbursement.set(null);
    this.disbursementContext.set(null);
    this.disbursementLoadError.set('');
    this.isTransferConfirmationOpen.set(false);
    this.bankAccounts.set([]);
    this.modal.set('disbursement');
    this.loadDisbursementContext(remittanceId);
    this.loadBankAccounts(remittance.counterpartyId);
  }

  openRemittanceConfirmation(remittance: RemittanceResponse): void {
    this.remittanceToConfirm.set(remittance);
    this.modal.set('remittance-confirmation');
  }

  openClosingDisbursementModal(closingId: number): void {
    if (this.modal() === 'disbursement' && this.selectedClosingId() === closingId) {
      return;
    }
    this.cancelDisbursementModalRequests();
    this.selectedRemittance.set(null);
    this.disbursementContext.set(null);
    this.closingContext.set(null);
    this.selectedClosingId.set(closingId);
    this.disbursementLoadError.set('');
    this.isTransferConfirmationOpen.set(false);
    this.modal.set('disbursement');
    this.isLoadingContext.set(true);
    const subscription = this.workflowService.getClosingDisbursementContext(closingId).pipe(
      take(1), takeUntilDestroyed(this.destroyRef), finalize(() => this.isLoadingContext.set(false))
    ).subscribe({
      next: context => {
        if (this.selectedClosingId() !== closingId) return;
        if (context.closingId !== closingId) {
          this.disbursementLoadError.set('The backend returned a different closing.');
          return;
        }
        this.closingContext.set(context);
        const notificationId = this.pendingNotificationId();
        if (notificationId != null) {
          this.workflowService.markNotificationRead(notificationId).pipe(take(1)).subscribe({
            next: () => this.pendingNotificationId.set(null),
            error: error => this.errorMessage.set(this.getErrorMessage(error, 'Notification could not be marked as read.'))
          });
        }
      },
      error: error => this.disbursementLoadError.set(this.getErrorMessage(error, 'Closing context could not be loaded.'))
    });
    this.disbursementContextSubscription = subscription.closed ? null : subscription;
  }

  startClosingPayment(): void {
    const context = this.closingContext();
    if (!context?.canStartPayment || this.isSubmitting()) return;
    this.submit(() => this.workflowService.startClosingDisbursement(context.closingId), 'Closing payment started.', updated => {
      this.closingContext.set(updated);
      this.loadRemittances();
    }, false);
  }

  confirmClosingPayment(): void {
    const context = this.closingContext();
    if (!context?.canConfirmTransfer || this.isSubmitting()) return;
    if (!window.confirm(`Confirm transfer of ${this.formatMoney(context.totalClosingAmount, context.currencyCode)} to ${context.reinsurerName}?`)) return;
    this.submit(() => this.workflowService.confirmClosingTransfer(context.closingId), 'Closing payment confirmed.', updated => {
      this.closingContext.set(updated);
      this.loadRemittances();
    }, false);
  }

  downloadFinanceClosing(): void {
    const context = this.closingContext();
    if (!context?.canDownloadPdf || this.isDownloadingClosing()) return;
    this.isDownloadingClosing.set(true);
    this.workflowService.downloadFinanceClosing(context.closingId).pipe(
      take(1), takeUntilDestroyed(this.destroyRef), finalize(() => this.isDownloadingClosing.set(false))
    ).subscribe({
      next: file => this.saveDownloadedFile(file, `IRIS-${context.closingReference}.pdf`),
      error: error => this.errorMessage.set(this.getErrorMessage(error, 'Closing PDF could not be downloaded.'))
    });
  }

  closeModal(): void {
    if (this.isSubmitting()) {
      return;
    }

    if (this.modal() === 'receipt' && this.receiptForm.dirty && !window.confirm('You have unsaved encaissement changes. Close this modal?')) {
      return;
    }

    if (this.modal() === 'bank-account' && this.bankAccountForm.dirty && !window.confirm('You have unsaved bank-account changes. Close this modal?')) {
      return;
    }

    this.forceCloseModal();
  }

  onModalBackdropClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) {
      this.closeModal();
    }
  }

  forceCloseModal(): void {
    this.modal.set(null);
    this.cancelDisbursementModalRequests();
    this.selectedClosingId.set(null);
    this.closingContext.set(null);
    this.selectedReceipt.set(null);
    this.selectedRemittance.set(null);
    this.remittanceToConfirm.set(null);
    this.completedDisbursement.set(null);
    this.disbursementContext.set(null);
    this.disbursementLoadError.set('');
    this.isTransferConfirmationOpen.set(false);
    this.selectedCounterparty.set(null);
    this.selectedCounterpartyDetails.set(null);
    this.selectedBankAccount.set(null);
    this.eligibleInvoices.set([]);
    this.eligibleInvoicesLoadState.set('idle');
    this.eligibleInvoicesError.set('');
    this.eligibleInvoicesHttpStatus.set(null);
    this.generatedRemittances.set([]);
    this.selectedPairingBankAccount.set(null);
    this.isInvoiceDropdownOpen.set(false);
  }

  createReceipt(): void {
    this.resolveReceiptBankAccountSelection();

    if (this.receiptForm.invalid || this.isSubmitting()) {
      this.receiptForm.markAllAsTouched();
      this.receiptForm.updateValueAndValidity();
      return;
    }

    const raw = this.receiptForm.getRawValue();
    const account = this.selectedReceiptBankAccount();
    if (!account) {
      this.receiptForm.controls.bankAccountId.setErrors({ required: true });
      return;
    }

    this.submit(() => this.workflowService.createReceipt({
      bankAccountId: raw.bankAccountId!,
      amountReceived: raw.amountReceived!,
      receiptMonth: raw.receiptMonth,
      settlementMethod: raw.settlementMethod,
      collectionType: raw.collectionType
    }), 'Encaissement created and sent to the Back Officer for pairing.', () => this.loadReceipts());
  }

  saveBankAccount(): void {
    const counterparty = this.selectedCounterparty();
    const counterpartyId = this.getPositiveId(counterparty?.id);
    if (!counterparty || this.bankAccountForm.invalid || this.isSubmitting()) {
      this.bankAccountForm.markAllAsTouched();
      return;
    }

    if (counterpartyId == null) {
      this.errorMessage.set('This counterparty is missing a valid backend ID.');
      return;
    }

    const raw = this.bankAccountForm.getRawValue();
    const account = this.selectedBankAccount();
    const request = {
      counterpartyId,
      currencyId: raw.currencyId!,
      bankName: raw.bankName.trim(),
      bankCity: raw.bankCity.trim(),
      bankCountry: raw.bankCountry.trim(),
      agencyCode: this.nullable(raw.agencyCode) ?? account?.agencyCode ?? null,
      rib: this.nullable(raw.rib) ?? account?.rib ?? null,
      iban: this.normalizeAccountCode(raw.iban),
      swiftBic: this.normalizeAccountCode(raw.swiftBic),
      hasCorrespondentBank: raw.hasCorrespondentBank,
      correspondentBankName: raw.hasCorrespondentBank ? this.nullable(raw.correspondentBankName) : null,
      correspondentSwiftBic: raw.hasCorrespondentBank ? this.normalizeAccountCode(raw.correspondentSwiftBic) : null,
      accountLabel: this.nullable(raw.accountLabel) ?? account?.accountLabel ?? null,
      isDefault: account?.isDefault ?? false,
      isActive: raw.isActive
    };
    const requestFactory = account
      ? () => this.workflowService.updateBankAccount(counterpartyId, account.idBankAccount, request)
      : () => this.workflowService.createBankAccount(counterpartyId, request);

    this.submit(requestFactory, account ? 'Bank account updated successfully.' : 'Bank account saved successfully.', () => {
      this.clearReceiptBankAccountCache();
      this.loadBankAccounts(counterpartyId);
      this.loadCounterparties();
      this.selectedBankAccount.set(null);
      this.resetBankAccountForm();
    }, false);
  }

  editBankAccount(account: BankAccountResponse): void {
    this.selectedBankAccount.set(account);
    this.bankAccountForm.reset({
      currencyId: account.currencyId,
      currencySearch: this.getCurrencyLabel(account.currencyId, account.currencyCode),
      bankName: account.bankName,
      bankCity: account.bankCity ?? '',
      bankCountry: account.bankCountry ?? '',
      agencyCode: account.agencyCode ?? '',
      rib: account.rib ?? '',
      iban: account.iban ?? '',
      swiftBic: account.swiftBic ?? '',
      accountLabel: account.accountLabel ?? '',
      hasCorrespondentBank: account.hasCorrespondentBank,
      correspondentBankName: account.correspondentBankName ?? '',
      correspondentSwiftBic: account.correspondentSwiftBic ?? '',
      isActive: account.isActive
    });
    this.syncCorrespondentBankValidators(account.hasCorrespondentBank);
    this.bankAccountForm.markAsPristine();
  }

  resetBankAccountForm(): void {
    this.selectedBankAccount.set(null);
    this.bankAccountForm.reset({
      currencyId: null,
      currencySearch: '',
      bankName: '',
      bankCity: '',
      bankCountry: '',
      agencyCode: '',
      rib: '',
      iban: '',
      swiftBic: '',
      accountLabel: '',
      hasCorrespondentBank: false,
      correspondentBankName: '',
      correspondentSwiftBic: '',
      isActive: true
    });
    this.syncCorrespondentBankValidators(false);
    this.bankAccountForm.markAsPristine();
  }

  onCurrencySearchInput(event: Event): void {
    const value = event.target instanceof HTMLInputElement ? event.target.value : '';
    const normalizedValue = value.trim().toLowerCase();
    const currency = this.currencies().find(item => {
      const label = this.getCurrencyLabel(item.id).toLowerCase();
      return label === normalizedValue || item.code.toLowerCase() === normalizedValue;
    });

    this.bankAccountForm.controls.currencyId.setValue(currency?.id ?? null);
    this.bankAccountForm.controls.currencyId.markAsTouched();
  }

  setBankAccountStatus(account: BankAccountResponse, isActive: boolean): void {
    this.workflowService.setBankAccountStatus(account.idCounterparty, account.idBankAccount, isActive).subscribe({
      next: () => {
        this.clearReceiptBankAccountCache();
        this.loadBankAccounts(account.idCounterparty);
        this.loadCounterparties();
      },
      error: error => this.errorMessage.set(this.getErrorMessage(error, 'Bank account status could not be changed.'))
    });
  }

  allocateReceipt(): void {
    const receipt = this.selectedReceipt();
    const selectedInvoiceId = this.getPositiveId(this.pairingForm.controls.invoiceId.value);
    const selectedAmount = Number(this.pairingForm.controls.allocatedAmount.value);
    if (selectedInvoiceId != null && Number.isFinite(selectedAmount) && selectedAmount > 0 && this.proposedAllocations()[selectedInvoiceId] != null) {
      this.proposedAllocations.update(allocations => ({
        ...allocations,
        [selectedInvoiceId]: Math.min(selectedAmount, this.getEligibleInvoiceOutstandingAmountById(selectedInvoiceId))
      }));
    }
    const allocations = this.proposedAllocationItems()
      .map(item => ({
        invoiceId: item.invoiceId,
        allocatedAmount: Number(item.allocatedAmount)
      }))
      .filter(item => Number.isFinite(item.allocatedAmount) && item.allocatedAmount > 0);

    if (!receipt || this.isSubmitting() || !this.isPairingFormValid()) {
      return;
    }

    if (!window.confirm('Confirm pairing this encaissement with the selected invoice(s)?')) {
      return;
    }

    const payload = { allocations };
    console.debug('Pair Encaissement allocation payload', payload);

    this.submit(() => this.workflowService.allocateReceiptInvoices(receipt.idBankReceipt, payload), 'Encaissement paired successfully.', response => {
      this.selectedReceipt.set(response);
      this.generatedRemittances.set(response.generatedRemittances ?? response.remittances ?? []);
      this.loadReceipts();
      this.loadInvoices();
      this.loadRemittances();
      const notificationId = this.pendingNotificationId();
      if (notificationId != null) {
        this.workflowService.markNotificationRead(notificationId).subscribe({
          error: error => this.errorMessage.set(this.getErrorMessage(error, 'Notification could not be marked as read.'))
        });
      }
    }, false);
  }

  confirmRemittance(remittance: RemittanceResponse): void {
    this.openRemittanceConfirmation(remittance);
  }

  confirmSelectedRemittance(): void {
    const remittance = this.remittanceToConfirm();
    if (!remittance || this.isSubmitting()) {
      return;
    }

    this.submit(() => this.workflowService.confirmRemittance(remittance.remittanceRef), 'Remittance sent to Finance for disbursement.', response => {
      const updated = {
        ...remittance,
        ...response,
        status: 'Awaiting Finance Disbursement'
      };
      this.remittances.update(items => items.map(item => item.remittanceRef === remittance.remittanceRef ? updated : item));
      this.remittanceToConfirm.set(null);
    });
  }

  isRemittanceSelected(remittance: RemittanceResponse): boolean {
    return this.selectedRemittanceIds().has(this.getRemittanceId(remittance));
  }

  canSelectRemittance(remittance: RemittanceResponse): boolean {
    if (!this.isOutgoingClosingEligible(remittance)) {
      return false;
    }

    const lock = this.selectedRemittanceLock();
    return !lock
      || (lock.reinsurerId === this.getRemittanceReinsurerId(remittance) && lock.currencyCode === remittance.currencyCode);
  }

  getRemittanceSelectionDisabledReason(remittance: RemittanceResponse): string {
    if (!this.isOutgoingClosingEligible(remittance)) {
      if (remittance.closingId || remittance.closingReference || remittance.closingIssuedDate) {
        return 'This row is already included in a closing.';
      }

      return 'This remittance is not eligible for closing.';
    }

    const lock = this.selectedRemittanceLock();
    if (lock && (lock.reinsurerId !== this.getRemittanceReinsurerId(remittance) || lock.currencyCode !== remittance.currencyCode)) {
      return 'Select remittances for the same reinsurer and currency only.';
    }

    return '';
  }

  toggleRemittanceSelection(remittance: RemittanceResponse, checked: boolean): void {
    const remittanceId = this.getRemittanceId(remittance);
    if (checked && !this.canSelectRemittance(remittance)) {
      return;
    }

    this.selectedRemittanceIds.update(ids => {
      const next = new Set(ids);
      checked ? next.add(remittanceId) : next.delete(remittanceId);
      return next;
    });
  }

  clearRemittanceSelection(): void {
    this.selectedRemittanceIds.set(new Set());
  }

  printSelectedClosing(): void {
    const ids = [...this.selectedRemittanceIds()];
    if (!ids.length || this.isGeneratingClosing()) {
      return;
    }

    this.isGeneratingClosing.set(true);
    this.errorMessage.set('');
    this.successMessage.set('');
    this.workflowService.createOutgoingClosing({ remittanceIds: ids }).pipe(
      finalize(() => this.isGeneratingClosing.set(false))
    ).subscribe({
      next: file => {
        this.saveDownloadedFile(file, 'outgoing-closing.pdf');
        this.successMessage.set('Closing generated successfully.');
        this.clearRemittanceSelection();
        this.loadRemittances();
        this.refreshNotifications();
      },
      error: (error: HttpErrorResponse) => this.setDownloadError(error, 'Closing could not be generated.')
    });
  }

  downloadClosing(remittance: RemittanceResponse): void {
    const closingId = this.getPositiveId(remittance.closingId);
    if (closingId == null || this.isDownloadingClosing()) {
      return;
    }

    this.isDownloadingClosing.set(true);
    this.errorMessage.set('');
    this.workflowService.downloadOutgoingClosing(closingId).pipe(
      finalize(() => this.isDownloadingClosing.set(false))
    ).subscribe({
      next: file => this.saveDownloadedFile(file, `closing-${remittance.closingReference ?? closingId}.pdf`),
      error: (error: HttpErrorResponse) => this.setDownloadError(error, 'Closing document could not be downloaded.')
    });
  }

  createDisbursement(): void {
    this.startDisbursement();
  }

  getStatusClasses(status: string): string {
    const normalized = this.normalizeStatus(status);

    if (normalized === 'paired') {
      return 'border-emerald-200 bg-emerald-50 text-emerald-800';
    }

    if (normalized.includes('unpaired')) {
      return 'border-amber-200 bg-amber-50 text-amber-800';
    }

    if (normalized.includes('partial') || normalized.includes('ready') || normalized.includes('awaiting') || normalized.includes('progress')) {
      return 'border-amber-200 bg-amber-50 text-amber-800';
    }

    if (normalized.includes('paid') || normalized.includes('confirmed') || normalized.includes('closed')) {
      return 'border-sky-200 bg-sky-50 text-sky-800';
    }

    return 'border-iris-border bg-iris-bg text-iris-slate';
  }

  formatMoney(value: number | null | undefined, currencyCode?: string | null): string {
    if (value == null) {
      return 'Not provided';
    }

    return `${currencyCode ? `${currencyCode} ` : ''}${new Intl.NumberFormat(undefined, { minimumFractionDigits: 3, maximumFractionDigits: 3 }).format(value)}`;
  }

  getActiveBankAccountCountLabel(counterparty: FinanceCounterpartyListItem): string {
    return `${counterparty.activeBankAccountCount} active bank account${counterparty.activeBankAccountCount === 1 ? '' : 's'}`;
  }

  maskIban(iban: string | null | undefined): string {
    if (!iban?.trim()) {
      return 'No IBAN';
    }

    const compact = iban.replace(/\s+/g, '').toUpperCase();
    if (compact.length <= 8) {
      return `${compact.slice(0, 2)}••••${compact.slice(-2)}`;
    }

    return `${compact.slice(0, 4)}••••••••${compact.slice(-4)}`;
  }

  getBankAccountOptionLabel(account: BankAccountResponse): string {
    return `${account.bankName} — ${this.maskIban(account.iban)} — ${account.currencyCode}`;
  }

  getReceiptBankAccountOptionLabel(account: BankAccountResponse): string {
    return [
      account.beneficiaryName || 'Beneficiary unavailable',
      account.bankName,
      this.getBankAccountIbanDisplay(account),
      account.swiftBic,
      account.currencyCode
    ].filter(Boolean).join(' - ');
  }

  getBankAccountIbanDisplay(account: BankAccountResponse | null | undefined): string {
    if (!account) {
      return 'No IBAN';
    }

    return account.maskedIban?.trim() || this.maskIban(account.iban);
  }

  getEligibleInvoiceLabel(invoice: EligibleInvoice): string {
    return [
      invoice.invoiceNumber || `INV-${invoice.invoiceId}`,
      invoice.label || 'No label',
      this.getEligibleInvoiceContractDisplay(invoice),
      invoice.cedentName || 'Cedent unavailable'
    ].filter(Boolean).join(' - ');
  }

  clearInvoiceFilters(): void {
    this.invoicePageNumber.set(1);
    this.invoiceFilters.reset({
      search: '',
      contractSearch: '',
      contractId: null,
      cedentSearch: '',
      counterpartyId: null,
      invoiceType: '',
      recoveryStatus: '',
      currencyId: null,
      from: '',
      to: ''
    });
  }

  onInvoiceContractFilterInput(): void {
    const value = this.invoiceFilters.controls.contractSearch.value;
    const normalizedValue = this.normalizeSearchText(value);
    const selected = this.invoiceContractOptions().find(option => this.normalizeSearchText(option.label) === normalizedValue);
    this.invoiceFilters.controls.contractId.setValue(selected?.contractId ?? null);
  }

  onInvoiceCedentFilterInput(): void {
    const value = this.invoiceFilters.controls.cedentSearch.value;
    const normalizedValue = this.normalizeSearchText(value);
    const selected = this.invoiceCedentOptions().find(option => this.normalizeSearchText(option.label) === normalizedValue);
    this.invoiceFilters.controls.counterpartyId.setValue(selected?.counterpartyId ?? null);
  }

  isOutgoingClosingEligible(remittance: RemittanceResponse): boolean {
    return remittance.closingEligible === true;
  }

  getRemittanceReference(remittance: RemittanceResponse): string {
    return remittance.remittanceReference?.trim() || `REM-${remittance.remittanceRef}`;
  }

  getRemittanceReinsurerId(remittance: RemittanceResponse): number {
    return remittance.reinsurerId ?? remittance.counterpartyId;
  }

  getRemittanceReinsurerName(remittance: RemittanceResponse): string {
    return remittance.reinsurerName || remittance.counterpartyName;
  }

  getRemittanceContractDisplay(remittance: RemittanceResponse): string {
    const name = remittance.contractName?.trim() || 'Not provided';
    const umr = remittance.umr?.trim();
    return umr ? `${umr} - ${name}` : name;
  }

  getRemittancePanelDisplay(remittance: RemittanceResponse): string {
    return remittance.panelName?.trim() || (remittance.panelId == null ? 'Not linked' : `Panel ${remittance.panelId}`);
  }

  getRemittanceInvoiceDisplay(remittance: RemittanceResponse): string {
    return remittance.invoiceNumber?.trim() || (remittance.invoiceId ? `Invoice ${remittance.invoiceId}` : 'Not provided');
  }

  getRemittanceReceiptDisplay(remittance: RemittanceResponse): string {
    return remittance.receiptReference?.trim() || (remittance.receiptAllocationId ? `Allocation ${remittance.receiptAllocationId}` : 'Not provided');
  }

  downloadListedInvoice(invoice: InvoiceResponse): void {
    const invoiceId = this.getPositiveId(invoice.idInvoice);
    if (invoiceId == null) {
      this.errorMessage.set('Invoice could not be downloaded: the invoice is missing a valid backend ID.');
      return;
    }
    if (this.downloadingInvoiceIds().has(invoiceId)) return;
    this.downloadingInvoiceIds.update(ids => new Set(ids).add(invoiceId));
    this.errorMessage.set('');
    this.workflowService.downloadPremiumDebitNote(invoiceId).pipe(
      take(1),
      takeUntilDestroyed(this.destroyRef),
      finalize(() => this.downloadingInvoiceIds.update(ids => {
        const remaining = new Set(ids);
        remaining.delete(invoiceId);
        return remaining;
      }))
    ).subscribe({
      next: file => {
        if (!this.isPdfDownload(file)) {
          this.errorMessage.set('Invoice could not be downloaded: the backend response was not a PDF.');
          return;
        }
        try {
          this.saveDownloadedFile(file, 'invoice-' + invoiceId + '.pdf');
        } catch {
          this.errorMessage.set('Invoice could not be downloaded. Please retry.');
        }
      },
      error: (error: HttpErrorResponse) => this.setDownloadError(error, 'Invoice could not be downloaded. Please retry.')
    });
  }

  getInvoiceLabel(invoice: InvoiceResponse): string {
    return invoice.label?.trim() || 'No label';
  }

  getInvoiceContractDisplay(invoice: InvoiceResponse): string {
    if (invoice.umr && invoice.contractName) {
      return `${invoice.umr} - ${invoice.contractName}`;
    }

    return invoice.umr || invoice.contractName || (invoice.contractId ? `Contract #${invoice.contractId}` : 'Not provided');
  }

  getInvoiceCounterpartyName(invoice: InvoiceResponse): string {
    return invoice.cedentName || invoice.reinsurerName || invoice.counterpartyName || 'Not provided';
  }

  getInvoiceTypeLabel(invoiceType: string | null | undefined): string {
    const normalized = this.normalizeStatus(invoiceType ?? '');
    if (normalized.includes('reinsurer')) {
      return 'Reinsurer Payable';
    }

    if (normalized.includes('cedent') || normalized.includes('premium')) {
      return 'Cedent Premium Invoice';
    }

    return invoiceType?.trim() || 'Not provided';
  }

  getInvoicePrimaryAmount(invoice: InvoiceResponse): number | null {
    return invoice.invoiceAmount
      ?? invoice.grossAmount
      ?? invoice.actualAmount
      ?? invoice.amount
      ?? invoice.affectedAmount
      ?? invoice.netPremium;
  }

  getInvoiceRecoveryStatus(invoice: InvoiceResponse): InvoicePaymentStatus {
    return getInvoicePaymentStatusValue(invoice.paymentStatus ?? invoice.recoveryStatus) ?? 'Unsettled';
  }

  getPairingStatusClasses(status: string | null | undefined): string {
    return getInvoicePaymentStatusClasses(status);
  }

  getEligibleInvoiceContractDisplay(invoice: EligibleInvoice): string {
    if (invoice.umr && invoice.contractName) {
      return `${invoice.umr} - ${invoice.contractName}`;
    }

    return invoice.umr || invoice.contractName || (invoice.contractId ? `Contract #${invoice.contractId}` : 'Contract unavailable');
  }

  getEligibleInvoiceOutstandingAmount(invoice: EligibleInvoice): number {
    return Math.max(invoice.remainingAmount ?? invoice.outstandingAmount ?? 0, 0);
  }

  getEligibleInvoiceOutstandingAmountById(invoiceId: number): number {
    const invoice = this.eligibleInvoices().find(item => this.getPositiveId(item.invoiceId) === invoiceId);
    return invoice ? this.getEligibleInvoiceOutstandingAmount(invoice) : 0;
  }

  isReadyForDisbursement(status: string): boolean {
    return this.getRemittanceWorkflowStatus(status) === RemittanceWorkflowStatus.ReadyForDisbursement;
  }

  canMakeDisbursement(remittance: RemittanceResponse): boolean {
    return this.role() === 'finance'
      && this.isAwaitingFinanceDisbursement(remittance.status);
  }

  canOpenDisbursement(remittance: RemittanceResponse): boolean {
    return this.role() === 'finance'
      && (this.canMakeDisbursement(remittance)
        || this.isPaymentInProgress(remittance.status)
        || this.isClosedDisbursement(remittance.status));
  }

  canConfirmRemittance(remittance: RemittanceResponse): boolean {
    const normalized = this.getRemittanceWorkflowStatus(remittance.status);
    return normalized === RemittanceWorkflowStatus.Draft || normalized === RemittanceWorkflowStatus.ReadyForDisbursement;
  }

  isAwaitingFinanceDisbursement(status: string): boolean {
    return this.getRemittanceWorkflowStatus(status) === RemittanceWorkflowStatus.AwaitingFinanceDisbursement;
  }

  isPaymentInProgress(status: string): boolean {
    return this.getRemittanceWorkflowStatus(status) === RemittanceWorkflowStatus.PaymentInProgress;
  }

  isClosedDisbursement(status: string): boolean {
    const normalized = this.getRemittanceWorkflowStatus(status);
    return normalized === RemittanceWorkflowStatus.Closed || normalized === RemittanceWorkflowStatus.Disbursed;
  }

  getRemittanceStatusLabel(status: string): string {
    if (this.isAwaitingFinanceDisbursement(status)) {
      return 'Awaiting Finance Disbursement';
    }

    if (this.isPaymentInProgress(status)) {
      return 'Payment In Progress';
    }

    if (this.isClosedDisbursement(status)) {
      return 'Closed';
    }

    return status;
  }

  getRemittanceGrossAmount(remittance: RemittanceResponse): number | null {
    return remittance.grossPremium ?? remittance.allocatedAmount ?? remittance.netPremiumDue;
  }

  getRemittanceDeductions(remittance: RemittanceResponse): number | null {
    if (typeof remittance.otherDeductions === 'number') {
      return remittance.otherDeductions;
    }

    if (typeof remittance.deductions === 'number') {
      return remittance.deductions;
    }

    const gross = this.getRemittanceGrossAmount(remittance);
    return gross == null || remittance.netPayableAmount == null ? null : Math.max(gross - remittance.netPayableAmount, 0);
  }

  getDisbursementContextRows(remittance: RemittanceResponse | null): Array<{ label: string; value: string }> {
    if (!remittance) {
      return [];
    }

    return [
      { label: 'Contract name', value: remittance.contractName || 'Not provided by backend' },
      { label: 'UMR', value: remittance.umr || 'Not provided by backend' },
      { label: 'Cedent', value: remittance.cedentName || 'Not provided by backend' },
      { label: 'Reinsurer', value: remittance.counterpartyName },
      { label: 'Panel', value: remittance.panelId == null ? 'Not linked' : `Panel ${remittance.panelId}` },
      { label: 'Gross/allocated premium', value: this.formatMoney(this.getRemittanceGrossAmount(remittance), remittance.currencyCode) },
      { label: 'Deductions', value: this.formatMoney(this.getRemittanceDeductions(remittance), remittance.currencyCode) },
      { label: 'Net payable amount', value: this.formatMoney(remittance.netPayableAmount, remittance.currencyCode) },
      { label: 'Currency', value: remittance.currencyCode },
      { label: 'Current status', value: this.getRemittanceStatusLabel(remittance.status) },
      { label: 'Remittance reference', value: String(remittance.remittanceRef) },
      ...(this.isClosedDisbursement(remittance.status)
        ? [{ label: 'Transfer completion date', value: remittance.transferCompletedAt ? new Date(remittance.transferCompletedAt).toLocaleDateString() : 'Not provided by backend' }]
        : [])
    ];
  }

  getSelectedBankAccountRows(): Array<{ label: string; value: string }> {
    const contextAccount = this.disbursementContext()?.defaultBankAccount ?? null;
    if (contextAccount) {
      return this.getBankAccountSnapshotRows(contextAccount);
    }

    const account = this.selectedDisbursementBankAccount();
    if (!account) {
      return [];
    }

    return [
      { label: 'Bank name', value: account.bankName || 'Not provided' },
      { label: 'Bank city/country', value: [account.bankCity, account.bankCountry].filter(Boolean).join(', ') || 'Not provided' },
      { label: 'Masked IBAN', value: this.getBankAccountIbanDisplay(account) },
      { label: 'SWIFT/BIC', value: account.swiftBic || 'Not provided' },
      ...(account.hasCorrespondentBank
        ? [{ label: 'Correspondent bank', value: [account.correspondentBankName, account.correspondentSwiftBic].filter(Boolean).join(' - ') || 'Not provided' }]
        : [])
    ];
  }

  canSubmitDisbursement(): boolean {
    const context = this.disbursementContext();
    return !!this.selectedRemittance()
      && this.isAwaitingFinanceDisbursement(this.selectedRemittance()!.status)
      && !this.isSubmitting()
      && (context ? context.canStartPayment : true)
      && this.hasValidDisbursementBankAccount()
      && !this.completedDisbursement();
  }

  hasValidDisbursementBankAccount(): boolean {
    return !!(this.disbursementContext()?.defaultBankAccount ?? this.selectedDisbursementBankAccount());
  }

  getDisbursementValidationMessage(): string {
    return this.disbursementContext()?.validationMessage || 'A valid reinsurer bank account is required before disbursement.';
  }

  canDownloadExistingInvoice(): boolean {
    const remittance = this.selectedRemittance();
    return !!remittance
      && (this.isPaymentInProgress(remittance.status) || this.isClosedDisbursement(remittance.status))
      && !this.isDownloadingInvoice()
      && this.getActualDisbursementId(remittance) !== null;
  }

  canConfirmSelectedTransfer(): boolean {
    const remittance = this.selectedRemittance();
    return !!remittance
      && this.isPaymentInProgress(remittance.status)
      && !this.isConfirmingTransfer()
      && this.hasValidDisbursementBankAccount()
      && this.getActualDisbursementId(remittance) !== null;
  }

  startDisbursement(): void {
    const remittance = this.selectedRemittance();
    if (!remittance || !this.canSubmitDisbursement()) {
      return;
    }

    this.isSubmitting.set(true);
    this.errorMessage.set('');
    const remittanceId = this.getRemittanceId(remittance);
    this.workflowService.startDisbursement(remittanceId).subscribe({
      next: response => {
        const updated = this.applyDisbursementCommandResponse(remittance, response, 'PaymentInProgress');
        const downloadUrl = this.getCommandDownloadUrl(response);
        if (!downloadUrl) {
          this.isSubmitting.set(false);
          this.errorMessage.set('The backend did not return an invoice download URL.');
          this.loadRemittances();
          return;
        }

        this.workflowService.downloadDocumentUrl(downloadUrl).subscribe({
          next: file => {
            if (!this.isPdfDownload(file)) {
              this.isSubmitting.set(false);
              this.errorMessage.set('The backend response was not a PDF invoice.');
              this.loadRemittances();
              return;
            }
            this.saveDownloadedFile(file, `invoice-remittance-${updated.remittanceRef}.pdf`);
            this.isSubmitting.set(false);
            this.successMessage.set('Invoice downloaded. Payment processing has started.');
            this.loadRemittances();
            this.refreshNotifications();
          },
          error: (error: HttpErrorResponse) => {
            this.isSubmitting.set(false);
            this.errorMessage.set(this.getErrorMessage(error, 'Invoice could not be downloaded.'));
            this.loadRemittances();
          }
        });
      },
      error: (error: HttpErrorResponse) => {
        this.isSubmitting.set(false);
        this.errorMessage.set(this.getErrorMessage(error, 'Disbursement could not be started.'));
      }
    });
  }

  downloadExistingInvoice(): void {
    const remittance = this.selectedRemittance();
    if (!remittance || this.isDownloadingInvoice()) {
      return;
    }

    const request = this.getExistingInvoiceDownloadRequest(remittance);
    if (!request) {
      this.errorMessage.set('Backend disbursement DTO did not include a real disbursementId for invoice download.');
      return;
    }

    this.isDownloadingInvoice.set(true);
    this.errorMessage.set('');
    request.pipe(finalize(() => this.isDownloadingInvoice.set(false))).subscribe({
      next: file => {
        if (!this.isPdfDownload(file)) {
          this.errorMessage.set('The backend response was not a PDF invoice.');
          return;
        }
        this.saveDownloadedFile(file, `invoice-remittance-${remittance.remittanceRef}.pdf`);
      },
      error: (error: HttpErrorResponse) => {
        this.errorMessage.set(this.getErrorMessage(error, 'Invoice could not be downloaded.'));
      }
    });
  }

  openTransferConfirmation(): void {
    if (!this.canConfirmSelectedTransfer()) {
      return;
    }

    this.isTransferConfirmationOpen.set(true);
  }

  closeTransferConfirmation(): void {
    if (!this.isConfirmingTransfer()) {
      this.isTransferConfirmationOpen.set(false);
    }
  }

  confirmTransfer(): void {
    const remittance = this.selectedRemittance();
    const disbursementId = remittance ? this.getActualDisbursementId(remittance) : null;
    if (!remittance || disbursementId == null || !this.isPaymentInProgress(remittance.status) || this.isConfirmingTransfer()) {
      if (remittance && disbursementId == null) {
        this.errorMessage.set('Backend disbursement DTO did not include a real disbursementId for transfer confirmation.');
      }
      return;
    }

    this.isConfirmingTransfer.set(true);
    this.errorMessage.set('');
    this.workflowService.confirmTransfer(disbursementId).pipe(
      finalize(() => this.isConfirmingTransfer.set(false))
    ).subscribe({
      next: response => {
        this.applyDisbursementCommandResponse(remittance, response, 'Closed');
        this.isTransferConfirmationOpen.set(false);
        this.successMessage.set('The amount transfer was confirmed successfully.');
        this.loadRemittances();
        this.refreshNotifications();
      },
      error: (error: HttpErrorResponse) => {
        this.errorMessage.set(this.getConfirmTransferErrorMessage(error));
        console.error('Confirm transfer request failed', {
          status: error.status,
          error: error.error
        });
      }
    });
  }

  goToBankAccounts(): void {
    const target = this.role() === 'finance'
      ? '/workspace/reassurance/finance-officer/bank-accounts'
      : '/workspace/reassurance/back-officer/bank-accounts';
    void this.router.navigate([target]);
  }

  downloadInvoiceDocument(): void {
    this.downloadExistingInvoice();
  }

  printInvoiceDocument(): void {
    this.retrieveDisbursementDocument(true);
  }

  private retrieveDisbursementDocument(print: boolean): void {
    const disbursement = this.completedDisbursement();
    if (!disbursement || this.isSubmitting()) {
      return;
    }

    const request = disbursement.documentId != null
      ? this.workflowService.downloadDocument(disbursement.documentId)
      : disbursement.documentDownloadUrl
        ? this.workflowService.downloadDocumentUrl(disbursement.documentDownloadUrl)
        : null;

    if (!request) {
      this.errorMessage.set('Generated disbursement document is not available from the backend response.');
      return;
    }

    this.isSubmitting.set(true);
    this.errorMessage.set('');
    request.subscribe({
      next: file => {
        this.isSubmitting.set(false);
        if (print) {
          const url = URL.createObjectURL(file.blob);
          const printWindow = window.open(url, '_blank');
          printWindow?.addEventListener('load', () => printWindow.print(), { once: true });
          window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
        } else {
          this.saveDownloadedFile(file, `disbursement-${disbursement.idDisbursement}.pdf`);
        }
      },
      error: (error: HttpErrorResponse) => {
        this.isSubmitting.set(false);
        this.errorMessage.set(this.getErrorMessage(error, 'Generated disbursement document could not be retrieved.'));
      }
    });
  }

  private isValidDisbursementBankAccount(account: BankAccountResponse): boolean {
    const remittance = this.selectedRemittance();
    return account.isActive
      && (!remittance?.counterpartyId || account.idCounterparty === remittance.counterpartyId || account.counterpartyId === remittance.counterpartyId)
      && (!remittance?.currencyCode || account.currencyCode === remittance.currencyCode);
  }

  private cancelDisbursementModalRequests(): void {
    this.disbursementContextSubscription?.unsubscribe();
    this.disbursementContextSubscription = null;
    this.disbursementBankAccountsSubscription?.unsubscribe();
    this.disbursementBankAccountsSubscription = null;
    this.loadingDisbursementContextRef = null;
    this.loadingDisbursementBankAccountsCounterpartyId = null;
    this.isLoadingContext.set(false);
    this.isBankAccountLoading.set(false);
  }

  private getBankAccountSnapshotRows(account: BankAccountSnapshot): Array<{ label: string; value: string }> {
    return [
      { label: 'Bank name', value: account.bankName || 'Not provided' },
      { label: 'Bank city/country', value: [account.bankCity, account.bankCountry].filter(Boolean).join(', ') || 'Not provided' },
      { label: 'Masked IBAN', value: this.maskIban(account.iban) },
      { label: 'SWIFT/BIC', value: account.swiftBic || 'Not provided' },
      ...(account.correspondentBankName || account.correspondentSwiftBic
        ? [{ label: 'Correspondent bank', value: [account.correspondentBankName, account.correspondentSwiftBic].filter(Boolean).join(' - ') || 'Not provided' }]
        : [])
    ];
  }

  private applyDisbursementCommandResponse(
    current: RemittanceResponse,
    response: DisbursementCommandResponse,
    fallbackStatus: 'PaymentInProgress' | 'Closed'
  ): RemittanceResponse {
    const responseRemittance = response.remittance ?? null;
    const responseDisbursement = response.disbursement ?? null;
    const updated: RemittanceResponse = {
      ...current,
      ...(responseRemittance ?? {}),
      remittanceId: response.remittanceId ?? responseRemittance?.remittanceId ?? current.remittanceId,
      status: response.status || responseRemittance?.status || fallbackStatus,
      disbursementId: response.disbursementId ?? responseRemittance?.disbursementId ?? responseDisbursement?.idDisbursement ?? current.disbursementId,
      invoiceId: response.invoiceId ?? responseRemittance?.invoiceId ?? current.invoiceId,
      documentId: response.documentId ?? responseRemittance?.documentId ?? responseDisbursement?.documentId ?? current.documentId,
      invoiceDownloadUrl: response.invoiceDownloadUrl ?? responseRemittance?.invoiceDownloadUrl ?? current.invoiceDownloadUrl,
      documentDownloadUrl: response.documentDownloadUrl ?? response.downloadUrl ?? responseRemittance?.documentDownloadUrl ?? responseDisbursement?.documentDownloadUrl ?? current.documentDownloadUrl,
      transferCompletedAt: response.transferCompletedAt ?? response.closedAt ?? responseRemittance?.transferCompletedAt ?? current.transferCompletedAt
    };

    this.selectedRemittance.set(updated);
    this.disbursementContext.update(context => context && context.remittanceId === this.getRemittanceId(current)
      ? {
        ...context,
        status: updated.status,
        disbursementId: updated.disbursementId ?? context.disbursementId,
        invoiceId: updated.invoiceId ?? context.invoiceId,
        closedAt: updated.transferCompletedAt ?? context.closedAt,
        canStartPayment: false,
        canConfirmTransfer: updated.status === 'PaymentInProgress'
      }
      : context);
    if (responseDisbursement) {
      this.completedDisbursement.set(responseDisbursement);
    }
    this.remittances.update(items => items.map(item => item.remittanceRef === current.remittanceRef ? updated : item));

    return updated;
  }

  private getCommandDownloadUrl(response: DisbursementCommandResponse): string | null {
    return response.invoiceDownloadUrl
      ?? response.downloadUrl
      ?? response.documentDownloadUrl
      ?? response.remittance?.invoiceDownloadUrl
      ?? response.remittance?.documentDownloadUrl
      ?? response.disbursement?.documentDownloadUrl
      ?? null;
  }

  private getExistingInvoiceDownloadRequest(remittance: RemittanceResponse): Observable<BackendFileDownload> | null {
    const actualDisbursementId = this.getActualDisbursementId(remittance);
    if (actualDisbursementId != null) {
      return this.workflowService.downloadDisbursementInvoice(actualDisbursementId);
    }

    return null;
  }

  private getActualDisbursementId(remittance: RemittanceResponse): number | null {
    return this.disbursementContext()?.disbursementId ?? remittance.disbursementId ?? null;
  }

  getRemittanceId(remittance: RemittanceResponse): number {
    return remittance.remittanceId ?? remittance.remittanceRef;
  }

  private isPdfDownload(file: BackendFileDownload): boolean {
    const contentType = file.contentType?.toLowerCase() ?? '';
    return contentType.includes('application/pdf') || file.blob.type.toLowerCase().includes('application/pdf');
  }

  private saveDownloadedFile(file: BackendFileDownload, fallbackFileName: string): void {
    const url = URL.createObjectURL(file.blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = file.fileName || fallbackFileName;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
  }

  private setDownloadError(error: HttpErrorResponse, fallback: string): void {
    const body = error.error;
    if (body instanceof Blob && body.size > 0) {
      body.text().then(text => {
        try {
          const parsed = JSON.parse(text) as Record<string, unknown>;
          const message = parsed['message'] ?? parsed['title'] ?? parsed['detail'];
          const errors = Array.isArray(parsed['errors']) ? parsed['errors'].join(' ') : '';
          this.errorMessage.set([message, errors].filter(value => typeof value === 'string' && value.trim()).join(' ') || fallback);
        } catch {
          this.errorMessage.set(text.trim() || fallback);
        }
      }).catch(() => this.errorMessage.set(this.getErrorMessage(error, fallback)));
      return;
    }

    this.errorMessage.set(this.getErrorMessage(error, fallback));
  }

  private refreshNotifications(): void {
    window.dispatchEvent(new CustomEvent('iris-notifications-refresh'));
  }

  getReceiptMonth(receipt: BankReceiptResponse): string {
    return (receipt.receptionDate || receipt.operationDate || '').slice(0, 7) || 'Not provided';
  }

  private submit<T>(requestFactory: () => Observable<T>, success: string, afterSuccess: (response: T) => void, close = true): void {
    this.isSubmitting.set(true);
    this.errorMessage.set('');
    requestFactory().subscribe({
      next: response => {
        this.successMessage.set(success);
        this.isSubmitting.set(false);
        if (close) {
          this.forceCloseModal();
        }
        afterSuccess(response);
      },
      error: (error: HttpErrorResponse) => {
        this.errorMessage.set(this.getErrorMessage(error, 'Request failed. Review the form and retry.'));
        this.isSubmitting.set(false);
      }
    });
  }

  private loadCurrencies(): void {
    if (this.currencies().length) {
      return;
    }

    this.contractsService.getCurrencies().subscribe({
      next: currencies => this.currencies.set(currencies),
      error: error => this.errorMessage.set(this.getErrorMessage(error, 'Currencies could not be loaded.'))
    });
  }

  getCurrencyLabel(currencyId: number | null | undefined, fallbackCode = ''): string {
    const currency = this.currencies().find(item => item.id === currencyId);
    if (currency) {
      return `${currency.code} - ${currency.name}`;
    }

    return fallbackCode;
  }

  displayValue(value: string | null | undefined): string {
    return value && value.trim() ? value : '—';
  }

  private syncCorrespondentBankValidators(hasCorrespondentBank: boolean): void {
    const bankName = this.bankAccountForm.controls.correspondentBankName;
    const swiftBic = this.bankAccountForm.controls.correspondentSwiftBic;

    if (hasCorrespondentBank) {
      bankName.setValidators([Validators.required]);
      swiftBic.setValidators([Validators.required, this.swiftBicValidator()]);
    } else {
      bankName.clearValidators();
      swiftBic.clearValidators();
      bankName.setValue('', { emitEvent: false });
      swiftBic.setValue('', { emitEvent: false });
    }

    bankName.updateValueAndValidity({ emitEvent: false });
    swiftBic.updateValueAndValidity({ emitEvent: false });
  }

  private remainingAmountValidator(): ValidatorFn {
    return (control: AbstractControl<number | null>): ValidationErrors | null => {
      const receipt = this.selectedReceipt();
      const value = control.value;
      if (!receipt || value == null) {
        return null;
      }

      return value > receipt.availableAmount ? { exceedsRemaining: true } : null;
    };
  }

  private getSuggestedAllocationAmount(invoice?: EligibleInvoice | null): number {
    const receipt = this.selectedReceipt();
    if (!receipt) {
      return 0;
    }

    const receiptBalance = Math.max(receipt.availableAmount - this.allocatedAmountInForm(), 0);
    return invoice ? Math.min(receiptBalance, this.getEligibleInvoiceOutstandingAmount(invoice)) : receiptBalance;
  }

  private sortReceiptsForBackOffice(receipts: BankReceiptResponse[]): BankReceiptResponse[] {
    const weight = (status: string) => {
      const normalized = this.normalizeStatus(status);
      if (normalized === 'unpaired') return 0;
      if (normalized.includes('partial')) return 1;
      if (normalized === 'paired') return 2;
      return 3;
    };

    return [...receipts].sort((left, right) => weight(left.pairingStatus) - weight(right.pairingStatus));
  }

  private handleLoadError(error: HttpErrorResponse, fallback: string, target?: { set(value: string): void }): void {
    const message = this.getErrorMessage(error, fallback);
    this.errorMessage.set(message);
    target?.set(message);
    this.isLoading.set(false);
  }

  private getErrorMessage(error: unknown, fallback: string): string {
    if (!(error instanceof HttpErrorResponse)) {
      if (error && typeof error === 'object') {
        const record = error as Record<string, unknown>;
        const errorBody = record['error'];
        if (errorBody && typeof errorBody === 'object') {
          const body = errorBody as Record<string, unknown>;
          const message = body['message'] ?? body['title'];
          if (typeof message === 'string' && message.trim()) {
            return message;
          }
        }
      }

      return error instanceof Error && error.message ? error.message : fallback;
    }

    if (error.status === 0) {
      return 'Backend unavailable. Check the API server and retry.';
    }

    if (error.status === 401) {
      return 'Session expired. Sign in again.';
    }

    if (error.status === 403) {
      return 'You do not have permission for this financial operation.';
    }

    const validationMessage = this.getValidationErrorMessage(error.error);
    if (validationMessage) {
      return validationMessage;
    }

    const message = error.error?.message ?? error.error?.title ?? error.error?.detail;
    if (typeof message === 'string' && message.trim()) {
      return message;
    }

    if (error.status === 404) {
      return 'Disbursement or invoice was not found.';
    }

    if (error.status === 500) {
      return 'PDF generation failed on the backend.';
    }

    return fallback;
  }

  private getConfirmTransferErrorMessage(error: HttpErrorResponse): string {
    const backendMessage = this.getValidationErrorMessage(error.error)
      || (typeof error.error?.message === 'string' ? error.error.message : '')
      || (typeof error.error?.title === 'string' ? error.error.title : '')
      || (typeof error.error?.detail === 'string' ? error.error.detail : '');

    if (backendMessage.trim()) {
      return backendMessage;
    }

    switch (error.status) {
      case 0:
        return 'Backend unavailable. Check the API server and retry.';
      case 400:
        return 'The transfer confirmation request was invalid.';
      case 401:
        return 'Session expired. Sign in again.';
      case 403:
        return 'You do not have permission to confirm this transfer.';
      case 404:
        return 'Disbursement was not found.';
      case 409:
        return 'This disbursement can no longer be confirmed in its current status.';
      case 500:
        return 'Transfer confirmation failed on the backend.';
      default:
        return 'Transfer could not be confirmed.';
    }
  }

  private getValidationErrorMessage(errorBody: unknown): string {
    if (!errorBody || typeof errorBody !== 'object') {
      return typeof errorBody === 'string' && errorBody.trim() ? errorBody : '';
    }

    const body = errorBody as Record<string, unknown>;
    const errors = body['errors'];
    if (Array.isArray(errors)) {
      return errors
        .filter((message): message is string => typeof message === 'string' && message.trim().length > 0)
        .join(' ');
    }

    if (!errors || typeof errors !== 'object') {
      return '';
    }

    const messages = Object.entries(errors as Record<string, unknown>).flatMap(([field, value]) => {
      const values = Array.isArray(value) ? value : [value];
      return values
        .filter((message): message is string => typeof message === 'string' && message.trim().length > 0)
        .map(message => `${field}: ${message}`);
    });

    return messages.join(' ');
  }

  normalizeStatus(status: string): string {
    return normalizePaymentStatus(status);
  }

  private getRemittanceWorkflowStatus(status: string): RemittanceWorkflowStatus | string {
    const normalized = this.normalizeStatus(status);
    switch (normalized) {
      case RemittanceWorkflowStatus.AwaitingFinanceDisbursement:
      case RemittanceWorkflowStatus.Closed:
      case RemittanceWorkflowStatus.Disbursed:
      case RemittanceWorkflowStatus.Draft:
      case RemittanceWorkflowStatus.PaymentInProgress:
      case RemittanceWorkflowStatus.ReadyForDisbursement:
        return normalized;
      default:
        return normalized;
    }
  }

  private nullable(value: string | null | undefined): string | null {
    return value && value.trim() ? value.trim() : null;
  }

  private normalizeAccountCode(value: string | null | undefined): string | null {
    const normalizedValue = value?.replace(/\s+/g, '').toUpperCase() ?? '';
    return normalizedValue ? normalizedValue : null;
  }

  private normalizeSearchText(value: string): string {
    return value.trim().toLowerCase().replace(/\s+/g, ' ');
  }

  private ibanValidator(): ValidatorFn {
    return (control: AbstractControl<string>): ValidationErrors | null => {
      const value = this.normalizeAccountCode(control.value);
      if (!value) {
        return null;
      }

      if (value.length > 34) {
        return { ibanLength: true };
      }

      return /^[A-Z0-9]+$/.test(value) ? null : { ibanCharacters: true };
    };
  }

  private swiftBicValidator(): ValidatorFn {
    return (control: AbstractControl<string>): ValidationErrors | null => {
      const value = this.normalizeAccountCode(control.value);
      if (!value) {
        return null;
      }

      return /^[A-Z0-9]{8}([A-Z0-9]{3})?$/.test(value) ? null : { swiftBic: true };
    };
  }

  private getPositiveId(value: number | string | null | undefined): number | null {
    const numericValue = Number(value);
    return Number.isInteger(numericValue) && numericValue > 0 ? numericValue : null;
  }

  private today(): string {
    return new Date().toISOString().slice(0, 10);
  }

  private currentMonth(): string {
    return this.today().slice(0, 7);
  }

}
