export interface ContractTypeReference {
  id: number;
  code: string;
  name: string;
  description: string;
  categoryTags: string[];
  isImplemented: boolean;
}

export interface CurrencyReference {
  id: number;
  code: string;
  symbol: string;
  decimalPlaces: number;
  isDefault: boolean;
  name: string;
}

export interface CedentReference {
  id: number;
  name: string;
  country: string | null;
  city: string | null;
}

export interface CedentSearchResponse {
  items: CedentReference[];
  pageNumber: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
}

export interface UpsertFacultativeContractRequest {
  umr: string | null;
  name: string;
  counterpartyId: number;
  currencyId: number;
  receptionDate: string | null;
  inceptionDate: string;
  expiryDate: string;
  writtenSharePct: number | null;
  signedSharePct: number | null;
  fees: number | null;
  isHighPriority: boolean;
  sumInsured: number | null;
  deductible: number | null;
  premiumRate: number | null;
  grossPremium: number | null;
  cedentCommissionPct: number | null;
  cedentPremiumReference: string | null;
  isFronting: boolean;
  frontingReference: string | null;
  memoText: string | null;
}

export interface FacultativeContractResponse {
  contractId: number;
  status: string;
  netPremiumCedent: number | null;
  umr: string | null;
  name: string;
  counterpartyId: number;
  counterpartyName?: string | null;
  currencyId: number;
  currencyCode?: string | null;
  currencySymbol?: string | null;
  currencyDecimalPlaces?: number | null;
  receptionDate: string | null;
  inceptionDate: string;
  expiryDate: string;
  writtenSharePct: number | null;
  signedSharePct: number | null;
  fees: number | null;
  isHighPriority: boolean;
  sumInsured: number | null;
  deductible: number | null;
  premiumRate: number | null;
  grossPremium: number | null;
  cedentCommissionPct: number | null;
  cedentPremiumReference: string | null;
  isFronting: boolean;
  frontingReference: string | null;
  memoText: string | null;
}
