import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { authInterceptor } from '../interceptors/auth.interceptor';
import { FinancialWorkflowService } from './financial-workflow.service';

describe('FinancialWorkflowService', () => {
  let service: FinancialWorkflowService;
  let httpTesting: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(withInterceptors([authInterceptor])), provideHttpClientTesting()]
    });

    localStorage.setItem('iris_auth_token', 'finance-token');
    service = TestBed.inject(FinancialWorkflowService);
    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpTesting.verify();
    localStorage.removeItem('iris_auth_token');
  });

  it('retrieves the closing context using the closing ID', () => {
    service.getClosingDisbursementContext(1).subscribe(result => expect(result.closingId).toBe(1));
    const request = httpTesting.expectOne('http://localhost:5151/api/finance/closings/1/disbursement-context');
    expect(request.request.method).toBe('GET');
    expect(request.request.headers.get('Authorization')).toBe('Bearer finance-token');
    request.flush({ closingId: 1, lines: [{ remittanceRef: 6, signedNetPayableAmount: -0.45 }], totalClosingAmount: 21.25, isConsistent: true, calculatedTotal: 21.25, difference: 0 });
  });

  it('loads the Finance queue as closing rows from the existing disbursement queue API', () => {
    service.getFinanceClosingQueue().subscribe(rows => expect(rows).toEqual([
      expect.objectContaining({ closingId: 8, closingReference: 'CL-8', lineCount: 2, premiumTotal: 200, avoirTotal: 0.45, netPayableAmount: 199.55 })
    ]));
    const request = httpTesting.expectOne('http://localhost:5151/api/finance/disbursement-queue');
    expect(request.request.method).toBe('GET');
    request.flush([{ closingId: 8, closingReference: 'CL-8', lineCount: 2, premiumTotal: 200, avoirTotal: 0.45, netPayableAmount: 199.55, currencyCode: 'TND', status: 'AwaitingFinanceDisbursement' }]);
  });

  it('starts and confirms the batch using the closing ID', () => {
    service.startClosingDisbursement(1).subscribe();
    const started = httpTesting.expectOne('http://localhost:5151/api/finance/closings/1/start-disbursement');
    expect(started.request.method).toBe('POST');
    started.flush({ closingId: 1, status: 'PaymentInProgress' });
    service.confirmClosingTransfer(1).subscribe();
    const confirmed = httpTesting.expectOne('http://localhost:5151/api/finance/closings/1/confirm-transfer');
    expect(confirmed.request.method).toBe('POST');
    confirmed.flush({ closingId: 1, status: 'Closed' });
  });

  it('confirms selected remittance primary IDs with one Back Officer batch request', () => {
    service.confirmRemittancesForDisbursement([9, 10]).subscribe(result => expect(result.items).toHaveLength(2));
    const request = httpTesting.expectOne('http://localhost:5151/api/back-office/remittances/confirm-for-disbursement/batch');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ remittanceIds: [9, 10] });
    request.flush({ items: [{ remittanceId: 9, status: 'AwaitingFinanceDisbursement' }, { remittanceId: 10, status: 'AwaitingFinanceDisbursement' }] });
  });

  it('downloads the selected invoice PDF as a Blob with its backend filename', () => {
    const blob = new Blob(['%PDF-1.4'], { type: 'application/pdf' });
    service.downloadInvoicePdf(91).subscribe(file => {
      expect(file.blob).toBe(blob);
      expect(file.fileName).toBe('Invoice-91.pdf');
    });
    const request = httpTesting.expectOne('http://localhost:5151/api/back-office/invoices/91/pdf');
    expect(request.request.responseType).toBe('blob');
    request.flush(blob, { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': 'attachment; filename="Invoice-91.pdf"' } });
  });

  it('downloads an Avoir PDF using the Avoir document ID', () => {
    const blob = new Blob(['%PDF-1.4'], { type: 'application/pdf' });
    service.downloadAvoirPdf(92).subscribe(file => {
      expect(file.blob).toBe(blob);
      expect(file.fileName).toBe('Avoir-AV-2026-000001.pdf');
    });
    const request = httpTesting.expectOne('http://localhost:5151/api/back-office/avoirs/92/pdf');
    expect(request.request.method).toBe('GET');
    expect(request.request.responseType).toBe('blob');
    request.flush(blob, { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': 'attachment; filename="Avoir-AV-2026-000001.pdf"' } });
  });

  it('downloads a Credit Note from the selected Avoir endpoint', () => {
    const blob = new Blob(['%PDF-1.4'], { type: 'application/pdf' });
    service.downloadCreditNotePdf(93).subscribe(file => {
      expect(file.blob).toBe(blob);
      expect(file.fileName).toBe('Credit_Note_AV-2026-000012.pdf');
    });
    const request = httpTesting.expectOne('http://localhost:5151/api/back-office/avoirs/93/credit-note/pdf');
    expect(request.request.method).toBe('GET');
    expect(request.request.responseType).toBe('blob');
    request.flush(blob, { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': 'attachment; filename="Credit_Note_AV-2026-000012.pdf"' } });
  });

  it('downloads the persisted closing PDF with the server filename', () => {
    service.downloadFinanceClosing(1).subscribe(result => expect(result.fileName).toBe('IRIS-CL-1.pdf'));
    const request = httpTesting.expectOne('http://localhost:5151/api/finance/closings/1/pdf');
    expect(request.request.responseType).toBe('blob');
    request.flush(new Blob(['%PDF-1.4'], { type: 'application/pdf' }), {
      headers: { 'Content-Disposition': 'attachment; filename=IRIS-CL-1.pdf' }
    });
  });

  it('downloads a closing PDF using the selected remittance ID', () => {
    const blob = new Blob(['%PDF-1.4'], { type: 'application/pdf' });
    service.downloadRemittanceClosing(22).subscribe(result => expect(result.blob).toBe(blob));
    const request = httpTesting.expectOne('http://localhost:5151/api/back-office/remittances/22/closing/pdf');
    expect(request.request.method).toBe('GET');
    expect(request.request.responseType).toBe('blob');
    request.flush(blob, { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': 'attachment; filename=Closing_REM-22.pdf' } });
  });

  it('loads Finance Officer incoming remittances from the finance receipt endpoint', () => {
    service.getFinanceReceipts({
      pageNumber: 1,
      pageSize: 25,
      search: '  cedent  ',
      pairingStatus: 'Unpaired',
      sortBy: 'operationDate',
      sortDirection: 'asc'
    }).subscribe(result => {
      expect(result.items).toEqual([]);
      expect(result.totalCount).toBe(0);
    });

    const request = httpTesting.expectOne(req => req.url === 'http://localhost:5151/api/finance/bank-receipts');
    expect(request.request.method).toBe('GET');
    expect(request.request.headers.get('Authorization')).toBe('Bearer finance-token');
    expect(request.request.params.get('pageNumber')).toBe('1');
    expect(request.request.params.get('pageSize')).toBe('25');
    expect(request.request.params.get('search')).toBe('cedent');
    expect(request.request.params.get('pairingStatus')).toBe('Unpaired');
    expect(request.request.params.has('collectionType')).toBe(false);
    expect(request.request.params.get('sortBy')).toBe('operationDate');
    expect(request.request.params.get('sortDirection')).toBe('asc');
    request.flush({ items: [], pageNumber: 1, page: 1, pageSize: 25, totalCount: 0, totalPages: 0 });
  });

  it('loads Back Officer receipt pairing data from the back-office receipt endpoint', () => {
    service.getBackOfficeReceipts({ pageNumber: 2, pageSize: 10 }).subscribe(result => {
      expect(result.items).toEqual([]);
      expect(result.pageNumber).toBe(2);
    });

    const request = httpTesting.expectOne('http://localhost:5151/api/back-office/bank-receipts?pageNumber=2&pageSize=10');
    expect(request.request.method).toBe('GET');
    expect(request.request.headers.get('Authorization')).toBe('Bearer finance-token');
    request.flush({ items: [], pageNumber: 2, page: 2, pageSize: 10, totalCount: 0, totalPages: 0 });
  });

  it('creates incoming remittances with the exact bank receipt payload', () => {
    const payload = {
      bankAccountId: 11,
      receiptMonth: '2026-09',
      amountReceived: 1500,
      settlementMethod: 'BankTransfer'
    };

    service.createReceipt(payload).subscribe();

    const request = httpTesting.expectOne('http://localhost:5151/api/finance/bank-receipts');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual(payload);
    request.flush({ ...payload, idBankReceipt: 9, counterpartyName: 'Cedent', currencyCode: 'USD', availableAmount: 1500, allocatedAmount: 0, pairingStatus: 'Unpaired' });
  });

  it('loads eligible invoices for pairing', () => {
    localStorage.setItem('iris_auth_token', 'back-officer-token');
    service.getEligibleInvoices(9, 'ami').subscribe(result => {
      expect(result).toEqual({ items: [], status: 200 });
    });

    const request = httpTesting.expectOne(req => req.url === 'http://localhost:5151/api/back-office/bank-receipts/9/eligible-invoices');
    expect(request.request.method).toBe('GET');
    expect(request.request.params.get('search')).toBe('ami');
    expect(request.request.headers.get('Authorization')).toBe('Bearer back-officer-token');
    request.flush([]);
  });

  it('loads encaissements across pairing statuses and normalizes backend eligibility', () => {
    localStorage.setItem('iris_auth_token', 'back-officer-token');
    service.getEligibleAvoirRefundReceipts(25).subscribe(items => {
      expect(items).toEqual([{
        bankReceiptId: 2, receiptReference: 'BR-2', receptionDate: '2026-10-01', operationDate: '2026-09-01', receiptAmount: 45, allocatedAmount: 10, remainingAmount: 35, pairingStatus: 'PartiallyPaired',
        currencyCode: 'TND', contractId: 4, contractName: 'Bound contract', cedentId: 3,
        cedentName: 'Cedent', avoirInvoiceId: 25, avoirNumber: 'AV-25', availableAvoirAmount: 10, refundAmount: 10,
        isEligibleForRefund: false, eligibilityFailureReason: 'A cedent refund requires this encaissement to be fully paired.'
      }]);
    });
    const request = httpTesting.expectOne('http://localhost:5151/api/back-office/invoices/25/eligible-refund-receipts');
    expect(request.request.method).toBe('GET');
    request.flush([{
      bankReceiptId: 2, receiptReference: 'BR-2', receptionDate: '2026-10-01', operationDate: '2026-09-01', receiptAmount: 45, allocatedAmount: 10, remainingAmount: 35, pairingStatus: 'PartiallyPaired',
      currencyCode: 'TND', contractId: 4, contractName: 'Bound contract', cedentId: 3,
      cedentName: 'Cedent', avoirInvoiceId: 25, avoirNumber: 'AV-25', availableAvoirAmount: 10, refundAmount: 10,
      isEligible: false, eligibilityFailureReason: 'A cedent refund requires this encaissement to be fully paired.'
    }]);
  });

  it('posts Avoir refund fields using the selected receipt id', () => {
    const payload = { avoirInvoiceId: 25, amount: 10, idempotencyKey: 'refund-25-2' };
    service.refundAvoir(2, payload).subscribe(result => expect(result.remittanceId).toBe(7));
    const request = httpTesting.expectOne('http://localhost:5151/api/back-office/bank-receipts/2/invoice-allocations/avoir-refund');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual(payload);
    request.flush({ remittanceId: 7 });
  });

  it('maps paged eligible-invoice responses from items', () => {
    localStorage.setItem('iris_auth_token', 'back-officer-token');
    service.getEligibleInvoices(9).subscribe(result => {
      expect(result.status).toBe(200);
      expect(result.items).toEqual([
        {
          invoiceId: 2,
          idInvoice: 2,
          invoiceNumber: 'INV-2',
          label: 'Premium invoice',
          contractId: 12,
          umr: 'IT26-F-PD-0001',
          contractName: 'SODIG 2025',
          cedentId: 22,
          cedentName: 'ami',
          counterpartyName: 'ami',
          invoiceType: 'CEDENT_PREMIUM_INVOICE',
          invoiceDate: '2026-09-11',
          invoiceAmount: 500,
          settledAmount: 100,
          remainingAmount: 400,
          paymentStatus: 'Unsettled',
          grossAmount: 500,
          alreadyPairedAmount: 100,
          outstandingAmount: 400,
          currencyCode: 'TND',
          recoveryStatus: 'Unsettled'
        }
      ]);
    });

    const request = httpTesting.expectOne('http://localhost:5151/api/back-office/bank-receipts/9/eligible-invoices');
    expect(request.request.method).toBe('GET');
    expect(request.request.headers.get('Authorization')).toBe('Bearer back-officer-token');
    request.flush({
      items: [
        {
          idInvoice: 2,
          invoiceNumber: 'INV-2',
          label: 'Premium invoice',
          contractId: 12,
          umr: 'IT26-F-PD-0001',
          contractName: 'SODIG 2025',
          cedentId: 22,
          counterpartyName: 'ami',
          invoiceType: 'CEDENT_PREMIUM_INVOICE',
          invoiceDate: '2026-09-11',
          grossAmount: 500,
          alreadyPairedAmount: 100,
          outstandingAmount: 400,
          currencyCode: 'TND',
          paymentStatus: 'Unsettled',
          recoveryStatus: 'Unsettled'
        }
      ],
      pageNumber: 1,
      pageSize: 25,
      totalCount: 1,
      totalPages: 1
    });
  });

  it('normalizes Avoir eligible-invoice data without losing its signed amount or document number', () => {
    service.getEligibleInvoices(9).subscribe(result => {
      expect(result.items).toHaveLength(1);
      expect(result.items[0]).toEqual(expect.objectContaining({
        invoiceId: 13,
        invoiceType: 'AVOIR',
        isAvoir: true,
        invoiceNumber: 'AV-2026-000013',
        documentNumber: 'AV-2026-000013',
        grossAmount: 50,
        signedAmount: -50,
        currencyCode: 'TND'
      }));
    });
    const request = httpTesting.expectOne('http://localhost:5151/api/back-office/bank-receipts/9/eligible-invoices');
    request.flush({ items: [{
      invoiceId: 13,
      documentNumber: 'AV-2026-000013',
      invoiceType: 'AVOIR',
      isAvoir: true,
      grossAmount: 50,
      signedAmount: -50,
      currencyCode: 'TND'
    }] });
  });

  it('allocates an encaissement using only invoice ID and allocated amount', () => {
    service.allocateReceiptInvoices(9, {
      invoiceId: 34,
      allocatedAmount: 1200,
      currencyId: 3,
      exchangeRate: 1
    } as unknown as { invoiceId: number; allocatedAmount: number }).subscribe();

    const request = httpTesting.expectOne('http://localhost:5151/api/back-office/bank-receipts/9/invoice-allocations');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({
      invoiceId: 34,
      allocatedAmount: 1200
    });
    request.flush({});
  });

  it('uses the implemented Back Officer remittance and invoice routes', () => {
    service.getBackOfficeRemittances().subscribe();
    service.confirmRemittance(77).subscribe();
    service.getInvoices({ contractId: 12, paymentStatus: 'Unsettled', search: 'cedent' }).subscribe();
    service.createInvoice({
      contractId: 12,
      counterpartyId: 22,
      panelId: 34,
      remittanceRef: 77,
      invoiceType: 'REINSURER_PAYABLE',
      invoiceDate: '2026-09-11',
      netPremium: 900,
      label: 'Payable',
      settlementMethod: 'BANK_TRANSFER'
    }).subscribe();

    const remittancesRequest = httpTesting.expectOne(req => req.url === 'http://localhost:5151/api/back-office/remittances' && req.method === 'GET');
    expect(remittancesRequest.request.method).toBe('GET');
    expect(remittancesRequest.request.params.get('pageNumber')).toBe('1');
    expect(remittancesRequest.request.params.get('pageSize')).toBe('20');
    const confirmRequest = httpTesting.expectOne('http://localhost:5151/api/back-office/remittances/77/confirm');
    expect(confirmRequest.request.method).toBe('POST');
    const invoiceListRequest = httpTesting.expectOne(req => req.url === 'http://localhost:5151/api/back-office/invoices' && req.method === 'GET');
    expect(invoiceListRequest.request.method).toBe('GET');
    expect(invoiceListRequest.request.params.get('contractId')).toBe('12');
    expect(invoiceListRequest.request.params.get('paymentStatus')).toBe('Unsettled');
    expect(invoiceListRequest.request.params.get('search')).toBe('cedent');
    const createInvoiceRequest = httpTesting.expectOne(req => req.url === 'http://localhost:5151/api/back-office/invoices' && req.method === 'POST');
    expect(createInvoiceRequest.request.method).toBe('POST');
    expect(createInvoiceRequest.request.body.remittanceRef).toBe(77);

    remittancesRequest.flush({ items: [], pageNumber: 1, pageSize: 20, totalCount: 0, totalPages: 0 });
    confirmRequest.flush({});
    invoiceListRequest.flush({ items: [], pageNumber: 1, pageSize: 20, totalCount: 0, totalPages: 0 });
    createInvoiceRequest.flush({});
  });

  it('maps remittance labels, reinsurer, cedent and signed payable amount from the API', () => {
    let invoiceLabel: string | null | undefined;
    let invoiceAvoirNumber: string | null | undefined;
    let label: string | null | undefined;
    let beneficiaryCounterpartyId: number | null | undefined;
    let reinsurerId: number | null | undefined;
    let cedentName: string | null | undefined;
    let signedAmount: number | null | undefined;
    service.getBackOfficeRemittances().subscribe(response => {
      invoiceLabel = response.items[0]?.invoiceLabel;
      invoiceAvoirNumber = response.items[0]?.invoiceAvoirNumber;
      label = response.items[0]?.label;
      beneficiaryCounterpartyId = response.items[0]?.beneficiaryCounterpartyId;
      reinsurerId = response.items[0]?.reinsurerId;
      cedentName = response.items[0]?.cedentName;
      signedAmount = response.items[0]?.signedNetPayableAmount;
    });

    const request = httpTesting.expectOne(req => req.url === 'http://localhost:5151/api/back-office/remittances' && req.method === 'GET');
    request.flush({
      items: [{ remittanceRef: 77, sourceDocumentId: 21, invoiceAvoirNumber: 'AV-2026-000011', label: 'test avoir', invoiceLabel: 'Premium invoice label', beneficiaryCounterpartyId: 501, reinsurerId: 501, cedentName: 'Cedent SA', signedNetPayableAmount: -2.5 }],
      pageNumber: 1,
      pageSize: 20,
      totalCount: 1,
      totalPages: 1
    });

    expect(invoiceLabel).toBe('Premium invoice label');
    expect(invoiceAvoirNumber).toBe('AV-2026-000011');
    expect(label).toBe('test avoir');
    expect(beneficiaryCounterpartyId).toBe(501);
    expect(reinsurerId).toBe(501);
    expect(cedentName).toBe('Cedent SA');
    expect(signedAmount).toBe(-2.5);
  });

  it('omits placeholder invoice filters and maps the paged response envelope', () => {
    service.getInvoices({
      invoiceType: 'All types',
      paymentStatus: 'All statuses',
      currencyId: 'All currencies'
    }).subscribe(response => {
      expect(response.items[0].invoiceId).toBe(41);
      expect(response.items[0].isAvoir).toBe(false);
      expect(response.items[1].invoiceType).toBe('AVOIR');
      expect(response.items[1].isAvoir).toBe(true);
      expect(response.totalCount).toBe(2);
      expect(response.pageNumber).toBe(1);
    });

    const request = httpTesting.expectOne(req => req.url === 'http://localhost:5151/api/back-office/invoices');
    expect(request.request.params.has('invoiceType')).toBe(false);
    expect(request.request.params.has('paymentStatus')).toBe(false);
    expect(request.request.params.has('currencyId')).toBe(false);
    expect(request.request.params.get('pageNumber')).toBe('1');
    expect(request.request.params.get('pageSize')).toBe('20');
    request.flush({
      items: [{
        invoiceId: 41,
        idInvoice: 41,
        contractId: 7,
        contractName: 'Bound Contract',
        cedentId: 2,
        counterpartyId: 2,
        counterpartyName: 'Cedent',
        invoiceNumber: 'INV-2026-000041',
        invoiceType: 'CEDENT_PREMIUM_INVOICE',
        invoiceDate: '2026-10-06',
        grossAmount: 100,
        netAmount: 90,
        netPremium: 90,
        paymentStatus: 'Unsettled',
        recoveryStatus: 'Unsettled',
        status: 'Draft',
        label: 'Premium'
      }, {
        invoiceId: 42,
        idInvoice: 42,
        contractId: 7,
        invoiceNumber: 'AV-2026-000042',
        type: 'AVOIR',
        invoiceDate: '2026-10-06',
        grossAmount: 10,
        netAmount: 10,
        netPremium: 10,
        status: 'Draft',
        label: 'Credit adjustment'
      }],
      pageNumber: 1,
      pageSize: 20,
      totalCount: 2,
      totalPages: 1
    });
  });

  it('uses the implemented Finance Officer disbursement and bank-account routes', () => {
    service.getDisbursementQueue().subscribe(items => {
      expect(items[0]).toEqual(expect.objectContaining({
        remittanceId: 77,
        remittanceRef: 77,
        remittanceReference: 'REM-77',
        disbursementId: 501,
        invoiceId: 4,
        invoiceDownloadUrl: '/api/finance/disbursements/501/invoice',
        status: 'PaymentInProgress'
      }));
    });
    service.createDisbursement({
      remittanceRef: 77,
      bankAccountId: 44,
      operationDate: '2026-09-11',
      paymentMethod: 'BANK_TRANSFER',
      bankReference: 'TR-77',
      description: 'Settlement'
    }).subscribe();
    service.getDisbursementContext(77).subscribe(context => {
      expect(context).toEqual(expect.objectContaining({
        remittanceId: 77,
        disbursementId: 501,
        invoiceId: 4,
        invoiceDownloadUrl: '/api/finance/disbursements/501/invoice',
        status: 'PaymentInProgress'
      }));
    });
    service.startDisbursement(77).subscribe(response => {
      expect(response).toEqual({
        remittanceId: 77,
        disbursementId: 501,
        invoiceId: 4,
        status: 'PaymentInProgress',
        invoiceDownloadUrl: '/api/finance/disbursements/501/invoice'
      });
    });
    service.confirmTransfer(501).subscribe();
    service.downloadDocument(9001).subscribe(download => {
      expect(download.fileName).toBe('payment.pdf');
      expect(download.contentType).toBe('application/pdf');
    });
    service.downloadDisbursementInvoice(501).subscribe(download => {
      expect(download.fileName).toBe('invoice-501.pdf');
      expect(download.contentType).toBe('application/pdf');
    });
    service.getBankAccounts(22).subscribe();
    service.createBankAccount(22, {
      counterpartyId: 22,
      currencyId: 3,
      bankName: 'IRIS Bank',
      bankCity: 'Casablanca',
      bankCountry: 'Morocco',
      agencyCode: null,
      rib: '123',
      iban: 'MA64011519000001205000534921',
      swiftBic: 'IRISMA12',
      hasCorrespondentBank: true,
      correspondentBankName: 'Correspondent Bank',
      correspondentSwiftBic: 'CORRMA12',
      accountLabel: 'Default USD',
      isDefault: true,
      isActive: true
    }).subscribe();
    service.updateBankAccount(22, 44, {
      counterpartyId: 22,
      currencyId: 3,
      bankName: 'IRIS Bank Updated',
      bankCity: 'Rabat',
      bankCountry: 'Morocco',
      agencyCode: null,
      rib: '123',
      iban: 'MA64011519000001205000534921',
      swiftBic: 'IRISMA12',
      hasCorrespondentBank: false,
      correspondentBankName: null,
      correspondentSwiftBic: null,
      accountLabel: 'Default USD',
      isDefault: true,
      isActive: true
    }).subscribe();
    service.setBankAccountStatus(22, 44, false).subscribe();

    const queueRequest = httpTesting.expectOne('http://localhost:5151/api/finance/disbursement-queue');
    expect(queueRequest.request.method).toBe('GET');
    const disbursementRequest = httpTesting.expectOne('http://localhost:5151/api/finance/disbursements');
    expect(disbursementRequest.request.method).toBe('POST');
    expect(disbursementRequest.request.body).toEqual({
      remittanceRef: 77,
      bankAccountId: 44,
      operationDate: '2026-09-11',
      paymentMethod: 'BANK_TRANSFER',
      bankReference: 'TR-77',
      description: 'Settlement'
    });
    const documentRequest = httpTesting.expectOne('http://localhost:5151/api/documents/9001/download');
    expect(documentRequest.request.method).toBe('GET');
    const startRequest = httpTesting.expectOne('http://localhost:5151/api/finance/remittances/77/start-disbursement');
    expect(startRequest.request.method).toBe('POST');
    expect(startRequest.request.body).toEqual({});
    const contextRequest = httpTesting.expectOne('http://localhost:5151/api/finance/remittances/77/disbursement-context');
    expect(contextRequest.request.method).toBe('GET');
    const confirmTransferRequest = httpTesting.expectOne('http://localhost:5151/api/finance/disbursements/501/confirm-transfer');
    expect(confirmTransferRequest.request.method).toBe('POST');
    expect(confirmTransferRequest.request.body).toEqual({});
    const invoiceRequest = httpTesting.expectOne('http://localhost:5151/api/finance/disbursements/501/invoice');
    expect(invoiceRequest.request.method).toBe('GET');
    const getAccountsRequest = httpTesting.expectOne(req => req.url === 'http://localhost:5151/api/counterparties/22/bank-accounts' && req.method === 'GET');
    expect(getAccountsRequest.request.method).toBe('GET');
    const createAccountRequest = httpTesting.expectOne(req => req.url === 'http://localhost:5151/api/counterparties/22/bank-accounts' && req.method === 'POST');
    expect(createAccountRequest.request.method).toBe('POST');
    expect(createAccountRequest.request.body).toEqual({
      counterpartyId: 22,
      currencyId: 3,
      bankName: 'IRIS Bank',
      bankCity: 'Casablanca',
      bankCountry: 'Morocco',
      agencyCode: null,
      rib: '123',
      iban: 'MA64011519000001205000534921',
      swiftBic: 'IRISMA12',
      hasCorrespondentBank: true,
      correspondentBankName: 'Correspondent Bank',
      correspondentSwiftBic: 'CORRMA12',
      accountLabel: 'Default USD',
      isDefault: true,
      isActive: true
    });
    const updateAccountRequest = httpTesting.expectOne(req => req.url === 'http://localhost:5151/api/counterparties/22/bank-accounts/44' && req.method === 'PUT');
    expect(updateAccountRequest.request.method).toBe('PUT');
    expect(updateAccountRequest.request.body.hasCorrespondentBank).toBe(false);
    expect(updateAccountRequest.request.body.correspondentBankName).toBeNull();
    expect(updateAccountRequest.request.body.correspondentSwiftBic).toBeNull();
    const statusRequest = httpTesting.expectOne('http://localhost:5151/api/counterparties/22/bank-accounts/44/status');
    expect(statusRequest.request.method).toBe('PATCH');
    expect(statusRequest.request.body).toEqual({ isActive: false });

    queueRequest.flush([{
      remittanceId: 77,
      remittanceReference: 'REM-77',
      disbursementId: 501,
      invoiceId: 4,
      invoiceDownloadUrl: '/api/finance/disbursements/501/invoice',
      counterpartyId: 22,
      counterpartyName: 'AMI',
      currencyId: 3,
      currencyCode: 'TND',
      status: 'PaymentInProgress'
    }]);
    disbursementRequest.flush({});
    contextRequest.flush({
      RemittanceId: 77,
      DisbursementId: 501,
      InvoiceId: 4,
      InvoiceDownloadUrl: '/api/finance/disbursements/501/invoice',
      ReinsurerId: 22,
      ReinsurerName: 'AMI',
      NetPayableAmount: 1000,
      CurrencyCode: 'TND',
      Status: 'PaymentInProgress',
      CanDownloadInvoice: true,
      CanStartPayment: false,
      CanConfirmTransfer: true
    });
    startRequest.flush({
      remittanceId: 77,
      disbursementId: 501,
      invoiceId: 4,
      status: 'PaymentInProgress',
      invoiceDownloadUrl: '/api/finance/disbursements/501/invoice'
    });
    confirmTransferRequest.flush({ status: 'Closed' });
    documentRequest.flush(new Blob(['pdf'], { type: 'application/pdf' }), { headers: { 'Content-Disposition': 'attachment; filename="payment.pdf"', 'Content-Type': 'application/pdf' } });
    invoiceRequest.flush(new Blob(['pdf'], { type: 'application/pdf' }), { headers: { 'Content-Disposition': 'attachment; filename="invoice-501.pdf"', 'Content-Type': 'application/pdf' } });
    getAccountsRequest.flush([]);
    createAccountRequest.flush({});
    updateAccountRequest.flush({});
    statusRequest.flush({});
  });

  it('uses remittance_ref from the Finance queue and normalizes the Avoir refund context', () => {
    service.getDisbursementQueue().subscribe(items => {
      expect(items[0].remittanceId).toBe(8);
      expect(items[0].remittanceRef).toBe(8);
      expect(items[0].sourceType).toBe('AVOIR_REFUND');
      expect(items[0].beneficiaryType).toBe('CEDENT');
    });
    const queue = httpTesting.expectOne('http://localhost:5151/api/finance/disbursement-queue');
    queue.flush([{
      remittanceId: 0,
      remittanceRef: 8,
      sourceType: 'AVOIR_REFUND',
      sourceInvoiceId: 21,
      sourceInvoiceNumber: 'AV-2026-000001',
      beneficiaryType: 'CEDENT',
      counterpartyName: 'STAR Assurances',
      netPayableAmount: 10,
      currencyCode: 'TND'
    }]);

    service.getDisbursementContext(8).subscribe(context => {
      expect(context.remittanceId).toBe(8);
      expect(context.sourceType).toBe('AVOIR_REFUND');
      expect(context.avoirId).toBe(21);
      expect(context.avoirNumber).toBe('AV-2026-000001');
      expect(context.encaissementReference).toBe('BR-8');
      expect(context.beneficiaryName).toBe('STAR Assurances');
      expect(context.netPayableAmount).toBe(10);
    });
    const context = httpTesting.expectOne('http://localhost:5151/api/finance/remittances/8/disbursement-context');
    context.flush({
      remittanceId: 8,
      remittanceReference: '8',
      sourceType: 'AVOIR_REFUND',
      avoirId: 21,
      avoirNumber: 'AV-2026-000001',
      creditNoteNumber: 'AV-2026-000001',
      encaissementId: 8,
      encaissementReference: 'BR-8',
      beneficiaryType: 'CEDENT',
      beneficiaryName: 'STAR Assurances',
      netPayableAmount: '10.00',
      currencyCode: 'TND',
      status: 'AwaitingFinanceDisbursement',
      canStartPayment: true
    });
  });

  it('downloads an Avoir refund Credit Note by remittance reference', () => {
    const blob = new Blob(['%PDF-1.4'], { type: 'application/pdf' });
    service.downloadAvoirRefundCreditNote(8).subscribe(file => {
      expect(file.blob).toBe(blob);
      expect(file.fileName).toBe('CreditNote-AV-2026-000001.pdf');
    });
    const request = httpTesting.expectOne('http://localhost:5151/api/finance/remittances/8/credit-note');
    expect(request.request.method).toBe('GET');
    expect(request.request.responseType).toBe('blob');
    request.flush(blob, { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': 'attachment; filename="CreditNote-AV-2026-000001.pdf"' } });
  });

  it('uses notification and financial-history endpoints without duplicating /api', () => {
    service.getNotifications(true).subscribe();
    service.getUnreadNotificationCount().subscribe();
    service.markNotificationRead(5).subscribe();
    service.markAllNotificationsRead().subscribe();
    service.getFinancialHistory(12).subscribe();
    service.getInvoiceContext(12).subscribe(context => {
      expect(context.receiptAllocations).toEqual([{
        receiptAllocationId: 15,
        receiptReference: 'ENC-15',
        allocatedAmount: 50,
        alreadyInvoicedAmount: 0,
        availableAmount: 50,
        currencyCode: 'TND'
      }]);
      expect(context.reinsurerPanels[0].panelId).toBe(34);
      expect(context.contractGrossPremium).toBe(150);
      expect(context.invoiceableGrossPremium).toBe(150);
      expect(context.cedentCommissionPct).toBe(10);
      expect(context.cedentCommissionPercentage).toBe(10);
      expect(context.cedentCommissionAmount).toBe(15);
      expect(context.contractSignedSharePercentage).toBe(100);
      expect(context.invoiceableNetPremium).toBe(135);
      expect(context.alreadyInvoicedAmount).toBe(0);
      expect(context.availableCreditBalance).toBe(45);
      expect(context.remainingInvoiceableAmount).toBe(135);
    });

    const notificationsRequest = httpTesting.expectOne(req => req.url === 'http://localhost:5151/api/notifications');
    expect(notificationsRequest.request.params.get('unreadOnly')).toBe('true');
    const countRequest = httpTesting.expectOne('http://localhost:5151/api/notifications/unread-count');
    expect(countRequest.request.method).toBe('GET');
    const readRequest = httpTesting.expectOne('http://localhost:5151/api/notifications/5/read');
    expect(readRequest.request.method).toBe('PATCH');
    const readAllRequest = httpTesting.expectOne('http://localhost:5151/api/notifications/read-all');
    expect(readAllRequest.request.method).toBe('PATCH');
    const historyRequest = httpTesting.expectOne('http://localhost:5151/api/contracts/12/financial-history');
    expect(historyRequest.request.method).toBe('GET');
    const invoiceContextRequest = httpTesting.expectOne('http://localhost:5151/api/back-office/contracts/12/invoice-context');
    expect(invoiceContextRequest.request.method).toBe('GET');

    notificationsRequest.flush([]);
    countRequest.flush(3);
    readRequest.flush({});
    readAllRequest.flush(null);
    historyRequest.flush({ receipts: [], remittances: [], invoices: [], disbursements: [] });
    invoiceContextRequest.flush({
      contractId: 12,
      currency: 'TND',
      status: 'Bound',
      contractGrossPremium: 150,
      cedentCommissionPct: 10,
      cedentCommissionPercentage: 10,
      cedentCommissionAmount: 15,
      contractSignedSharePercentage: 100,
      invoiceableNetPremium: 135,
      currencyDecimalPlaces: 3,
      currencyCode: 'TND',
      pairedAmount: 50,
      alreadyInvoicedAmount: 0,
      availableCreditBalance: 45,
      remainingInvoiceableAmount: 135,
      invoiceableGrossPremium: 150,
      canCreateInvoice: true,
      receiptAllocations: [{
        receiptAllocationId: 15,
        receiptReference: 'ENC-15',
        allocatedAmount: 50,
        alreadyInvoicedAmount: 0,
        availableAmount: 50,
        currencyCode: 'TND'
      }],
      reinsurerPanels: [{ panelId: 34, counterpartyId: 22, reinsurerName: 'Global Re', signedSharePct: 45, status: 'Confirmed' }]
    });
  });

  it('maps contract cedent commission preview values without defaulting missing values to zero', () => {
    let preview: any;
    service.previewPremiumDebitNote(12, {
      invoiceType: 'INVOICE',
      grossAmount: 50,
      invoiceDate: '2026-10-05',
      label: null
    }).subscribe(value => preview = value);

    httpTesting.expectOne('http://localhost:5151/api/back-office/contracts/12/invoices/preview').flush({
      contractId: 12,
      invoiceableGrossPremium: 50,
      alreadyInvoicedAmount: 0,
      grossAmount: 50,
      remainingAmount: 0,
      allocations: [{
        panelId: 1,
        reinsurerName: 'AMI',
        signedSharePct: 50,
        allocationRatio: 0.5,
        allocationRatioPercentage: 50,
        grossPremium: 25,
        allocatedGrossPremium: 25,
        allocatedNetPremium: 22.5,
        allocationAmount: 22.5,
        cedentCommissionPct: 10,
        cedentCommissionPercentage: 10,
        cedentCommissionAmount: 2.5,
        brokeragePct: 10,
        irisBrokerageRate: 10,
        irisBrokeragePercentage: 10,
        brokerageAmount: 2.5,
        irisBrokerageAmount: 2.5,
        otherDeductions: 0,
        otherDeductionsAmount: 0,
        netAmount: 20,
        netPayableAmount: 20,
        currencyCode: 'TND'
      }]
    });

    expect(preview.allocations[0].cedentCommissionPct).toBe(10);
    expect(preview.allocations[0].cedentCommissionAmount).toBe(2.5);
    expect(preview.allocations[0].allocatedGrossPremium).toBe(25);
    expect(preview.allocations[0].allocatedNetPremium).toBe(22.5);
    expect(preview.allocations[0].irisBrokerageAmount).toBe(2.5);
    expect(preview.allocations[0].irisBrokerageRate).toBe(10);
    expect(preview.allocations[0].netPayableAmount).toBe(20);

    let mappingError: Error | null = null;
    service.previewPremiumDebitNote(12, {
      invoiceType: 'INVOICE',
      grossAmount: 50,
      invoiceDate: '2026-10-05',
      label: null
    }).subscribe({ error: error => mappingError = error });
    httpTesting.expectOne('http://localhost:5151/api/back-office/contracts/12/invoices/preview').flush({
      contractId: 12,
      allocations: [{ panelId: 1, grossPremium: 50 }]
    });

    expect(mappingError).toBeTruthy();
    const capturedError = mappingError as unknown as Error;
    expect(capturedError.message).toContain('missing cedentCommissionPct');
  });

  it('maps premium debit note payment status for contract invoice history', () => {
    service.getContractPremiumDebitNotes(12).subscribe(invoices => {
      expect(invoices[0].status).toBe('Draft');
      expect(invoices[0].paymentStatus).toBe('PartiallySettled');
      expect(invoices[0].recoveryStatus).toBe('PartiallySettled');
      expect(invoices[0].allocations[0].allocatedGrossPremium).toBe(44.445);
      expect(invoices[0].allocations[0].allocatedNetPremium).toBe(40);
      expect(invoices[0].allocations[0].irisBrokerageAmount).toBe(4.445);
    });

    const request = httpTesting.expectOne('http://localhost:5151/api/back-office/contracts/12/invoices');
    expect(request.request.method).toBe('GET');
    request.flush([{
      invoiceId: 41,
      contractId: 12,
      invoiceNumber: 'INV-2026-000041',
      sequence: 1,
      invoiceType: 'CEDENT_PREMIUM_INVOICE',
      invoiceDate: '2026-10-06',
      grossAmount: 100,
      remainingAmount: 20,
      totalNetAmount: 90,
      currencyCode: 'TND',
      paymentStatus: 'PartiallySettled',
      status: 'Draft',
      label: '',
      allocations: [{
        panelId: 3,
        reinsurerName: 'Reinsurer',
        grossPremium: 44.445,
        allocatedGrossPremium: 44.445,
        allocatedNetPremium: 40,
        cedentCommissionPct: 0,
        cedentCommissionPercentage: 0,
        cedentCommissionAmount: 0,
        brokeragePct: 10,
        irisBrokerageRate: 10,
        irisBrokeragePercentage: 10,
        brokerageAmount: 4,
        irisBrokerageAmount: 4.445,
        otherDeductions: 0,
        otherDeductionsAmount: 0,
        netAmount: 40,
        netPayableAmount: 35.555,
        currencyCode: 'TND'
      }]
    }]);
  });
});
