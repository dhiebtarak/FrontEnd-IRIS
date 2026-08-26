import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';
import {
  CedentReference,
  CedentSearchResponse,
  ContractTypeReference,
  CurrencyReference,
  DashboardSummary,
  FacultativeContractResponse,
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

  updateFacultativeContract(contractId: number, request: UpsertFacultativeContractRequest): Observable<FacultativeContractResponse> {
    return this.httpClient.put<unknown>(`${this.baseUrl}/contracts/facultative/${contractId}`, request).pipe(
      map(payload => this.mapFacultativeContract(payload))
    );
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

    return {
      contractId: this.toNumber(record['contractId'] ?? record['id']) ?? 0,
      status: this.toText(record['status']) || 'DRAFT',
      netPremiumCedent: this.toNullableNumber(record['netPremiumCedent']),
      umr: this.toNullableText(record['umr']),
      name: this.toText(record['name']),
      counterpartyId: this.toNumber(record['counterpartyId']) ?? 0,
      counterpartyName: this.toNullableText(record['counterpartyName'] ?? record['cedentName']),
      currencyId: this.toNumber(record['currencyId']) ?? 0,
      currencyCode: this.toNullableText(record['currencyCode']),
      currencySymbol: this.toNullableText(record['currencySymbol']),
      currencyDecimalPlaces: this.toNullableNumber(record['currencyDecimalPlaces']),
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
      memoText: this.toNullableText(record['memoText'])
    };
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
