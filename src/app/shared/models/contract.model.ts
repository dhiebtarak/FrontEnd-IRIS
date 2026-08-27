export interface ContractTypeReference {
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

export type ContractSortField =
  | 'name'
  | 'umr'
  | 'cedentName'
  | 'contractType'
  | 'status'
  | 'inceptionDate'
  | 'expiryDate'
  | 'grossPremium'
  | 'createdAt'
  | 'updatedAt';

export type ContractSortDirection = 'asc' | 'desc';

export interface ContractListFilters {
  pageNumber: number;
  pageSize: number;
  search?: string;
  contractType?: string;
  status?: string;
  counterpartyId?: number;
  currencyId?: number;
  inceptionFrom?: string;
  inceptionTo?: string;
  expiryFrom?: string;
  expiryTo?: string;
  sortBy: ContractSortField;
  sortDirection: ContractSortDirection;
}

export interface ContractListItem {
  idContract: number;
  umr: string | null;
  name: string;
  cedentId: number;
  cedentName: string;
  contractType: string | null;
  typeOfBusiness: string | null;
  currencyId: number;
  currencyCode: string;
  status: string;
  inceptionDate: string;
  expiryDate: string;
  grossPremium: number | null;
  actionRequired: boolean;
  createdAt: string;
  updatedAt: string | null;
}

export interface PagedContractResponse {
  items: ContractListItem[];
  pageNumber: number;
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
}

export interface WorkflowDistributionItem {
  status: string;
  count: number;
  percentage: number;
}

export interface RecentContractItem {
  idContract: number;
  umr: string | null;
  name: string;
  cedentId: number;
  cedentName: string;
  contractType: string;
  status: string;
  currencyCode: string;
  inceptionDate: string;
  expiryDate: string;
  updatedAt: string | null;
}

export interface DashboardSummary {
  totalContracts: number;
  pendingReviewContracts: number;
  boundActiveContracts: number;
  actionRequiredContracts: number;
  workflowDistribution: WorkflowDistributionItem[];
  recentContracts: RecentContractItem[];
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
