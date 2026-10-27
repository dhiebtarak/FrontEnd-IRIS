import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { BehaviorSubject, of, Subject, throwError } from 'rxjs';
import { ToastrService } from 'ngx-toastr';
import { ContractsService } from '../../../shared/services/contracts.service';
import { CounterpartiesService } from '../../../shared/services/counterparties.service';
import { FinancialWorkflowService } from '../../../shared/services/financial-workflow.service';
import { DocumentsService } from '../../../shared/services/documents.service';
import { FinancialWorkspacePageComponent } from './financial-workspace-page.component';

describe('FinancialWorkspacePageComponent', () => {
  let fixture: ComponentFixture<FinancialWorkspacePageComponent>;
  let routeData: BehaviorSubject<Record<string, unknown>>;

  const batchContext = {
    closingId: 1, closingReference: 'CL-1', closingDate: '2026-10-12T08:00:00Z', status: 'AwaitingFinanceDisbursement',
    reinsurerId: 5, reinsurerName: 'AMI', reinsurerAddress: 'Tunis', reinsurerCity: 'Tunis', reinsurerCountry: 'Tunisia',
    currencyId: 1, currencyCode: 'TND', totalClosingAmount: 199.55, storedTotal: 199.55, calculatedTotal: 199.55, difference: 0, isConsistent: true, bankAccounts: [],
    selectedBankAccount: { idBankAccount: 3, bankName: 'BIAT', bankCity: 'Tunis', bankCountry: 'Tunisia', iban: 'TN00000000000000000000000000', swiftBic: 'BIATTNTT', correspondentBankName: null, correspondentSwiftBic: null, isDefault: false },
    lines: [{ remittanceRef: 6, remittanceReference: 'REM-13', sourceType: 'PREMIUM', contractName: 'Factory', umr: 'UMR-1', panelName: 'AMI panel', invoiceNumber: 'INV-1', receiptReference: null, netPayableAmount: 200, signedNetPayableAmount: 200 },
      { remittanceRef: 7, remittanceReference: 'REM-22', sourceType: 'AVOIR', contractName: 'Warehouse', umr: 'UMR-2', panelName: 'AMI panel 2', invoiceNumber: 'AV-1', receiptReference: null, netPayableAmount: -0.45, signedNetPayableAmount: -0.45 }],
    canDownloadPdf: true, pdfDownloadUrl: '/api/finance/closings/1/pdf', disbursementId: null,
    canStartPayment: true, canConfirmTransfer: false, validationMessage: null
  };

  it('opens the whole closing and never requests a remittance context for its ID', () => {
    createComponent();
    workflowService.getClosingDisbursementContext.mockReturnValue(of(batchContext));
    fixture.componentInstance.openClosingDisbursementModal(1);
    fixture.detectChanges();
    expect(workflowService.getClosingDisbursementContext).toHaveBeenCalledWith(1);
    expect(workflowService.getDisbursementContext).not.toHaveBeenCalled();
    expect(fixture.componentInstance.selectedRemittance()).toBeNull();
    expect(fixture.nativeElement.textContent).toContain('REM-13');
    expect(fixture.nativeElement.textContent).toContain('REM-22');
    expect(fixture.nativeElement.textContent).toContain('UMR-2');
    expect(fixture.nativeElement.textContent).toContain('CL-1');
    expect(fixture.nativeElement.textContent).toContain('TND -0,450');
    expect(fixture.nativeElement.textContent).toContain('TND +199,550');
    expect(fixture.nativeElement.textContent).toContain('No encaissement');
  });

  it('processes the complete closing using its ID', () => {
    createComponent();
    workflowService.getClosingDisbursementContext.mockReturnValue(of(batchContext));
    workflowService.startClosingDisbursement.mockReturnValue(of({ ...batchContext, status: 'PaymentInProgress', canStartPayment: false, canConfirmTransfer: true, disbursementId: 12 }));
    workflowService.confirmClosingTransfer.mockReturnValue(of({ ...batchContext, status: 'Closed', canStartPayment: false, canConfirmTransfer: false, disbursementId: 12 }));
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    fixture.componentInstance.openClosingDisbursementModal(1);
    fixture.componentInstance.startClosingPayment();
    fixture.componentInstance.confirmClosingPayment();
    expect(workflowService.startClosingDisbursement).toHaveBeenCalledWith(1);
    expect(workflowService.confirmClosingTransfer).toHaveBeenCalledWith(1);
    expect(workflowService.startDisbursement).not.toHaveBeenCalled();
    expect(fixture.componentInstance.closingContext()?.status).toBe('Closed');
  });

  it('cancels stale closing requests and rejects mismatched closing responses', () => {
    createComponent();
    const first = new Subject<any>();
    const second = new Subject<any>();
    workflowService.getClosingDisbursementContext.mockReturnValueOnce(first).mockReturnValueOnce(second);
    fixture.componentInstance.openClosingDisbursementModal(1);
    fixture.componentInstance.openClosingDisbursementModal(2);
    first.next(batchContext);
    expect(fixture.componentInstance.closingContext()).toBeNull();
    second.next(batchContext);
    expect(fixture.componentInstance.closingContext()).toBeNull();
    expect(fixture.componentInstance.disbursementLoadError()).toContain('different closing');
  });

  it('renders one mixed Premium/Avoir queue row and opens its closing by ID', () => {
    workflowService.getFinanceClosingQueue.mockReturnValue(of([{
      closingId: 8, closingReference: 'CL-8', reinsurerName: 'AMI', lineCount: 2, premiumTotal: 200,
      avoirTotal: 0.45, netPayableAmount: 199.55, currencyCode: 'TND', issueDate: '2026-10-21', status: 'AwaitingFinanceDisbursement'
    }]));
    routeData.next({ role: 'finance', page: 'disbursements' });
    createComponent();
    fixture.detectChanges();
    expect(workflowService.getFinanceClosingQueue).toHaveBeenCalledTimes(1);
    expect(fixture.nativeElement.textContent).toContain('CL-8');
    expect(fixture.nativeElement.textContent).toContain('TND 199,550');
    expect(fixture.nativeElement.querySelectorAll('tbody tr').length).toBe(1);
    workflowService.getClosingDisbursementContext.mockReturnValue(of({ ...batchContext, closingId: 8, closingReference: 'CL-8' }));
    getButtonsByText('Make Disbursement')[0].click();
    expect(workflowService.getClosingDisbursementContext).toHaveBeenCalledWith(8);
    expect(workflowService.getDisbursementContext).not.toHaveBeenCalled();
  });

  it('shows stored, calculated and difference values from an inconsistent backend context', () => {
    createComponent();
    workflowService.getClosingDisbursementContext.mockReturnValue(of({
      ...batchContext, isConsistent: false, storedTotal: 199.55, calculatedTotal: 199.5, difference: -0.05,
      validationMessage: 'Closing lines do not reconcile.'
    }));
    fixture.componentInstance.openClosingDisbursementModal(1);
    fixture.detectChanges();
    const text = fixture.nativeElement.textContent;
    expect(text).toContain('Stored total:');
    expect(text).toContain('Calculated total:');
    expect(text).toContain('Difference:');
    expect(text).toContain('Closing lines do not reconcile.');
    expect(fixture.componentInstance.canStartClosingPayment(fixture.componentInstance.closingContext()!)).toBe(false);
  });

  it('prevents duplicate start-payment calls while the request is pending', () => {
    createComponent();
    workflowService.getClosingDisbursementContext.mockReturnValue(of(batchContext));
    const pending = new Subject<any>();
    workflowService.startClosingDisbursement.mockReturnValue(pending);
    fixture.componentInstance.openClosingDisbursementModal(1);
    fixture.componentInstance.startClosingPayment();
    fixture.componentInstance.startClosingPayment();
    expect(workflowService.startClosingDisbursement).toHaveBeenCalledTimes(1);
    pending.next({ ...batchContext, status: 'PaymentInProgress', canStartPayment: false });
    pending.complete();
  });
  let workflowService: {
    getFinanceReceipts: ReturnType<typeof vi.fn>;
    getBackOfficeReceipts: ReturnType<typeof vi.fn>;
    getReceipt: ReturnType<typeof vi.fn>;
    createReceipt: ReturnType<typeof vi.fn>;
    getEligibleInvoices: ReturnType<typeof vi.fn>;
    getEligibleAvoirRefundReceipts: ReturnType<typeof vi.fn>;
    refundAvoir: ReturnType<typeof vi.fn>;
    allocateReceiptInvoices: ReturnType<typeof vi.fn>;
    getDisbursementQueue: ReturnType<typeof vi.fn>;
    getFinanceClosingQueue: ReturnType<typeof vi.fn>;
    getDisbursementContext: ReturnType<typeof vi.fn>;
    getClosingDisbursementContext: ReturnType<typeof vi.fn>;
    startClosingDisbursement: ReturnType<typeof vi.fn>;
    confirmClosingTransfer: ReturnType<typeof vi.fn>;
    downloadFinanceClosing: ReturnType<typeof vi.fn>;
    createDisbursement: ReturnType<typeof vi.fn>;
    startDisbursement: ReturnType<typeof vi.fn>;
    confirmTransfer: ReturnType<typeof vi.fn>;
    confirmRemittance: ReturnType<typeof vi.fn>;
    confirmRemittancesForDisbursement: ReturnType<typeof vi.fn>;
    downloadDisbursementInvoice: ReturnType<typeof vi.fn>;
    downloadInvoicePdf: ReturnType<typeof vi.fn>;
    downloadAvoirPdf: ReturnType<typeof vi.fn>;
    downloadPremiumDebitNote: ReturnType<typeof vi.fn>;
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
  let documentsService: Pick<DocumentsService, 'getDocuments' | 'uploadDocument' | 'downloadDocument' | 'archiveDocument'>;
  let toastr: Pick<ToastrService, 'success' | 'error'>;
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
      getEligibleAvoirRefundReceipts: vi.fn().mockReturnValue(of([])),
      refundAvoir: vi.fn().mockReturnValue(of({ remittanceId: 7, remittanceReference: 'REM-7', beneficiaryName: 'Cedent' })),
      allocateReceiptInvoices: vi.fn().mockReturnValue(of({})),
      getDisbursementQueue: vi.fn().mockReturnValue(of([])),
      getFinanceClosingQueue: vi.fn().mockReturnValue(of([])),
      getDisbursementContext: vi.fn().mockReturnValue(of({})),
      getClosingDisbursementContext: vi.fn().mockReturnValue(of({})),
      startClosingDisbursement: vi.fn().mockReturnValue(of({})),
      confirmClosingTransfer: vi.fn().mockReturnValue(of({})),
      downloadFinanceClosing: vi.fn().mockReturnValue(of({})),
      createDisbursement: vi.fn().mockReturnValue(of({})),
      startDisbursement: vi.fn().mockReturnValue(of({})),
      confirmTransfer: vi.fn().mockReturnValue(of({})),
      confirmRemittance: vi.fn().mockReturnValue(of({})),
      confirmRemittancesForDisbursement: vi.fn().mockReturnValue(of({ items: [] })),
      downloadPremiumDebitNote: vi.fn(),
      downloadInvoicePdf: vi.fn(),
      downloadAvoirPdf: vi.fn(),
      downloadDisbursementInvoice: vi.fn().mockReturnValue(of({ blob: new Blob(['pdf'], { type: 'application/pdf' }), fileName: 'invoice.pdf', contentType: 'application/pdf' })),
      downloadDocument: vi.fn().mockReturnValue(of({ blob: new Blob(['pdf'], { type: 'application/pdf' }), fileName: 'invoice.pdf', contentType: 'application/pdf' })),
      downloadDocumentUrl: vi.fn().mockReturnValue(of({ blob: new Blob(['pdf'], { type: 'application/pdf' }), fileName: 'invoice.pdf', contentType: 'application/pdf' })),
      getBackOfficeRemittances: vi.fn().mockReturnValue(of({ items: [], pageNumber: 1, pageSize: 20, totalCount: 0, totalPages: 0 })),
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
    documentsService = {
      getDocuments: vi.fn().mockReturnValue(of([])),
      uploadDocument: vi.fn().mockReturnValue(of({})),
      downloadDocument: vi.fn().mockReturnValue(of({ blob: new Blob(['file']), fileName: 'receipt.pdf' })),
      archiveDocument: vi.fn().mockReturnValue(of(void 0))
    };
    toastr = { success: vi.fn(), error: vi.fn() };
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
        { provide: ContractsService, useValue: contractsService },
        { provide: DocumentsService, useValue: documentsService },
        { provide: ToastrService, useValue: toastr }
      ]
    }).compileComponents();
  });

  function createComponent(): void {
    fixture = TestBed.createComponent(FinancialWorkspacePageComponent);
    fixture.detectChanges();
  }

  function getButtonsByText(text: string): HTMLButtonElement[] {
    return Array.from(fixture.nativeElement.querySelectorAll('button'))
      .filter((button): button is HTMLButtonElement => button instanceof HTMLButtonElement && button.textContent?.trim() === text);
  }

  it('shows Avoir amounts as negative while keeping allocation inputs positive and pairing their signed net', () => {
    routeData.next({ role: 'back-office', page: 'receipts' });
    createComponent();
    const component = fixture.componentInstance;
    const invoice = {
      invoiceId: 11,
      idInvoice: 11,
      invoiceNumber: 'INV-11',
      invoiceType: 'INVOICE',
      invoiceAmount: 100,
      grossAmount: 100,
      remainingAmount: 100,
      outstandingAmount: 100
    } as any;
    const avoir = {
      invoiceId: 12,
      idInvoice: 12,
      invoiceNumber: 'AV-12',
      invoiceType: 'AVOIR',
      invoiceAmount: 50,
      grossAmount: 50,
      signedAmount: -50,
      remainingAmount: 50,
      outstandingAmount: 50
    } as any;
    component.eligibleInvoices.set([invoice, avoir]);
    component.selectedReceipt.set({ availableAmount: 50 } as any);
    component.proposedAllocations.set({ 11: 100, 12: 50 });

    expect(component.getInvoicePrimaryAmount(avoir)).toBe(-50);
    expect(component.getEligibleInvoiceSignedAmount(avoir, 50)).toBe(-50);
    expect(component.allocatedAmountInForm()).toBe(50);
    expect(component.pairingRemainingAmount()).toBe(0);
    expect(component.proposedAllocationItems().map(item => item.allocatedAmount)).toEqual([100, 50]);
    expect(component.isPairingFormValid()).toBe(true);
  });

  it('uses backend eligible receipts for the Avoir-only Cedent refund flow', () => {
    const eligibleReceipt = {
      bankReceiptId: 2, receiptReference: 'BR-2', receiptAmount: 45, allocatedAmount: 45, remainingAmount: 0, pairingStatus: 'Paired',
      currencyCode: 'TND', contractId: 4, contractName: 'Bound contract', cedentId: 3,
      cedentName: 'Cedent', avoirInvoiceId: 25, avoirNumber: 'AV-25', availableAvoirAmount: 10, refundAmount: 10,
      isEligibleForRefund: true, eligibilityFailureReason: null
    };
    workflowService.getEligibleAvoirRefundReceipts.mockReturnValue(of([eligibleReceipt]));
    routeData.next({ role: 'back-office', page: 'invoices' });
    createComponent();
    const component = fixture.componentInstance;
    const avoir = { idInvoice: 25, invoiceType: 'AVOIR', invoiceNumber: 'AV-25' } as any;

    component.openAvoirRefund(avoir);
    expect(workflowService.getEligibleAvoirRefundReceipts).toHaveBeenCalledWith(25);
    expect(component.eligibleAvoirRefundReceipts()).toEqual([eligibleReceipt]);
    component.createAvoirRefund(eligibleReceipt);

    expect(workflowService.refundAvoir).toHaveBeenCalledTimes(1);
    expect(workflowService.refundAvoir.mock.calls[0][0]).toBe(2);
    expect(workflowService.refundAvoir.mock.calls[0][1]).toMatchObject({ avoirInvoiceId: 25, amount: 10 });
    expect(component.successMessage()).toContain('REM-7');
  });

  it('shows a backend-returned unpaired encaissement and disables refund only by backend eligibility', () => {
    const receipt = {
      bankReceiptId: 31, receiptReference: 'BR-31', receiptAmount: 100, allocatedAmount: 0,
      remainingAmount: 100, pairingStatus: 'Unpaired', currencyCode: 'TND', contractId: 4,
      contractName: 'Bound contract', cedentId: 3, cedentName: 'Cedent', avoirInvoiceId: 25,
      avoirNumber: 'AV-25', availableAvoirAmount: 10, refundAmount: 10,
      isEligibleForRefund: false, eligibilityFailureReason: 'A cedent refund requires this encaissement to be fully paired.'
    };
    workflowService.getEligibleAvoirRefundReceipts.mockReturnValue(of([receipt]));
    routeData.next({ role: 'back-office', page: 'invoices' });
    createComponent();
    const component = fixture.componentInstance;

    component.openAvoirRefund({ idInvoice: 25, invoiceType: 'AVOIR', invoiceNumber: 'AV-25' } as any);
    fixture.detectChanges();

    expect(component.eligibleAvoirRefundReceipts()).toEqual([receipt]);
    expect(fixture.nativeElement.textContent).toContain('Choose an encaissement received from this cedent. All pairing statuses are available.');
    expect(fixture.nativeElement.textContent).toContain('BR-31');
    expect(fixture.nativeElement.textContent).toContain('Unpaired');
    const action = Array.from(fixture.nativeElement.querySelectorAll('button'))
      .find((button: any) => button.textContent.includes('Create Cedent Refund')) as HTMLButtonElement;
    expect(action.disabled).toBe(true);
    expect(fixture.nativeElement.textContent).toContain(receipt.eligibilityFailureReason);
    expect(workflowService.refundAvoir).not.toHaveBeenCalled();
  });

  it('uses the backend Avoir document number, type and signed amount in the general invoice list', () => {
    routeData.next({ role: 'back-office', page: 'invoices' });
    createComponent();
    const component = fixture.componentInstance;
    const avoir = {
      idInvoice: 12,
      invoiceId: 12,
      invoiceType: 'AVOIR',
      isAvoir: true,
      invoiceNumber: 'AV-2026-000012',
      documentNumber: 'AV-2026-000012',
      invoiceAmount: 50,
      grossAmount: 50,
      signedAmount: -50,
      currencyCode: 'TND'
    } as any;

    expect(component.getInvoiceDocumentNumber(avoir)).toBe('AV-2026-000012');
    expect(component.getInvoiceTypeLabel(avoir.invoiceType)).toBe('Avoir');
    expect(component.getInvoicePrimaryAmount(avoir)).toBe(-50);
  });

  it('downloads the selected invoice and only disables its row without navigating', () => {
    routeData.next({ role: 'back-office', page: 'invoices' });
    createComponent();
    const component = fixture.componentInstance;
    const first = { idInvoice: 91, invoiceNumber: 'INV-91', invoiceDate: '2026-10-13' } as any;
    const second = { ...first, idInvoice: 92, invoiceNumber: 'INV-92' };
    component.invoices.set([first, second]);
    const request = new Subject<any>();
    workflowService.downloadInvoicePdf.mockReturnValue(request);
    const save = vi.spyOn(component as any, 'saveDownloadedFile').mockImplementation(() => {});
    fixture.detectChanges();
    getButtonsByText('Download Invoice')[0].click();
    component.downloadListedInvoice(first);
    fixture.detectChanges();
    expect(workflowService.downloadInvoicePdf).toHaveBeenCalledExactlyOnceWith(91);
    expect(getButtonsByText('Downloading...')[0].disabled).toBe(true);
    expect(getButtonsByText('Download Invoice')[0].disabled).toBe(false);
    const file = { blob: new Blob(['%PDF-1.4'], { type: 'application/pdf' }), fileName: 'Backend-Invoice-91.pdf', contentType: 'application/pdf' };
    request.next(file);
    fixture.detectChanges();
    expect(save).toHaveBeenCalledWith(file, 'Facture_INV-91.pdf');
    expect(component.downloadingInvoiceIds().size).toBe(0);
    expect(getButtonsByText('Download Invoice')).toHaveLength(2);
    expect(router.navigate).not.toHaveBeenCalled();
  });

  it('shows Download Avoir and calls only the Avoir PDF endpoint with the Avoir ID', () => {
    routeData.next({ role: 'back-office', page: 'invoices' });
    createComponent();
    const component = fixture.componentInstance;
    const avoir = {
      idInvoice: 12,
      invoiceId: 12,
      invoiceType: 'AVOIR',
      invoiceNumber: 'AV-2026-000012',
      documentNumber: 'AV-2026-000012'
    } as any;
    component.invoices.set([avoir]);
    const request = new Subject<any>();
    workflowService.downloadAvoirPdf.mockReturnValue(request);
    const save = vi.spyOn(component as any, 'saveDownloadedFile').mockImplementation(() => {});

    fixture.detectChanges();
    expect(getButtonsByText('Download Avoir')).toHaveLength(1);
    getButtonsByText('Download Avoir')[0].click();

    expect(workflowService.downloadAvoirPdf).toHaveBeenCalledExactlyOnceWith(12);
    expect(workflowService.downloadInvoicePdf).not.toHaveBeenCalled();
    request.next({
      blob: new Blob(['%PDF-1.4'], { type: 'application/pdf' }),
      fileName: '',
      contentType: 'application/pdf'
    });

    expect(save).toHaveBeenCalledWith(expect.anything(), 'Avoir_AV-2026-000012.pdf');
    expect(component.downloadingInvoiceIds().size).toBe(0);
  });

  it('shows download failures without hiding invoices and re-enables the row', () => {
    routeData.next({ role: 'back-office', page: 'invoices' });
    createComponent();
    const component = fixture.componentInstance;
    const invoice = { idInvoice: 91, invoiceNumber: 'INV-91' } as any;
    component.invoices.set([invoice]);
    workflowService.downloadInvoicePdf.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 500 })));
    component.downloadListedInvoice(invoice);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('PDF generation failed on the backend.');
    expect(component.invoices()).toEqual([invoice]);
    expect(getButtonsByText('Download Invoice')[0].disabled).toBe(false);
    const save = vi.spyOn(component as any, 'saveDownloadedFile');
    workflowService.downloadInvoicePdf.mockReturnValue(of({ blob: new Blob(['error'], { type: 'application/json' }), contentType: 'application/json' }));
    component.downloadListedInvoice(invoice);
    expect(component.errorMessage()).toContain('not a PDF');
    expect(save).not.toHaveBeenCalled();
    expect(component.downloadingInvoiceIds().size).toBe(0);
  });

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

  it('shows Mister Clippy for Finance receipts with the selected receipt ID', () => {
    routeData.next({ role: 'finance', page: 'receipts' });
    createComponent();

    getButtonsByText('Documents')[0].click();
    fixture.detectChanges();

    expect(documentsService.getDocuments).toHaveBeenCalledWith({ scope: 'receipt', receiptId: 10 });
    expect(fixture.nativeElement.textContent).toContain('Encaissement attachments');
    expect(fixture.nativeElement.textContent).toContain('Attach file');
  });

  it('opens receipt attachments read-only for Back Officer pairing', () => {
    workflowService.getBackOfficeReceipts.mockReturnValue(of({
      items: [{
        idBankReceipt: 44,
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
        bankReference: 'BR-44',
        settlementLabel: 'Premium'
      }],
      pageNumber: 1,
      pageSize: 25,
      totalCount: 1,
      totalPages: 1
    }));
    routeData.next({ role: 'back-office', page: 'receipts' });
    createComponent();

    getButtonsByText('Pair Encaissement')[0].click();
    fixture.detectChanges();
    getButtonsByText('Documents').at(-1)?.click();
    fixture.detectChanges();

    expect(fixture.componentInstance.selectedReceiptDocumentContext()).toEqual({ scope: 'receipt', receiptId: 44 });
    expect(documentsService.getDocuments).toHaveBeenCalledWith({ scope: 'receipt', receiptId: 44 });
    expect(fixture.nativeElement.textContent).toContain('Encaissement attachments');
    expect(fixture.nativeElement.textContent).not.toContain('Attach file');
    expect(fixture.nativeElement.textContent).not.toContain('Archive');
  });

  it('does not call the Back Officer invoices endpoint for the Finance dashboard', () => {
    createComponent();

    expect(workflowService.getFinanceReceipts).toHaveBeenCalledTimes(1);
    expect(workflowService.getFinanceClosingQueue).toHaveBeenCalledTimes(1);
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

  it('loads invoices from the paged items envelope and defaults null payment status to Unsettled', () => {
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
    expect(fixture.componentInstance.invoices()[0].recoveryStatus).toBe('Unsettled');
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
    });
    fixture.componentInstance.createReceipt();

    expect(workflowService.createReceipt).toHaveBeenCalledWith({
      bankAccountId: 44,
      receiptMonth: '2026-09',
      amountReceived: 15000,
      settlementMethod: 'BankTransfer',
    });
  });

  it('pairs partially, displays backend remittance lines, closes the modal, and opens Outgoing Remittances', () => {
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
          paymentStatus: 'Unsettled',
          recoveryStatus: 'Unsettled'
        }
      ]
    }));
    workflowService.allocateReceiptInvoices.mockReturnValue(of({
      ...receipt,
      pairingStatus: 'Partially Paired',
      availableAmount: 49500,
      allocatedAmount: 500,
      createdRemittances: [
        {
          remittanceRef: 77,
          remittanceReference: '77',
          receiptAllocationId: 33,
          disbursementId: null,
          panelId: 501,
          counterpartyId: 88,
          counterpartyName: 'Example Reinsurer',
          reinsurerId: 88,
          reinsurerName: 'Example Reinsurer',
          cedentName: 'Example Cedent',
          invoiceNumber: 'INV-2026-000001',
          invoiceLabel: 'Premium invoice',
          contractName: 'SODIG 2025',
          umr: 'IT26-F-PD-0001',
          signedSharePct: 40,
          allocatedAmount: 6000,
          netPremiumDue: 6000,
          netPayableAmount: 5400,
          signedNetPayableAmount: 5400,
          currencyId: 3,
          currencyCode: 'TND',
          status: 'Draft',
          description: 'Generated from contract encaissement allocation'
        },
        {
          remittanceRef: 78,
          remittanceReference: '78',
          receiptAllocationId: 33,
          disbursementId: null,
          panelId: 502,
          counterpartyId: 89,
          counterpartyName: 'Second Reinsurer',
          reinsurerId: 89,
          reinsurerName: 'Second Reinsurer',
          cedentName: 'Example Cedent',
          invoiceNumber: 'INV-2026-000001',
          invoiceLabel: 'Premium invoice',
          contractName: 'SODIG 2025',
          umr: 'IT26-F-PD-0001',
          signedSharePct: 60,
          allocatedAmount: 9000,
          netPremiumDue: 9000,
          netPayableAmount: 8100,
          signedNetPayableAmount: 8100,
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
    fixture.componentInstance.pairingForm.controls.allocatedAmount.setValue('500' as unknown as number);
    fixture.componentInstance.allocateReceipt();
    fixture.detectChanges();

    expect(confirmSpy).toHaveBeenCalled();
    expect(workflowService.allocateReceiptInvoices).toHaveBeenCalledWith(99, {
      allocations: [
        {
          invoiceId: 2001,
          allocatedAmount: 500
        }
      ]
    });
    expect(workflowService.markNotificationRead).toHaveBeenCalledWith(5);
    expect(fixture.componentInstance.successMessage()).toBe('Encaissement paired successfully.');
    expect(fixture.componentInstance.selectedReceipt()?.allocatedAmount).toBe(500);
    expect(fixture.componentInstance.selectedReceipt()?.availableAmount).toBe(49500);
    expect(fixture.componentInstance.selectedReceipt()?.pairingStatus).toBe('Partially Paired');
    expect(fixture.componentInstance.modal()).toBeNull();
    expect(fixture.componentInstance.generatedRemittances().map(item => item.remittanceRef)).toEqual([77, 78]);
    expect(fixture.componentInstance.remittances().map(item => item.remittanceRef)).toEqual([77, 78]);
    expect(router.navigate).toHaveBeenCalledWith(['/workspace/reassurance/back-officer/outgoing-remittances']);

    workflowService.getBackOfficeRemittances.mockReturnValue(of({
      items: fixture.componentInstance.generatedRemittances(), pageNumber: 1, pageSize: 20, totalCount: 2, totalPages: 1
    }));
    routeData.next({ role: 'back-office', page: 'remittances' });
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('INV-2026-000001');
    expect(fixture.nativeElement.textContent).toContain('Premium invoice');
    expect(fixture.nativeElement.textContent).toContain('SODIG 2025');
    expect(fixture.nativeElement.textContent).toContain('IT26-F-PD-0001');
    expect(fixture.nativeElement.textContent).toContain('Example Reinsurer');
    expect(fixture.nativeElement.textContent).toContain('Second Reinsurer');
    expect(fixture.nativeElement.textContent).toContain('Draft');
  });

  it('blocks duplicate pairing submits and warns when the backend returns no created remittances', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const receipt = {
      idBankReceipt: 99, bankAccountId: 44, counterpartyId: 22, counterpartyName: 'ami',
      receptionDate: '2026-09-01', operationDate: '2026-09-01', amountReceived: 50000,
      currencyId: 3, currencyCode: 'TND', appliedExchangeRate: null, availableAmount: 50000,
      allocatedAmount: 0, pairingStatus: 'Unpaired', settlementMethod: 'BankTransfer',
      bankReference: 'REF', settlementLabel: ''
    };
    const allocation = new Subject<any>();
    workflowService.getEligibleInvoices.mockReturnValue(of({ status: 200, items: [{
      invoiceId: 2001, invoiceNumber: 'INV-1', label: 'Premium', contractId: 1, cedentId: 22,
      cedentName: 'ami', contractName: 'Contract', umr: 'UMR-1', grossAmount: 50000,
      alreadyPairedAmount: 0, outstandingAmount: 50000, currencyCode: 'TND', paymentStatus: 'Unsettled'
    }] }));
    workflowService.allocateReceiptInvoices.mockReturnValue(allocation.asObservable());
    routeData.next({ role: 'back-office', page: 'receipts' });
    createComponent();
    fixture.componentInstance.openPairingModal(receipt);
    fixture.componentInstance.selectInvoice(fixture.componentInstance.filteredEligibleInvoices()[0]);
    fixture.componentInstance.pairingForm.controls.allocatedAmount.setValue(500);

    fixture.componentInstance.allocateReceipt();
    fixture.componentInstance.allocateReceipt();
    expect(workflowService.allocateReceiptInvoices).toHaveBeenCalledTimes(1);

    allocation.next({ ...receipt, allocatedAmount: 500, availableAmount: 49500, pairingStatus: 'Partially Paired', createdRemittances: [] });
    fixture.detectChanges();
    expect(fixture.componentInstance.modal()).toBeNull();
    expect(fixture.componentInstance.pairingWarningMessage()).toContain('backend returned no createdRemittances');
    expect(router.navigate).toHaveBeenCalledWith(['/workspace/reassurance/back-officer/outgoing-remittances']);
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
            paymentStatus: 'Unsettled',
            recoveryStatus: 'Unsettled'
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
          paymentStatus: 'Unsettled',
          recoveryStatus: 'Unsettled'
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
          paymentStatus: 'Unsettled',
          recoveryStatus: 'Unsettled'
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
    workflowService.getBackOfficeRemittances.mockReturnValue(of({
      items: [{
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
      }],
      pageNumber: 1,
      pageSize: 20,
      totalCount: 1,
      totalPages: 1
    }));
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
    expect(fixture.nativeElement.textContent).toContain('Beneficiary:');
    expect(fixture.nativeElement.textContent).toContain('AMI');
    expect(fixture.nativeElement.textContent).toContain('Net payable:');
    expect(fixture.nativeElement.textContent).toContain('TND');
    expect(fixture.nativeElement.textContent).toContain('1');
    expect(fixture.nativeElement.textContent).not.toContain('Receipt Allocation ID');
    expect(fixture.nativeElement.textContent).not.toContain('Panel ID');

    const submitButton = Array.from(fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>)
      .find(button => button.textContent?.trim() === 'Confirm for disbursement')!;
    workflowService.confirmRemittance.mockReturnValueOnce(of({ status: 'AwaitingFinanceDisbursement' }));
    workflowService.getBackOfficeRemittances.mockReturnValueOnce(of({
      items: [{ remittanceRef: 77, status: 'AwaitingFinanceDisbursement', currencyCode: 'TND' }],
      pageNumber: 1, pageSize: 20, totalCount: 1, totalPages: 1
    }));
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
      remittanceReference: '2',
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

  it('uses remittance reference 8 for an Avoir refund and the cedent Credit Note workflow', () => {
    const remittance = {
      remittanceId: 88,
      remittanceRef: 88,
      remittanceReference: '8',
      receiptAllocationId: 54,
      sourceType: 'AVOIR_REFUND',
      sourceInvoiceId: 71,
      sourceInvoiceNumber: 'AV-2026-000008',
      beneficiaryType: 'CEDENT',
      counterpartyId: 42,
      counterpartyName: 'Cedent SA',
      contractId: 12,
      contractName: 'Property Contract',
      umr: 'IT26-F-PD-0008',
      netPremiumDue: 10,
      netPayableAmount: 10,
      currencyId: 3,
      currencyCode: 'TND',
      status: 'AwaitingFinanceDisbursement',
      description: 'Cedent Avoir refund',
      panelId: 99,
      disbursementId: null
    };
    const creditNoteUrl = '/api/finance/remittances/8/credit-note';
    workflowService.getDisbursementContext.mockReturnValue(of({
      remittanceId: 88,
      remittanceReference: '8',
      sourceType: 'AVOIR_REFUND',
      beneficiaryType: 'CEDENT',
      beneficiaryId: 42,
      beneficiaryName: 'Cedent SA',
      avoirId: 71,
      avoirNumber: 'AV-2026-000008',
      encaissementReference: 'ENC-45',
      contractId: 12,
      contractName: 'Property Contract',
      umr: 'IT26-F-PD-0008',
      cedentName: 'Cedent SA',
      netPayableAmount: 10,
      currency: 'TND',
      currencyCode: 'TND',
      status: 'AwaitingFinanceDisbursement',
      canStartPayment: true,
      canConfirmTransfer: false,
      creditNoteDownloadUrl: creditNoteUrl,
      defaultBankAccount: {
        idBankAccount: 501,
        bankName: 'Cedent Bank',
        bankCity: 'Tunis',
        bankCountry: 'Tunisia',
        iban: 'TN5900000000000000000000',
        swiftBic: 'CEDNTNTT',
        correspondentBankName: null,
        correspondentSwiftBic: null,
        isDefault: false
      }
    }));
    workflowService.getBankAccounts.mockReturnValue(of([{
      idBankAccount: 501,
      idCounterparty: 42,
      counterpartyId: 42,
      beneficiaryName: 'Cedent SA',
      beneficiaryAddress: null,
      beneficiaryCity: 'Tunis',
      beneficiaryCountry: 'Tunisia',
      currencyId: 3,
      currencyCode: 'TND',
      bankName: 'Cedent Bank',
      bankCity: 'Tunis',
      bankCountry: 'Tunisia',
      agencyCode: null,
      rib: null,
      iban: 'TN5900000000000000000000',
      maskedIban: 'TN****0000',
      swiftBic: 'CEDNTNTT',
      hasCorrespondentBank: false,
      correspondentBankName: null,
      correspondentSwiftBic: null,
      accountLabel: null,
      isDefault: false,
      isActive: true
    }]));
    workflowService.startDisbursement.mockReturnValue(of({
      status: 'PaymentInProgress', remittanceId: 88, disbursementId: 303, invoiceId: 909
    }));
    workflowService.confirmTransfer.mockReturnValue(of({
      status: 'Closed', remittanceId: 88, disbursementId: 303, invoiceId: 909
    }));
    routeData.next({ role: 'finance', page: 'disbursements' });
    createComponent();

    fixture.componentInstance.openDisbursementModal(remittance);
    fixture.detectChanges();

    expect(fixture.componentInstance.getNumericRemittanceReference({ ...remittance, remittanceReference: null })).toBeNull();
    expect(workflowService.getDisbursementContext).toHaveBeenCalledTimes(1);
    expect(workflowService.getDisbursementContext).toHaveBeenCalledWith(8);
    expect(workflowService.getBankAccounts).toHaveBeenCalledWith(42);
    expect(fixture.nativeElement.textContent).toContain('Beneficiary type');
    expect(fixture.nativeElement.textContent).toContain('Cedent');
    expect(fixture.nativeElement.textContent).toContain('Cedent SA');
    expect(fixture.nativeElement.textContent).toContain('IT26-F-PD-0008');
    expect(fixture.nativeElement.textContent).toContain('AV-2026-000008');
    expect(fixture.nativeElement.textContent).toContain('ENC-45');
    expect(fixture.nativeElement.textContent).toContain(fixture.componentInstance.formatMoney(10, 'TND'));
    expect(fixture.nativeElement.textContent).toContain('Cedent Bank');
    expect(fixture.nativeElement.textContent).toContain('Download Credit Note');
    expect(fixture.nativeElement.textContent).not.toContain('Download Invoice');

    fixture.componentInstance.startDisbursement();
    expect(workflowService.startDisbursement).toHaveBeenCalledWith(8);
    expect(workflowService.downloadDocumentUrl).toHaveBeenCalledWith(creditNoteUrl);
    expect(workflowService.downloadDisbursementInvoice).not.toHaveBeenCalled();
    expect(fixture.componentInstance.disbursementContext()?.status).toBe('PaymentInProgress');

    fixture.componentInstance.confirmTransfer();
    expect(workflowService.confirmTransfer).toHaveBeenCalledWith(303);
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
    expect(workflowService.getFinanceClosingQueue).toHaveBeenCalledTimes(2);
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

  it('shows one Finance queue row per closing and uses the closing ID for actions', () => {
    workflowService.getFinanceClosingQueue.mockReturnValue(of([
      { closingId: 20, closingReference: 'CL-20', reinsurerName: 'Ready Reinsurer', lineCount: 2, premiumTotal: 1500, avoirTotal: -100, netPayableAmount: 1400, currencyCode: 'TND', issueDate: '2026-10-20', status: 'AwaitingFinanceDisbursement' },
      { closingId: 21, closingReference: 'CL-21', reinsurerName: 'Paid Reinsurer', lineCount: 1, premiumTotal: 1900, avoirTotal: 0, netPayableAmount: 1900, currencyCode: 'TND', issueDate: '2026-10-19', status: 'Closed' }
    ]));
    routeData.next({ role: 'finance', page: 'disbursements' });
    createComponent();
    fixture.detectChanges();

    const actionButtons = Array.from(fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>)
      .filter(button => button.textContent?.trim() === 'Make Disbursement');

    expect(actionButtons).toHaveLength(1);
    expect(fixture.nativeElement.textContent).toContain('Ready Reinsurer');
    expect(fixture.nativeElement.textContent).toContain('Paid Reinsurer');
    const rows = Array.from(fixture.nativeElement.querySelectorAll('tbody tr') as NodeListOf<HTMLTableRowElement>);
    expect(rows).toHaveLength(2);
    actionButtons[0].click();
    expect(workflowService.getClosingDisbursementContext).toHaveBeenCalledWith(20);
    expect(workflowService.getDisbursementContext).not.toHaveBeenCalled();
  });

  it('selects compatible Draft remittances with null workflow IDs and confirms them in one batch', () => {
    const drafts = [
      { remittanceRef: 9, remittanceReference: 'REM-9', reinsurerId: 22, counterpartyId: 22, beneficiaryId: 22, counterpartyName: 'AMI', beneficiaryType: 'Reinsurer', sourceType: 'Premium', currencyCode: 'TND', netPayableAmount: 0.1, signedNetPayableAmount: 0.1, status: 'Draft', disbursementId: null, panelId: null, closingEligible: false },
      { remittanceRef: 10, remittanceReference: 'REM-10', reinsurerId: 22, counterpartyId: 22, beneficiaryId: 22, counterpartyName: 'AMI', beneficiaryType: 'Reinsurer', sourceType: 'PREMIUM', currencyCode: 'TND', netPayableAmount: 0.2, signedNetPayableAmount: 0.2, status: ' DRAFT ', disbursementId: null, closingEligible: false },
      { remittanceRef: 11, remittanceReference: 'REM-11', reinsurerId: 23, counterpartyId: 23, beneficiaryId: 23, counterpartyName: 'Other', beneficiaryType: 'Reinsurer', currencyCode: 'TND', netPayableAmount: 9, signedNetPayableAmount: 9, status: 'Draft' },
      { remittanceRef: 12, remittanceReference: 'REM-12', counterpartyId: 22, beneficiaryId: 22, counterpartyName: 'AMI', beneficiaryType: 'Reinsurer', currencyCode: 'TND', netPayableAmount: 4, status: 'Closed' },
      { remittanceRef: 13, remittanceReference: 'REM-13', counterpartyId: 22, beneficiaryId: 22, counterpartyName: 'AMI', beneficiaryType: 'Reinsurer', currencyCode: 'TND', netPayableAmount: 5, status: 'Paid' }
    ];
    workflowService.getBackOfficeRemittances
      .mockReturnValueOnce(of({ items: drafts, pageNumber: 1, pageSize: 20, totalCount: 5, totalPages: 1 }))
      .mockReturnValueOnce(of({ items: drafts.map(row => row.remittanceRef === 9 || row.remittanceRef === 10 ? { ...row, status: 'AwaitingFinanceDisbursement' } : row), pageNumber: 1, pageSize: 20, totalCount: 5, totalPages: 1 }));
    workflowService.confirmRemittancesForDisbursement.mockReturnValueOnce(of({ items: [
      { remittanceId: 9, status: 'AwaitingFinanceDisbursement' },
      { remittanceId: 10, status: 'AwaitingFinanceDisbursement' }
    ], signedPremiumTotal: 0.3, signedAvoirTotal: 0, netBalance: 0.3, settlementMode: 'PAYABLE', amountToDisburse: 0.3, remainingAvoirCredit: null }));
    routeData.next({ role: 'back-office', page: 'remittances' });
    createComponent();
    fixture.detectChanges();

    const checkboxes = Array.from(fixture.nativeElement.querySelectorAll('tbody input[type="checkbox"]')) as HTMLInputElement[];
    expect(checkboxes[0].disabled).toBe(false);
    expect(checkboxes[1].disabled).toBe(false);
    expect(checkboxes[2].disabled).toBe(false);
    expect(checkboxes[3].disabled).toBe(true);
    expect(checkboxes[4].disabled).toBe(true);
    checkboxes[0].click();
    fixture.detectChanges();
    const header = fixture.nativeElement.querySelector('thead input[type="checkbox"]') as HTMLInputElement;
    expect(header.indeterminate).toBe(true);
    checkboxes[1].click();
    fixture.detectChanges();
    expect(fixture.componentInstance.selectedRemittanceIds()).toEqual(new Set([9, 10]));
    expect(fixture.componentInstance.selectedRemittanceTotal()).toBe(0.3);
    expect(fixture.nativeElement.textContent).toContain('2 selected');

    expect(header.checked).toBe(true);
    const action = getButtonsByText('Confirm for Disbursement')[0];
    expect(action.disabled).toBe(false);
    action.click();
    action.click();
    fixture.detectChanges();
    expect(workflowService.confirmRemittancesForDisbursement).toHaveBeenCalledTimes(1);
    expect(workflowService.confirmRemittancesForDisbursement).toHaveBeenCalledWith([9, 10]);
    expect(fixture.componentInstance.selectedRemittanceIds().size).toBe(0);
    expect(fixture.componentInstance.remittances().find(row => row.remittanceRef === 9)?.status).toBe('AwaitingFinanceDisbursement');
    expect(fixture.componentInstance.successMessage()).toContain('Amount to disburse');
    expect(fixture.componentInstance.lastRemittanceConfirmation()?.amountToDisburse).toBe(0.3);
  });

  it('allows same-reinsurer Premium and Avoir rows and displays backend signed totals', () => {
    const rows = [
      { remittanceRef: 16, remittanceReference: 'REM-16', reinsurerId: 501, counterpartyId: 501, beneficiaryId: 501, beneficiaryType: 'Cedent', cedentName: 'STAR Assurances', reinsurerName: 'STAR Assurances', sourceType: 'avoir', currencyCode: 'TND', netPayableAmount: 2.5, signedNetPayableAmount: -2.5, status: 'Draft', panelId: 71 },
      { remittanceRef: 15, remittanceReference: 'REM-15', reinsurerId: 501, counterpartyId: 501, beneficiaryId: 501, beneficiaryType: 'Reinsurer', reinsurerName: 'STAR Assurances', counterpartyName: 'STAR Assurances', sourceType: ' premium ', currencyCode: 'TND', netPayableAmount: 5, signedNetPayableAmount: 5, status: 'Draft', panelId: 72 }
    ];
    workflowService.getBackOfficeRemittances.mockReturnValueOnce(of({ items: rows, pageNumber: 1, pageSize: 20, totalCount: 2, totalPages: 1 }));
    workflowService.confirmRemittancesForDisbursement.mockReturnValueOnce(of({
      items: [
        { remittanceId: 16, status: 'AwaitingFinanceDisbursement' },
        { remittanceId: 15, status: 'AwaitingFinanceDisbursement' }
      ],
      signedPremiumTotal: 5,
      signedAvoirTotal: -10,
      netBalance: -5,
      settlementMode: 'CREDIT',
      amountToDisburse: 0,
      remainingAvoirCredit: 0
    }));
    routeData.next({ role: 'back-office', page: 'remittances' });
    createComponent();
    fixture.detectChanges();

    const checkboxes = Array.from(fixture.nativeElement.querySelectorAll('tbody input[type="checkbox"]')) as HTMLInputElement[];
    checkboxes[0].click();
    checkboxes[1].click();
    fixture.detectChanges();

    expect(fixture.componentInstance.selectedRemittanceIds()).toEqual(new Set([16, 15]));
    expect(fixture.componentInstance.remittanceSelectionError()).toBe('');
    expect(fixture.componentInstance.selectedPremiumTotal()).toBe(5);
    expect(fixture.componentInstance.selectedAvoirTotal()).toBe(-2.5);
    expect(fixture.componentInstance.selectedRemittanceTotal()).toBe(2.5);
    const summary = fixture.nativeElement.textContent;
    expect(summary).toContain('2 selected');
    expect(summary).toContain(`Premium total: ${fixture.componentInstance.formatSignedRemittanceTotal(5, 'TND')}`);
    expect(summary).toContain('Reinsurer: STAR Assurances');
    expect(summary).toContain(`Avoir total: ${fixture.componentInstance.formatSignedRemittanceTotal(-2.5, 'TND')}`);
    expect(summary).toContain(`Net balance: ${fixture.componentInstance.formatSignedRemittanceTotal(2.5, 'TND')}`);
    expect(fixture.componentInstance.getRemittanceSourceLabel(rows[0] as any)).toBe('Avoir');
    expect(fixture.componentInstance.getRemittanceSourceLabel(rows[1] as any)).toBe('Premium');
    expect(summary).not.toContain('Beneficiary type');
    expect(summary).toContain('Cedent');
    expect(summary).toContain('Reinsurer');
    expect(summary).toContain(fixture.componentInstance.formatMoney(-2.5, 'TND'));

    getButtonsByText('Confirm for Disbursement')[0].click();
    fixture.detectChanges();
    expect(workflowService.confirmRemittancesForDisbursement).toHaveBeenCalledWith([16, 15]);
    expect(fixture.componentInstance.successMessage()).toContain('Net credit balance');
    expect(fixture.componentInstance.successMessage()).toContain('Net amount:');
    expect(fixture.componentInstance.successMessage()).toContain('No positive disbursement was created');
    expect(fixture.componentInstance.lastRemittanceConfirmation()?.amountToDisburse).toBe(0);
    expect(fixture.nativeElement.textContent).toContain('Settlement mode: CREDIT');
  });

  it('confirms REM-13 and REM-22 by ID when reinsurer and currency match despite different origins', () => {
    const rows = [
      { remittanceRef: 13, remittanceId: 13, remittanceReference: 'REM-13', reinsurerId: 501, counterpartyId: 501, reinsurerName: 'STAR Assurances', beneficiaryType: 'Cedent', sourceType: 'AVOIR', contractId: 4, paymentOrigin: 'Avoir direct', currencyCode: 'TND', signedNetPayableAmount: -10, status: 'Draft' },
      { remittanceRef: 22, remittanceId: 22, remittanceReference: 'REM-22', reinsurerId: 501, counterpartyId: 501, reinsurerName: 'STAR Assurances', beneficiaryType: 'Reinsurer', sourceType: 'Premium', contractId: 9, paymentOrigin: 'Encaissement', currencyCode: 'TND', signedNetPayableAmount: 15, status: 'Draft' }
    ];
    workflowService.getBackOfficeRemittances
      .mockReturnValueOnce(of({ items: rows, pageNumber: 1, pageSize: 20, totalCount: 2, totalPages: 1 }))
      .mockReturnValueOnce(of({ items: rows.map(row => ({ ...row, status: 'AwaitingFinanceDisbursement' })), pageNumber: 1, pageSize: 20, totalCount: 2, totalPages: 1 }));
    workflowService.confirmRemittancesForDisbursement.mockReturnValueOnce(of({
      items: [
        { remittanceId: 13, status: 'AwaitingFinanceDisbursement' },
        { remittanceId: 22, status: 'AwaitingFinanceDisbursement' }
      ],
      signedPremiumTotal: 15,
      signedAvoirTotal: -10,
      netBalance: 5,
      settlementMode: 'PAYABLE',
      amountToDisburse: 5
    }));
    routeData.next({ role: 'back-office', page: 'remittances' });
    createComponent();

    const checkboxes = Array.from(fixture.nativeElement.querySelectorAll('tbody input[type="checkbox"]')) as HTMLInputElement[];
    expect(checkboxes).toHaveLength(2);
    expect(checkboxes.every(checkbox => !checkbox.disabled)).toBe(true);
    checkboxes[0].click();
    checkboxes[1].click();
    fixture.detectChanges();
    expect(fixture.componentInstance.selectedRemittanceIds()).toEqual(new Set([13, 22]));
    expect(fixture.componentInstance.remittanceSelectionError()).toBe('');

    getButtonsByText('Confirm for Disbursement')[0].click();
    fixture.detectChanges();
    expect(workflowService.confirmRemittancesForDisbursement).toHaveBeenCalledTimes(1);
    expect(workflowService.confirmRemittancesForDisbursement).toHaveBeenCalledWith([13, 22]);
    expect(workflowService.getBackOfficeRemittances).toHaveBeenCalledTimes(2);
    expect(fixture.componentInstance.selectedRemittanceIds().size).toBe(0);
    expect(fixture.componentInstance.remittances().filter(row => [13, 22].includes(row.remittanceRef)).every(row => row.status === 'AwaitingFinanceDisbursement')).toBe(true);
    expect(fixture.componentInstance.successMessage()).toContain(`Net amount: ${fixture.componentInstance.formatSignedRemittanceTotal(5, 'TND')}`);
    expect(fixture.componentInstance.successMessage()).toContain('Amount to disburse:');
    expect(fixture.componentInstance.remittances().filter(row => [13, 22].includes(row.remittanceRef)).some(row => ['Paid', 'Closed'].includes(row.status))).toBe(false);
  });

  it('shows the exact backend conflict and affected references while preserving selection', () => {
    const rows = [
      { remittanceRef: 13, remittanceReference: 'REM-13', reinsurerId: 501, reinsurerName: 'STAR Assurances', sourceType: 'AVOIR', contractId: 4, currencyCode: 'TND', signedNetPayableAmount: -10, status: 'Draft' },
      { remittanceRef: 22, remittanceReference: 'REM-22', reinsurerId: 501, reinsurerName: 'STAR Assurances', sourceType: 'Premium', contractId: 9, currencyCode: 'TND', signedNetPayableAmount: 15, status: 'Draft' }
    ];
    routeData.next({ role: 'back-office', page: 'remittances' });
    createComponent();
    fixture.componentInstance.remittances.set(rows as any);
    workflowService.confirmRemittancesForDisbursement.mockReturnValueOnce(throwError(() => new HttpErrorResponse({
      status: 409,
      statusText: 'Conflict',
      error: {
        code: 'REMITTANCE_STATE_CONFLICT',
        message: 'One or more remittances are no longer Draft.',
        traceId: 'batch-trace-409',
        affectedRemittanceReferences: ['REM-13', 'REM-22']
      }
    })));
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    fixture.componentInstance.toggleRemittanceSelection(rows[0] as any, true);
    fixture.componentInstance.toggleRemittanceSelection(rows[1] as any, true);

    fixture.componentInstance.confirmSelectedRemittancesForDisbursement();
    fixture.detectChanges();

    expect(workflowService.confirmRemittancesForDisbursement).toHaveBeenCalledWith([13, 22]);
    expect(fixture.componentInstance.selectedRemittanceIds()).toEqual(new Set([13, 22]));
    expect(fixture.componentInstance.isSubmitting()).toBe(false);
    expect(fixture.componentInstance.errorMessage()).toContain('One or more remittances are no longer Draft.');
    expect(fixture.componentInstance.errorMessage()).toContain('REM-13, REM-22');
    expect(fixture.nativeElement.textContent).toContain('One or more remittances are no longer Draft.');
    expect(warning).toHaveBeenCalledWith('Remittance batch confirmation conflict.', {
      code: 'REMITTANCE_STATE_CONFLICT',
      traceId: 'batch-trace-409'
    });
    warning.mockRestore();
  });

  it('keeps the valid selection and explains reinsurer incompatibility', () => {
    routeData.next({ role: 'back-office', page: 'remittances' });
    createComponent();
    const first = { remittanceRef: 9, reinsurerId: 22, counterpartyId: 22, counterpartyName: 'AMI', beneficiaryType: 'Reinsurer', currencyCode: 'TND', status: 'Draft' } as any;
    const incompatible = { ...first, remittanceRef: 10, reinsurerId: 23, counterpartyId: 23, beneficiaryId: 23, counterpartyName: 'Other' } as any;
    fixture.componentInstance.remittances.set([first, incompatible]);
    fixture.componentInstance.toggleRemittanceSelection(first, true);
    fixture.componentInstance.toggleRemittanceSelection(incompatible, true);
    expect(fixture.componentInstance.selectedRemittanceIds()).toEqual(new Set([9]));
    expect(fixture.componentInstance.remittanceSelectionError()).toBe('Select remittances for the same reinsurer and currency.');
  });

  it('renders each backend Avoir panel allocation as its own signed row', () => {
    routeData.next({ role: 'back-office', page: 'remittances' });
    createComponent();
    fixture.componentInstance.remittances.set([
      { remittanceRef: 25, reinsurerId: 22, reinsurerName: 'AMI', cedentName: 'Cedent SA', sourceType: 'AVOIR', invoiceNumber: 'AV-2026-000005', currencyCode: 'TND', signedNetPayableAmount: -2.25, netPayableAmount: 2.25, status: 'Draft' } as any,
      { remittanceRef: 26, reinsurerId: 23, reinsurerName: 'STAR Assurances', cedentName: 'Cedent SA', sourceType: 'AVOIR', invoiceNumber: 'AV-2026-000005', currencyCode: 'TND', signedNetPayableAmount: -2.5, netPayableAmount: 2.5, status: 'Draft' } as any
    ]);
    fixture.detectChanges();

    const rows = Array.from(fixture.nativeElement.querySelectorAll('tbody tr')) as HTMLTableRowElement[];
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toContain('Avoir');
    expect(rows[0].textContent).toContain('AMI');
    expect(rows[0].textContent).toContain(fixture.componentInstance.formatMoney(-2.25, 'TND'));
    expect(rows[1].textContent).toContain('STAR Assurances');
    expect(rows[1].textContent).toContain(fixture.componentInstance.formatMoney(-2.5, 'TND'));
    expect(fixture.nativeElement.textContent).not.toContain('Avoir Refund');
  });

  it('rejects a selected remittance with a different currency', () => {
    routeData.next({ role: 'back-office', page: 'remittances' });
    createComponent();
    const first = { remittanceRef: 9, reinsurerId: 22, counterpartyId: 22, sourceType: 'Premium', currencyCode: 'TND', netPayableAmount: 10, signedNetPayableAmount: 10, status: 'Draft' } as any;
    const incompatible = { ...first, remittanceRef: 10, currencyCode: 'USD' } as any;
    fixture.componentInstance.remittances.set([first, incompatible]);
    fixture.componentInstance.toggleRemittanceSelection(first, true);
    fixture.componentInstance.toggleRemittanceSelection(incompatible, true);
    expect(fixture.componentInstance.selectedRemittanceIds()).toEqual(new Set([9]));
    expect(fixture.componentInstance.remittanceSelectionError()).toBe('Select remittances for the same reinsurer and currency.');
  });
});
