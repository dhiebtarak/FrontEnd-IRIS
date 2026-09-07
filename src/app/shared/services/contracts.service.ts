import { HttpClient, HttpParams, HttpResponse } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';
import {
  CedentReference,
  CedentSearchResponse,
  ContractPanelItem,
  ContractSlipDownload,
  ContractListFilters,
  ContractTypeReference,
  CoverageLevel,
  CoverageOption,
  CoverageRelationType,
  CoverageSelectionResponse,
  CreateContractPanelRequest,
  CurrencyReference,
  DashboardSummary,
  FacultativeContractResponse,
  PagedContractResponse,
  UpdateContractPanelRequest,
  UpsertFacultativeContractRequest
} from '../models/contract.model';

@Injectable({
  providedIn: 'root'
})
export class ContractsService {
  private readonly baseUrl = 'http://localhost:5151/api';

  constructor(private readonly httpClient: HttpClient) {}

  getDashboardSummary(): Observable<DashboardSummary> {
    return this.httpClient.get<DashboardSummary>(`${this.baseUrl}/contracts/dashboard-summary`);
  }

  getContracts(filters: ContractListFilters): Observable<PagedContractResponse> {
    let params = new HttpParams()
      .set('PageNumber', String(filters.pageNumber))
      .set('PageSize', String(filters.pageSize))
      .set('SortBy', filters.sortBy)
      .set('SortDirection', filters.sortDirection);

    params = this.setTextParam(params, 'Search', filters.search);
    params = this.setTextParam(params, 'ContractType', filters.contractType);
    params = this.setTextParam(params, 'Status', filters.status);
    params = this.setPositiveNumberParam(params, 'CounterpartyId', filters.counterpartyId);
    params = this.setPositiveNumberParam(params, 'CurrencyId', filters.currencyId);
    params = this.setTextParam(params, 'InceptionFrom', filters.inceptionFrom);
    params = this.setTextParam(params, 'InceptionTo', filters.inceptionTo);
    params = this.setTextParam(params, 'ExpiryFrom', filters.expiryFrom);
    params = this.setTextParam(params, 'ExpiryTo', filters.expiryTo);

    return this.httpClient.get<PagedContractResponse>(`${this.baseUrl}/contracts`, { params });
  }

  getContractTypes(): Observable<ContractTypeReference[]> {
    return this.httpClient.get<unknown>(`${this.baseUrl}/reference-data/contract-types`).pipe(
      map(payload => this.uniqueBy(
        this.toArray(payload).map(item => this.mapContractType(item)),
        type => type.code
      ))
    );
  }

  getCurrencies(): Observable<CurrencyReference[]> {
    return this.httpClient.get<unknown>(`${this.baseUrl}/reference-data/currencies`).pipe(
      map(payload => this.uniqueBy(
        this.toArray(payload).map(item => this.mapCurrency(item)),
        currency => currency.id
      ))
    );
  }

  searchCedents(search: string | null, page: number, pageSize: number): Observable<CedentSearchResponse> {
    let params = new HttpParams()
      .set('page', String(page))
      .set('pageSize', String(pageSize));

    if (typeof search === 'string' && search.trim().length > 0) {
      params = params.set('search', search.trim());
    }

    return this.httpClient.get<unknown>(`${this.baseUrl}/reference-data/cedents`, { params }).pipe(
      map(payload => this.mapCedentResponse(payload, page, pageSize))
    );
  }

  getMainCovers(): Observable<CoverageOption[]> {
    return this.httpClient.get<unknown>(`${this.baseUrl}/coverage-catalog/main-covers`).pipe(
      map(payload => this.uniqueBy(
        this.toArray(payload).map(item => this.mapCoverageOption(item, 'MAIN_COVER', null)),
        option => option.id
      ))
    );
  }

  getCoverageChildren(parentId: number, level: Extract<CoverageLevel, 'SECTION' | 'EXTENSION'>): Observable<CoverageOption[]> {
    const params = new HttpParams().set('level', level);

    return this.httpClient.get<unknown>(`${this.baseUrl}/coverage-catalog/${parentId}/children`, { params }).pipe(
      map(payload => this.uniqueBy(
        this.toArray(payload).map(item => this.mapCoverageOption(item, level, parentId)),
        option => option.id
      ))
    );
  }

  createFacultativeContract(request: UpsertFacultativeContractRequest): Observable<FacultativeContractResponse> {
    return this.httpClient.post<unknown>(`${this.baseUrl}/contracts/facultative`, request).pipe(
      map(payload => this.mapFacultativeContract(payload))
    );
  }

  getFacultativeContract(contractId: number): Observable<FacultativeContractResponse> {
    return this.httpClient.get<unknown>(`${this.baseUrl}/contracts/facultative/${contractId}`).pipe(
      map(payload => this.mapFacultativeContract(payload))
    );
  }

  getContractOverview(contractId: number): Observable<FacultativeContractResponse> {
    return this.httpClient.get<unknown>(`${this.baseUrl}/contracts/${contractId}/overview`).pipe(
      map(payload => this.mapFacultativeContract(payload))
    );
  }

  updateFacultativeContract(contractId: number, request: UpsertFacultativeContractRequest): Observable<FacultativeContractResponse> {
    return this.httpClient.put<unknown>(`${this.baseUrl}/contracts/facultative/${contractId}`, request).pipe(
      map(payload => this.mapFacultativeContract(payload))
    );
  }

  downloadContractSlips(contractId: number): Observable<ContractSlipDownload> {
    return this.httpClient.get(`${this.baseUrl}/contracts/${contractId}/slips`, {
      observe: 'response',
      responseType: 'blob'
    }).pipe(
      map(response => this.mapSlipDownload(response))
    );
  }

  createContractPanel(contractId: number, request: CreateContractPanelRequest): Observable<ContractPanelItem> {
    return this.httpClient.post<unknown>(`${this.baseUrl}/contracts/${contractId}/panels`, request).pipe(
      map(payload => this.mapContractPanel(payload))
    );
  }

  updateContractPanel(contractId: number, panelId: number, request: UpdateContractPanelRequest): Observable<ContractPanelItem> {
    return this.httpClient.put<unknown>(`${this.baseUrl}/contracts/${contractId}/panels/${panelId}`, request).pipe(
      map(payload => this.mapContractPanel(payload))
    );
  }

  getContractPanels(contractId: number): Observable<ContractPanelItem[]> {
    return this.httpClient.get<unknown>(`${this.baseUrl}/contracts/${contractId}/panels`).pipe(
      map(payload => this.uniqueBy(
        this.toArray(payload).map(item => this.mapContractPanel(item)),
        panel => panel.idPanel > 0 ? panel.idPanel : panel.idCounterparty
      ))
    );
  }

  startBindingPhase(contractId: number): Observable<unknown> {
    return this.httpClient.post(`${this.baseUrl}/contracts/${contractId}/start-binding`, {});
  }

  confirmContractPanel(contractId: number, panelId: number): Observable<ContractPanelItem> {
    return this.httpClient.post<unknown>(`${this.baseUrl}/contracts/${contractId}/panels/${panelId}/confirm`, {}).pipe(
      map(payload => this.mapContractPanel(payload))
    );
  }

  private setTextParam(params: HttpParams, name: string, value: string | undefined): HttpParams {
    const normalizedValue = value?.trim();
    return normalizedValue ? params.set(name, normalizedValue) : params;
  }

  private setPositiveNumberParam(params: HttpParams, name: string, value: number | undefined): HttpParams {
    return value != null && value > 0 ? params.set(name, String(value)) : params;
  }

  private toArray(payload: unknown): unknown[] {
    if (Array.isArray(payload)) {
      return payload;
    }

    if (payload && typeof payload === 'object') {
      const record = payload as Record<string, unknown>;
      const items = record['items'];

      if (Array.isArray(items)) {
        return items;
      }
    }

    return [];
  }

  private mapContractType(value: unknown): ContractTypeReference {
    const record = this.toRecord(value);
    const categoryTags = record['categoryTags'];
    const rawTags = Array.isArray(categoryTags)
      ? categoryTags.filter((tag): tag is string => typeof tag === 'string' && tag.trim().length > 0)
      : typeof record['category'] === 'string'
        ? [record['category']]
        : typeof record['categories'] === 'string'
          ? record['categories'].split(',').map(tag => tag.trim()).filter(Boolean)
          : [];

    return {
      code: this.toText(record['code']).trim(),
      name: this.toText(record['displayName'] ?? record['name']),
      description: this.toText(record['description']),
      categoryTags: rawTags,
      isImplemented: this.toBoolean(record['isImplemented'])
    };
  }

  private mapCurrency(value: unknown): CurrencyReference {
    const record = this.toRecord(value);

    return {
      id: this.toNumber(record['id'] ?? record['currencyId'] ?? record['idCurrency']) ?? 0,
      code: this.toText(record['code'] ?? record['currencyCode']),
      symbol: this.toText(record['symbol'] ?? record['currencySymbol']),
      decimalPlaces: this.toNumber(record['decimalPlaces'] ?? record['minorUnit'] ?? record['decimalDigits']) ?? 2,
      isDefault: this.toBoolean(record['isDefault']),
      name: this.toText(record['name'] ?? record['currencyName'] ?? record['code'] ?? record['currencyCode'])
    };
  }

  private mapCedentResponse(payload: unknown, page: number, pageSize: number): CedentSearchResponse {
    const record = this.toRecord(payload);
    const items = this.uniqueBy(
      this.toArray(payload).map(item => this.mapCedent(item)),
      cedent => cedent.id
    );

    return {
      items,
      pageNumber: this.toNumber(record['pageNumber']) ?? page,
      pageSize: this.toNumber(record['pageSize']) ?? pageSize,
      totalCount: this.toNumber(record['totalCount']) ?? items.length,
      totalPages: this.toNumber(record['totalPages']) ?? (items.length > 0 ? 1 : 0)
    };
  }

  private mapCedent(value: unknown): CedentReference {
    const record = this.toRecord(value);

    return {
      id: this.toNumber(record['id'] ?? record['counterpartyId']) ?? 0,
      name: this.toText(record['name'] ?? record['displayName'] ?? record['counterpartyName']),
      country: this.toNullableText(record['country']),
      city: this.toNullableText(record['city'])
    };
  }

  private mapFacultativeContract(value: unknown): FacultativeContractResponse {
    const record = this.toRecord(value);
    const cedent = this.toRecord(record['cedent']);
    const currency = this.toRecord(record['currency']);

    return {
      contractId: this.toNumber(record['contractId'] ?? record['idContract'] ?? record['id']) ?? 0,
      status: this.toText(record['status']) || 'DRAFT',
      netPremiumCedent: this.toNullableNumber(record['netPremiumCedent']),
      umr: this.toNullableText(record['umr']),
      name: this.toText(record['name']),
      contractType: this.toNullableText(record['contractType']),
      counterpartyId: this.toNumber(record['counterpartyId']) ?? 0,
      counterpartyName: this.toNullableText(record['counterpartyName'] ?? record['cedentName'] ?? cedent['name']),
      currencyId: this.toNumber(record['currencyId']) ?? 0,
      currencyCode: this.toNullableText(record['currencyCode'] ?? currency['code']),
      currencySymbol: this.toNullableText(record['currencySymbol'] ?? currency['symbol']),
      currencyDecimalPlaces: this.toNullableNumber(record['currencyDecimalPlaces'] ?? currency['decimalPlaces']),
      coverageSelection: this.mapCoverageSelection(record['coverageSelection']),
      receptionDate: this.toNullableText(record['receptionDate']),
      inceptionDate: this.toText(record['inceptionDate']),
      expiryDate: this.toText(record['expiryDate']),
      writtenSharePct: this.toNullableNumber(record['writtenSharePct']),
      signedSharePct: this.toNullableNumber(record['signedSharePct']),
      fees: this.toNullableNumber(record['fees']),
      isHighPriority: this.toBoolean(record['isHighPriority']),
      sumInsured: this.toNullableNumber(record['sumInsured']),
      deductible: this.toNullableNumber(record['deductible']),
      premiumRate: this.toNullableNumber(record['premiumRate']),
      grossPremium: this.toNullableNumber(record['grossPremium']),
      cedentCommissionPct: this.toNullableNumber(record['cedentCommissionPct']),
      cedentPremiumReference: this.toNullableText(record['cedentPremiumReference']),
      isFronting: this.toBoolean(record['isFronting']),
      frontingReference: this.toNullableText(record['frontingReference']),
      memoText: this.toNullableText(record['memoText']),
      createdBy: this.toNullableText(record['createdBy'] ?? record['createdByName']),
      createdAt: this.toNullableText(record['createdAt'] ?? record['creationDate']),
      updatedAt: this.toNullableText(record['updatedAt']),
      panels: this.toArray(record['panels'] ?? record['placementPanels'] ?? record['reinsurerPanels'])
        .map(item => this.mapContractPanel(item))
    };
  }

  private mapSlipDownload(response: HttpResponse<Blob>): ContractSlipDownload {
    const blob = response.body;
    const hasSlip = response.status !== 204 && !!blob && blob.size > 0;

    return {
      blob: hasSlip ? blob : null,
      filename: hasSlip ? this.getFilenameFromContentDisposition(response.headers.get('Content-Disposition')) : null,
      hasSlip
    };
  }

  private mapCoverageSelection(value: unknown): CoverageSelectionResponse | null {
    if (!value || typeof value !== 'object') {
      return null;
    }

    const record = value as Record<string, unknown>;

    return {
      mainCoverId: this.toNumber(record['mainCoverId']) ?? null,
      sectionIds: this.toNumberArray(record['sectionIds']),
      extensionIds: this.toNumberArray(record['extensionIds']),
      mainCover: record['mainCover'] ? this.mapCoverageOption(record['mainCover'], 'MAIN_COVER', null) : null,
      sections: this.toArray(record['sections']).map(item => this.mapCoverageOption(item, 'SECTION', null)),
      extensions: this.toArray(record['extensions']).map(item => this.mapCoverageOption(item, 'EXTENSION', null))
    };
  }

  private mapCoverageOption(value: unknown, fallbackLevel: CoverageLevel, fallbackParentId: number | null): CoverageOption {
    const record = this.toRecord(value);
    const level = this.toCoverageLevel(record['level'] ?? record['coverageLevel']) ?? fallbackLevel;

    return {
      id: this.toNumber(record['id'] ?? record['coverageItemId'] ?? record['idCoverageItem']) ?? 0,
      code: this.toText(record['code'] ?? record['coverageCode']).trim(),
      name: this.toText(record['name'] ?? record['coverageName']).trim(),
      level,
      parentId: this.toNumber(record['parentId'] ?? record['parentCoverageItemId'] ?? record['idParentCoverageItem']) ?? fallbackParentId,
      relationType: this.toCoverageRelationType(record['relationType']),
      isMandatory: this.toBoolean(record['isMandatory']),
      hasSlip: this.toBoolean(record['hasSlip']),
      slipTemplateId: this.toNullableNumber(record['slipTemplateId'] ?? record['idSlipTemplate'])
    };
  }

  private mapContractPanel(value: unknown): ContractPanelItem {
    const record = this.toRecord(value);
    const reinsurer = this.toRecord(record['reinsurer'] ?? record['reinsuranceCompany'] ?? record['counterparty']);

    return {
      idPanel: this.toNumber(record['idPanel'] ?? record['panelId'] ?? record['id']) ?? 0,
      idContract: this.toNumber(record['idContract'] ?? record['contractId']) ?? 0,
      idCounterparty: this.toNumber(record['idCounterparty'] ?? record['reinsurerId'] ?? record['counterpartyId'] ?? reinsurer['id']) ?? 0,
      reinsurerName: this.toText(
        record['reinsurerName']
        ?? record['reinsuranceCompanyName']
        ?? record['counterpartyName']
        ?? reinsurer['name']
      ),
      role: this.toNullableText(record['role']),
      writtenSharePct: this.toNullableNumber(record['writtenSharePct']),
      signedSharePct: this.toNullableNumber(record['signedSharePct']),
      tsi: this.toNullableNumber(record['tsi'] ?? record['sumInsured'] ?? record['totalSumInsured']),
      deductible: this.toNullableNumber(record['deductible']),
      premiumRatePct: this.toNullableNumber(record['premiumRatePct'] ?? record['premiumRate']),
      grossPremium: this.toNullableNumber(record['grossPremium']),
      brokeragePct: this.toNullableNumber(record['brokeragePct'] ?? record['brokerageIrisPct'] ?? record['brokerageIRISPct']),
      otherDeductions: this.toNullableNumber(record['otherDeductions']),
      netPremium: this.toNullableNumber(record['netPremium'] ?? record['netPremiumReinsurer']),
      premiumReference: this.toNullableText(record['premiumReference'] ?? record['reinsurancePremiumReference']),
      status: this.toText(record['status']) || 'Draft'
    };
  }

  private toNumberArray(value: unknown): number[] {
    if (!Array.isArray(value)) {
      return [];
    }

    return value
      .map(item => this.toNumber(item))
      .filter((item): item is number => item != null && item > 0);
  }

  private toCoverageLevel(value: unknown): CoverageLevel | null {
    return value === 'MAIN_COVER' || value === 'SECTION' || value === 'EXTENSION' ? value : null;
  }

  private toCoverageRelationType(value: unknown): CoverageRelationType | null {
    return value === 'HAS_SECTION' || value === 'HAS_EXTENSION' ? value : null;
  }

  private getFilenameFromContentDisposition(contentDisposition: string | null): string | null {
    if (!contentDisposition) {
      return null;
    }

    const utf8Match = /filename\*=UTF-8''([^;]+)/i.exec(contentDisposition);

    if (utf8Match?.[1]) {
      return decodeURIComponent(utf8Match[1].replace(/"/g, ''));
    }

    const filenameMatch = /filename="?([^";]+)"?/i.exec(contentDisposition);
    return filenameMatch?.[1] ?? null;
  }

  private toRecord(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  }

  private uniqueBy<T>(items: T[], selectKey: (item: T) => string | number): T[] {
    const seenKeys = new Set<string | number>();

    return items.filter(item => {
      const key = selectKey(item);
      const isInvalidKey = typeof key === 'number' ? key <= 0 : key.trim().length === 0;

      if (isInvalidKey || seenKeys.has(key)) {
        return false;
      }

      seenKeys.add(key);
      return true;
    });
  }

  private toText(value: unknown): string {
    return typeof value === 'string' ? value : '';
  }

  private toNullableText(value: unknown): string | null {
    const text = this.toText(value);
    return text ? text : null;
  }

  private toNumber(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }

    if (typeof value === 'string' && value.trim().length > 0) {
      const parsedValue = Number(value);
      return Number.isFinite(parsedValue) ? parsedValue : null;
    }

    return null;
  }

  private toNullableNumber(value: unknown): number | null {
    return this.toNumber(value);
  }

  private toBoolean(value: unknown): boolean {
    return value === true || value === 'true';
  }
}
