export type CounterpartyType = 'Cedent' | 'Reinsurer' | 'Client' | 'Partner';
export type CounterpartyStatus = 'Active' | 'Inactive' | 'Pending' | 'Suspended';
export type CounterpartyAttachmentControlName = 'commercialRegisterAttachment' | 'taxIdentificationNumberAttachment';

export interface AttachmentUploadRequest {
  fileName: string;
  contentType: string;
  base64Content: string;
}

export interface CounterpartyAttachment {
  title?: string;
  description?: string;
  originalFileName?: string | null;
  fileName?: string;
  fileExtension?: string;
  mimeType?: string;
  storageProvider?: string;
  filePath?: string | null;
  noteContent?: string;
  confidentialityLevel?: string;
  status?: CounterpartyStatus | string | null;
  isActive?: boolean;
  idDocument?: number;
  documentType?: string;
  documentCategory?: string;
}

interface CounterpartyBase {
  name: string;
  types: CounterpartyType[];
  email: string;
  phoneNumber: string;
  addressLine: string;
  city: string;
  country: string;
  isActive: boolean;
  activity: string;
  cedantLegalEntity: string;
  legacyClientId: number | null;
  legacyCompanyCode: string;
  observations: string;
  postalCode: string;
  status: CounterpartyStatus;
  website: string;
}

export interface CounterpartyUpsertRequest extends CounterpartyBase {
  commercialRegister: AttachmentUploadRequest | null;
  taxIdAttachment: AttachmentUploadRequest | null;
}

export interface CounterpartyStatusUpdatePayload {
  isActive: boolean;
  status: CounterpartyStatus;
}

export interface Counterparty extends CounterpartyBase {
  id?: number | string;
  createdAtUtc?: string;
  updatedAtUtc?: string;
  commercialRegisterAttachment?: CounterpartyAttachment | null;
  taxIdentificationNumberAttachment?: CounterpartyAttachment | null;
}

export interface CounterpartyListFilters {
  pageNumber: number;
  pageSize: number;
  search?: string;
  type?: string;
  status?: string;
  isActive?: boolean;
}

export interface CounterpartyListItem {
  id: number | string;
  legacyClientId: number | null;
  legacyCompanyCode: string | null;
  name: string;
  types: CounterpartyType[];
  email: string | null;
  status: string;
  isActive: boolean;
  country?: string | null;
  activity?: string | null;
}

export interface FinanceCounterpartyListItem {
  id: number;
  name: string;
  status: string;
  hasActiveBankAccount: boolean;
  activeBankAccountCount: number;
}

export interface CounterpartyListResponse {
  items: CounterpartyListItem[];
  pageNumber: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
}

export interface FinanceCounterpartyListResponse {
  items: FinanceCounterpartyListItem[];
  pageNumber: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
}
