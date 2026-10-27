export interface PagedResponse<T> {
  items: T[];
  pageNumber: number;
  page?: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
}

export interface BankAccountRequest {
  counterpartyId: number;
  currencyId: number;
  bankName: string;
  bankCity: string;
  bankCountry: string;
  agencyCode: string | null;
  rib: string | null;
  iban: string | null;
  swiftBic: string | null;
  hasCorrespondentBank: boolean;
  correspondentBankName: string | null;
  correspondentSwiftBic: string | null;
  accountLabel: string | null;
  isDefault: boolean;
  isActive: boolean;
}

export interface BankAccountResponse extends BankAccountRequest {
  idBankAccount: number;
  idCounterparty: number;
  beneficiaryName: string;
  beneficiaryAddress: string | null;
  beneficiaryCity: string | null;
  beneficiaryCountry: string | null;
  currencyCode: string;
  maskedIban?: string | null;
}

export interface BankReceiptRequest {
  bankAccountId: number;
  receiptMonth: string;
  amountReceived: number;
  settlementMethod: string;
}

export interface FinancialReceiptQuery {
  search?: string | null;
  counterpartyId?: number | null;
  currencyId?: number | null;
  pairingStatus?: string | null;
  operationFrom?: string | null;
  operationTo?: string | null;
  pageNumber: number;
  pageSize: number;
  sortBy?: string | null;
  sortDirection?: 'asc' | 'desc' | null;
}

export interface RemittanceQuery {
  search?: string | null;
  reinsurer?: string | null;
  reinsurerId?: number | null;
  contract?: string | null;
  umr?: string | null;
  contractId?: number | null;
  status?: string | null;
  currency?: string | null;
  currencyId?: number | null;
  dateFrom?: string | null;
  dateTo?: string | null;
  pageNumber?: number;
  pageSize?: number;
  sortBy?: string | null;
  sortDirection?: string | null;
}

export interface BankReceiptResponse {
  idBankReceipt: number;
  bankAccountId: number;
  counterpartyId: number;
  counterpartyName: string;
  receptionDate: string;
  operationDate: string;
  amountReceived: number;
  currencyId: number;
  currencyCode: string;
  appliedExchangeRate: number | null;
  availableAmount: number;
  allocatedAmount: number;
  pairingStatus: string;
  hasEligibleAvoirRefund?: boolean;
  receiptReference?: string | null;
  settlementMethod: string;
  bankReference: string;
  settlementLabel: string;
  remittances?: RemittanceResponse[];
  generatedRemittances?: RemittanceResponse[];
  createdRemittances?: RemittanceResponse[];
}

export interface PairEncaissementRequest {
  contractId: number;
  allocatedAmount: number;
}

export interface PairEncaissementBatchRequest {
  allocations: PairEncaissementRequest[];
}

export interface PairInvoiceAllocationRequest {
  invoiceId: number;
  allocatedAmount: number;
}

export interface PairInvoiceAllocationBatchRequest {
  allocations: PairInvoiceAllocationRequest[];
}

export interface EligibleContract {
  contractId: number;
  idContract?: number | string;
  umr: string | null;
  contractName: string;
  cedentId: number;
  cedentName: string;
  counterpartyName?: string;
  status: string;
  currencyCode: string;
  eligibleReinsurerCount: number;
}

export interface EligibleContractsResult {
  items: EligibleContract[];
  status: number;
}

export interface EligibleInvoice {
  invoiceId: number;
  idInvoice?: number | string;
  invoiceNumber: string;
  documentNumber?: string | null;
  label: string | null;
  contractId: number | null;
  umr: string | null;
  contractName: string | null;
  cedentId: number | null;
  cedentName: string;
  counterpartyName?: string | null;
  invoiceType?: string | null;
  invoiceDate?: string | null;
  invoiceAmount?: number | null;
  amount?: number | null;
  signedAmount?: number | null;
  isAvoir?: boolean | null;
  settledAmount?: number | null;
  remainingAmount?: number | null;
  paymentStatus?: string | null;
  grossAmount: number;
  alreadyPairedAmount: number;
  outstandingAmount: number;
  currencyCode: string;
  currency?: string | null;
  recoveryStatus?: string | null;
}

export interface EligibleInvoicesResult {
  items: EligibleInvoice[];
  status: number;
}

export interface RemittanceResponse {
  remittanceRef: number;
  remittanceId?: number | null;
  remittanceReference?: string | null;
  receiptReference?: string | null;
  receiptAllocationId: number | null;
  disbursementId: number | null;
  invoiceId?: number | null;
  sourceDocumentId?: number | null;
  invoiceNumber?: string | null;
  invoiceLabel?: string | null;
  invoiceAvoirNumber?: string | null;
  label?: string | null;
  sourceType?: string | null;
  beneficiaryType?: 'Cedent' | 'Reinsurer' | string | null;
  beneficiaryCounterpartyId?: number | null;
  sourceInvoiceId?: number | null;
  sourceInvoiceNumber?: string | null;
  panelId: number | null;
  panelName?: string | null;
  contractId?: number | null;
  contractName?: string | null;
  umr?: string | null;
  cedentName?: string | null;
  counterpartyId: number;
  beneficiaryId?: number | null;
  counterpartyName: string;
  reinsurerId?: number | null;
  reinsurerName?: string | null;
  signedSharePct?: number | null;
  allocatedAmount?: number | null;
  deductions?: number | null;
  grossPremium?: number | null;
  otherDeductions?: number | null;
  netPremiumDue: number | null;
  netPayableAmount: number | null;
  signedNetPayableAmount?: number | null;
  currencyId: number;
  currencyCode: string;
  status: string;
  description: string;
  confirmedAt?: string | null;
  confirmedBy?: string | null;
  transferCompletedAt?: string | null;
  hasActiveBankAccount?: boolean | null;
  createdAt?: string | null;
  closingIssuedDate?: string | null;
  closingId?: number | null;
  closingReference?: string | null;
  closingEligible?: boolean | null;
  remainingPayableAmount?: number | null;
  invoiceDownloadUrl?: string | null;
  documentDownloadUrl?: string | null;
  documentId?: number | null;
}

export interface RemittanceBatchConfirmationResponse {
  items: Array<{ remittanceId: number; status: string; confirmationDate?: string | null; financeNotificationCreated?: boolean }>;
  signedPremiumTotal?: number | null;
  signedAvoirTotal?: number | null;
  netBalance?: number | null;
  settlementMode?: string | null;
  amountToDisburse?: number | null;
  remainingAvoirCredit?: number | null;
}

export interface EligibleAvoirRefundReceipt {
  bankReceiptId: number;
  receiptReference: string;
  receiptAmount: number;
  allocatedAmount: number;
  remainingAmount: number;
  pairingStatus: string;
  currencyCode: string;
  contractId: number;
  contractName: string;
  cedentId: number;
  cedentName: string;
  avoirInvoiceId: number;
  avoirNumber: string;
  availableAvoirAmount: number;
  refundAmount: number;
  isEligibleForRefund: boolean;
  eligibilityFailureReason: string | null;
}

export interface AvoirRefundRequest {
  avoirInvoiceId: number;
  amount: number;
  idempotencyKey: string;
}

export interface AvoirRefundResponse {
  pairingMode: 'CEDENT_REFUND' | string;
  receiptId: number;
  receiptReference: string;
  pairingStatus: string;
  signedPairingTotal: number;
  avoirInvoiceId: number;
  avoirNumber: string;
  avoirOriginalAmount: number;
  avoirAppliedAmount: number;
  avoirRemainingAmount: number;
  beneficiaryId: number;
  beneficiaryName: string;
  beneficiaryType: string;
  remittanceId: number;
  remittanceReference: string;
  remittanceStatus: string;
  currencyCode: string;
}

export interface DisbursementQueueItem extends RemittanceResponse {
  remittanceId: number;
  remittanceReference: string;
  disbursementId: number | null;
  invoiceId: number | null;
  invoiceDownloadUrl: string | null;
  status: string;
}

export interface InvoiceRequest {
  contractId: number;
  receiptAllocationId?: number | null;
  counterpartyId?: number | null;
  panelId: number | null;
  remittanceRef?: number | null;
  invoiceType: string;
  invoiceDate: string;
  amount?: number | null;
  netPremium?: number | null;
  label: string | null;
  settlementMethod: string | null;
}

export interface InvoiceQuery {
  search?: string | null;
  contractId?: number | null;
  counterpartyId?: number | null;
  cedentId?: number | null;
  panelId?: number | null;
  invoiceType?: string | null;
  status?: string | null;
  paymentStatus?: string | null;
  recoveryStatus?: string | null;
  pairingStatus?: string | null;
  currencyId?: number | string | null;
  currencyCode?: string | null;
  currency?: string | null;
  from?: string | null;
  to?: string | null;
  dateFrom?: string | null;
  dateTo?: string | null;
  pageNumber?: number;
  pageSize?: number;
  sortBy?: string | null;
  sortDirection?: string | null;
}

export interface InvoiceResponse {
  idInvoice: number;
  invoiceId?: number;
  contractId: number;
  counterpartyId: number | null;
  panelId: number | null;
  remittanceRef: number | null;
  receiptAllocationId?: number | null;
  currencyId?: number | null;
  currencyCode?: string | null;
  currency?: string | null;
  invoiceNumber: string;
  documentNumber?: string | null;
  invoiceType: string;
  invoiceDate: string;
  invoiceAmount?: number | null;
  signedAmount?: number | null;
  isAvoir?: boolean | null;
  settledAmount?: number | null;
  remainingAmount?: number | null;
  paymentStatus?: string | null;
  grossAmount?: number | null;
  actualAmount?: number | null;
  amount?: number | null;
  netPremium: number | null;
  netAmount?: number | null;
  affectedAmount?: number | null;
  unaffectedAmount?: number | null;
  alreadyPairedAmount?: number | null;
  pairedAmount?: number | null;
  outstandingAmount?: number | null;
  contractName?: string | null;
  umr?: string | null;
  cedentName?: string | null;
  counterpartyName?: string | null;
  reinsurerName?: string | null;
  recoveryStatus?: string | null;
  status: string;
  label: string;
}

export interface InvoiceReceiptAllocation {
  receiptAllocationId: number;
  receiptReference: string;
  allocatedAmount: number;
  alreadyInvoicedAmount: number;
  availableAmount: number;
  currencyCode: string;
  currency?: string | null;
}

export interface InvoicePanelOption {
  panelId: number;
  counterpartyId: number;
  reinsurerName: string;
  signedSharePct: number | null;
  status: string;
}

export interface InvoiceContext {
  contractId: number;
  currency: string;
  currencyCode?: string;
  status?: string;
  contractGrossPremium: number;
  cedentCommissionPct: number | null;
  cedentCommissionPercentage?: number | null;
  cedentCommissionAmount?: number | null;
  contractSignedSharePercentage?: number | null;
  invoiceableNetPremium?: number | null;
  currencyDecimalPlaces?: number | null;
  pairedAmount: number;
  alreadyInvoicedAmount: number;
  remainingInvoiceableAmount: number;
  availableCreditBalance?: number | null;
  availableAvoirAmount?: number | null;
  netInvoicedBalance?: number | null;
  invoiceableGrossPremium?: number;
  canCreateInvoice?: boolean;
  blockingReason?: string | null;
  previousInvoices?: PremiumDebitNoteResponse[];
  receiptAllocations: InvoiceReceiptAllocation[];
  reinsurerPanels: InvoicePanelOption[];
}

export interface PremiumDebitNoteRequest {
  invoiceType: 'INVOICE' | 'INVOICE_FEES' | 'AVOIR';
  processingMode?: 'PAIR_WITH_ENCAISSEMENT' | 'DIRECT_TO_REMITTANCES';
  grossAmount: number;
  invoiceDate: string;
  label: string | null;
  idempotencyKey?: string | null;
  allocations?: PremiumDebitNoteAllocation[];
}

export interface PremiumDebitNoteAllocation {
  panelId: number;
  reinsurerCode: string | null;
  reinsurerName: string;
  signedSharePct: number | null;
  allocationRatio: number;
  allocationRatioPercentage?: number | null;
  grossPremium: number;
  allocatedGrossPremium?: number | null;
  allocatedNetPremium?: number | null;
  allocationAmount?: number | null;
  cedentCommissionPct: number | null;
  cedentCommissionPercentage?: number | null;
  cedentCommissionAmount: number;
  brokeragePct: number;
  irisBrokerageRate?: number | null;
  irisBrokeragePercentage?: number | null;
  brokerageAmount: number;
  irisBrokerageAmount?: number | null;
  otherDeductions: number;
  otherDeductionsAmount?: number | null;
  otherDeductionsPercentage?: number | null;
  netAmount: number;
  netPayableAmount?: number | null;
  signedNetPayableAmount?: number | null;
  currencyCode: string;
}

export interface PremiumDebitNotePreview {
  contractId: number;
  invoiceableGrossPremium: number;
  alreadyInvoicedAmount: number;
  grossAmount: number;
  remainingAmount: number;
  isReconciled?: boolean | null;
  reconciliationDifference?: number | null;
  currencyCode?: string | null;
  allocations: PremiumDebitNoteAllocation[];
}

export interface PremiumDebitNoteResponse extends PremiumDebitNotePreview {
  invoiceId: number;
  invoiceNumber: string;
  documentNumber?: string | null;
  sequence: number | null;
  invoiceType: string;
  processingMode?: 'PAIR_WITH_ENCAISSEMENT' | 'DIRECT_TO_REMITTANCES' | null;
  pairingRequired?: boolean;
  createdRemittances?: RemittanceResponse[];
  invoiceDate: string;
  totalNetAmount: number;
  currency?: string | null;
  amount?: number | null;
  signedAmount?: number | null;
  isAvoir?: boolean | null;
  currencyCode: string;
  status: string;
  paymentStatus?: string | null;
  recoveryStatus?: string | null;
  label: string;
}

export interface NotificationItem {
  closingId?: number | null;
  idNotification: number;
  notificationType: string;
  title: string;
  message: string;
  entityType: string;
  entityId: number | null;
  contractId?: number | null;
  umr?: string | null;
  contractUmr?: string | null;
  contractName?: string | null;
  name?: string | null;
  isRead: boolean;
  createdAt: string;
}

export interface DisbursementRequest {
  remittanceRef: number;
  bankAccountId: number;
  operationDate: string;
  paymentMethod: string;
  bankReference?: string | null;
  description: string | null;
}

export interface DisbursementResponse {
  idDisbursement: number;
  remittanceRef: number;
  counterpartyId: number;
  counterpartyName: string;
  totalAmount: number;
  currencyId: number;
  currencyCode: string;
  operationDate: string;
  signatureStatus: string;
  documentId?: number | null;
  documentDownloadUrl?: string | null;
}

export interface BankAccountSnapshot {
  idBankAccount: number;
  bankName: string | null;
  bankCity: string | null;
  bankCountry: string | null;
  iban: string | null;
  swiftBic: string | null;
  correspondentBankName: string | null;
  correspondentSwiftBic: string | null;
  isDefault: boolean;
}

export interface DisbursementContext {
  closingId?: number | null;
  remittanceId: number;
  remittanceReference?: string | null;
  sourceType?: string | null;
  beneficiaryType?: string | null;
  beneficiaryId?: number | null;
  beneficiaryName?: string | null;
  avoirId?: number | null;
  avoirNumber?: string | null;
  creditNoteNumber?: string | null;
  creditNoteDownloadUrl?: string | null;
  encaissementId?: number | null;
  encaissementReference?: string | null;
  grossAmount?: number | null;
  currency?: string | null;
  contractId?: number | null;
  contractName?: string | null;
  umr?: string | null;
  cedentName?: string | null;
  panelId?: number | null;
  reinsurerId: number;
  reinsurerName: string;
  grossPremium?: number | null;
  deductions?: number | null;
  netPayableAmount: number;
  currencyCode: string;
  status: string;
  disbursementId?: number | null;
  invoiceId?: number | null;
  invoiceDownloadUrl?: string | null;
  invoiceNumber?: string | null;
  canDownloadInvoice: boolean;
  canStartPayment: boolean;
  canConfirmTransfer: boolean;
  defaultBankAccount?: BankAccountSnapshot | null;
  validationMessage?: string | null;
  closedAt?: string | null;
}

export interface ClosingDisbursementContext {
  closingId: number;
  closingReference: string;
  closingDate: string;
  status: string;
  reinsurerId: number;
  reinsurerName: string;
  reinsurerAddress: string | null;
  reinsurerCity: string | null;
  reinsurerCountry: string | null;
  currencyId: number;
  currencyCode: string;
  totalClosingAmount: number;
  storedTotal?: number;
  calculatedTotal: number;
  difference: number;
  isConsistent: boolean;
  lines: RemittanceResponse[];
  bankAccounts: BankAccountResponse[];
  selectedBankAccount: BankAccountSnapshot | null;
  canDownloadPdf: boolean;
  pdfDownloadUrl: string | null;
  disbursementId: number | null;
  canStartPayment: boolean;
  canConfirmTransfer: boolean;
  validationMessage: string | null;
}

export interface FinanceClosingQueueItem {
  closingId: number;
  closingReference: string;
  reinsurerName: string;
  lineCount: number;
  premiumTotal: number;
  avoirTotal: number;
  netPayableAmount: number;
  currencyCode: string;
  issueDate: string;
  status: string;
}

export interface DisbursementCommandResponse {
  remittanceId?: number | null;
  remittance?: RemittanceResponse | null;
  disbursement?: DisbursementResponse | null;
  invoiceDownloadUrl?: string | null;
  documentDownloadUrl?: string | null;
  downloadUrl?: string | null;
  status?: string | null;
  disbursementId?: number | null;
  invoiceId?: number | null;
  documentId?: number | null;
  transferCompletedAt?: string | null;
  closedAt?: string | null;
}

export interface StartDisbursementResponse {
  remittanceId: number;
  disbursementId: number;
  invoiceId: number;
  status: 'PaymentInProgress';
  invoiceDownloadUrl: string;
}

export interface BackendFileDownload {
  blob: Blob;
  fileName: string | null;
  contentType: string | null;
}

export interface FinancialNoteDownload extends BackendFileDownload {
  documentType: 'DEBIT_NOTE' | 'CREDIT_NOTE' | null;
  documentReference: string | null;
}

export interface FinancialHistory {
  receipts: BankReceiptResponse[];
  remittances: RemittanceResponse[];
  invoices: InvoiceResponse[];
  disbursements: DisbursementResponse[];
}

export interface CedentClosingRequest {
  counterpartyId: number;
  currencyId: number;
  closingInformation: string | null;
  operationDate: string | null;
}

export interface CedentClosingResponse {
  premiumRef: number;
  contractId: number;
  counterpartyId: number;
  currencyId: number;
  status: string;
  closingInformation: string;
  operationDate: string | null;
}

export interface OutgoingClosingRequest {
  remittanceIds: number[];
}
