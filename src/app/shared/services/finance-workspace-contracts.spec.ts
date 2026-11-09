import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { FinancialWorkflowService } from './financial-workflow.service';
describe('Finance workspace API contracts', () => {
  beforeEach(() =>
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }),
  );
  afterEach(() => TestBed.inject(HttpTestingController).verify());
  it('sends complete calendar dates without datetime conversion', () => {
    const payload = {
      bankAccountId: 3,
      counterpartyId: 7,
      operationDate: '2026-03-29',
      amountReceived: 100,
      settlementMethod: 'BankTransfer',
    };
    TestBed.inject(FinancialWorkflowService).createReceipt(payload).subscribe();
    const request = TestBed.inject(HttpTestingController).expectOne('/api/finance/bank-receipts');
    expect(request.request.body).toEqual(payload);
    expect(request.request.body.operationDate).toBe('2026-03-29');
    request.flush({});
  });
  it('preserves zero lower bounds and omits empty filters', () => {
    TestBed.inject(FinancialWorkflowService)
      .getFinanceReceipts({
        pageNumber: 2,
        pageSize: 25,
        counterpartyId: 7,
        operationFrom: '2026-09-23',
        operationTo: '2026-09-24',
        minAmount: 0,
        maxAmount: 100,
        search: ' ',
        pairingStatus: '',
        sortBy: 'amountReceived',
        sortDirection: 'asc',
      })
      .subscribe();
    const request = TestBed.inject(HttpTestingController).expectOne(
      (r) => r.url === '/api/finance/bank-receipts',
    );
    expect(request.request.params.get('minAmount')).toBe('0');
    expect(request.request.params.get('operationFrom')).toBe('2026-09-23');
    expect(request.request.params.get('counterpartyId')).toBe('7');
    expect(request.request.params.has('search')).toBe(false);
    expect(request.request.params.has('pairingStatus')).toBe(false);
    request.flush({ items: [] });
  });
  it('requests all management accounts and a separate authorized edit resource', () => {
    const api = TestBed.inject(FinancialWorkflowService);
    api.getBankAccounts(7, false).subscribe();
    const list = TestBed.inject(HttpTestingController).expectOne(
      '/api/counterparties/7/bank-accounts?activeOnly=false',
    );
    list.flush([]);
    api
      .getBankAccount(7, 3)
      .subscribe((account) => expect(account.iban).toBe('AUTHORIZED-EDIT-VALUE'));
    const detail = TestBed.inject(HttpTestingController).expectOne(
      '/api/counterparties/7/bank-accounts/3',
    );
    detail.flush({ account: { idBankAccount: 3 }, iban: 'AUTHORIZED-EDIT-VALUE', rib: null });
  });
  it('pages active receipt account options by counterparty without downloading the directory', () => {
    TestBed.inject(FinancialWorkflowService)
      .getReceiptBankAccountOptions('Business label', 7, 2)
      .subscribe();
    const request = TestBed.inject(HttpTestingController).expectOne(
      (r) => r.url === '/api/finance/bank-account-options',
    );
    expect(request.request.params.get('counterpartyId')).toBe('7');
    expect(request.request.params.get('pageNumber')).toBe('2');
    request.flush({ items: [], totalCount: 0, totalPages: 0, pageNumber: 2, pageSize: 25 });
  });
  it('sends an explicit payment account and supports default changes', () => {
    const api = TestBed.inject(FinancialWorkflowService);
    api.startClosingDisbursement(10, 4).subscribe();
    const payment = TestBed.inject(HttpTestingController).expectOne(
      '/api/finance/closings/10/start-disbursement',
    );
    expect(payment.request.body).toEqual({ bankAccountId: 4 });
    payment.flush({});
    api.setBankAccountDefault(7, 4).subscribe();
    const request = TestBed.inject(HttpTestingController).expectOne(
      '/api/counterparties/7/bank-accounts/4/default',
    );
    expect(request.request.method).toBe('PATCH');
    request.flush({});
  });
});
