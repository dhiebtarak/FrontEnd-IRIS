import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { BehaviorSubject, of, Subject, throwError } from 'rxjs';
import { ContractsService } from '../../../shared/services/contracts.service';
import { CounterpartiesService } from '../../../shared/services/counterparties.service';
import { FinancialWorkflowService } from '../../../shared/services/financial-workflow.service';
import { FinancialWorkspacePageComponent } from './financial-workspace-page.component';

describe('FinancialWorkspacePageComponent', () => {
  let fixture: ComponentFixture<FinancialWorkspacePageComponent>;
  let routeData: BehaviorSubject<Record<string, unknown>>;
  let workflowService: {
    getFinanceReceipts: ReturnType<typeof vi.fn>;
    getBackOfficeReceipts: ReturnType<typeof vi.fn>;
    getReceipt: ReturnType<typeof vi.fn>;
    createReceipt: ReturnType<typeof vi.fn>;
    getEligibleInvoices: ReturnType<typeof vi.fn>;
    allocateReceiptInvoices: ReturnType<typeof vi.fn>;
    getDisbursementQueue: ReturnType<typeof vi.fn>;
    getDisbursementContext: ReturnType<typeof vi.fn>;
    createDisbursement: ReturnType<typeof vi.fn>;
    startDisbursement: ReturnType<typeof vi.fn>;
    confirmTransfer: ReturnType<typeof vi.fn>;
    confirmRemittance: ReturnType<typeof vi.fn>;
    downloadDisbursementInvoice: ReturnType<typeof vi.fn>;
    downloadDocument: ReturnType<typeof vi.fn>;
    downloadDocumentUrl: ReturnType<typeof vi.fn>;
    getBackOfficeRemittances: ReturnType<typeof vi.fn>;
    getInvoices: ReturnType<typeof vi.fn>;
    getBankAccounts: ReturnType<typeof vi.fn>;
    createBankAccount: ReturnType<typeof vi.fn>;
    updateBankAccount: ReturnType<typeof vi.fn>;
    setBankAccountStatus: ReturnType<typeof vi.fn>;
    markNotificationRead: ReturnType<typeof vi.fn>;
  };
  let counterpartiesService: {
    getFinanceCounterparties: ReturnType<typeof vi.fn>;
    getCounterpartyById: ReturnType<typeof vi.fn>;
  };
  let contractsService: {
    getCurrencies: ReturnType<typeof vi.fn>;
  };
  let router: {
    navigate: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    routeData = new BehaviorSubject<Record<string, unknown>>({ role: 'finance', page: 'dashboard' });
    workflowService = {
      getFinanceReceipts: vi.fn().mockReturnValue(of({
        items: [
          {
            idBankReceipt: 10,
            bankAccountId: 3,
            counterpartyId: 7,
            counterpartyName: 'Cedent',
            receptionDate: '2026-09-11',
            operationDate: '2026-09-11',
            amountReceived: 1000,
            currencyId: 1,
            currencyCode: 'USD',
            appliedExchangeRate: null,
            availableAmount: 1000,
            allocatedAmount: 0,
            pairingStatus: 'Unpaired',
            settlementMethod: 'BANK_TRANSFER',
            collectionType: 'PREMIUM',
            bankReference: 'BR-1',
            settlementLabel: 'Premium'
          }
        ],
        pageNumber: 1,
        page: 1,
        pageSize: 25,
        totalCount: 1,
        totalPages: 1
      })),
      getBackOfficeReceipts: vi.fn().mockReturnValue(of({ items: [], pageNumber: 1, pageSize: 25, totalCount: 0, totalPages: 0 })),
      getReceipt: vi.fn().mockReturnValue(of({})),
      createReceipt: vi.fn().mockReturnValue(of({})),
      getEligibleInvoices: vi.fn().mockReturnValue(of({ items: [], status: 200 })),
      allocateReceiptInvoices: vi.fn().mockReturnValue(of({})),
      getDisbursementQueue: vi.fn().mockReturnValue(of([])),
      getDisbursementContext: vi.fn().mockReturnValue(of({})),
      createDisbursement: vi.fn().mockReturnValue(of({})),
      startDisbursement: vi.fn().mockReturnValue(of({})),
      confirmTransfer: vi.fn().mockReturnValue(of({})),
      confirmRemittance: vi.fn().mockReturnValue(of({})),
      downloadDisbursementInvoice: vi.fn().mockReturnValue(of({ blob: new Blob(['pdf'], { type: 'application/pdf' }), fileName: 'invoice.pdf', contentType: 'application/pdf' })),
      downloadDocument: vi.fn().mockReturnValue(of({ blob: new Blob(['pdf'], { type: 'application/pdf' }), fileName: 'invoice.pdf', contentType: 'application/pdf' })),
      downloadDocumentUrl: vi.fn().mockReturnValue(of({ blob: new Blob(['pdf'], { type: 'application/pdf' }), fileName: 'invoice.pdf', contentType: 'application/pdf' })),
      getBackOfficeRemittances: vi.fn().mockReturnValue(of([])),
      getInvoices: vi.fn().mockReturnValue(of({ items: [], pageNumber: 1, pageSize: 20, totalCount: 0, totalPages: 0 })),
      getBankAccounts: vi.fn().mockReturnValue(of([])),
      createBankAccount: vi.fn().mockReturnValue(of({})),
      updateBankAccount: vi.fn().mockReturnValue(of({})),
      setBankAccountStatus: vi.fn().mockReturnValue(of({})),
      markNotificationRead: vi.fn().mockReturnValue(of({}))
    };
    counterpartiesService = {
      getFinanceCounterparties: vi.fn().mockReturnValue(of({
        items: [
          {
            id: 22,
            name: 'Ami',
            status: 'Active',
            hasActiveBankAccount: true,
            activeBankAccountCount: 1
          },
          {
            id: 23,
            name: 'No Account Re',
            status: 'Active',
            hasActiveBankAccount: false,
            activeBankAccountCount: 0
          }
        ],
        pageNumber: 1,
        pageSize: 50,
        totalCount: 2,
        totalPages: 1
      })),
      getCounterpartyById: vi.fn().mockReturnValue(of({
        id: 22,
        name: 'Beneficiary Re',
        addressLine: '12 Market Street',
        city: 'Casablanca',
        country: 'Morocco'
      }))
    };
    contractsService = {
      getCurrencies: vi.fn().mockReturnValue(of([
        { id: 3, code: 'USD', name: 'US Dollar', symbol: '$', decimalPlaces: 2, isDefault: false }
      ]))
    };
    router = {
      navigate: vi.fn().mockResolvedValue(true)
    };

    await TestBed.configureTestingModule({
      imports: [FinancialWorkspacePageComponent],
      providers: [
        { provide: ActivatedRoute, useValue: { data: routeData.asObservable(), queryParamMap: of(convertToParamMap({})) } },
        { provide: Router, useValue: router },
        { provide: FinancialWorkflowService, useValue: workflowService },
        { provide: CounterpartiesService, useValue: counterpartiesService },
        { provide: ContractsService, useValue: contractsService }
      ]
    }).compileComponents();
  });

  function createComponent(): void {
    fixture = TestBed.createComponent(FinancialWorkspacePageComponent);
    fixture.detectChanges();
  }

  it('maps the paged Finance receipt response into array state for filters and @for', () => {
    routeData.next({ role: 'finance', page: 'receipts' });

    createComponent();

    expect(workflowService.getFinanceReceipts).toHaveBeenCalledTimes(1);
    expect(fixture.componentInstance.receipts()).toEqual([
      expect.objectContaining({ idBankReceipt: 10, pairingStatus: 'Unpaired' })
    ]);
    expect(fixture.componentInstance.totalReceipts()).toBe(1);
    expect(fixture.componentInstance.unpairedReceipts().length).toBe(1);
    expect(fixture.nativeElement.textContent).toContain('BR-10');
  });

  it('does not call the Back Officer invoices endpoint for the Finance dashboard', () => {
    createComponent();

    expect(workflowService.getFinanceReceipts).toHaveBeenCalledTimes(1);
    expect(workflowService.getDisbursementQueue).toHaveBeenCalledTimes(1);
    expect(workflowService.getInvoices).not.toHaveBeenCalled();
  });

  it('keeps receipts as an array when the Finance receipt request fails', () => {
    workflowService.getFinanceReceipts.mockReturnValue(throwError(() => ({ status: 500, error: { message: 'Database unavailable' } })));

    createComponent();

    expect(fixture.componentInstance.receipts()).toEqual([]);
    expect(fixture.componentInstance.unpairedReceipts()).toEqual([]);
    expect(fixture.componentInstance.receiptError()).toBe('Database unavailable');
  });

  it('uses the Back Officer invoice route only for the Back Officer dashboard', () => {
    routeData.next({ role: 'back-office', page: 'dashboard' });

    createComponent();

    expect(workflowService.getBackOfficeReceipts).toHaveBeenCalledTimes(1);
    expect(workflowService.getBackOfficeRemittances).toHaveBeenCalledTimes(1);
    expect(workflowService.getInvoices).toHaveBeenCalledTimes(1);
  });

  it('loads invoices from the paged items envelope and defaults null pairing status to Unpaired', () => {
    workflowService.getInvoices.mockReturnValueOnce(of({
      items: [{
        idInvoice: 14,
        invoiceId: 14,
        contractId: 4,
        contractName: 'Property Contract',
        umr: 'IT26-F-PD-0001',
        counterpartyId: 3,
        counterpartyName: 'Cedent',
        invoiceNumber: 'INV-2026-000014',
        invoiceType: 'CEDENT_PREMIUM_INVOICE',
        invoiceDate: '2026-10-06',
        grossAmount: 50,
        netPremium: 45,
        recoveryStatus: null,
        status: 'Draft',
        label: 'Premium'
      }],
      pageNumber: 1,
      pageSize: 20,
      totalCount: 1,
      totalPages: 1
    }));
    routeData.next({ role: 'back-office', page: 'invoices' });

    createComponent();

    expect(fixture.componentInstance.invoices()).toHaveLength(1);
    expect(fixture.componentInstance.invoices()[0].recoveryStatus).toBe('Unpaired');
    expect(fixture.nativeElement.textContent).toContain('INV-2026-000014');
    expect(fixture.nativeElement.textContent).toContain('Cedent');
    expect(fixture.nativeElement.textContent).not.toContain('No invoices found');
  });

  it('shows an API error and retry instead of rendering the empty state', () => {
    workflowService.getInvoices.mockReturnValueOnce(throwError(() => new HttpErrorResponse({
      status: 500,
      statusText: 'Server Error',
      error: { message: 'Invoice query failed' }
    })));
    routeData.next({ role: 'back-office', page: 'invoices' });

    createComponent();

    expect(fixture.nativeElement.textContent).toContain('HTTP 500: Invoice query failed');
    expect(fixture.nativeElement.textContent).toContain('Retry');
    expect(fixture.nativeElement.textContent).not.toContain('No invoices found');
    expect(fixture.nativeElement.textContent).not.toContain('No invoices match the selected filters');
  });

  it('distinguishes an unfiltered empty list from a filtered empty list', () => {
    routeData.next({ role: 'back-office', page: 'invoices' });
    createComponent();
    expect(fixture.nativeElement.textContent).toContain('No invoices found');
    expect(fixture.nativeElement.textContent).not.toContain('No invoices match the selected filters');

    fixture.componentInstance.invoiceFilters.controls.search.setValue('missing');
    expect(fixture.componentInstance.hasInvoiceFilters()).toBe(true);
  });

  it('loads beneficiary and currency data when opening the bank-account modal', () => {
    createComponent();

    fixture.componentInstance.openBankAccounts({
      id: 22,
      name: 'Ami',
      status: 'Active',
      hasActiveBankAccount: true,
      activeBankAccountCount: 1
    });
    fixture.detectChanges();

    expect(counterpartiesService.getCounterpartyById).toHaveBeenCalledWith(22);
    expect(workflowService.getBankAccounts).toHaveBeenCalledWith(22);
    expect(contractsService.getCurrencies).toHaveBeenCalledTimes(1);
    expect(fixture.nativeElement.textContent).toContain('Beneficiary Re');
    expect(fixture.nativeElement.textContent).not.toContain('Default account');
    expect(fixture.nativeElement.textContent).toContain('Banque correspondante');
  });

  it('normalizes bank-account create requests and clears correspondent data when disabled', () => {
    createComponent();
    fixture.componentInstance.openBankAccounts({
      id: 22,
      name: 'Ami',
      status: 'Active',
      hasActiveBankAccount: false,
      activeBankAccountCount: 0
    });
    fixture.componentInstance.bankAccountForm.patchValue({
      currencyId: 3,
      currencySearch: 'USD - US Dollar',
      bankName: '  IRIS Bank  ',
      bankCity: 'Casablanca',
      bankCountry: 'Morocco',
      iban: 'ma64 0115 1900 0001 2050 0053 4921',
      swiftBic: 'iris ma 12',
      hasCorrespondentBank: true,
      correspondentBankName: 'Correspondent',
      correspondentSwiftBic: 'corr ma 12'
    });

    fixture.componentInstance.bankAccountForm.controls.hasCorrespondentBank.setValue(false);
    fixture.componentInstance.saveBankAccount();

    expect(workflowService.createBankAccount).toHaveBeenCalledWith(22, expect.objectContaining({
      counterpartyId: 22,
      bankName: 'IRIS Bank',
      iban: 'MA64011519000001205000534921',
      swiftBic: 'IRISMA12',
      hasCorrespondentBank: false,
      correspondentBankName: null,
      correspondentSwiftBic: null
    }));
    expect(counterpartiesService.getFinanceCounterparties).toHaveBeenCalledTimes(2);
  });

  it('requires correspondent fields only when Banque correspondante is enabled', () => {
    createComponent();

    fixture.componentInstance.bankAccountForm.patchValue({
      currencyId: 3,
      bankName: 'IRIS Bank',
      bankCity: 'Casablanca',
      bankCountry: 'Morocco',
      iban: 'MA64011519000001205000534921',
      swiftBic: 'IRISMA12',
      hasCorrespondentBank: false
    });

    expect(fixture.componentInstance.bankAccountForm.valid).toBe(true);

    fixture.componentInstance.bankAccountForm.controls.hasCorrespondentBank.setValue(true);

    expect(fixture.componentInstance.bankAccountForm.controls.correspondentBankName.hasError('required')).toBe(true);
    expect(fixture.componentInstance.bankAccountForm.controls.correspondentSwiftBic.hasError('required')).toBe(true);
    expect(fixture.componentInstance.bankAccountForm.invalid).toBe(true);
  });

  it('renders backend-owned active bank-account status without default-account wording', () => {
    routeData.next({ role: 'finance', page: 'bank-accounts' });

    createComponent();

    const text = fixture.nativeElement.textContent;
    expect(text).toContain('Ami');
    expect(text).toContain('Active bank account available');
    expect(text).toContain('1 active bank account');
    expect(text).toContain('No Account Re');
    expect(text).toContain('Add an active bank account before payment.');
    expect(text).toContain('Bank Accounts');
    expect(text).not.toContain('Verify active default bank account before payment.');
    expect(text).not.toContain('Default account');
  });

  it('shows a retryable error when the backend does not provide bank-account status', () => {
    counterpartiesService.getFinanceCounterparties.mockReturnValue(throwError(() => new Error('Counterparty bank-account status is unavailable from the backend response.')));
    routeData.next({ role: 'finance', page: 'bank-accounts' });

    createComponent();

    expect(fixture.componentInstance.counterparties()).toEqual([]);
    expect(fixture.nativeElement.textContent).toContain('Counterparty bank-account status is unavailable from the backend response.');
    expect(fixture.nativeElement.textContent).toContain('Retry');
  });

  it('refreshes the counterparty status after deactivating a bank account', () => {
    createComponent();

    fixture.componentInstance.setBankAccountStatus({
      idBankAccount: 44,
      idCounterparty: 22,
      counterpartyId: 22,
      beneficiaryName: 'Ami',
      beneficiaryAddress: null,
      beneficiaryCity: null,
      beneficiaryCountry: null,
      currencyId: 3,
      currencyCode: 'USD',
      bankName: 'IRIS Bank',
      bankCity: 'Casablanca',
      bankCountry: 'Morocco',
      agencyCode: null,
      rib: null,
      iban: 'MA64011519000001205000534921',
      swiftBic: 'IRISMA12',
      hasCorrespondentBank: false,
      correspondentBankName: null,
      correspondentSwiftBic: null,
      accountLabel: null,
      isDefault: false,
      isActive: true
    }, false);

    expect(workflowService.setBankAccountStatus).toHaveBeenCalledWith(22, 44, false);
    expect(workflowService.getBankAccounts).toHaveBeenCalledWith(22);
    expect(counterpartiesService.getFinanceCounterparties).toHaveBeenCalledTimes(2);
  });

  it('creates an encaissement from a selected active bank account without exposing the full IBAN', () => {
    const activeAccount = {
      idBankAccount: 44,
      idCounterparty: 22,
      counterpartyId: 22,
      beneficiaryName: 'Ami',
      beneficiaryAddress: null,
      beneficiaryCity: null,
      beneficiaryCountry: null,
      currencyId: 3,
      currencyCode: 'TND',
      bankName: 'BIAT',
      bankCity: 'Tunis',
      bankCountry: 'Tunisia',
      agencyCode: null,
      rib: null,
      iban: 'TN5914207207100707128831',
      swiftBic: 'BIATTNTT',
      hasCorrespondentBank: false,
      correspondentBankName: null,
      correspondentSwiftBic: null,
      accountLabel: null,
      isDefault: false,
      isActive: true
    };
    const inactiveAccount = {
      ...activeAccount,
      idBankAccount: 45,
      bankName: 'Inactive Bank',
      iban: 'TN0000000000000000000000',
      swiftBic: 'INACTNTT',
      isActive: false
    };
    workflowService.getBankAccounts.mockImplementation((counterpartyId: number) => of(counterpartyId === 22 ? [activeAccount, inactiveAccount] : []));
    workflowService.createReceipt.mockReturnValue(of({
      idBankReceipt: 99,
      bankAccountId: 44,
      counterpartyId: 22,
      counterpartyName: 'Ami',
      receptionDate: '2026-09-01',
      operationDate: '2026-09-01',
      amountReceived: 1250.1234,
      currencyId: 3,
      currencyCode: 'TND',
      appliedExchangeRate: null,
      availableAmount: 1250.1234,
      allocatedAmount: 0,
      pairingStatus: 'Unpaired',
      settlementMethod: 'BANK_TRANSFER',
      collectionType: 'PREMIUM',
      bankReference: 'BNK-9',
      settlementLabel: 'Affaire A1'
    }));
    routeData.next({ role: 'finance', page: 'receipts' });
    createComponent();

    fixture.componentInstance.openReceiptModal();
    fixture.componentInstance.selectReceiptBankAccount(activeAccount);
    fixture.componentInstance.receiptForm.patchValue({
      receiptMonth: '2026-09',
      amountReceived: 1250.1234,
      settlementMethod: 'BankTransfer',
      collectionType: 'Premium'
    });
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent;
    expect(text).toContain('Counterparty / Cédante');
    expect(text).not.toContain('Cedante is required');
    expect(text).not.toContain('Devise');
    expect(text).toContain('BIAT');
    expect(text).not.toContain('Pairing information supplied by Finance');
    expect(text).not.toContain('Référence bancaire');
    expect(text).not.toContain('Facture N');
    expect(text).not.toContain('Mois de facture');
    expect(text).not.toContain('Notes');
    expect(text).toContain('TN59');
    expect(text).toContain('8831');
    expect(text).not.toContain('TN5914207207100707128831');
    expect(text).not.toContain('Inactive Bank');
    expect(fixture.componentInstance.filteredReceiptBankAccounts().map(account => account.idBankAccount)).toEqual([44]);

    fixture.componentInstance.createReceipt();

    expect(workflowService.createReceipt).toHaveBeenCalledWith({
      bankAccountId: 44,
      receiptMonth: '2026-09',
      amountReceived: 1250.1234,
      settlementMethod: 'BankTransfer',
      collectionType: 'Premium'
    });
    expect(workflowService.getBackOfficeReceipts).not.toHaveBeenCalled();
    expect(fixture.componentInstance.successMessage()).toBe('Encaissement created and sent to the Back Officer for pairing.');
  });

  it('blocks encaissement submission when no active bank account is available', () => {
    workflowService.getBankAccounts.mockReturnValue(of([]));
    routeData.next({ role: 'finance', page: 'receipts' });
    createComponent();

    fixture.componentInstance.openReceiptModal();
    fixture.componentInstance.openReceiptBankAccountDropdown();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('No matching active bank accounts.');
    expect(fixture.nativeElement.textContent).toContain('Create Encaissement');
    const submitButton = fixture.nativeElement.querySelector('form button[type="submit"]') as HTMLButtonElement;
    expect(submitButton.disabled).toBe(false);

    submitButton.click();
    fixture.detectChanges();

    expect(workflowService.createReceipt).not.toHaveBeenCalled();
    expect(fixture.nativeElement.textContent).toContain('Create Encaissement is blocked by:');
    expect(fixture.nativeElement.textContent).toContain('Select a bank account from the search results.');
  });

  it('resolves the visible bank-account label to the real id before submitting encaissement', () => {
    const activeAccount = {
      idBankAccount: 44,
      idCounterparty: 22,
      counterpartyId: 22,
      beneficiaryName: 'ami',
      beneficiaryAddress: null,
      beneficiaryCity: null,
      beneficiaryCountry: null,
      currencyId: 3,
      currencyCode: 'TND',
      bankName: 'biat',
      bankCity: 'Tunis',
      bankCountry: 'Tunisia',
      agencyCode: null,
      rib: null,
      iban: 'TN5914207207100707128831',
      maskedIban: 'TN****8831',
      swiftBic: '15249584',
      hasCorrespondentBank: false,
      correspondentBankName: null,
      correspondentSwiftBic: null,
      accountLabel: null,
      isDefault: false,
      isActive: true
    };
    workflowService.getBankAccounts.mockImplementation((counterpartyId: number) => of(counterpartyId === 22 ? [activeAccount] : []));
    routeData.next({ role: 'finance', page: 'receipts' });
    createComponent();

    fixture.componentInstance.openReceiptModal();
    fixture.componentInstance.receiptForm.patchValue({
      bankAccountSearch: 'ami - biat - TN****8831 - 15249584 - TND',
      bankAccountId: null,
      receiptMonth: '2026-09',
      amountReceived: 15000,
      settlementMethod: 'BankTransfer',
      collectionType: 'Premium'
    });
    fixture.componentInstance.createReceipt();

    expect(workflowService.createReceipt).toHaveBeenCalledWith({
      bankAccountId: 44,
      receiptMonth: '2026-09',
      amountReceived: 15000,
      settlementMethod: 'BankTransfer',
      collectionType: 'Premium'
    });
  });

  it('pairs a Back Officer encaissement with selected invoices only', () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const receipt = {
      idBankReceipt: 99,
      bankAccountId: 44,
      counterpartyId: 22,
      counterpartyName: 'ami',
      receptionDate: '2026-09-01',
      operationDate: '2026-09-01',
      amountReceived: 50000,
      currencyId: 3,
      currencyCode: 'TND',
      appliedExchangeRate: null,
      availableAmount: 50000,
      allocatedAmount: 0,
      pairingStatus: 'Unpaired',
      settlementMethod: 'BankTransfer',
      collectionType: 'Premium',
      bankReference: 'REF',
      settlementLabel: ''
    };
    workflowService.getBankAccounts.mockReturnValue(of([
      {
        idBankAccount: 44,
        idCounterparty: 22,
        counterpartyId: 22,
        beneficiaryName: 'ami',
        beneficiaryAddress: null,
        beneficiaryCity: null,
        beneficiaryCountry: null,
        currencyId: 3,
        currencyCode: 'TND',
        bankName: 'BIAT',
        bankCity: 'Tunis',
        bankCountry: 'Tunisia',
        agencyCode: null,
        rib: null,
        iban: 'TN5914207207100707128831',
        maskedIban: 'TN59********8831',
        swiftBic: 'BIATTNTT',
        hasCorrespondentBank: false,
        correspondentBankName: null,
        correspondentSwiftBic: null,
        accountLabel: null,
        isDefault: false,
        isActive: true
      }
    ]));
    workflowService.getEligibleInvoices.mockReturnValue(of({
      status: 200,
      items: [
        {
          invoiceId: 2001,
          idInvoice: 2001,
          invoiceNumber: 'INV-2026-000001',
          label: 'Premium invoice',
          contractId: 1001,
          cedentId: 22,
          cedentName: 'ami',
          contractName: 'SODIG 2025',
          umr: 'IT26-F-PD-0001',
          invoiceType: 'CEDENT_PREMIUM_INVOICE',
          invoiceDate: '2026-09-05',
          grossAmount: 50000,
          alreadyPairedAmount: 0,
          outstandingAmount: 50000,
          currencyCode: 'TND',
          recoveryStatus: 'Unpaired'
        }
      ]
    }));
    workflowService.allocateReceiptInvoices.mockReturnValue(of({
      ...receipt,
      pairingStatus: 'Paired',
      availableAmount: 0,
      allocatedAmount: 50000,
      generatedRemittances: [
        {
          remittanceRef: 77,
          receiptAllocationId: 33,
          disbursementId: null,
          panelId: 501,
          counterpartyId: 88,
          counterpartyName: 'Example Reinsurer',
          signedSharePct: 40,
          allocatedAmount: 6000,
          netPremiumDue: 6000,
          netPayableAmount: 5400,
          currencyId: 3,
          currencyCode: 'TND',
          status: 'Draft',
          description: 'Generated from contract encaissement allocation'
        }
      ]
    }));
    routeData.next({ role: 'back-office', page: 'receipts' });
    createComponent();

    fixture.componentInstance.pendingNotificationId.set(5);
    fixture.componentInstance.openPairingModal(receipt);
    fixture.componentInstance.openInvoiceDropdown();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Pair Encaissement with Invoices');
    expect(fixture.nativeElement.textContent).toContain('INV-2026-000001');
    expect(fixture.nativeElement.textContent).toContain('Premium invoice');
    expect(fixture.nativeElement.textContent).toContain('IT26-F-PD-0001');
    expect(fixture.nativeElement.textContent).toContain('SODIG 2025');
    expect(fixture.nativeElement.textContent).toContain('TN59********8831');
    expect(fixture.nativeElement.textContent).not.toContain('Panel 501');

    fixture.componentInstance.selectInvoice(fixture.componentInstance.filteredEligibleInvoices()[0]);
    fixture.componentInstance.pairingForm.controls.allocatedAmount.setValue('50000' as unknown as number);
    fixture.componentInstance.allocateReceipt();
    fixture.detectChanges();

    expect(confirmSpy).toHaveBeenCalled();
    expect(workflowService.allocateReceiptInvoices).toHaveBeenCalledWith(99, {
      allocations: [
        {
          invoiceId: 2001,
          allocatedAmount: 50000
        }
      ]
    });
    expect(workflowService.markNotificationRead).toHaveBeenCalledWith(5);
    expect(fixture.componentInstance.successMessage()).toBe('Encaissement paired successfully.');
    expect(fixture.nativeElement.textContent).toContain('Example Reinsurer');
    expect(fixture.nativeElement.textContent).toContain('40%');
    expect(fixture.nativeElement.textContent).toContain('Draft');
  });

  it('shows a failed invoice-load state instead of the empty-invoice state', () => {
    const receipt = {
      idBankReceipt: 99,
      bankAccountId: 44,
      counterpartyId: 22,
      counterpartyName: 'ami',
      receptionDate: '2026-09-01',
      operationDate: '2026-09-01',
      amountReceived: 50000,
      currencyId: 3,
      currencyCode: 'TND',
      appliedExchangeRate: null,
      availableAmount: 50000,
      allocatedAmount: 0,
      pairingStatus: 'Unpaired',
      settlementMethod: 'BankTransfer',
      collectionType: 'Premium',
      bankReference: 'REF',
      settlementLabel: ''
    };
    workflowService.getBankAccounts.mockReturnValue(of([]));
    workflowService.getEligibleInvoices
      .mockReturnValueOnce(throwError(() => new HttpErrorResponse({
        status: 0,
        statusText: 'Unknown Error',
        url: 'http://localhost:5151/api/back-office/bank-receipts/99/eligible-invoices'
      })))
      .mockReturnValueOnce(of({
        status: 200,
        items: [
          {
            invoiceId: 2001,
            invoiceNumber: 'INV-2026-000001',
            label: 'Premium invoice',
            contractId: 1001,
            cedentId: 22,
            cedentName: 'ami',
            contractName: 'SODIG 2025',
            umr: 'IT26-F-PD-0001',
            grossAmount: 50000,
            alreadyPairedAmount: 0,
            outstandingAmount: 50000,
            currencyCode: 'TND',
            recoveryStatus: 'Unpaired'
          }
        ]
      }));
    routeData.next({ role: 'back-office', page: 'receipts' });
    createComponent();

    fixture.componentInstance.openPairingModal(receipt);
    fixture.componentInstance.openInvoiceDropdown();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Unable to load invoices because the backend is unavailable.');
    expect(fixture.nativeElement.textContent).toContain('HTTP status: 0');
    expect(fixture.nativeElement.textContent).toContain('Retry');
    expect(fixture.nativeElement.textContent).not.toContain('No eligible invoices found.');

    const retryButton = Array.from(fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>)
      .find(button => button.textContent?.trim() === 'Retry');
    retryButton?.click();
    fixture.detectChanges();

    expect(workflowService.getEligibleInvoices).toHaveBeenCalledTimes(2);
    expect(fixture.nativeElement.textContent).toContain('IT26-F-PD-0001');
  });

  it('shows the empty invoice message only after a successful empty response', () => {
    const receipt = {
      idBankReceipt: 99,
      bankAccountId: 44,
      counterpartyId: 22,
      counterpartyName: 'ami',
      receptionDate: '2026-09-01',
      operationDate: '2026-09-01',
      amountReceived: 50000,
      currencyId: 3,
      currencyCode: 'TND',
      appliedExchangeRate: null,
      availableAmount: 50000,
      allocatedAmount: 0,
      pairingStatus: 'Unpaired',
      settlementMethod: 'BankTransfer',
      collectionType: 'Premium',
      bankReference: 'REF',
      settlementLabel: ''
    };
    workflowService.getBankAccounts.mockReturnValue(of([]));
    workflowService.getEligibleInvoices.mockReturnValue(of({ items: [], status: 200 }));
    routeData.next({ role: 'back-office', page: 'receipts' });
    createComponent();

    fixture.componentInstance.openPairingModal(receipt);
    fixture.componentInstance.openInvoiceDropdown();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('No eligible invoices found.');
    expect(fixture.nativeElement.textContent).not.toContain('Unable to load invoices because the backend is unavailable.');
  });

  it('displays backend allocation validation errors instead of a generic message', () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const receipt = {
      idBankReceipt: 99,
      bankAccountId: 44,
      counterpartyId: 22,
      counterpartyName: 'ami',
      receptionDate: '2026-09-01',
      operationDate: '2026-09-01',
      amountReceived: 50000,
      currencyId: 3,
      currencyCode: 'TND',
      appliedExchangeRate: null,
      availableAmount: 50000,
      allocatedAmount: 0,
      pairingStatus: 'Unpaired',
      settlementMethod: 'BankTransfer',
      collectionType: 'Premium',
      bankReference: 'REF',
      settlementLabel: ''
    };
    workflowService.getBankAccounts.mockReturnValue(of([]));
    workflowService.getEligibleInvoices.mockReturnValue(of({
      status: 200,
      items: [
        {
          invoiceId: 2,
          invoiceNumber: 'INV-2',
          label: 'Premium invoice',
          contractId: 1001,
          cedentId: 22,
          cedentName: 'ami',
          contractName: 'SODIG 2025',
          umr: 'IT26-F-PD-0001',
          grossAmount: 15000,
          alreadyPairedAmount: 0,
          outstandingAmount: 15000,
          currencyCode: 'TND',
          recoveryStatus: 'Unpaired'
        }
      ]
    }));
    workflowService.allocateReceiptInvoices.mockReturnValue(throwError(() => new HttpErrorResponse({
      status: 400,
      error: {
        errors: {
          allocatedAmount: ['Allocation exceeds the encaissement balance.']
        }
      }
    })));
    routeData.next({ role: 'back-office', page: 'receipts' });
    createComponent();

    fixture.componentInstance.openPairingModal(receipt);
    fixture.componentInstance.selectInvoice(fixture.componentInstance.filteredEligibleInvoices()[0]);
    fixture.componentInstance.pairingForm.controls.allocatedAmount.setValue(15000);
    fixture.componentInstance.allocateReceipt();
    fixture.detectChanges();

    expect(confirmSpy).toHaveBeenCalled();
    expect(workflowService.allocateReceiptInvoices).toHaveBeenCalledWith(99, {
      allocations: [
        {
          invoiceId: 2,
          allocatedAmount: 15000
        }
      ]
    });
    expect(fixture.nativeElement.textContent).toContain('allocatedAmount: Allocation exceeds the encaissement balance.');
    expect(fixture.nativeElement.textContent).not.toContain('Request failed. Review the form and retry.');
  });

  it('pairs with a numeric idInvoice-only eligible invoice and displays backend validation arrays', () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const receipt = {
      idBankReceipt: 99,
      bankAccountId: 44,
      counterpartyId: 22,
      counterpartyName: 'ami',
      receptionDate: '2026-09-01',
      operationDate: '2026-09-01',
      amountReceived: 50000,
      currencyId: 3,
      currencyCode: 'TND',
      appliedExchangeRate: null,
      availableAmount: 50000,
      allocatedAmount: 0,
      pairingStatus: 'Unpaired',
      settlementMethod: 'BankTransfer',
      collectionType: 'Premium',
      bankReference: 'REF',
      settlementLabel: ''
    };
    workflowService.getBankAccounts.mockReturnValue(of([]));
    workflowService.getEligibleInvoices.mockReturnValue(of({
      status: 200,
      items: [
        {
          idInvoice: '2',
          invoiceId: '2',
          invoiceNumber: 'INV-2',
          label: 'Premium invoice',
          contractId: 1001,
          cedentId: 22,
          cedentName: 'ami',
          contractName: 'SODIG 2025',
          umr: 'IT26-F-PD-0001',
          grossAmount: 15000,
          alreadyPairedAmount: 0,
          outstandingAmount: 15000,
          currencyCode: 'TND',
          recoveryStatus: 'Unpaired'
        } as never
      ]
    }));
    workflowService.allocateReceiptInvoices.mockReturnValue(throwError(() => new HttpErrorResponse({
      status: 400,
      error: {
        message: 'Validation failed.',
        errors: ['invoiceId must be a positive numeric Invoice ID.']
      }
    })));
    routeData.next({ role: 'back-office', page: 'receipts' });
    createComponent();

    fixture.componentInstance.openPairingModal(receipt);
    fixture.componentInstance.selectInvoice(fixture.componentInstance.filteredEligibleInvoices()[0]);
    fixture.componentInstance.pairingForm.controls.allocatedAmount.setValue('15000' as unknown as number);
    fixture.componentInstance.allocateReceipt();
    fixture.detectChanges();

    expect(confirmSpy).toHaveBeenCalled();
    expect(workflowService.allocateReceiptInvoices).toHaveBeenCalledWith(99, {
      allocations: [
        {
          invoiceId: 2,
          allocatedAmount: 15000
        }
      ]
    });
    expect(fixture.nativeElement.textContent).toContain('invoiceId must be a positive numeric Invoice ID.');
    expect(fixture.nativeElement.textContent).not.toContain('Request failed. Review the form and retry.');
  });

  it('confirms a Back Officer remittance without opening the invoice form or sending invoice fields', () => {
    workflowService.getBackOfficeRemittances.mockReturnValue(of([
      {
        remittanceRef: 77,
        receiptAllocationId: 10,
        disbursementId: null,
        panelId: 100,
        counterpartyId: 22,
        counterpartyName: 'AMI',
        netPremiumDue: 1800,
        netPayableAmount: 1620,
        currencyId: 3,
        currencyCode: 'TND',
        status: 'ReadyForDisbursement',
        description: 'Ready remittance'
      }
    ]));
    workflowService.confirmRemittance.mockReturnValue(of({
      remittanceRef: 77,
      receiptAllocationId: 10,
      disbursementId: null,
      panelId: 100,
      counterpartyId: 22,
      counterpartyName: 'AMI',
      netPremiumDue: 1800,
      netPayableAmount: 1620,
      currencyId: 3,
      currencyCode: 'TND',
      status: 'ReadyForDisbursement',
      description: 'Ready remittance'
    }));
    routeData.next({ role: 'back-office', page: 'remittances' });
    createComponent();

    const confirmButton = Array.from(fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>)
      .find(button => button.textContent?.trim() === 'Confirm')!;
    confirmButton.click();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Confirm this remittance for Finance disbursement?');
    expect(fixture.nativeElement.textContent).toContain('Reinsurer:');
    expect(fixture.nativeElement.textContent).toContain('AMI');
    expect(fixture.nativeElement.textContent).toContain('Net payable:');
    expect(fixture.nativeElement.textContent).toContain('TND');
    expect(fixture.nativeElement.textContent).toContain('1');
    expect(fixture.nativeElement.textContent).not.toContain('Receipt Allocation ID');
    expect(fixture.nativeElement.textContent).not.toContain('Panel ID');

    const submitButton = Array.from(fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>)
      .find(button => button.textContent?.trim() === 'Confirm for disbursement')!;
    submitButton.click();
    fixture.detectChanges();

    expect(workflowService.confirmRemittance).toHaveBeenCalledWith(77);
    expect(workflowService.confirmRemittance.mock.calls[0]).toHaveLength(1);
    expect(fixture.componentInstance.successMessage()).toBe('Remittance sent to Finance for disbursement.');
    expect(fixture.nativeElement.textContent).toContain('Awaiting Finance Disbursement');
    expect(fixture.nativeElement.textContent).not.toContain('Create Invoice');
  });

  it('starts disbursement from the read-only modal and downloads the backend invoice', () => {
    const remittance = {
      remittanceRef: 2,
      receiptAllocationId: 11,
      disbursementId: null,
      panelId: 101,
      contractId: 5,
      contractName: 'SODIG 2026',
      umr: 'IT26-F-PD-0001',
      cedentName: 'Cedent SA',
      counterpartyId: 22,
      counterpartyName: 'AMI',
      allocatedAmount: 1800,
      otherDeductions: 180,
      netPremiumDue: 1800,
      netPayableAmount: 1620,
      currencyId: 3,
      currencyCode: 'TND',
      status: 'AwaitingFinanceDisbursement',
      description: 'Ready remittance'
    };
    workflowService.getDisbursementQueue.mockReturnValue(of([remittance]));
    workflowService.getDisbursementContext.mockReturnValue(of({
      remittanceId: 2,
      contractName: 'SODIG 2026',
      umr: 'IT26-F-PD-0001',
      cedentName: 'Cedent SA',
      panelId: 101,
      reinsurerId: 22,
      reinsurerName: 'AMI',
      grossPremium: 1800,
      deductions: 180,
      netPayableAmount: 1620,
      currencyCode: 'TND',
      status: 'AwaitingFinanceDisbursement',
      canDownloadInvoice: false,
      canStartPayment: true,
      canConfirmTransfer: false,
      defaultBankAccount: {
        idBankAccount: 44,
        bankName: 'BIAT',
        bankCity: 'Tunis',
        bankCountry: 'Tunisia',
        iban: 'TN5914207207100707128831',
        swiftBic: 'BIATTNTT',
        correspondentBankName: null,
        correspondentSwiftBic: null,
        isDefault: true
      }
    }));
    workflowService.getBankAccounts.mockReturnValue(of([
      {
        idBankAccount: 44,
        idCounterparty: 22,
        counterpartyId: 22,
        beneficiaryName: 'AMI',
        beneficiaryAddress: '1 Avenue',
        beneficiaryCity: 'Tunis',
        beneficiaryCountry: 'Tunisia',
        currencyId: 3,
        currencyCode: 'TND',
        bankName: 'BIAT',
        bankCity: 'Tunis',
        bankCountry: 'Tunisia',
        agencyCode: null,
        rib: null,
        iban: 'TN5914207207100707128831',
        maskedIban: 'TN****8831',
        swiftBic: 'BIATTNTT',
        hasCorrespondentBank: false,
        correspondentBankName: null,
        correspondentSwiftBic: null,
        accountLabel: null,
        isDefault: true,
        isActive: true
      }
    ]));
    workflowService.startDisbursement.mockReturnValue(of({
      status: 'PaymentInProgress',
      remittanceId: 2,
      invoiceDownloadUrl: '/api/finance/disbursements/7/invoice',
      disbursementId: 7,
      invoiceId: 4
    }));
    routeData.next({ role: 'finance', page: 'disbursements' });
    createComponent();

    fixture.componentInstance.openDisbursementModal(remittance);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Contract name');
    expect(fixture.nativeElement.textContent).toContain('SODIG 2026');
    expect(fixture.nativeElement.textContent).toContain('Remittance reference');
    expect(fixture.nativeElement.textContent).toContain('BIAT');
    expect(fixture.nativeElement.textContent).toContain('Download Invoice');
    expect(fixture.nativeElement.textContent).not.toContain('Payment method');
    expect(fixture.nativeElement.textContent).not.toContain('Transfer date');
    expect(fixture.nativeElement.textContent).not.toContain('Bank reference');

    fixture.componentInstance.startDisbursement();
    fixture.detectChanges();

    expect(workflowService.startDisbursement).toHaveBeenCalledWith(2);
    expect(workflowService.downloadDocumentUrl).toHaveBeenCalledWith('/api/finance/disbursements/7/invoice');
    expect(workflowService.createDisbursement).not.toHaveBeenCalled();
    expect(fixture.componentInstance.selectedRemittance()?.disbursementId).toBe(7);
    expect(fixture.componentInstance.selectedRemittance()?.status).toBe('PaymentInProgress');
    expect(fixture.componentInstance.successMessage()).toBe('Invoice downloaded. Payment processing has started.');
  });

  it('loads a remittance disbursement context only once when the same modal is opened again', () => {
    const remittance = {
      remittanceRef: 2,
      receiptAllocationId: 11,
      disbursementId: 7,
      invoiceId: 4,
      panelId: 101,
      counterpartyId: 22,
      counterpartyName: 'AMI',
      netPremiumDue: 1800,
      netPayableAmount: 1620,
      currencyId: 3,
      currencyCode: 'TND',
      status: 'PaymentInProgress',
      invoiceDownloadUrl: '/api/finance/disbursements/7/invoice',
      description: 'Payment in progress'
    };
    workflowService.getDisbursementContext.mockReturnValue(of({
      remittanceId: 2,
      reinsurerId: 22,
      reinsurerName: 'AMI',
      netPayableAmount: 1620,
      currencyCode: 'TND',
      status: 'PaymentInProgress',
      disbursementId: 7,
      invoiceId: 4,
      invoiceDownloadUrl: '/api/finance/disbursements/7/invoice',
      canDownloadInvoice: true,
      canStartPayment: false,
      canConfirmTransfer: true,
      defaultBankAccount: {
        idBankAccount: 44,
        bankName: 'BIAT',
        bankCity: 'Tunis',
        bankCountry: 'Tunisia',
        iban: 'TN5914207207100707128831',
        swiftBic: 'BIATTNTT',
        correspondentBankName: null,
        correspondentSwiftBic: null,
        isDefault: false
      }
    }));
    routeData.next({ role: 'finance', page: 'disbursements' });
    createComponent();

    fixture.componentInstance.openDisbursementModal(remittance);
    fixture.componentInstance.openDisbursementModal(remittance);

    expect(workflowService.getDisbursementContext).toHaveBeenCalledTimes(1);
    expect(workflowService.getDisbursementContext).toHaveBeenCalledWith(2);
    expect(workflowService.getBankAccounts).toHaveBeenCalledTimes(1);
  });

  it('uses one context response and ignores later emissions from the same request', () => {
    const context = new Subject<unknown>();
    const remittance = {
      remittanceRef: 2,
      receiptAllocationId: 11,
      disbursementId: null,
      panelId: 101,
      counterpartyId: 22,
      counterpartyName: 'AMI',
      netPremiumDue: 1800,
      netPayableAmount: 1620,
      currencyId: 3,
      currencyCode: 'TND',
      status: 'AwaitingFinanceDisbursement',
      description: 'Ready remittance'
    };
    workflowService.getDisbursementContext.mockReturnValue(context.asObservable());
    routeData.next({ role: 'finance', page: 'disbursements' });
    createComponent();

    fixture.componentInstance.openDisbursementModal(remittance);
    context.next({
      remittanceId: 2,
      reinsurerId: 22,
      reinsurerName: 'AMI',
      netPayableAmount: 1620,
      currencyCode: 'TND',
      status: 'PaymentInProgress',
      disbursementId: 7,
      invoiceId: 4,
      invoiceDownloadUrl: '/api/finance/disbursements/7/invoice',
      canDownloadInvoice: true,
      canStartPayment: false,
      canConfirmTransfer: true,
      defaultBankAccount: {
        idBankAccount: 44,
        bankName: 'BIAT',
        bankCity: 'Tunis',
        bankCountry: 'Tunisia',
        iban: 'TN5914207207100707128831',
        swiftBic: 'BIATTNTT',
        correspondentBankName: null,
        correspondentSwiftBic: null,
        isDefault: false
      }
    });
    context.next({
      remittanceId: 2,
      reinsurerId: 22,
      reinsurerName: 'AMI',
      netPayableAmount: 1620,
      currencyCode: 'TND',
      status: 'Closed',
      disbursementId: 999,
      canDownloadInvoice: true,
      canStartPayment: false,
      canConfirmTransfer: false,
      defaultBankAccount: {
        idBankAccount: 44,
        bankName: 'BIAT',
        bankCity: 'Tunis',
        bankCountry: 'Tunisia',
        iban: 'TN5914207207100707128831',
        swiftBic: 'BIATTNTT',
        correspondentBankName: null,
        correspondentSwiftBic: null,
        isDefault: false
      }
    });

    expect(fixture.componentInstance.selectedRemittance()?.disbursementId).toBe(7);
    expect(fixture.componentInstance.selectedRemittance()?.status).toBe('PaymentInProgress');
  });

  it('accepts an active same-reinsurer same-currency bank account even when it is not default', () => {
    const remittance = {
      remittanceRef: 2,
      receiptAllocationId: 11,
      disbursementId: null,
      panelId: 101,
      counterpartyId: 22,
      counterpartyName: 'AMI',
      netPremiumDue: 1800,
      netPayableAmount: 1620,
      currencyId: 3,
      currencyCode: 'TND',
      status: 'AwaitingFinanceDisbursement',
      description: 'Ready remittance'
    };
    workflowService.getDisbursementContext.mockReturnValue(of({
      remittanceId: 2,
      reinsurerId: 22,
      reinsurerName: 'AMI',
      netPayableAmount: 1620,
      currencyCode: 'TND',
      status: 'AwaitingFinanceDisbursement',
      canDownloadInvoice: false,
      canStartPayment: true,
      canConfirmTransfer: false,
      defaultBankAccount: {
        idBankAccount: 44,
        bankName: 'BIAT',
        bankCity: 'Tunis',
        bankCountry: 'Tunisia',
        iban: 'TN5914207207100707128831',
        swiftBic: 'BIATTNTT',
        correspondentBankName: null,
        correspondentSwiftBic: null,
        isDefault: false
      }
    }));
    workflowService.getBankAccounts.mockReturnValue(of([{
      idBankAccount: 44,
      idCounterparty: 22,
      counterpartyId: 22,
      beneficiaryName: 'AMI',
      beneficiaryAddress: '1 Avenue',
      beneficiaryCity: 'Tunis',
      beneficiaryCountry: 'Tunisia',
      currencyId: 3,
      currencyCode: 'TND',
      bankName: 'BIAT',
      bankCity: 'Tunis',
      bankCountry: 'Tunisia',
      agencyCode: null,
      rib: null,
      iban: null,
      maskedIban: null,
      swiftBic: null,
      hasCorrespondentBank: false,
      correspondentBankName: null,
      correspondentSwiftBic: null,
      accountLabel: null,
      isDefault: false,
      isActive: true
    }]));
    routeData.next({ role: 'finance', page: 'disbursements' });
    createComponent();

    fixture.componentInstance.openDisbursementModal(remittance);

    expect(fixture.componentInstance.hasValidDisbursementBankAccount()).toBe(true);
    expect(fixture.componentInstance.canSubmitDisbursement()).toBe(true);
  });

  it('shows backend unavailable instead of a bank-account validation error when account loading fails', () => {
    const remittance = {
      remittanceRef: 2,
      receiptAllocationId: 11,
      disbursementId: null,
      panelId: 101,
      counterpartyId: 22,
      counterpartyName: 'AMI',
      netPremiumDue: 1800,
      netPayableAmount: 1620,
      currencyId: 3,
      currencyCode: 'TND',
      status: 'AwaitingFinanceDisbursement',
      description: 'Ready remittance'
    };
    workflowService.getDisbursementContext.mockReturnValue(of({
      remittanceId: 2,
      reinsurerId: 22,
      reinsurerName: 'AMI',
      netPayableAmount: 1620,
      currencyCode: 'TND',
      status: 'AwaitingFinanceDisbursement',
      canDownloadInvoice: false,
      canStartPayment: true,
      canConfirmTransfer: false,
      defaultBankAccount: {
        idBankAccount: 44,
        bankName: 'BIAT',
        bankCity: 'Tunis',
        bankCountry: 'Tunisia',
        iban: 'TN5914207207100707128831',
        swiftBic: 'BIATTNTT',
        correspondentBankName: null,
        correspondentSwiftBic: null,
        isDefault: false
      }
    }));
    workflowService.getBankAccounts.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 0 })));
    routeData.next({ role: 'finance', page: 'disbursements' });
    createComponent();

    fixture.componentInstance.openDisbursementModal(remittance);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Backend unavailable. Check the API server and retry.');
    expect(fixture.nativeElement.textContent).not.toContain('A valid reinsurer bank account is required before disbursement.');
  });

  it('confirms transfer for a payment in progress and closes the disbursement', () => {
    const remittance = {
      remittanceRef: 4,
      receiptAllocationId: 11,
      disbursementId: 501,
      panelId: 101,
      counterpartyId: 22,
      counterpartyName: 'AMI',
      netPremiumDue: 1800,
      netPayableAmount: 1620,
      currencyId: 3,
      currencyCode: 'TND',
      status: 'PaymentInProgress',
      invoiceDownloadUrl: '/api/finance/disbursements/501/invoice',
      description: 'Ready remittance'
    };
    workflowService.getDisbursementContext.mockReturnValue(of({
      remittanceId: 4,
      reinsurerId: 22,
      reinsurerName: 'AMI',
      netPayableAmount: 1620,
      currencyCode: 'TND',
      status: 'PaymentInProgress',
      disbursementId: 501,
      canDownloadInvoice: true,
      canStartPayment: false,
      canConfirmTransfer: true,
      defaultBankAccount: {
        idBankAccount: 44,
        bankName: 'BIAT',
        bankCity: 'Tunis',
        bankCountry: 'Tunisia',
        iban: 'TN5914207207100707128831',
        swiftBic: 'BIATTNTT',
        correspondentBankName: null,
        correspondentSwiftBic: null,
        isDefault: false
      }
    }));
    workflowService.confirmTransfer.mockReturnValue(of({
      status: 'Closed',
      transferCompletedAt: '2026-09-23T12:00:00Z'
    }));
    routeData.next({ role: 'finance', page: 'disbursements' });
    createComponent();

    fixture.componentInstance.openDisbursementModal(remittance);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Download Invoice Again');
    expect(fixture.nativeElement.textContent).toContain('Confirm Amount Transferred');

    fixture.componentInstance.openTransferConfirmation();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Confirm that TND');
    expect(fixture.nativeElement.textContent).toContain('was transferred to AMI?');
    expect(fixture.nativeElement.textContent).toContain('This will close the disbursement.');

    fixture.componentInstance.confirmTransfer();
    fixture.detectChanges();

    expect(workflowService.confirmTransfer).toHaveBeenCalledWith(501);
    expect(fixture.componentInstance.selectedRemittance()?.status).toBe('Closed');
    expect(fixture.componentInstance.successMessage()).toBe('The amount transfer was confirmed successfully.');
    expect(fixture.componentInstance.isTransferConfirmationOpen()).toBe(false);
    expect(workflowService.getDisbursementQueue).toHaveBeenCalledTimes(2);
  });

  it('keeps the transfer confirmation open and the status unchanged when confirmation fails', () => {
    const remittance = {
      remittanceId: 2,
      remittanceRef: 2,
      remittanceReference: 'REM-2',
      receiptAllocationId: 11,
      disbursementId: 501,
      invoiceId: 4,
      panelId: 101,
      counterpartyId: 22,
      counterpartyName: 'AMI',
      netPremiumDue: 1800,
      netPayableAmount: 1620,
      currencyId: 3,
      currencyCode: 'TND',
      status: 'PaymentInProgress',
      invoiceDownloadUrl: '/api/finance/disbursements/501/invoice',
      description: 'Payment in progress'
    };
    workflowService.getDisbursementContext.mockReturnValue(of({
      remittanceId: 2,
      reinsurerId: 22,
      reinsurerName: 'AMI',
      netPayableAmount: 1620,
      currencyCode: 'TND',
      status: 'PaymentInProgress',
      disbursementId: 501,
      invoiceId: 4,
      invoiceDownloadUrl: '/api/finance/disbursements/501/invoice',
      canDownloadInvoice: true,
      canStartPayment: false,
      canConfirmTransfer: true,
      defaultBankAccount: {
        idBankAccount: 44,
        bankName: 'BIAT',
        bankCity: 'Tunis',
        bankCountry: 'Tunisia',
        iban: 'TN5914207207100707128831',
        swiftBic: 'BIATTNTT',
        correspondentBankName: null,
        correspondentSwiftBic: null,
        isDefault: false
      }
    }));
    workflowService.confirmTransfer.mockReturnValue(throwError(() => new HttpErrorResponse({
      status: 409,
      error: { message: 'Disbursement is not in progress.' }
    })));
    routeData.next({ role: 'finance', page: 'disbursements' });
    createComponent();

    fixture.componentInstance.openDisbursementModal(remittance);
    fixture.componentInstance.openTransferConfirmation();
    fixture.componentInstance.confirmTransfer();

    expect(workflowService.confirmTransfer).toHaveBeenCalledWith(501);
    expect(fixture.componentInstance.selectedRemittance()?.status).toBe('PaymentInProgress');
    expect(fixture.componentInstance.isTransferConfirmationOpen()).toBe(true);
    expect(fixture.componentInstance.isConfirmingTransfer()).toBe(false);
    expect(fixture.componentInstance.errorMessage()).toBe('Disbursement is not in progress.');
  });

  it('prevents duplicate confirm-transfer requests while confirmation is in flight', () => {
    const confirmation = new Subject<unknown>();
    const remittance = {
      remittanceRef: 2,
      receiptAllocationId: 11,
      disbursementId: 501,
      panelId: 101,
      counterpartyId: 22,
      counterpartyName: 'AMI',
      netPremiumDue: 1800,
      netPayableAmount: 1620,
      currencyId: 3,
      currencyCode: 'TND',
      status: 'PaymentInProgress',
      description: 'Payment in progress'
    };
    workflowService.getDisbursementContext.mockReturnValue(of({
      remittanceId: 2,
      reinsurerId: 22,
      reinsurerName: 'AMI',
      netPayableAmount: 1620,
      currencyCode: 'TND',
      status: 'PaymentInProgress',
      disbursementId: 501,
      canDownloadInvoice: true,
      canStartPayment: false,
      canConfirmTransfer: true,
      defaultBankAccount: {
        idBankAccount: 44,
        bankName: 'BIAT',
        bankCity: 'Tunis',
        bankCountry: 'Tunisia',
        iban: 'TN5914207207100707128831',
        swiftBic: 'BIATTNTT',
        correspondentBankName: null,
        correspondentSwiftBic: null,
        isDefault: false
      }
    }));
    workflowService.confirmTransfer.mockReturnValue(confirmation.asObservable());
    routeData.next({ role: 'finance', page: 'disbursements' });
    createComponent();

    fixture.componentInstance.openDisbursementModal(remittance);
    fixture.componentInstance.openTransferConfirmation();
    fixture.componentInstance.confirmTransfer();
    fixture.componentInstance.confirmTransfer();

    expect(workflowService.confirmTransfer).toHaveBeenCalledTimes(1);
    expect(fixture.componentInstance.isConfirmingTransfer()).toBe(true);
  });

  it('enables payment-in-progress actions for spaced or underscored status values with real disbursement and BIAT data', () => {
    const remittance = {
      remittanceId: 2,
      remittanceRef: 2,
      remittanceReference: 'REM-2',
      receiptAllocationId: 11,
      disbursementId: 7,
      invoiceId: 4,
      panelId: 101,
      counterpartyId: 22,
      counterpartyName: 'AMI',
      netPremiumDue: 1800,
      netPayableAmount: 1620,
      currencyId: 3,
      currencyCode: 'TND',
      status: 'Payment In Progress',
      invoiceDownloadUrl: '/api/finance/disbursements/7/invoice',
      description: 'Payment in progress'
    };
    workflowService.getDisbursementContext.mockReturnValue(of({
      remittanceId: 2,
      reinsurerId: 22,
      reinsurerName: 'AMI',
      netPayableAmount: 1620,
      currencyCode: 'TND',
      status: 'PAYMENT_IN_PROGRESS',
      disbursementId: 7,
      invoiceId: 4,
      invoiceDownloadUrl: '/api/finance/disbursements/7/invoice',
      canDownloadInvoice: true,
      canStartPayment: false,
      canConfirmTransfer: true,
      defaultBankAccount: {
        idBankAccount: 44,
        bankName: 'BIAT',
        bankCity: 'Tunis',
        bankCountry: 'Tunisia',
        iban: 'TN5914207207100707128831',
        swiftBic: 'BIATTNTT',
        correspondentBankName: null,
        correspondentSwiftBic: null,
        isDefault: false
      }
    }));
    routeData.next({ role: 'finance', page: 'disbursements' });
    createComponent();

    fixture.componentInstance.openDisbursementModal(remittance);
    fixture.detectChanges();

    const selected = fixture.componentInstance.selectedRemittance()!;
    expect(selected.status).toBe('PAYMENT_IN_PROGRESS');
    expect(selected.disbursementId).toBe(7);
    expect(selected.invoiceId).toBe(4);
    expect(selected.invoiceDownloadUrl).toBe('/api/finance/disbursements/7/invoice');
    expect(fixture.componentInstance.isLoadingContext()).toBe(false);
    expect(fixture.componentInstance.isDownloadingInvoice()).toBe(false);
    expect(fixture.componentInstance.isConfirmingTransfer()).toBe(false);
    expect(fixture.componentInstance.hasValidDisbursementBankAccount()).toBe(true);
    expect(fixture.componentInstance.canDownloadExistingInvoice()).toBe(true);
    expect(fixture.componentInstance.canConfirmSelectedTransfer()).toBe(true);

    const buttons = Array.from(fixture.nativeElement.querySelectorAll('button')) as HTMLButtonElement[];
    const downloadButton = buttons.find(button => button.textContent?.trim() === 'Download Invoice Again')!;
    const confirmButton = buttons.find(button => button.textContent?.trim() === 'Confirm Amount Transferred')!;
    expect(downloadButton.disabled).toBe(false);
    expect(confirmButton.disabled).toBe(false);

    downloadButton.click();
    confirmButton.click();
    fixture.detectChanges();
    const finalConfirmButton = (Array.from(fixture.nativeElement.querySelectorAll('button')) as HTMLButtonElement[])
      .find(button => button.textContent?.trim() === 'Confirm Transfer')!;
    finalConfirmButton.click();

    expect(workflowService.downloadDisbursementInvoice).toHaveBeenCalledTimes(1);
    expect(workflowService.downloadDisbursementInvoice).toHaveBeenCalledWith(7);
    expect(workflowService.confirmTransfer).toHaveBeenCalledTimes(1);
    expect(workflowService.confirmTransfer).toHaveBeenCalledWith(7);
    expect(workflowService.downloadDisbursementInvoice).not.toHaveBeenCalledWith(2);
    expect(workflowService.confirmTransfer).not.toHaveBeenCalledWith(2);
  });

  it('reports a backend DTO problem when payment-in-progress context lacks a real disbursement id', () => {
    const remittance = {
      remittanceId: 2,
      remittanceRef: 2,
      remittanceReference: 'REM-2',
      receiptAllocationId: 11,
      disbursementId: null,
      invoiceId: 4,
      panelId: 101,
      counterpartyId: 22,
      counterpartyName: 'AMI',
      netPremiumDue: 1800,
      netPayableAmount: 1620,
      currencyId: 3,
      currencyCode: 'TND',
      status: 'Payment In Progress',
      description: 'Payment in progress'
    };
    workflowService.getDisbursementContext.mockReturnValue(of({
      remittanceId: 2,
      reinsurerId: 22,
      reinsurerName: 'AMI',
      netPayableAmount: 1620,
      currencyCode: 'TND',
      status: 'PAYMENT_IN_PROGRESS',
      disbursementId: null,
      invoiceId: 4,
      canDownloadInvoice: true,
      canStartPayment: false,
      canConfirmTransfer: true,
      defaultBankAccount: {
        idBankAccount: 44,
        bankName: 'BIAT',
        bankCity: 'Tunis',
        bankCountry: 'Tunisia',
        iban: 'TN5914207207100707128831',
        swiftBic: 'BIATTNTT',
        correspondentBankName: null,
        correspondentSwiftBic: null,
        isDefault: false
      }
    }));
    routeData.next({ role: 'finance', page: 'disbursements' });
    createComponent();

    fixture.componentInstance.openDisbursementModal(remittance);
    fixture.detectChanges();

    expect(fixture.componentInstance.canDownloadExistingInvoice()).toBe(false);
    expect(fixture.componentInstance.canConfirmSelectedTransfer()).toBe(false);
    expect(fixture.componentInstance.errorMessage()).toContain('Backend disbursement DTO did not include a real disbursementId');
    expect(workflowService.downloadDisbursementInvoice).not.toHaveBeenCalled();
    expect(workflowService.confirmTransfer).not.toHaveBeenCalled();
  });

  it('downloads a PaymentInProgress invoice using the existing disbursement id, not remittance id', () => {
    const remittance = {
      remittanceId: 2,
      remittanceRef: 2,
      remittanceReference: 'REM-2',
      receiptAllocationId: 11,
      disbursementId: 7,
      invoiceId: 4,
      panelId: 101,
      counterpartyId: 22,
      counterpartyName: 'AMI',
      netPremiumDue: 1800,
      netPayableAmount: 1620,
      currencyId: 3,
      currencyCode: 'TND',
      status: 'PaymentInProgress',
      description: 'Payment in progress'
    };
    workflowService.getDisbursementContext.mockReturnValue(of({
      remittanceId: 2,
      reinsurerId: 22,
      reinsurerName: 'AMI',
      netPayableAmount: 1620,
      currencyCode: 'TND',
      status: 'PaymentInProgress',
      disbursementId: 7,
      invoiceId: 4,
      canDownloadInvoice: true,
      canStartPayment: false,
      canConfirmTransfer: true,
      defaultBankAccount: null
    }));
    routeData.next({ role: 'finance', page: 'disbursements' });
    createComponent();

    fixture.componentInstance.openDisbursementModal(remittance);
    expect(fixture.componentInstance.selectedRemittance()?.disbursementId).toBe(7);
    expect(fixture.componentInstance.canDownloadExistingInvoice()).toBe(true);
    fixture.componentInstance.downloadExistingInvoice();

    expect(workflowService.downloadDisbursementInvoice).toHaveBeenCalledWith(7);
    expect(workflowService.downloadDocumentUrl).not.toHaveBeenCalled();
    expect(workflowService.downloadDisbursementInvoice).not.toHaveBeenCalledWith(2);
    expect(workflowService.startDisbursement).not.toHaveBeenCalled();
  });

  it('preserves the backend invoice download URL but downloads through the real disbursement id endpoint', () => {
    const remittance = {
      remittanceId: 2,
      remittanceRef: 2,
      remittanceReference: 'REM-2',
      receiptAllocationId: 11,
      disbursementId: 7,
      invoiceId: 4,
      panelId: 101,
      counterpartyId: 22,
      counterpartyName: 'AMI',
      netPremiumDue: 1800,
      netPayableAmount: 1620,
      currencyId: 3,
      currencyCode: 'TND',
      status: 'PaymentInProgress',
      description: 'Payment in progress'
    };
    workflowService.getDisbursementContext.mockReturnValue(of({
      remittanceId: 2,
      reinsurerId: 22,
      reinsurerName: 'AMI',
      netPayableAmount: 1620,
      currencyCode: 'TND',
      status: 'PaymentInProgress',
      disbursementId: 7,
      invoiceId: 4,
      invoiceDownloadUrl: '/api/finance/disbursements/7/invoice',
      canDownloadInvoice: true,
      canStartPayment: false,
      canConfirmTransfer: true,
      defaultBankAccount: null
    }));
    routeData.next({ role: 'finance', page: 'disbursements' });
    createComponent();

    fixture.componentInstance.openDisbursementModal(remittance);
    fixture.componentInstance.downloadExistingInvoice();

    expect(fixture.componentInstance.selectedRemittance()?.invoiceDownloadUrl).toBe('/api/finance/disbursements/7/invoice');
    expect(workflowService.downloadDisbursementInvoice).toHaveBeenCalledWith(7);
    expect(workflowService.downloadDocumentUrl).not.toHaveBeenCalled();
    expect(workflowService.startDisbursement).not.toHaveBeenCalled();
  });

  it('keeps closed disbursements downloadable without another transfer-confirmation action', () => {
    const remittance = {
      remittanceRef: 5,
      receiptAllocationId: 11,
      disbursementId: 777,
      panelId: 101,
      counterpartyId: 22,
      counterpartyName: 'AMI',
      netPremiumDue: 1800,
      netPayableAmount: 1620,
      currencyId: 3,
      currencyCode: 'TND',
      status: 'Closed',
      transferCompletedAt: '2026-09-23T12:00:00Z',
      description: 'Closed remittance'
    };
    workflowService.getDisbursementContext.mockReturnValue(of({
      remittanceId: 5,
      reinsurerId: 22,
      reinsurerName: 'AMI',
      netPayableAmount: 1620,
      currencyCode: 'TND',
      status: 'Closed',
      disbursementId: 777,
      canDownloadInvoice: true,
      canStartPayment: false,
      canConfirmTransfer: false,
      defaultBankAccount: null,
      closedAt: '2026-09-23T12:00:00Z'
    }));
    routeData.next({ role: 'finance', page: 'disbursements' });
    createComponent();

    fixture.componentInstance.openDisbursementModal(remittance);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Closed');
    expect(fixture.nativeElement.textContent).toContain('Transfer completion date');
    expect(fixture.nativeElement.textContent).toContain('Download Invoice');
    expect(fixture.nativeElement.textContent).not.toContain('Confirm Amount Transferred');

    fixture.componentInstance.downloadExistingInvoice();

    expect(workflowService.downloadDisbursementInvoice).toHaveBeenCalledWith(777);
    expect(workflowService.startDisbursement).not.toHaveBeenCalled();
  });

  it('shows Make Disbursement for remittances awaiting Finance disbursement', () => {
    workflowService.getDisbursementQueue.mockReturnValue(of([
      {
        remittanceRef: 1,
        receiptAllocationId: 10,
        disbursementId: null,
        panelId: 100,
        counterpartyId: 22,
        counterpartyName: 'Draft Reinsurer',
        netPremiumDue: 1000,
        netPayableAmount: 900,
        currencyId: 3,
        currencyCode: 'TND',
        status: 'Draft',
        description: 'Draft remittance'
      },
      {
        remittanceRef: 2,
        receiptAllocationId: 11,
        disbursementId: null,
        panelId: 101,
        counterpartyId: 23,
        counterpartyName: 'Ready Reinsurer',
        netPremiumDue: 1500,
        netPayableAmount: 1400,
        currencyId: 3,
        currencyCode: 'TND',
        status: 'AwaitingFinanceDisbursement',
        description: 'Ready remittance'
      },
      {
        remittanceRef: 3,
        receiptAllocationId: 12,
        disbursementId: 44,
        panelId: 102,
        counterpartyId: 24,
        counterpartyName: 'Paid Reinsurer',
        netPremiumDue: 2000,
        netPayableAmount: 1900,
        currencyId: 3,
        currencyCode: 'TND',
        status: 'Disbursed',
        description: 'Paid remittance'
      }
    ]));
    routeData.next({ role: 'finance', page: 'disbursements' });
    createComponent();
    fixture.detectChanges();

    const actionButtons = Array.from(fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>)
      .filter(button => button.textContent?.trim() === 'Make Disbursement');

    expect(actionButtons).toHaveLength(1);
    expect(fixture.nativeElement.textContent).toContain('Ready Reinsurer');
    expect(fixture.nativeElement.textContent).toContain('Draft Reinsurer');
    expect(fixture.nativeElement.textContent).toContain('Paid Reinsurer');

    const rows = Array.from(fixture.nativeElement.querySelectorAll('tbody tr') as NodeListOf<HTMLTableRowElement>);
    rows[1].click();
    fixture.detectChanges();

    expect(fixture.componentInstance.selectedRemittance()?.remittanceRef).toBe(2);
    expect(fixture.nativeElement.textContent).toContain('Make Disbursement');
  });
});
