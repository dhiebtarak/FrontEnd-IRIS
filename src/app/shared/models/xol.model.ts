import { CoverageSelectionPayload } from './contract.model';
export type XolDecimal = number | string;
export interface XolInstallment {
  sequence: number;
  expectedSettlementDate: string | null;
  amount: XolDecimal | null;
  settlementDate: string | null;
}
export interface XolReinstatement {
  sequence: number;
  condition: string;
}
export interface XolLayer {
  id: number;
  version: number;
  cover: XolDecimal | null;
  retention: XolDecimal | null;
  annualTreatyCapacity: XolDecimal | null;
  epi: XolDecimal | null;
  mdp: XolDecimal | null;
  adjustablePremiumRatePct: XolDecimal | null;
  loading: string | null;
  cashLoss: XolDecimal | null;
  numberOfInstallments: number;
  numberOfReinstatements: number;
  installments: XolInstallment[];
  reinstatements: XolReinstatement[];
}
export interface XolContractRequest {
  saveDraft: boolean;
  version: number;
  name: string | null;
  counterpartyId: number | null;
  currencyId: number | null;
  inceptionDate: string | null;
  expiryDate: string | null;
  receptionDate: string | null;
  xolType: string | null;
  lossBasis: string | null;
  treatyYear: number | null;
  territoriesExcluded: string | null;
  eventDefinition: string | null;
  eventWindow: string | null;
  hours: number | null;
  writtenSharePct: XolDecimal | null;
  signedSharePct: XolDecimal | null;
  participationShareBasis: 'Written' | 'Signed' | null;
  memo: string | null;
  coverageSelection: CoverageSelectionPayload | null;
  layers: XolLayer[];
}
export interface XolLayerResponse {
  id: number;
  version: number;
  number: number;
  details: XolLayer;
  capacity: XolDecimal | null;
  rolPct: XolDecimal | null;
  ourSharePct: XolDecimal | null;
  ourShareAmount: XolDecimal | null;
  dueToUsCover: XolDecimal | null;
  dueToUsRetention: XolDecimal | null;
  dueToUsEpi: XolDecimal | null;
  dueToUsMdp: XolDecimal | null;
  dueToUsCashLoss: XolDecimal | null;
  installments: { details: XolInstallment; status: string; dueToUsAmount: XolDecimal | null }[];
}
export interface XolContractResponse {
  contractId: number;
  umr: string | null;
  status: string;
  cedentName: string | null;
  currencyCode: string | null;
  currencyDecimalPlaces: number;
  canEdit: boolean;
  details: XolContractRequest;
  coverages: { id: number; code: string; name: string; level: string }[];
  layers: XolLayerResponse[];
  panels: {
    id: number;
    name: string;
    status: string | null;
    writtenSharePct: XolDecimal | null;
    signedSharePct: XolDecimal | null;
  }[];
}
export function emptyXolLayer(): XolLayer {
  return {
    id: 0,
    version: 0,
    cover: null,
    retention: null,
    annualTreatyCapacity: null,
    epi: null,
    mdp: null,
    adjustablePremiumRatePct: null,
    loading: null,
    cashLoss: null,
    numberOfInstallments: 0,
    numberOfReinstatements: 0,
    installments: [],
    reinstatements: [],
  };
}

export const XOL_REINSTATEMENT_CONDITIONS = [
  { code: 'ProRataCapacityAndPeriod', name: 'Pro rata on capacity and period' },
  { code: 'ProRataCapacity', name: 'Pro rata on capacity' },
  { code: 'Free', name: 'Free' },
] as const;
