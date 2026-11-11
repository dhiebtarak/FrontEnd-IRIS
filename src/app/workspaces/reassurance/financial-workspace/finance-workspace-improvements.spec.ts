import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { BehaviorSubject, Subject, of, throwError } from 'rxjs';
import { FinancialWorkspacePageComponent } from './financial-workspace-page.component';
import { FinancialWorkflowService } from '../../../shared/services/financial-workflow.service';
import { CounterpartiesService } from '../../../shared/services/counterparties.service';
import { ContractsService } from '../../../shared/services/contracts.service';
import { DocumentAttachmentsComponent } from '../../../shared/components/document-attachments/document-attachments.component';
import {
  BankAccountResponse,
  BankReceiptResponse,
  ClosingDisbursementContext,
} from '../../../shared/models/financial-workflow.model';
import { CounterpartyListItem } from '../../../shared/models/counterparty.model';
import { formatCalendarDate } from '../../../shared/models/calendar-date.util';
@Component({
  selector: 'app-document-attachments',
  standalone: true,
  template: '',
  inputs: ['context', 'readOnly', 'title'],
})
class AttachmentStub {}

describe('Finance workspace improvements', () => {
  const choice: CounterpartyListItem = {
    id: 7,
    name: 'Acme Cedent',
    types: ['Cedent'],
    email: 'accounts@example.test',
    legacyClientId: null,
    legacyCompanyCode: 'ACME',
    status: 'Active',
    isActive: true,
    hasActiveBankAccount: true,
    activeBankAccountCount: 2,
  };
  const account: BankAccountResponse = {
    idBankAccount: 3,
    idCounterparty: 7,
    counterpartyId: 7,
    beneficiaryName: 'Acme Cedent',
    beneficiaryAddress: null,
    beneficiaryCity: null,
    beneficiaryCountry: null,
    currencyId: 1,
    currencyCode: 'USD',
    bankName: 'Test Bank',
    bankCity: 'Tunis',
    bankCountry: 'Tunisia',
    agencyCode: null,
    rib: null,
    iban: null,
    maskedIban: 'TN****0001',
    swiftBic: 'ABCDEF12',
    accountLabel: 'Primary',
    isDefault: true,
    isActive: true,
    hasCorrespondentBank: false,
    correspondentBankName: null,
    correspondentSwiftBic: null,
  };
  const receipt: BankReceiptResponse = {
    idBankReceipt: 1,
    bankAccountId: 3,
    counterpartyId: 7,
    counterpartyName: 'Acme Cedent',
    operationDate: '2026-09-23',
    receptionDate: '2026-09-24',
    amountReceived: 100,
    currencyId: 1,
    currencyCode: 'USD',
    appliedExchangeRate: null,
    availableAmount: 100,
    allocatedAmount: 0,
    pairingStatus: 'Unpaired',
    settlementMethod: 'BankTransfer',
    bankReference: 'BANK-1',
    settlementLabel: 'Premium',
  };
  const page = { items: [receipt], pageNumber: 1, pageSize: 25, totalCount: 60, totalPages: 3 };
  let data: BehaviorSubject<Record<string, unknown>>;
  let api: ReturnType<typeof mocks>;
  function mocks() {
    return {
      getFinanceReceipts: vi.fn().mockReturnValue(of(page)),
      getBackOfficeReceipts: vi.fn().mockReturnValue(of(page)),
      getReceiptBankAccountOptions: vi
        .fn()
        .mockReturnValue(
          of({ items: [account], pageNumber: 1, pageSize: 25, totalCount: 1, totalPages: 1 }),
        ),
      getBankAccounts: vi
        .fn()
        .mockReturnValue(
          of([
            account,
            {
              ...account,
              idBankAccount: 4,
              accountLabel: 'Additional',
              isDefault: false,
              isActive: false,
            },
          ]),
        ),
      getBankAccount: vi.fn().mockReturnValue(of({ ...account, iban: 'TN5900000000000000000001' })),
      createReceipt: vi.fn().mockReturnValue(of(receipt)),
      createBankAccount: vi.fn().mockReturnValue(of({ ...account, idBankAccount: 5 })),
      updateBankAccount: vi.fn().mockReturnValue(of(account)),
      setBankAccountDefault: vi.fn().mockReturnValue(of(account)),
      setBankAccountStatus: vi.fn().mockReturnValue(of(true)),
      getClosingDisbursementContext: vi.fn(),
      startClosingDisbursement: vi.fn(),
      getDisbursementContext: vi.fn(),
      markNotificationRead: vi.fn().mockReturnValue(of({})),
    };
  }
  beforeEach(() => {
    data = new BehaviorSubject<Record<string, unknown>>({ role: 'finance', page: 'receipts' });
    api = mocks();
    TestBed.configureTestingModule({
      imports: [FinancialWorkspacePageComponent],
      providers: [
        { provide: ActivatedRoute, useValue: { data, queryParamMap: of(convertToParamMap({})) } },
        { provide: Router, useValue: { navigate: vi.fn() } },
        { provide: FinancialWorkflowService, useValue: api },
        {
          provide: CounterpartiesService,
          useValue: {
            getFinanceCounterparties: () => of({ items: [choice] }),
            getCounterparties: () =>
              of({ items: [choice], pageNumber: 1, pageSize: 20, totalCount: 1, totalPages: 1 }),
            getCounterpartyById: () => of(choice),
          },
        },
        {
          provide: ContractsService,
          useValue: { getCurrencies: () => of([{ id: 1, code: 'USD', name: 'US Dollar' }]) },
        },
      ],
    });
    TestBed.overrideComponent(FinancialWorkspacePageComponent, {
      remove: { imports: [DocumentAttachmentsComponent] },
      add: { imports: [AttachmentStub] },
    });
  });
  function fixture() {
    const fixture = TestBed.createComponent(FinancialWorkspacePageComponent);
    fixture.detectChanges();
    return fixture;
  }
  function fillAccount(component: FinancialWorkspacePageComponent) {
    component.bankAccountForm.patchValue({
      currencyId: 1,
      bankName: ' New Bank ',
      bankCity: ' Tunis ',
      bankCountry: ' Tunisia ',
      iban: 'tn59 0000 0000 0000 0000 0002',
      swiftBic: 'abcdef12',
      accountLabel: 'Additional',
    });
  }
  it('sends an exact calendar date and real account/counterparty IDs', () => {
    const f = fixture(),
      c = f.componentInstance;
    c.openReceiptModal();
    c.selectReceiptBankAccount(account);
    c.receiptForm.patchValue({ operationDate: '2026-03-29', amountReceived: 100 });
    c.createReceipt();
    expect(api.createReceipt).toHaveBeenCalledWith({
      bankAccountId: 3,
      counterpartyId: 7,
      operationDate: '2026-03-29',
      amountReceived: 100,
      settlementMethod: 'BankTransfer',
    });
    expect(formatCalendarDate('2026-03-29')).toContain('29');
    expect(c.displayCalendarDate('2026-09-23')).toContain('23');
  });
  it('keeps the chosen account when lookup pages change and sends the selected counterparty scope', () => {
    const f=fixture(),c=f.componentInstance;c.openReceiptModal();c.selectReceiptBankAccount(account);
    api.getReceiptBankAccountOptions.mockReturnValue(of({items:[],pageNumber:1,pageSize:25,totalCount:0,totalPages:0}));c.openReceiptBankAccountDropdown();
    expect(c.selectedReceiptBankAccount()?.idBankAccount).toBe(3);c.receiptForm.patchValue({operationDate:'2026-09-23',amountReceived:100});c.createReceipt();
    expect(api.createReceipt).toHaveBeenCalledWith(expect.objectContaining({bankAccountId:3,counterpartyId:7}));
  });
  it('rejects incomplete and impossible dates with feedback', () => {
    const f = fixture(),
      c = f.componentInstance;
    c.openReceiptModal();
    c.selectReceiptBankAccount(account);
    c.receiptForm.patchValue({ operationDate: '2026-02-30', amountReceived: 100 });
    c.createReceipt();
    f.detectChanges();
    expect(api.createReceipt).not.toHaveBeenCalled();
    expect(c.receiptForm.controls.operationDate.hasError('calendarDate')).toBe(true);
    expect(f.nativeElement.textContent).toContain('valid complete encaissement date');
  });
  it('shows counterparty name while applying only the selected ID and clears all filter state', () => {
    const f = fixture(),
      c = f.componentInstance;
    c.selectReceiptCounterparty(choice);
    f.detectChanges();
    expect(
      (f.nativeElement.querySelector('#receipt-counterparty-filter') as HTMLInputElement).value,
    ).toBe('Acme Cedent');
    expect(api.getFinanceReceipts.mock.lastCall?.[0]).toMatchObject({
      counterpartyId: 7,
      pageNumber: 1,
    });
    c.changeReceiptPage(1);
    expect(c.receiptPageNumber()).toBe(2);
    c.clearReceiptFilters();
    f.detectChanges();
    expect(c.receiptCounterparty()).toBeNull();
    expect(c.receiptPageNumber()).toBe(1);
    expect(c.receiptFilters.controls.counterpartyId.value).toBeNull();
    expect(
      (f.nativeElement.querySelector('#receipt-counterparty-filter') as HTMLInputElement).value,
    ).toBe('');
  });
  it('clears a selected counterparty ID immediately without erasing newly typed text', () => {
    const f=fixture(),c=f.componentInstance;c.selectReceiptCounterparty(choice);f.detectChanges();
    const input=f.nativeElement.querySelector('#receipt-counterparty-filter') as HTMLInputElement;
    input.value='Another business';input.dispatchEvent(new Event('input'));f.detectChanges();
    expect(input.value).toBe('Another business');expect(c.receiptFilters.controls.counterpartyId.value).toBeNull();
    expect(api.getFinanceReceipts.mock.lastCall?.[0]).toMatchObject({counterpartyId:null});c.clearReceiptFilters();f.detectChanges();expect(input.value).toBe('');
  });
  it('validates ranges without sending them and resets pagination on changes', () => {
    const f = fixture(),
      c = f.componentInstance;
    const initial = api.getFinanceReceipts.mock.calls.length;
    c.receiptFilters.patchValue(
      { operationFrom: '2026-09-24', operationTo: '2026-09-23' },
      { emitEvent: false },
    );
    c.loadReceipts();
    expect(api.getFinanceReceipts).toHaveBeenCalledTimes(initial);
    f.detectChanges();
    expect(f.nativeElement.textContent).toContain('Date from must not be after date to');
    c.clearReceiptFilters();
    c.changeReceiptPage(1);
    c.receiptFilters.controls.minAmount.setValue(50);
    expect(api.getFinanceReceipts.mock.lastCall?.[0]).toMatchObject({
      minAmount: 50,
      pageNumber: 1,
    });
    c.receiptFilters.patchValue({ minAmount: 200, maxAmount: 100 }, { emitEvent: false });
    c.loadReceipts();
    expect(c.receiptFilters.hasError('amountRange')).toBe(true);
  });
  it('lists all accounts and opens a fresh add form without overwriting existing accounts', () => {
    const f = fixture(),
      c = f.componentInstance;
    data.next({ role: 'finance', page: 'bank-accounts' });
    c.openCounterpartyAccounts(choice);
    f.detectChanges();
    expect(api.getBankAccounts).toHaveBeenCalledWith(7, false);
    expect(c.bankAccounts()).toHaveLength(2);
    expect(f.nativeElement.textContent).toContain('Inactive');
    expect(c.bankAccountFormVisible()).toBe(false);
    const add = Array.from(
      f.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>,
    ).find((b) => b.textContent?.includes('Add another bank account'))!;
    add.click();
    f.detectChanges();
    fillAccount(c);
    c.saveBankAccount();
    expect(api.createBankAccount).toHaveBeenCalledTimes(1);
    expect(api.updateBankAccount).not.toHaveBeenCalled();
    expect(c.bankAccounts()).toHaveLength(2);
    expect(api.getBankAccounts.mock.calls.length).toBeGreaterThan(1);
  });
  it('accepts long IBAN and RIB values and hyphenated account identifiers', () => {
    const f = fixture(), c = f.componentInstance;
    c.openCounterpartyAccounts(choice);
    c.resetBankAccountForm();
    fillAccount(c);
    const iban = '354415-USD-0000001069-01-' + '9'.repeat(512);
    const rib = 'RIB-' + '7'.repeat(512);
    c.bankAccountForm.patchValue({ iban, rib });
    expect(c.bankAccountForm.valid).toBe(true);
    f.detectChanges();
    expect(f.nativeElement.querySelector('[formControlName="rib"]').hasAttribute('maxlength')).toBe(false);
    expect(f.nativeElement.querySelector('[formControlName="iban"]').hasAttribute('maxlength')).toBe(false);
    c.saveBankAccount();
    expect(api.createBankAccount).toHaveBeenCalledWith(7, expect.objectContaining({ iban, rib }));
  });

  it('does not require IBAN or SWIFT/BIC, including correspondent SWIFT/BIC', () => {
    const f = fixture(), c = f.componentInstance;
    c.openCounterpartyAccounts(choice);
    c.resetBankAccountForm();
    fillAccount(c);
    c.bankAccountForm.patchValue({ iban: '', swiftBic: '', hasCorrespondentBank: true, correspondentBankName: 'Correspondent', correspondentSwiftBic: '' });
    expect(c.bankAccountForm.valid).toBe(true);
    c.saveBankAccount();
    expect(api.createBankAccount).toHaveBeenCalledWith(7, expect.objectContaining({ iban: null, swiftBic: null, correspondentSwiftBic: null }));
  });

  it('accepts punctuation and numeric or long SWIFT/BIC codes without validation', () => {
    const f = fixture(), c = f.componentInstance;
    c.openCounterpartyAccounts(choice);
    c.resetBankAccountForm();
    fillAccount(c);
    c.bankAccountForm.patchValue({ iban: 'ANY/@!VALUE', swiftBic: '29590495' });
    expect(c.bankAccountForm.valid).toBe(true);
    c.bankAccountForm.patchValue({ swiftBic: '8'.repeat(512), hasCorrespondentBank: true, correspondentBankName: 'Correspondent', correspondentSwiftBic: '7'.repeat(512) });
    expect(c.bankAccountForm.valid).toBe(true);
    c.saveBankAccount();
    expect(api.createBankAccount).toHaveBeenCalledWith(7, expect.objectContaining({ iban: 'ANY/@!VALUE', swiftBic: '8'.repeat(512), correspondentSwiftBic: '7'.repeat(512) }));
  });

  it('prevents duplicate submissions and displays backend validation errors', () => {
    const f = fixture(),
      c = f.componentInstance;
    c.openCounterpartyAccounts(choice);
    c.resetBankAccountForm();
    fillAccount(c);
    const pending = new Subject<BankAccountResponse>();
    api.createBankAccount.mockReturnValue(pending);
    c.saveBankAccount();
    c.saveBankAccount();
    expect(api.createBankAccount).toHaveBeenCalledTimes(1);
    expect(c.isSubmitting()).toBe(true);
    pending.error(
      new HttpErrorResponse({
        status: 409,
        error: {
          message: 'This bank account already exists.',
          errors: ['Iban: Duplicate account.'],
        },
      }),
    );
    f.detectChanges();
    expect(c.isSubmitting()).toBe(false);
    expect(f.nativeElement.textContent).toContain('Duplicate account');
  });
  it('loads authorized edit details and keeps add and update operations separate', () => {
    const f = fixture(),
      c = f.componentInstance;
    c.openCounterpartyAccounts(choice);
    c.editBankAccount(account);
    expect(api.getBankAccount).toHaveBeenCalledWith(7, 3);
    expect(c.bankAccountForm.controls.iban.value).not.toBe('');
    c.saveBankAccount();
    expect(api.updateBankAccount).toHaveBeenCalledWith(
      7,
      3,
      expect.objectContaining({ accountLabel: 'Primary' }),
    );
    c.resetBankAccountForm();
    fillAccount(c);
    c.saveBankAccount();
    expect(api.createBankAccount).toHaveBeenCalledTimes(1);
  });
  it('handles default changes and guards repeated status actions', () => {
    const c = fixture().componentInstance;
    c.openCounterpartyAccounts(choice);
    c.markBankAccountDefault({ ...account, idBankAccount: 4, isDefault: false });
    expect(api.setBankAccountDefault).toHaveBeenCalledWith(7, 4);
    const pending = new Subject<boolean>();
    api.setBankAccountStatus.mockReturnValue(pending);
    c.setBankAccountStatus(account, false);
    c.setBankAccountStatus(account, false);
    expect(api.setBankAccountStatus).toHaveBeenCalledTimes(1);
    pending.next(true);
    pending.complete();
    expect(c.isSubmitting()).toBe(false);
  });
  it('refreshes backend eligibility for the selected payment account and sends its ID', () => {
    const c = fixture().componentInstance;
    const bank = {
      idBankAccount: 4,
      bankName: 'Other Bank',
      bankCity: 'Tunis',
      bankCountry: 'Tunisia',
      correspondentBankName: null,
      correspondentSwiftBic: null,
      isDefault: false,
      iban: 'TN5900000000000000000002',
      swiftBic: 'ABCDEF12',
    };
    const context = {
      closingId: 10,
      closingReference: 'C-10',
      status: 'AwaitingFinanceDisbursement',
      totalClosingAmount: 100,
      isConsistent: true,
      canStartPayment: true,
      selectedBankAccount: bank,
      disbursementId: null,
      bankAccounts: [account],
      lines: [],
      reinsurerName: 'Acme',
      currencyCode: 'USD',
    } as unknown as ClosingDisbursementContext;
    c.closingContext.set({ ...context, selectedBankAccount: { ...bank, idBankAccount: 3 } });
    api.getClosingDisbursementContext.mockReturnValue(of(context));
    api.startClosingDisbursement.mockReturnValue(of({ ...context, status: 'PaymentInProgress' }));
    c.choosePaymentAccount(4);
    expect(api.getClosingDisbursementContext).toHaveBeenCalledWith(10, 4);
    // Avoid an unrelated queue refresh; this check covers the request chosen from backend context.
    vi.spyOn(c, 'loadRemittances').mockImplementation(() => {});
    c.startClosingPayment();
    expect(api.startClosingDisbursement).toHaveBeenCalledWith(10, 4);
  });
  it('keeps loading, empty results and API failures distinct', () => {
    const f = fixture(),
      c = f.componentInstance;
    const pending = new Subject<typeof page>();
    api.getFinanceReceipts.mockReturnValue(pending);
    c.loadReceipts();
    f.detectChanges();
    expect(f.nativeElement.textContent).toContain('Loading encaissements');
    pending.next({ ...page, items: [], totalCount: 0, totalPages: 0 });
    pending.complete();
    f.detectChanges();
    expect(f.nativeElement.textContent).toContain('No matching encaissements');
    api.getFinanceReceipts.mockReturnValue(
      throwError(
        () => new HttpErrorResponse({ status: 500, error: { message: 'Service unavailable' } }),
      ),
    );
    c.loadReceipts();
    f.detectChanges();
    expect(f.nativeElement.textContent).toContain('Service unavailable');
    expect(f.nativeElement.textContent).not.toContain('No matching encaissements');
  });
});
