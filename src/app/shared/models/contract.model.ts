export interface ContractTypeReference {
  code: string;
  name: string;
  description: string;
  categoryTags: string[];
  isImplemented: boolean;
}

export type ContractStatus =
  | 'Draft'
  | 'ReadyForPlacement'
  | 'PlacementInProgress'
  | 'Bound'
  | 'Expired'
  | 'Cancelled';

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
  | 'receptionDate'
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
  receptionDate: string | null;
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

export type CoverageLevel =
  | 'MAIN'
  | 'MAIN_COVER'
  | 'SECTION'
  | 'EXTENSION';

export type CoverageRelationType =
  | 'HAS_SECTION'
  | 'HAS_EXTENSION';

export interface CoverageOption {
  id: number;
  code: string;
  name: string;
  description?: string | null;
  level: CoverageLevel;
  parentId: number | null;
  relationType: CoverageRelationType | null;
  isMandatory: boolean;
  hasSlip: boolean;
  slipTemplateId?: number | null;
}

export interface CoverageSelectionPayload {
  primaryMainCoverId: number;
  coverageIds: number[];
  mainCoverId: number;
  sectionIds: number[];
  extensionIds: number[];
}

export interface CoverageSelectionResponse {
  primaryMainCoverId: number | null;
  coverageIds: number[];
  mainCoverId: number | null;
  sectionIds: number[];
  extensionIds: number[];
  mainCover?: CoverageOption | null;
  sections?: CoverageOption[];
  extensions?: CoverageOption[];
}

export interface ContractPanelItem {
  idPanel: number;
  idContract: number;
  idCounterparty: number;
  reinsurerName: string;
  role: string | null;
  writtenSharePct: number | null;
  signedSharePct: number | null;
  tsi: number | null;
  limitOfLiability?: number | null;
  deductible: number | null;
  premiumRatePct: number | null;
  grossPremium: number | null;
  brokeragePct: number | null;
  otherDeductionsPercentage?: number | null;
  otherDeductions: number | null;
  otherDeductionsAmount?: number | null;
  netPremium: number | null;
  premiumReference: string | null;
  status: string;
}

export interface CreateContractPanelRequest {
  idCounterparty: number;
  writtenSharePct: number | null;
  signedSharePct: number | null;
  tsi: number | null;
  limitOfLiability?: number | null;
  deductible: number | null;
  premiumRatePct: number | null;
  grossPremium: number | null;
  brokeragePct: number | null;
  otherDeductionsPercentage?: number | null;
  otherDeductions?: number | null;
  premiumReference: string | null;
}

export interface UpdateContractPanelRequest extends CreateContractPanelRequest {
  netPremium: number | null;
  status: string | null;
}

export interface UpsertFacultativeContractRequest {
  name: string | null;
  counterpartyId: number | null;
  currencyId: number | null;
  coverageSelection: CoverageSelectionPayload | null;
  receptionDate: string | null;
  inceptionDate: string | null;
  expiryDate: string | null;
  writtenSharePct: number | null;
  signedSharePct: number | null;
  fees: number | null;
  isHighPriority: boolean | null;
  sumInsured: number | null;
  limitOfLiability: number | null;
  deductible: number | null;
  premiumRate: number | null;
  cedentCommissionPct: number | null;
  cedentPremiumReference: string | null;
  isFronting: boolean | null;
  frontingReference: string | null;
  memoText: string | null;
}

export interface FacultativeContractResponse {
  contractId: number;
  status: ContractStatus | string;
  hasAvoir?: boolean | null;
  contractDocumentType?: string | null;
  contractDocumentDownloadUrl?: string | null;
  allowedActions: string[];
  netPremiumCedent: number | null;
  umr: string | null;
  name: string | null;
  contractType?: string | null;
  counterpartyId: number | null;
  counterpartyName?: string | null;
  currencyId: number | null;
  currencyCode?: string | null;
  currencySymbol?: string | null;
  currencyDecimalPlaces?: number | null;
  coverageSelection?: CoverageSelectionResponse | null;
  receptionDate: string | null;
  inceptionDate: string | null;
  expiryDate: string | null;
  writtenSharePct: number | null;
  signedSharePct: number | null;
  fees: number | null;
  isHighPriority: boolean | null;
  sumInsured: number | null;
  limitOfLiability?: number | null;
  deductible: number | null;
  premiumRate: number | null;
  grossPremium: number | null;
  cedentCommissionPct: number | null;
  cedentCommission?: number | null;
  netPremium?: number | null;
  cedentPremiumReference: string | null;
  isFronting: boolean | null;
  frontingReference: string | null;
  memoText: string | null;
  createdBy?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  panels?: ContractPanelItem[];
}

export interface ContractSlipDownload {
  blob: Blob | null;
  filename: string | null;
  hasSlip: boolean;
}
