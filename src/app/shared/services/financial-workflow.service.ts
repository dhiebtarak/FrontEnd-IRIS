import { HttpClient, HttpErrorResponse, HttpParams, HttpResponse } from '@angular/common/http';
import { Injectable, isDevMode } from '@angular/core';
import { catchError, map, Observable, throwError } from 'rxjs';
import {
  BankAccountRequest,
  BankAccountResponse,
  BankReceiptRequest,
  BankReceiptResponse,
  AvoirRefundRequest,
  AvoirRefundResponse,
  EligibleAvoirRefundReceipt,
  BackendFileDownload,
  FinancialNoteDownload,
  CedentClosingRequest,
  CedentClosingResponse,
  DisbursementCommandResponse,
  DisbursementContext,
  ClosingDisbursementContext,
  FinanceClosingQueueItem,
  DisbursementQueueItem,
  DisbursementRequest,
  DisbursementResponse,
  EligibleContract,
  EligibleContractsResult,
  EligibleInvoice,
  EligibleInvoicesResult,
  FinancialHistory,
  FinancialReceiptQuery,
  InvoiceContext,
  InvoiceQuery,
  InvoicePanelOption,
  InvoiceReceiptAllocation,
  InvoiceRequest,
  InvoiceResponse,
  NotificationItem,
  OutgoingClosingRequest,
  PairEncaissementBatchRequest,
  PairInvoiceAllocationBatchRequest,
  PremiumDebitNoteAllocation,
  PremiumDebitNotePreview,
  PremiumDebitNoteRequest,
  PremiumDebitNoteResponse,
  PairEncaissementRequest,
  PairInvoiceAllocationRequest,
  PagedResponse,
  RemittanceResponse,
  RemittanceBatchConfirmationResponse,
  RemittanceQuery,
  StartDisbursementResponse
} from '../models/financial-workflow.model';

@Injectable({
  providedIn: 'root'
})
export class FinancialWorkflowService {
  private readonly baseUrl = 'http://localhost:5151/api';

  constructor(private readonly httpClient: HttpClient) {}

  getFinanceReceipts(query: FinancialReceiptQuery): Observable<PagedResponse<BankReceiptResponse>> {
    return this.httpClient.get<PagedResponse<BankReceiptResponse>>(`${this.baseUrl}/finance/bank-receipts`, {
      params: this.buildReceiptParams(query)
    });
  }

  getBackOfficeReceipts(query: FinancialReceiptQuery): Observable<PagedResponse<BankReceiptResponse>> {
    return this.httpClient.get<PagedResponse<BankReceiptResponse>>(`${this.baseUrl}/back-office/bank-receipts`, {
      params: this.buildReceiptParams(query)
    });
  }

  getReceipt(id: number, owner: 'finance' | 'back-office'): Observable<BankReceiptResponse> {
    return this.httpClient.get<BankReceiptResponse>(`${this.baseUrl}/${owner}/bank-receipts/${id}`);
  }

  createReceipt(request: BankReceiptRequest): Observable<BankReceiptResponse> {
    return this.httpClient.post<BankReceiptResponse>(`${this.baseUrl}/finance/bank-receipts`, request);
  }

  getEligibleContracts(receiptId: number, search?: string | null): Observable<EligibleContractsResult> {
    const params = this.setText(new HttpParams(), 'search', search);
    return this.httpClient.get<EligibleContract[] | PagedResponse<EligibleContract>>(
      `${this.baseUrl}/back-office/bank-receipts/${receiptId}/eligible-contracts`,
      { params, observe: 'response' }
    ).pipe(
      map(response => {
        const body = response.body;
        const items = (Array.isArray(body) ? body : body?.items ?? []).map(item => this.normalizeEligibleContract(item))
        console.debug('Eligible contracts response', {
          url: response.url,
          status: response.status,
          count: items.length
        });

        return {
          items,
          status: response.status
        };
      })
    );
  }

  allocateReceipt(receiptId: number, request: PairEncaissementRequest | PairEncaissementBatchRequest): Observable<BankReceiptResponse> {
    const url = `${this.baseUrl}/back-office/bank-receipts/${receiptId}/allocations`;
    const payload: PairEncaissementRequest | PairEncaissementBatchRequest = 'allocations' in request
      ? {
        allocations: request.allocations.map(allocation => ({
          contractId: this.toRequiredNumber(allocation.contractId),
          allocatedAmount: this.toRequiredNumber(allocation.allocatedAmount)
        }))
      }
      : {
        contractId: this.toRequiredNumber(request.contractId),
        allocatedAmount: this.toRequiredNumber(request.allocatedAmount)
      };
      
    console.debug('Allocation request payload', {
      url,
      payload
    });

    return this.httpClient.post<BankReceiptResponse>(url, payload, { observe: 'response' }).pipe(
      map(response => {
        console.debug('Allocation response', {
          url: response.url,
          status: response.status,
          body: response.body
        });
      console.log('Allocation response body', response.body);
        return response.body as BankReceiptResponse;
      }),
      catchError((error: unknown) => {
        if (error instanceof HttpErrorResponse) {
          console.debug('Allocation response', {
            url: error.url ?? url,
            status: error.status,
            body: error.error
          });
        }

        return throwError(() => error);
      })
    );
  }

  getEligibleInvoices(receiptId: number, search?: string | null): Observable<EligibleInvoicesResult> {
    const params = this.setText(new HttpParams(), 'search', search);
    return this.httpClient.get<EligibleInvoice[] | PagedResponse<EligibleInvoice>>(
      `${this.baseUrl}/back-office/bank-receipts/${receiptId}/eligible-invoices`,
      { params, observe: 'response' }
    ).pipe(
      map(response => {
        const body = response.body;
        const items = (Array.isArray(body) ? body : body?.items ?? []).map(item => this.normalizeEligibleInvoice(item));
        console.debug('Eligible invoices response', {
          url: response.url,
          status: response.status,
          count: items.length
        });

        return {
          items,
          status: response.status
        };
      })
    );
  }

  getEligibleAvoirRefundReceipts(avoirInvoiceId: number): Observable<EligibleAvoirRefundReceipt[]> {
    return this.httpClient.get<EligibleAvoirRefundReceipt[]>(
      `${this.baseUrl}/back-office/invoices/${avoirInvoiceId}/eligible-refund-receipts`
    ).pipe(map(items => Array.isArray(items) ? items.map(item => {
      const { isEligible: legacyEligibility, ...normalizedItem } = item as EligibleAvoirRefundReceipt & { isEligible?: boolean };
      return {
      ...normalizedItem,
      bankReceiptId: this.toRequiredNumber(item.bankReceiptId),
      avoirInvoiceId: this.toRequiredNumber(item.avoirInvoiceId),
      receiptAmount: this.toNumber(item.receiptAmount) ?? 0,
      allocatedAmount: this.toNumber(item.allocatedAmount) ?? 0,
      remainingAmount: this.toNumber(item.remainingAmount) ?? 0,
      pairingStatus: this.toText(item.pairingStatus),
      availableAvoirAmount: this.toNumber(item.availableAvoirAmount) ?? 0,
      refundAmount: this.toNumber(item.refundAmount) ?? 0,
      isEligibleForRefund: item.isEligibleForRefund === true || legacyEligibility === true,
      eligibilityFailureReason: this.toNullableText(item.eligibilityFailureReason)
    }; }) : []));
  }

  refundAvoir(receiptId: number, request: AvoirRefundRequest): Observable<AvoirRefundResponse> {
    return this.httpClient.post<AvoirRefundResponse>(
      `${this.baseUrl}/back-office/bank-receipts/${receiptId}/invoice-allocations/avoir-refund`, request
    );
  }

  allocateReceiptInvoices(receiptId: number, request: PairInvoiceAllocationRequest | PairInvoiceAllocationBatchRequest): Observable<BankReceiptResponse> {
    const url = `${this.baseUrl}/back-office/bank-receipts/${receiptId}/invoice-allocations`;
    const payload: PairInvoiceAllocationRequest | PairInvoiceAllocationBatchRequest = 'allocations' in request
      ? {
        allocations: request.allocations.map(allocation => ({
          invoiceId: this.toRequiredNumber(allocation.invoiceId),
          allocatedAmount: this.toRequiredNumber(allocation.allocatedAmount)
        }))
      }
      : {
        invoiceId: this.toRequiredNumber(request.invoiceId),
        allocatedAmount: this.toRequiredNumber(request.allocatedAmount)
      };

    console.debug('Invoice allocation request payload', { url, payload });

    return this.httpClient.post<BankReceiptResponse>(url, payload, { observe: 'response' }).pipe(
      map(response => {
        console.debug('Invoice allocation response', {
          url: response.url,
          status: response.status,
          body: response.body
        });
        return response.body as BankReceiptResponse;
      }),
      catchError((error: unknown) => {
        if (error instanceof HttpErrorResponse) {
          console.debug('Invoice allocation response', {
            url: error.url ?? url,
            status: error.status,
            body: error.error
          });
        }

        return throwError(() => error);
      })
    );
  }

  getBackOfficeRemittances(query: RemittanceQuery = {}): Observable<PagedResponse<RemittanceResponse>> {
    let params = new HttpParams();
    params = this.setText(params, 'search', query.search);
    params = this.setText(params, 'reinsurer', query.reinsurer);
    params = this.setNumber(params, 'reinsurerId', query.reinsurerId);
    params = this.setText(params, 'contract', query.contract);
    params = this.setText(params, 'umr', query.umr);
    params = this.setNumber(params, 'contractId', query.contractId);
    params = this.setText(params, 'status', query.status);
    params = this.setText(params, 'currency', query.currency);
    params = this.setNumber(params, 'currencyId', query.currencyId);
    params = this.setText(params, 'dateFrom', query.dateFrom);
    params = this.setText(params, 'dateTo', query.dateTo);
    params = this.setNumber(params, 'pageNumber', query.pageNumber ?? 1);
    params = this.setNumber(params, 'pageSize', query.pageSize ?? 20);
    params = this.setText(params, 'sortBy', query.sortBy);
    params = this.setText(params, 'sortDirection', query.sortDirection);

    return this.httpClient.get<PagedResponse<unknown>>(`${this.baseUrl}/back-office/remittances`, { params }).pipe(
      map(response => ({
        items: Array.isArray(response?.items) ? response.items.map(item => this.normalizeRemittance(item)) : [],
        pageNumber: response?.pageNumber ?? response?.page ?? 1,
        pageSize: response?.pageSize ?? 20,
        totalCount: response?.totalCount ?? 0,
        totalPages: response?.totalPages ?? Math.ceil((response?.totalCount ?? 0) / (response?.pageSize ?? 20))
      }))
    );
  }

  confirmRemittance(remittanceRef: number): Observable<RemittanceResponse> {
    return this.httpClient.post<RemittanceResponse>(`${this.baseUrl}/back-office/remittances/${remittanceRef}/confirm`, {});
  }

  confirmRemittancesForDisbursement(remittanceIds: number[]): Observable<RemittanceBatchConfirmationResponse> {
    return this.httpClient.post<RemittanceBatchConfirmationResponse>(`${this.baseUrl}/back-office/remittances/confirm-for-disbursement/batch`, { remittanceIds });
  }

  createOutgoingClosing(request: OutgoingClosingRequest): Observable<BackendFileDownload> {
    return this.httpClient.post(`${this.baseUrl}/back-office/remittances/closings`, request, {
      observe: 'response',
      responseType: 'blob'
    }).pipe(map(response => this.mapFileDownload(response)));
  }

  downloadOutgoingClosing(closingId: number): Observable<BackendFileDownload> {
    return this.httpClient.get(`${this.baseUrl}/back-office/remittances/closings/${closingId}/document`, {
      observe: 'response',
      responseType: 'blob'
    }).pipe(map(response => this.mapFileDownload(response)));
  }

  getDisbursementQueue(): Observable<DisbursementQueueItem[]> {
    return this.httpClient.get<unknown[]>(`${this.baseUrl}/finance/disbursement-queue`).pipe(
      map(items => Array.isArray(items) ? items.map(item => this.normalizeRemittance(item)) : [])
    );
  }

  getFinanceClosingQueue(): Observable<FinanceClosingQueueItem[]> {
    return this.httpClient.get<unknown>(`${this.baseUrl}/finance/disbursement-queue`).pipe(
      map(response => {
        const envelope = this.toRecord(response);
        const rows = Array.isArray(response) ? response : this.toArray(envelope['items']);
        return rows.map(value => {
          const row = this.toRecord(value);
          return {
            closingId: this.toRequiredNumber(row['closingId'] ?? row['ClosingId']),
            closingReference: this.toAnyText(row['closingReference'] ?? row['ClosingReference']),
            reinsurerName: this.toAnyText(row['reinsurerName'] ?? row['ReinsurerName']),
            lineCount: this.toRequiredNumber(row['lineCount'] ?? row['LineCount']),
            premiumTotal: this.toRequiredNumber(row['premiumTotal'] ?? row['PremiumTotal']),
            avoirTotal: this.toRequiredNumber(row['avoirTotal'] ?? row['AvoirTotal']),
            netPayableAmount: this.toRequiredNumber(row['netPayableAmount'] ?? row['NetPayableAmount']),
            currencyCode: this.toAnyText(row['currencyCode'] ?? row['CurrencyCode']),
            issueDate: this.toAnyText(row['issueDate'] ?? row['IssueDate']),
            status: this.toAnyText(row['status'] ?? row['Status'])
          } satisfies FinanceClosingQueueItem;
        });
      })
    );
  }

  getDisbursementContext(remittanceReference: number): Observable<DisbursementContext> {
    return this.httpClient.get<unknown>(`${this.baseUrl}/finance/remittances/${remittanceReference}/disbursement-context`).pipe(
      map(response => this.normalizeDisbursementContext(response, remittanceReference))
    );
  }

  downloadAvoirRefundCreditNote(remittanceRef: number): Observable<BackendFileDownload> {
    return this.httpClient.get(`${this.baseUrl}/finance/remittances/${remittanceRef}/credit-note`, {
      observe: 'response',
      responseType: 'blob'
    }).pipe(map(response => this.mapFileDownload(response)));
  }

  getClosingDisbursementContext(closingId: number): Observable<ClosingDisbursementContext> {
    return this.httpClient.get<Record<string, unknown>>(`${this.baseUrl}/finance/closings/${closingId}/disbursement-context`).pipe(map(record => ({
      ...record,
      storedTotal: this.toRequiredNumber(record['storedTotal'] ?? record['StoredTotal'] ?? record['totalClosingAmount'] ?? record['TotalClosingAmount']),
      calculatedTotal: this.toRequiredNumber(record['calculatedTotal'] ?? record['CalculatedTotal']),
      difference: this.toRequiredNumber(record['difference'] ?? record['Difference']),
      isConsistent: (record['isConsistent'] ?? record['IsConsistent']) === true,
      lines: (Array.isArray(record['lines'] ?? record['Lines']) ? (record['lines'] ?? record['Lines']) as unknown[] : []).map(line => this.normalizeRemittance(line))
    } as ClosingDisbursementContext)));
  }

  startClosingDisbursement(closingId: number): Observable<ClosingDisbursementContext> {
    return this.httpClient.post<ClosingDisbursementContext>(`${this.baseUrl}/finance/closings/${closingId}/start-disbursement`, {});
  }

  confirmClosingTransfer(closingId: number): Observable<ClosingDisbursementContext> {
    return this.httpClient.post<ClosingDisbursementContext>(`${this.baseUrl}/finance/closings/${closingId}/confirm-transfer`, {});
  }

  downloadFinanceClosing(closingId: number): Observable<BackendFileDownload> {
    return this.httpClient.get(`${this.baseUrl}/finance/closings/${closingId}/pdf`, {
      observe: 'response', responseType: 'blob'
    }).pipe(map(response => this.mapFileDownload(response)));
  }

  createDisbursement(request: DisbursementRequest): Observable<DisbursementResponse> {
    return this.httpClient.post<DisbursementResponse>(`${this.baseUrl}/finance/disbursements`, request);
  }

  confirmDisbursement(disbursementId: number): Observable<DisbursementResponse> {
    return this.httpClient.post<DisbursementResponse>(`${this.baseUrl}/finance/disbursements/${disbursementId}/confirm`, {});
  }

  startDisbursement(remittanceId: number): Observable<StartDisbursementResponse> {
    return this.httpClient.post<unknown>(`${this.baseUrl}/finance/remittances/${remittanceId}/start-disbursement`, {}).pipe(
      map(response => this.normalizeStartDisbursementResponse(response))
    );
  }

  confirmTransfer(disbursementId: number): Observable<DisbursementCommandResponse> {
    return this.httpClient.post<unknown>(`${this.baseUrl}/finance/disbursements/${disbursementId}/confirm-transfer`, {}).pipe(
      map(response => this.normalizeDisbursementCommandResponse(response))
    );
  }

  downloadDisbursementInvoice(disbursementId: number): Observable<BackendFileDownload> {
    return this.httpClient.get(`${this.baseUrl}/finance/disbursements/${disbursementId}/invoice`, {
      observe: 'response',
      responseType: 'blob'
    }).pipe(map(response => this.mapFileDownload(response)));
  }

  downloadDocument(documentId: number): Observable<BackendFileDownload> {
    return this.httpClient.get(`${this.baseUrl}/documents/${documentId}/download`, {
      observe: 'response',
      responseType: 'blob'
    }).pipe(map(response => this.mapFileDownload(response)));
  }

  downloadDocumentUrl(url: string): Observable<BackendFileDownload> {
    return this.httpClient.get(this.normalizeBackendDocumentUrl(url), {
      observe: 'response',
      responseType: 'blob'
    }).pipe(map(response => this.mapFileDownload(response)));
  }

  getInvoices(query: InvoiceQuery = {}): Observable<PagedResponse<InvoiceResponse>> {
    let params = new HttpParams();
    params = this.setText(params, 'search', query.search);
    params = this.setNumber(params, 'contractId', query.contractId);
    params = this.setNumber(params, 'cedentId', query.cedentId ?? query.counterpartyId);
    params = this.setNumber(params, 'panelId', query.panelId);
    params = this.setText(params, 'invoiceType', query.invoiceType);
    params = this.setText(params, 'status', query.status);
    params = this.setText(params, 'paymentStatus', query.paymentStatus ?? query.recoveryStatus ?? query.pairingStatus);
    params = this.setNumber(params, 'currencyId', typeof query.currencyId === 'number' ? query.currencyId : null);
    params = this.setText(params, 'dateFrom', query.dateFrom ?? query.from);
    params = this.setText(params, 'dateTo', query.dateTo ?? query.to);
    params = this.setNumber(params, 'pageNumber', query.pageNumber ?? 1);
    params = this.setNumber(params, 'pageSize', query.pageSize ?? 20);
    params = this.setText(params, 'sortBy', query.sortBy);
    params = this.setText(params, 'sortDirection', query.sortDirection);

    return this.httpClient.get<PagedResponse<InvoiceResponse>>(`${this.baseUrl}/back-office/invoices`, { params }).pipe(
      map(response => ({
        items: Array.isArray(response?.items) ? response.items.map(invoice => this.normalizeInvoiceResponse(invoice)) : [],
        pageNumber: response?.pageNumber ?? response?.page ?? 1,
        pageSize: response?.pageSize ?? 20,
        totalCount: response?.totalCount ?? 0,
        totalPages: response?.totalPages ?? 0
      }))
    );
  }

  createInvoice(request: InvoiceRequest): Observable<InvoiceResponse> {
    const url = `${this.baseUrl}/back-office/invoices`;
    console.debug('Invoice create request payload', { url, payload: request });
    return this.httpClient.post<InvoiceResponse>(url, request).pipe(
      map(response => {
        console.debug('Invoice create response', { url, body: response });
        return response;
      })
    );
  }

  createPanelInvoice(contractId: number, panelId: number, request: InvoiceRequest): Observable<InvoiceResponse> {
    return this.httpClient.post<InvoiceResponse>(`${this.baseUrl}/contracts/${contractId}/panels/${panelId}/invoices`, request);
  }

  getBankAccounts(counterpartyId: number): Observable<BankAccountResponse[]> {
    return this.httpClient.get<BankAccountResponse[]>(`${this.baseUrl}/counterparties/${counterpartyId}/bank-accounts`);
  }

  createBankAccount(counterpartyId: number, request: BankAccountRequest): Observable<BankAccountResponse> {
    return this.httpClient.post<BankAccountResponse>(`${this.baseUrl}/counterparties/${counterpartyId}/bank-accounts`, request);
  }

  updateBankAccount(counterpartyId: number, bankAccountId: number, request: BankAccountRequest): Observable<BankAccountResponse> {
    return this.httpClient.put<BankAccountResponse>(`${this.baseUrl}/counterparties/${counterpartyId}/bank-accounts/${bankAccountId}`, request);
  }

  setBankAccountStatus(counterpartyId: number, bankAccountId: number, isActive: boolean): Observable<BankAccountResponse> {
    return this.httpClient.patch<BankAccountResponse>(`${this.baseUrl}/counterparties/${counterpartyId}/bank-accounts/${bankAccountId}/status`, { isActive });
  }

  getNotifications(unreadOnly = false): Observable<NotificationItem[]> {
    return this.httpClient.get<NotificationItem[]>(`${this.baseUrl}/notifications`, {
      params: new HttpParams().set('unreadOnly', String(unreadOnly))
    });
  }

  getUnreadNotificationCount(): Observable<number> {
    return this.httpClient.get<number>(`${this.baseUrl}/notifications/unread-count`);
  }

  markNotificationRead(id: number): Observable<NotificationItem> {
    return this.httpClient.patch<NotificationItem>(`${this.baseUrl}/notifications/${id}/read`, {});
  }

  markAllNotificationsRead(): Observable<void> {
    return this.httpClient.patch<void>(`${this.baseUrl}/notifications/read-all`, {});
  }

  getFinancialHistory(contractId: number): Observable<FinancialHistory> {
    return this.httpClient.get<FinancialHistory>(`${this.baseUrl}/contracts/${contractId}/financial-history`);
  }

  getInvoiceContext(contractId: number): Observable<InvoiceContext> {
    const url = `${this.baseUrl}/back-office/contracts/${contractId}/invoice-context`;
    return this.httpClient.get<unknown>(url).pipe(
      map(payload => {
        const context = this.mapInvoiceContext(payload, contractId);
        console.debug('Invoice context response', { url, body: context });
        return context;
      })
    );
  }

  previewPremiumDebitNote(contractId: number, request: PremiumDebitNoteRequest): Observable<PremiumDebitNotePreview> {
    return this.httpClient
      .post<unknown>(`${this.baseUrl}/back-office/contracts/${contractId}/invoices/preview`, request)
      .pipe(map(payload => this.mapPremiumDebitNotePreview(payload, contractId)));
  }

  createPremiumDebitNote(contractId: number, request: PremiumDebitNoteRequest): Observable<PremiumDebitNoteResponse> {
    return this.httpClient
      .post<unknown>(`${this.baseUrl}/back-office/contracts/${contractId}/invoices`, request)
      .pipe(map(payload => this.mapPremiumDebitNoteResponse(payload, contractId)));
  }

  getContractPremiumDebitNotes(contractId: number): Observable<PremiumDebitNoteResponse[]> {
    return this.httpClient
      .get<unknown[]>(`${this.baseUrl}/back-office/contracts/${contractId}/invoices`)
      .pipe(map(payload => this.toArray(payload).map(item => this.mapPremiumDebitNoteResponse(item, contractId))));
  }

  downloadInvoicePdf(invoiceId: number): Observable<BackendFileDownload> {
    return this.httpClient.get(`${this.baseUrl}/back-office/invoices/${invoiceId}/pdf`, {
      observe: 'response',
      responseType: 'blob'
    }).pipe(map(response => this.mapFileDownload(response)));
  }

  downloadPremiumDebitNote(invoiceId: number): Observable<BackendFileDownload> {
    return this.downloadInvoicePdf(invoiceId);
  }

  downloadContractFinancialNote(contractId: number): Observable<FinancialNoteDownload> {
    return this.httpClient.get(`${this.baseUrl}/back-office/contracts/${contractId}/financial-note/pdf`, {
      observe: 'response',
      responseType: 'blob'
    }).pipe(map(response => ({
      ...this.mapFileDownload(response),
      documentType: this.normalizeFinancialNoteType(response.headers.get('X-Financial-Note-Type')),
      documentReference: response.headers.get('X-Financial-Note-Reference')
    })));
  }

  downloadAvoirPdf(avoirId: number): Observable<BackendFileDownload> {
    return this.httpClient.get(`${this.baseUrl}/back-office/avoirs/${avoirId}/pdf`, {
      observe: 'response',
      responseType: 'blob'
    }).pipe(map(response => this.mapFileDownload(response)));
  }

  downloadAvoirCreditNote(avoirId: number): Observable<BackendFileDownload> {
    return this.downloadAvoirPdf(avoirId);
  }

  createCedentClosing(contractId: number, request: CedentClosingRequest): Observable<CedentClosingResponse> {
    return this.httpClient.post<CedentClosingResponse>(`${this.baseUrl}/contracts/${contractId}/cedent-closings`, request);
  }

  private buildReceiptParams(query: FinancialReceiptQuery): HttpParams {
    let params = new HttpParams()
      .set('pageNumber', String(query.pageNumber))
      .set('pageSize', String(query.pageSize));

    params = this.setText(params, 'search', query.search);
    params = this.setNumber(params, 'counterpartyId', query.counterpartyId);
    params = this.setNumber(params, 'currencyId', query.currencyId);
    params = this.setText(params, 'pairingStatus', query.pairingStatus);
    params = this.setText(params, 'operationFrom', query.operationFrom);
    params = this.setText(params, 'operationTo', query.operationTo);
    params = this.setText(params, 'sortBy', query.sortBy);
    params = this.setText(params, 'sortDirection', query.sortDirection);

    return params;
  }

  private setText(params: HttpParams, key: string, value: string | null | undefined): HttpParams {
    const trimmed = value?.trim();
    if (!trimmed) return params;
    const normalized = trimmed.toLowerCase();
    if (normalized === 'null' || normalized === 'undefined' || normalized.startsWith('all ')) return params;
    return params.set(key, trimmed);
  }

  private setNumber(params: HttpParams, key: string, value: number | null | undefined): HttpParams {
    return typeof value === 'number' && Number.isFinite(value) && value > 0
      ? params.set(key, String(value))
      : params;
  }

  private normalizeBackendDocumentUrl(url: string): string {
    if (/^https?:\/\//i.test(url)) {
      return url;
    }

    const apiRoot = this.baseUrl.replace(/\/api$/, '');
    if (url.startsWith('/api/')) {
      return `${apiRoot}${url}`;
    }

    return `${this.baseUrl}/${url.replace(/^\/+/, '')}`;
  }

  private mapFileDownload(response: HttpResponse<Blob>): BackendFileDownload {
    return {
      blob: response.body ?? new Blob(),
      fileName: this.getFilenameFromContentDisposition(response.headers.get('Content-Disposition')),
      contentType: response.headers.get('Content-Type') ?? response.body?.type ?? null
    };
  }

  private normalizeFinancialNoteType(value: string | null): FinancialNoteDownload['documentType'] {
    const normalized = value?.trim().toUpperCase();
    return normalized === 'DEBIT_NOTE' || normalized === 'CREDIT_NOTE' ? normalized : null;
  }

  private normalizeStartDisbursementResponse(value: unknown): StartDisbursementResponse {
    const record = this.toRecord(value);
    return {
      remittanceId: this.toRequiredNumber(record['remittanceId'] ?? record['RemittanceId'] ?? record['remittanceRef'] ?? record['RemittanceRef']),
      disbursementId: this.toRequiredNumber(record['disbursementId'] ?? record['DisbursementId']),
      invoiceId: this.toRequiredNumber(record['invoiceId'] ?? record['InvoiceId']),
      status: 'PaymentInProgress',
      invoiceDownloadUrl: this.toAnyText(record['invoiceDownloadUrl'] ?? record['InvoiceDownloadUrl'] ?? record['downloadUrl'] ?? record['DownloadUrl'])
    };
  }

  private normalizeDisbursementContext(value: unknown, fallbackRemittanceId: number): DisbursementContext {
    const record = this.toRecord(value);
    return {
      ...(record as unknown as DisbursementContext),
      remittanceId: this.toRequiredNumber(record['remittanceId'] ?? record['RemittanceId'] ?? record['remittanceRef'] ?? record['RemittanceRef'] ?? fallbackRemittanceId),
      remittanceReference: this.toNullableText(record['remittanceReference'] ?? record['RemittanceReference']) ?? String(fallbackRemittanceId),
      sourceType: this.toNullableText(record['sourceType'] ?? record['SourceType']),
      avoirId: this.toNullableNumber(record['avoirId'] ?? record['AvoirId']),
      avoirNumber: this.toNullableText(record['avoirNumber'] ?? record['AvoirNumber']),
      creditNoteNumber: this.toNullableText(record['creditNoteNumber'] ?? record['CreditNoteNumber']),
      creditNoteDownloadUrl: this.toNullableText(record['creditNoteDownloadUrl'] ?? record['CreditNoteDownloadUrl']),
      encaissementId: this.toNullableNumber(record['encaissementId'] ?? record['EncaissementId']),
      encaissementReference: this.toNullableText(record['encaissementReference'] ?? record['EncaissementReference']),
      beneficiaryId: this.toNullableNumber(record['beneficiaryId'] ?? record['BeneficiaryId']),
      beneficiaryName: this.toNullableText(record['beneficiaryName'] ?? record['BeneficiaryName']),
      beneficiaryType: this.toNullableText(record['beneficiaryType'] ?? record['BeneficiaryType']),
      grossAmount: this.toNullableNumber(record['grossAmount'] ?? record['GrossAmount']),
      currency: this.toNullableText(record['currency'] ?? record['Currency']),
      contractId: this.toNullableNumber(record['contractId'] ?? record['ContractId']),
      contractName: this.toNullableText(record['contractName'] ?? record['ContractName']),
      umr: this.toNullableText(record['umr'] ?? record['Umr']),
      cedentName: this.toNullableText(record['cedentName'] ?? record['CedentName']),
      panelId: this.toNullableNumber(record['panelId'] ?? record['PanelId']),
      reinsurerId: this.toRequiredNumber(record['reinsurerId'] ?? record['ReinsurerId'] ?? record['counterpartyId'] ?? record['CounterpartyId']),
      reinsurerName: this.toAnyText(record['reinsurerName'] ?? record['ReinsurerName'] ?? record['counterpartyName'] ?? record['CounterpartyName']),
      grossPremium: this.toNullableNumber(record['grossPremium'] ?? record['GrossPremium']),
      deductions: this.toNullableNumber(record['deductions'] ?? record['Deductions'] ?? record['otherDeductions'] ?? record['OtherDeductions']),
      netPayableAmount: this.toNullableNumber(record['netPayableAmount'] ?? record['NetPayableAmount']) ?? 0,
      currencyCode: this.toAnyText(record['currencyCode'] ?? record['CurrencyCode']),
      status: this.toAnyText(record['status'] ?? record['Status']),
      disbursementId: this.toNullableNumber(record['disbursementId'] ?? record['DisbursementId']),
      invoiceId: this.toNullableNumber(record['invoiceId'] ?? record['InvoiceId']),
      invoiceDownloadUrl: this.toNullableText(record['invoiceDownloadUrl'] ?? record['InvoiceDownloadUrl'] ?? record['downloadUrl'] ?? record['DownloadUrl']),
      invoiceNumber: this.toNullableText(record['invoiceNumber'] ?? record['InvoiceNumber']),
      canDownloadInvoice: this.toBoolean(record['canDownloadInvoice'] ?? record['CanDownloadInvoice']),
      canStartPayment: this.toBoolean(record['canStartPayment'] ?? record['CanStartPayment']),
      canConfirmTransfer: this.toBoolean(record['canConfirmTransfer'] ?? record['CanConfirmTransfer']),
      defaultBankAccount: record['defaultBankAccount'] as DisbursementContext['defaultBankAccount'] ?? record['DefaultBankAccount'] as DisbursementContext['defaultBankAccount'] ?? null,
      validationMessage: this.toNullableText(record['validationMessage'] ?? record['ValidationMessage']),
      closedAt: this.toNullableText(record['closedAt'] ?? record['ClosedAt'])
    };
  }

  private normalizeDisbursementCommandResponse(value: unknown): DisbursementCommandResponse {
    const record = this.toRecord(value);
    const remittance = (record['remittance'] ?? record['Remittance']) as RemittanceResponse | null | undefined;
    const disbursement = (record['disbursement'] ?? record['Disbursement']) as DisbursementResponse | null | undefined;
    return {
      ...(record as unknown as DisbursementCommandResponse),
      remittanceId: this.toNullableNumber(record['remittanceId'] ?? record['RemittanceId']),
      remittance: remittance ?? null,
      disbursement: disbursement ?? null,
      invoiceDownloadUrl: this.toNullableText(record['invoiceDownloadUrl'] ?? record['InvoiceDownloadUrl']),
      documentDownloadUrl: this.toNullableText(record['documentDownloadUrl'] ?? record['DocumentDownloadUrl']),
      downloadUrl: this.toNullableText(record['downloadUrl'] ?? record['DownloadUrl']),
      status: this.toNullableText(record['status'] ?? record['Status']),
      disbursementId: this.toNullableNumber(record['disbursementId'] ?? record['DisbursementId']),
      invoiceId: this.toNullableNumber(record['invoiceId'] ?? record['InvoiceId']),
      documentId: this.toNullableNumber(record['documentId'] ?? record['DocumentId']),
      transferCompletedAt: this.toNullableText(record['transferCompletedAt'] ?? record['TransferCompletedAt']),
      closedAt: this.toNullableText(record['closedAt'] ?? record['ClosedAt'])
    };
  }

  private normalizeRemittance(value: unknown): DisbursementQueueItem {
    const record = this.toRecord(value);
    const rawRemittanceRef = this.toNullableNumber(record['remittanceRef'] ?? record['RemittanceRef']);
    const rawRemittanceId = this.toNullableNumber(record['remittanceId'] ?? record['RemittanceId']);
    const remittanceRef = rawRemittanceRef != null && rawRemittanceRef > 0 ? rawRemittanceRef : rawRemittanceId ?? 0;
    const remittanceId = remittanceRef > 0 ? remittanceRef : rawRemittanceId ?? 0;
    const counterpartyName = this.toAnyText(record['counterpartyName'] ?? record['CounterpartyName'] ?? record['reinsurerName'] ?? record['ReinsurerName']);
    return {
      ...(record as unknown as RemittanceResponse),
      remittanceId,
      remittanceRef,
      remittanceReference: this.toAnyText(record['remittanceReference'] ?? record['RemittanceReference'] ?? remittanceRef),
      receiptAllocationId: this.toNullableNumber(record['receiptAllocationId'] ?? record['ReceiptAllocationId']),
      disbursementId: this.toNullableNumber(record['disbursementId'] ?? record['DisbursementId']),
      invoiceId: this.toNullableNumber(record['invoiceId'] ?? record['InvoiceId']),
      sourceDocumentId: this.toNullableNumber(record['sourceDocumentId'] ?? record['SourceDocumentId']),
      invoiceNumber: this.toNullableText(record['invoiceNumber'] ?? record['InvoiceNumber']),
      invoiceLabel: this.toNullableText(record['invoiceLabel'] ?? record['InvoiceLabel']),
      invoiceAvoirNumber: this.toNullableText(record['invoiceAvoirNumber'] ?? record['InvoiceAvoirNumber']
        ?? record['sourceDocumentNumber'] ?? record['SourceDocumentNumber']),
      label: this.toNullableText(record['label'] ?? record['Label'] ?? record['invoiceLabel'] ?? record['InvoiceLabel']),
      sourceType: this.toNullableText(record['sourceType'] ?? record['SourceType']),
      beneficiaryType: this.toNullableText(record['beneficiaryType'] ?? record['BeneficiaryType']),
      sourceInvoiceId: this.toNullableNumber(record['sourceInvoiceId'] ?? record['SourceInvoiceId']),
      sourceInvoiceNumber: this.toNullableText(record['sourceInvoiceNumber'] ?? record['SourceInvoiceNumber']),
      invoiceDownloadUrl: this.toNullableText(record['invoiceDownloadUrl'] ?? record['InvoiceDownloadUrl'] ?? record['downloadUrl'] ?? record['DownloadUrl']),
      panelId: this.toNullableNumber(record['panelId'] ?? record['PanelId']),
      panelName: this.toNullableText(record['panelName'] ?? record['PanelName']),
      contractId: this.toNullableNumber(record['contractId'] ?? record['ContractId']),
      contractName: this.toNullableText(record['contractName'] ?? record['ContractName']),
      umr: this.toNullableText(record['umr'] ?? record['Umr']),
      cedentName: this.toNullableText(record['cedentName'] ?? record['CedentName']),
      counterpartyId: this.toRequiredNumber(record['counterpartyId'] ?? record['CounterpartyId'] ?? record['reinsurerId'] ?? record['ReinsurerId']),
      beneficiaryId: this.toNullableNumber(record['beneficiaryId'] ?? record['BeneficiaryId'] ?? record['counterpartyId'] ?? record['CounterpartyId']),
      beneficiaryCounterpartyId: this.toNullableNumber(record['beneficiaryCounterpartyId'] ?? record['BeneficiaryCounterpartyId'] ?? record['beneficiaryId'] ?? record['BeneficiaryId'] ?? record['counterpartyId'] ?? record['CounterpartyId']),
      counterpartyName,
      reinsurerId: this.toNullableNumber(record['reinsurerId'] ?? record['ReinsurerId'] ?? record['counterpartyId'] ?? record['CounterpartyId']),
      reinsurerName: this.toNullableText(record['reinsurerName'] ?? record['ReinsurerName'] ?? record['counterpartyName'] ?? record['CounterpartyName']),
      receiptReference: this.toNullableText(record['receiptReference'] ?? record['ReceiptReference']),
      grossPremium: this.toNullableNumber(record['grossPremium'] ?? record['GrossPremium']),
      otherDeductions: this.toNullableNumber(record['otherDeductions'] ?? record['OtherDeductions']),
      netPremiumDue: this.toNullableNumber(record['netPremiumDue'] ?? record['NetPremiumDue']),
      netPayableAmount: this.toNullableNumber(record['netPayableAmount'] ?? record['NetPayableAmount']),
      signedNetPayableAmount: this.toNullableNumber(record['signedNetPayableAmount'] ?? record['SignedNetPayableAmount']),
      currencyId: this.toRequiredNumber(record['currencyId'] ?? record['CurrencyId']),
      currencyCode: this.toAnyText(record['currencyCode'] ?? record['CurrencyCode']),
      status: this.toAnyText(record['status'] ?? record['Status']),
      description: this.toAnyText(record['description'] ?? record['Description']),
      confirmedAt: this.toNullableText(record['confirmedAt'] ?? record['ConfirmedAt']),
      confirmedBy: this.toNullableText(record['confirmedBy'] ?? record['ConfirmedBy']),
      createdAt: this.toNullableText(record['createdAt'] ?? record['CreatedAt']),
      closingIssuedDate: this.toNullableText(record['closingIssuedDate'] ?? record['ClosingIssuedDate']),
      closingId: this.toNullableNumber(record['closingId'] ?? record['ClosingId']),
      closingReference: this.toNullableText(record['closingReference'] ?? record['ClosingReference']),
      closingEligible: typeof record['closingEligible'] === 'boolean' ? record['closingEligible'] as boolean : null,
      remainingPayableAmount: this.toNullableNumber(record['remainingPayableAmount'] ?? record['RemainingPayableAmount']),
      transferCompletedAt: this.toNullableText(record['transferCompletedAt'] ?? record['TransferCompletedAt'] ?? record['closedAt'] ?? record['ClosedAt']),
      hasActiveBankAccount: typeof record['hasActiveBankAccount'] === 'boolean' ? record['hasActiveBankAccount'] as boolean : null
    };
  }

  private toNullableNumber(value: unknown): number | null {
    if (value == null || value === '') {
      return null;
    }

    const numberValue = Number(value);
    return Number.isFinite(numberValue) ? numberValue : null;
  }

  private toAnyText(value: unknown): string {
    return typeof value === 'string' ? value : value == null ? '' : String(value);
  }

  private toNullableText(value: unknown): string | null {
    const text = this.toAnyText(value).trim();
    return text ? text : null;
  }

  private toBoolean(value: unknown): boolean {
    return value === true || value === 'true' || value === 1 || value === '1';
  }

  private getFilenameFromContentDisposition(contentDisposition: string | null): string | null {
    if (!contentDisposition) {
      return null;
    }

    const utf8Match = /filename\*=UTF-8''([^;]+)/i.exec(contentDisposition);
    if (utf8Match?.[1]) {
      return decodeURIComponent(utf8Match[1].replace(/^"|"$/g, ''));
    }

    const filenameMatch = /filename="?([^";]+)"?/i.exec(contentDisposition);
    return filenameMatch?.[1] ?? null;
  }

  private resolveApiDownloadUrl(downloadUrl: string, fallbackUrl: string): string {
    try {
      const apiOrigin = new URL(this.baseUrl).origin;
      const resolved = new URL(downloadUrl, apiOrigin);
      return resolved.origin === apiOrigin ? resolved.toString() : fallbackUrl;
    } catch {
      return fallbackUrl;
    }
  }

  private normalizeEligibleContract(item: EligibleContract): EligibleContract {
    const record = item as EligibleContract & { IdContract?: number | string; counterpartyName?: string };
    return {
      ...item,
      contractId: this.toRequiredNumber(record.contractId ?? record.idContract ?? record.IdContract),
      cedentName: item.cedentName || record.counterpartyName || ''
    };
  }

  private normalizeEligibleInvoice(item: EligibleInvoice): EligibleInvoice {
    const record = this.toRecord(item);
    const invoiceId = this.toRequiredNumber(record['invoiceId'] ?? record['idInvoice'] ?? record['IdInvoice']);
    const invoiceType = this.toAnyText(record['invoiceType'] ?? record['InvoiceType'] ?? record['type'] ?? record['Type'] ?? record['documentType'] ?? record['DocumentType']);
    const isAvoir = record['isAvoir'] === true || invoiceType.trim().toUpperCase() === 'AVOIR';
    const documentNumber = this.toNullableText(record['documentNumber'] ?? record['DocumentNumber']);
    const invoiceNumber = this.toNullableText(record['invoiceNumber'] ?? record['InvoiceNumber']);
    return {
      ...(item as EligibleInvoice),
      invoiceId,
      idInvoice: record['idInvoice'] as number | string | undefined ?? invoiceId,
      invoiceNumber: invoiceNumber || documentNumber || `${isAvoir ? 'AV' : 'INV'}-${invoiceId}`,
      ...(documentNumber ? { documentNumber } : {}),
      label: this.toNullableText(record['label'] ?? record['Label']),
      contractId: this.toNullableNumber(record['contractId'] ?? record['ContractId'] ?? record['idContract'] ?? record['IdContract']),
      umr: this.toNullableText(record['umr'] ?? record['UMR'] ?? record['Umr']),
      contractName: this.toNullableText(record['contractName'] ?? record['ContractName']),
      cedentId: this.toNullableNumber(record['cedentId'] ?? record['CedentId'] ?? record['counterpartyId'] ?? record['CounterpartyId']),
      cedentName: this.toAnyText(record['cedentName'] ?? record['CedentName'] ?? record['counterpartyName'] ?? record['CounterpartyName']),
      counterpartyName: this.toNullableText(record['counterpartyName'] ?? record['CounterpartyName'] ?? record['reinsurerName'] ?? record['ReinsurerName']),
      invoiceType: invoiceType || null,
      invoiceDate: this.toNullableText(record['invoiceDate'] ?? record['InvoiceDate']),
      invoiceAmount: this.toNullableNumber(record['invoiceAmount'] ?? record['InvoiceAmount'] ?? record['grossAmount'] ?? record['GrossAmount'] ?? record['actualAmount'] ?? record['ActualAmount'] ?? record['amount'] ?? record['Amount']),
      ...(this.toNullableNumber(record['amount'] ?? record['Amount']) != null ? { amount: this.toNullableNumber(record['amount'] ?? record['Amount']) } : {}),
      ...(this.toNullableNumber(record['signedAmount'] ?? record['SignedAmount']) != null ? { signedAmount: this.toNullableNumber(record['signedAmount'] ?? record['SignedAmount']) } : {}),
      isAvoir,
      settledAmount: this.toNullableNumber(record['settledAmount'] ?? record['SettledAmount'] ?? record['alreadyPairedAmount'] ?? record['AlreadyPairedAmount'] ?? record['pairedAmount'] ?? record['PairedAmount']),
      remainingAmount: this.toNullableNumber(record['remainingAmount'] ?? record['RemainingAmount'] ?? record['outstandingAmount'] ?? record['OutstandingAmount']),
      paymentStatus: this.toNullableText(record['paymentStatus'] ?? record['PaymentStatus'] ?? record['recoveryStatus'] ?? record['RecoveryStatus']),
      grossAmount: this.toNumber(record['grossAmount'] ?? record['GrossAmount'] ?? record['invoiceAmount'] ?? record['InvoiceAmount'] ?? record['actualAmount'] ?? record['ActualAmount'] ?? record['amount'] ?? record['Amount']) ?? 0,
      alreadyPairedAmount: this.toNumber(record['alreadyPairedAmount'] ?? record['AlreadyPairedAmount'] ?? record['settledAmount'] ?? record['SettledAmount'] ?? record['pairedAmount'] ?? record['PairedAmount']) ?? 0,
      outstandingAmount: this.toNumber(record['outstandingAmount'] ?? record['OutstandingAmount'] ?? record['remainingAmount'] ?? record['RemainingAmount']) ?? 0,
      currencyCode: this.toAnyText(record['currencyCode'] ?? record['CurrencyCode'] ?? record['currency'] ?? record['Currency']),
      ...(this.toNullableText(record['currency'] ?? record['Currency']) ? { currency: this.toNullableText(record['currency'] ?? record['Currency']) } : {}),
      recoveryStatus: this.toNullableText(record['recoveryStatus'] ?? record['RecoveryStatus'] ?? record['paymentStatus'] ?? record['PaymentStatus'])
    };
  }

  private normalizeInvoiceResponse(item: InvoiceResponse): InvoiceResponse {
    const record = this.toRecord(item);
    const idInvoice = this.toRequiredNumber(record['idInvoice'] ?? record['IdInvoice'] ?? record['invoiceId'] ?? record['InvoiceId']);
    const invoiceType = this.toAnyText(record['invoiceType'] ?? record['InvoiceType'] ?? record['type'] ?? record['Type'] ?? record['documentType'] ?? record['DocumentType']);
    const isAvoir = record['isAvoir'] === true || invoiceType.trim().toUpperCase() === 'AVOIR';
    const documentNumber = this.toNullableText(record['documentNumber'] ?? record['DocumentNumber']);
    const invoiceNumber = this.toNullableText(record['invoiceNumber'] ?? record['InvoiceNumber']);
    return {
      ...item,
      idInvoice,
      contractId: this.toRequiredNumber(record['contractId'] ?? record['ContractId'] ?? record['idContract'] ?? record['IdContract']),
      counterpartyId: this.toNullableNumber(record['counterpartyId'] ?? record['CounterpartyId'] ?? record['cedentId'] ?? record['CedentId']),
      panelId: this.toNullableNumber(record['panelId'] ?? record['PanelId']),
      remittanceRef: this.toNullableNumber(record['remittanceRef'] ?? record['RemittanceRef']),
      receiptAllocationId: this.toNullableNumber(record['receiptAllocationId'] ?? record['ReceiptAllocationId']),
      currencyId: this.toNullableNumber(record['currencyId'] ?? record['CurrencyId']),
      currencyCode: this.toNullableText(record['currencyCode'] ?? record['CurrencyCode'] ?? record['currency'] ?? record['Currency']),
      ...(this.toNullableText(record['currency'] ?? record['Currency']) ? { currency: this.toNullableText(record['currency'] ?? record['Currency']) } : {}),
      invoiceNumber: invoiceNumber || documentNumber || `${isAvoir ? 'AV' : 'INV'}-${idInvoice}`,
      ...(documentNumber ? { documentNumber } : {}),
      invoiceType,
      isAvoir,
      invoiceDate: this.toAnyText(record['invoiceDate'] ?? record['InvoiceDate']),
      invoiceAmount: this.toNullableNumber(record['invoiceAmount'] ?? record['InvoiceAmount'] ?? record['grossAmount'] ?? record['GrossAmount']),
      ...(this.toNullableNumber(record['signedAmount'] ?? record['SignedAmount']) != null ? { signedAmount: this.toNullableNumber(record['signedAmount'] ?? record['SignedAmount']) } : {}),
      settledAmount: this.toNullableNumber(record['settledAmount'] ?? record['SettledAmount'] ?? record['pairedAmount'] ?? record['PairedAmount']),
      remainingAmount: this.toNullableNumber(record['remainingAmount'] ?? record['RemainingAmount'] ?? record['outstandingAmount'] ?? record['OutstandingAmount']),
      paymentStatus: this.toNullableText(record['paymentStatus'] ?? record['PaymentStatus'] ?? record['recoveryStatus'] ?? record['RecoveryStatus']),
      grossAmount: this.toNullableNumber(record['grossAmount'] ?? record['GrossAmount'] ?? record['invoiceAmount'] ?? record['InvoiceAmount']),
      actualAmount: this.toNullableNumber(record['actualAmount'] ?? record['ActualAmount']),
      amount: this.toNullableNumber(record['amount'] ?? record['Amount']),
      netPremium: this.toNullableNumber(record['netPremium'] ?? record['NetPremium'] ?? record['netAmount'] ?? record['NetAmount']),
      affectedAmount: this.toNullableNumber(record['affectedAmount'] ?? record['AffectedAmount']),
      unaffectedAmount: this.toNullableNumber(record['unaffectedAmount'] ?? record['UnaffectedAmount']),
      alreadyPairedAmount: this.toNullableNumber(record['alreadyPairedAmount'] ?? record['AlreadyPairedAmount']),
      pairedAmount: this.toNullableNumber(record['pairedAmount'] ?? record['PairedAmount']),
      outstandingAmount: this.toNullableNumber(record['outstandingAmount'] ?? record['OutstandingAmount'] ?? record['remainingAmount'] ?? record['RemainingAmount']),
      contractName: this.toNullableText(record['contractName'] ?? record['ContractName']),
      umr: this.toNullableText(record['umr'] ?? record['UMR'] ?? record['Umr']),
      cedentName: this.toNullableText(record['cedentName'] ?? record['CedentName']),
      counterpartyName: this.toNullableText(record['counterpartyName'] ?? record['CounterpartyName']),
      reinsurerName: this.toNullableText(record['reinsurerName'] ?? record['ReinsurerName']),
      recoveryStatus: this.toNullableText(record['recoveryStatus'] ?? record['RecoveryStatus'] ?? record['paymentStatus'] ?? record['PaymentStatus']),
      status: this.toAnyText(record['status'] ?? record['Status']),
      label: this.toAnyText(record['label'] ?? record['Label'])
    };
  }

  private mapInvoiceContext(payload: unknown, fallbackContractId: number): InvoiceContext {
    const record = this.toRecord(payload);
    const availableCreditBalance = this.toNullableNumber(record['availableCreditBalance'] ?? record['AvailableCreditBalance']);
    const availableAvoirAmount = this.toNullableNumber(record['availableAvoirAmount'] ?? record['AvailableAvoirAmount'] ?? record['availableCreditAmount'] ?? record['AvailableCreditAmount']);
    const netInvoicedBalance = this.toNullableNumber(record['netInvoicedBalance'] ?? record['NetInvoicedBalance']);
    const cedentCommissionPercentage = this.toNullableNumber(record['cedentCommissionPercentage'] ?? record['CedentCommissionPercentage'] ?? record['cedentCommissionPct'] ?? record['CedentCommissionPct']);
    const currencyCode = this.toText(record['currencyCode'] ?? record['CurrencyCode'] ?? record['currency'] ?? record['Currency']);
    return {
      contractId: this.toRequiredNumber(record['contractId'] ?? record['idContract']) || fallbackContractId,
      currency: currencyCode,
      currencyCode,
      status: this.toText(record['status'] ?? record['Status']),
      contractGrossPremium: this.toNumber(record['contractGrossPremium'] ?? record['ContractGrossPremium']) ?? 0,
      cedentCommissionPct: cedentCommissionPercentage,
      cedentCommissionPercentage,
      cedentCommissionAmount: this.toNullableNumber(record['cedentCommissionAmount'] ?? record['CedentCommissionAmount']),
      contractSignedSharePercentage: this.toNullableNumber(record['contractSignedSharePercentage'] ?? record['ContractSignedSharePercentage']),
      invoiceableNetPremium: this.toNullableNumber(record['invoiceableNetPremium'] ?? record['InvoiceableNetPremium']),
      currencyDecimalPlaces: this.toNullableNumber(record['currencyDecimalPlaces'] ?? record['CurrencyDecimalPlaces']),
      pairedAmount: this.toNumber(record['pairedAmount'] ?? record['totalPaired']) ?? 0,
      alreadyInvoicedAmount: this.toNumber(record['alreadyInvoicedAmount'] ?? record['alreadyInvoiced']) ?? 0,
      remainingInvoiceableAmount: this.toNumber(record['remainingInvoiceableAmount'] ?? record['RemainingInvoiceableAmount']) ?? 0,
      ...(availableCreditBalance != null ? { availableCreditBalance } : {}),
      ...(availableAvoirAmount != null ? { availableAvoirAmount } : {}),
      ...(netInvoicedBalance != null ? { netInvoicedBalance } : {}),
      invoiceableGrossPremium: this.toNumber(record['invoiceableGrossPremium'] ?? record['InvoiceableGrossPremium']) ?? 0,
      canCreateInvoice: record['canCreateInvoice'] === true || record['CanCreateInvoice'] === true,
      blockingReason: this.toBlockingReason(record['blockingReason'] ?? record['BlockingReason']),
      previousInvoices: this.toArray(record['previousInvoices'] ?? record['PreviousInvoices'])
        .map(item => this.mapPremiumDebitNoteResponse(item, fallbackContractId)),
      receiptAllocations: this.toArray(record['receiptAllocations'] ?? record['allocations'])
        .map(item => this.mapInvoiceReceiptAllocation(item))
        .filter(allocation => allocation.receiptAllocationId > 0),
      reinsurerPanels: this.toArray(record['reinsurerPanels'] ?? record['panels'])
        .map(item => this.mapInvoicePanelOption(item))
        .filter(panel => panel.panelId > 0)
    };
  }

  private toBlockingReason(value: unknown): string | null {
    if (typeof value === 'string') {
      return this.toBlockingReasonMessage(value.trim());
    }

    const record = this.toRecord(value);
    return this.toBlockingReasonMessage(this.toText(record['message'] ?? record['businessMessage'] ?? record['reason'] ?? record['description']));
  }

  private toBlockingReasonMessage(value: string): string | null {
    if (!value) {
      return null;
    }

    switch (value.trim().toUpperCase()) {
      case 'CONTRACT_NOT_BOUND':
        return 'Contract is not Bound.';
      case 'GROSS_PREMIUM_MISSING':
        return 'Contract gross premium is missing.';
      case 'FULLY_INVOICED':
        return 'The contract is fully invoiced.';
      case 'NO_CONFIRMED_REINSURERS':
        return 'No confirmed reinsurers are available for invoicing.';
      default:
        return value;
    }
  }

  private mapInvoiceReceiptAllocation(value: unknown): InvoiceReceiptAllocation {
    const record = this.toRecord(value);
    const receiptAllocationId = this.toRequiredNumber(record['receiptAllocationId'] ?? record['idReceiptAllocation']);
    const allocatedAmount = this.toNumber(record['allocatedAmount']) ?? 0;
    const alreadyInvoicedAmount = this.toNumber(record['alreadyInvoicedAmount'] ?? record['invoicedAmount']) ?? 0;
    return {
      receiptAllocationId,
      receiptReference: this.toText(record['receiptReference'] ?? record['bankReference'] ?? record['reference']) || `Allocation ${receiptAllocationId}`,
      allocatedAmount,
      alreadyInvoicedAmount,
      availableAmount: this.toNumber(record['availableAmount']) ?? Math.max(allocatedAmount - alreadyInvoicedAmount, 0),
      currencyCode: this.toText(record['currencyCode'] ?? record['currency'])
    };
  }

  private mapInvoicePanelOption(value: unknown): InvoicePanelOption {
    const record = this.toRecord(value);
    return {
      panelId: this.toRequiredNumber(record['panelId'] ?? record['idPanel']),
      counterpartyId: this.toRequiredNumber(record['counterpartyId'] ?? record['idCounterparty']),
      reinsurerName: this.toText(record['reinsurerName'] ?? record['counterpartyName']),
      signedSharePct: this.toNumber(record['signedSharePct']),
      status: this.toText(record['status'])
    };
  }

  private mapPremiumDebitNotePreview(value: unknown, fallbackContractId: number): PremiumDebitNotePreview {
    const record = this.toRecord(value);
    return {
      contractId: this.toRequiredNumber(record['contractId'] ?? record['ContractId']) || fallbackContractId,
      invoiceableGrossPremium: this.toNumber(record['invoiceableGrossPremium'] ?? record['InvoiceableGrossPremium']) ?? 0,
      alreadyInvoicedAmount: this.toNumber(record['alreadyInvoicedAmount'] ?? record['AlreadyInvoicedAmount']) ?? 0,
      grossAmount: this.toNumber(record['grossAmount'] ?? record['GrossAmount']) ?? 0,
      remainingAmount: this.toNumber(record['remainingAmount'] ?? record['RemainingAmount']) ?? 0,
      isReconciled: typeof (record['isReconciled'] ?? record['IsReconciled']) === 'boolean'
        ? (record['isReconciled'] ?? record['IsReconciled']) as boolean
        : null,
      reconciliationDifference: this.toNullableNumber(record['reconciliationDifference'] ?? record['ReconciliationDifference']),
      currencyCode: this.toNullableText(record['currencyCode'] ?? record['CurrencyCode']),
      allocations: this.toArray(record['allocations'] ?? record['Allocations']).map(item => this.mapPremiumDebitNoteAllocation(item))
    };
  }

  private mapPremiumDebitNoteResponse(value: unknown, fallbackContractId: number): PremiumDebitNoteResponse {
    const record = this.toRecord(value);
    const preview = this.mapPremiumDebitNotePreview(value, fallbackContractId);
    const invoiceType = this.toText(record['invoiceType'] ?? record['InvoiceType'] ?? record['type'] ?? record['Type'] ?? record['documentType'] ?? record['DocumentType']);
    const processingMode = this.toNullableText(record['processingMode'] ?? record['ProcessingMode']);
    const isAvoir = record['isAvoir'] === true || invoiceType.trim().toUpperCase() === 'AVOIR';
    const documentNumber = this.toNullableText(record['documentNumber'] ?? record['DocumentNumber']);
    const invoiceNumber = this.toNullableText(record['invoiceNumber'] ?? record['InvoiceNumber']);
    const amount = this.toNullableNumber(record['amount'] ?? record['Amount'] ?? record['grossAmount'] ?? record['GrossAmount']);
    const signedAmount = this.toNullableNumber(record['signedAmount'] ?? record['SignedAmount']);
    return {
      ...preview,
      invoiceId: this.toRequiredNumber(record['invoiceId'] ?? record['InvoiceId'] ?? record['idInvoice'] ?? record['IdInvoice']),
      invoiceNumber: invoiceNumber || documentNumber || `${isAvoir ? 'AV' : 'INV'}-${this.toRequiredNumber(record['invoiceId'] ?? record['InvoiceId'] ?? record['idInvoice'] ?? record['IdInvoice'])}`,
      ...(documentNumber ? { documentNumber } : {}),
      sequence: this.toNumber(record['sequence'] ?? record['Sequence'] ?? record['sequenceNumber'] ?? record['SequenceNumber']),
      invoiceType,
      ...(processingMode === 'PAIR_WITH_ENCAISSEMENT' || processingMode === 'DIRECT_TO_REMITTANCES' ? { processingMode } : {}),
      pairingRequired: record['pairingRequired'] === true || record['PairingRequired'] === true,
      createdRemittances: this.toArray(record['createdRemittances'] ?? record['CreatedRemittances'])
        .map(item => this.normalizeRemittance(item)),
      invoiceDate: this.toText(record['invoiceDate'] ?? record['InvoiceDate']),
      totalNetAmount: this.toNumber(record['totalNetAmount'] ?? record['TotalNetAmount'] ?? record['netPremium'] ?? record['NetPremium']) ?? 0,
      ...(amount != null ? { amount } : {}),
      ...(signedAmount != null ? { signedAmount } : {}),
      isAvoir,
      currencyCode: this.toText(record['currencyCode'] ?? record['CurrencyCode']),
      ...(this.toNullableText(record['currency'] ?? record['Currency']) ? { currency: this.toNullableText(record['currency'] ?? record['Currency']) } : {}),
      status: this.toText(record['status'] ?? record['Status']),
      paymentStatus: this.toNullableText(record['paymentStatus'] ?? record['PaymentStatus'] ?? record['recoveryStatus'] ?? record['RecoveryStatus']),
      recoveryStatus: this.toNullableText(record['recoveryStatus'] ?? record['RecoveryStatus'] ?? record['paymentStatus'] ?? record['PaymentStatus']),
      label: this.toText(record['label'] ?? record['Label'])
    };
  }

  private mapPremiumDebitNoteAllocation(value: unknown): PremiumDebitNoteAllocation {
    const record = this.toRecord(value);
    const cedentCommissionPct = this.toNumber(record['cedentCommissionPercentage'] ?? record['CedentCommissionPercentage'] ?? record['cedentCommissionPct'] ?? record['CedentCommissionPct']);
    const cedentCommissionAmount = this.toNumber(record['cedentCommissionAmount'] ?? record['CedentCommissionAmount']);
    if (isDevMode() && cedentCommissionPct == null) {
      throw new Error('Invoice calculation data error: response is missing cedentCommissionPct.');
    }
    if (isDevMode() && cedentCommissionAmount == null) {
      throw new Error('Invoice calculation data error: response is missing cedentCommissionAmount.');
    }
    return {
      panelId: this.toRequiredNumber(record['panelId'] ?? record['PanelId']),
      reinsurerCode: this.toNullableText(record['reinsurerCode'] ?? record['ReinsurerCode']),
      reinsurerName: this.toText(record['reinsurerName'] ?? record['ReinsurerName']),
      signedSharePct: this.toNumber(record['signedSharePct'] ?? record['SignedSharePct']),
      allocationRatio: this.toNumber(record['allocationRatio'] ?? record['AllocationRatio']) ?? 0,
      allocationRatioPercentage: this.toNullableNumber(record['allocationRatioPercentage'] ?? record['AllocationRatioPercentage']),
      grossPremium: this.toNumber(record['grossPremium'] ?? record['GrossPremium']) ?? 0,
      allocatedGrossPremium: this.toNullableNumber(record['allocatedGrossPremium'] ?? record['AllocatedGrossPremium']),
      allocatedNetPremium: this.toNullableNumber(record['allocatedNetPremium'] ?? record['AllocatedNetPremium']),
      allocationAmount: this.toNullableNumber(record['allocationAmount'] ?? record['AllocationAmount']),
      cedentCommissionPct,
      cedentCommissionPercentage: cedentCommissionPct,
      cedentCommissionAmount: cedentCommissionAmount ?? 0,
      brokeragePct: this.toNumber(record['irisBrokeragePercentage'] ?? record['IrisBrokeragePercentage'] ?? record['brokeragePct'] ?? record['BrokeragePct']) ?? 0,
      irisBrokerageRate: this.toNullableNumber(record['irisBrokerageRate'] ?? record['IrisBrokerageRate']),
      irisBrokeragePercentage: this.toNullableNumber(record['irisBrokeragePercentage'] ?? record['IrisBrokeragePercentage']),
      brokerageAmount: this.toNumber(record['brokerageAmount'] ?? record['BrokerageAmount']) ?? 0,
      irisBrokerageAmount: this.toNullableNumber(record['irisBrokerageAmount'] ?? record['IrisBrokerageAmount']),
      otherDeductions: this.toNumber(record['otherDeductionsAmount'] ?? record['OtherDeductionsAmount'] ?? record['otherDeductions'] ?? record['OtherDeductions']) ?? 0,
      otherDeductionsAmount: this.toNullableNumber(record['otherDeductionsAmount'] ?? record['OtherDeductionsAmount']),
      otherDeductionsPercentage: this.toNullableNumber(record['otherDeductionsPercentage'] ?? record['OtherDeductionsPercentage']),
      netAmount: this.toNumber(record['netPayableAmount'] ?? record['NetPayableAmount'] ?? record['netAmount'] ?? record['NetAmount']) ?? 0,
      netPayableAmount: this.toNullableNumber(record['netPayableAmount'] ?? record['NetPayableAmount']),
      signedNetPayableAmount: this.toNullableNumber(record['signedNetPayableAmount'] ?? record['SignedNetPayableAmount']),
      currencyCode: this.toText(record['currencyCode'] ?? record['CurrencyCode'])
    };
  }

  private toArray(value: unknown): unknown[] {
    if (Array.isArray(value)) {
      return value;
    }

    return [];
  }

  private toRecord(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' ? value as Record<string, unknown> : {};
  }

  private toText(value: unknown): string {
    return typeof value === 'string' ? value : '';
  }

  private toNumber(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }

    if (typeof value === 'string' && value.trim()) {
      const numericValue = Number(value);
      return Number.isFinite(numericValue) ? numericValue : null;
    }

    return null;
  }

  private toRequiredNumber(value: unknown): number {
    const numericValue = Number(value);
    return Number.isFinite(numericValue) ? numericValue : 0;
  }
}
