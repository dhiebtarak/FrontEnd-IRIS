export interface ClaimContext {
  contractId: number;
  contractName: string;
  umr: string;
  underwritingYear: number;
  deductible: number | null;
  signedSharePercentage: number | null;
  currencyId: number;
  currencyCode: string;
  currencyDecimalPlaces: number;
  canCreate: boolean;
}
export type ClaimStatus = 'Outstanding' | 'PaidLoss' | 'Closed' | 'UnderDeductible';
export interface ClaimRequest {
  dateOfLoss: string | null;
  notificationDate: string | null;
  natureOfLoss: string | null;
  currencyId: number;
  reserve: number | null;
  paidLoss: number | null;
  expertFees: number | null;
  otherFees: number | null;
  status: ClaimStatus;
}
export interface ClaimRecord extends Omit<ClaimRequest, 'dateOfLoss'> {
  claimId: number;
  claimNumber: string;
  contractId: number;
  contractName: string;
  umr: string;
  dateOfLoss: string;
  underwritingYear: number | null;
  amount100Percent: number;
  deductible: number | null;
  signedSharePercentage: number | null;
  collectionAmount: number | null;
  currencyCode: string;
  currencyDecimalPlaces: number;
  isClosed: boolean;
  includeInSoa: boolean;
  canEdit: boolean;
  canIssue: boolean;
  canPair: boolean;
  isPaired: boolean;
  processingMode: string | null;
  collectionReference: string | null;
  collectionIssuedAt: string | null;
}
export interface ClaimReceipt {
  bankReceiptId: number;
  reference: string | null;
  operationDate: string;
  amount: number;
  currencyCode: string;
}
export interface ClaimPage {
  items: ClaimRecord[];
  totalCount: number;
  pageNumber: number;
  pageSize: number;
  totalPages: number;
}
