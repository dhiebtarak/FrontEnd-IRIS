import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { map, Observable } from 'rxjs';
import {
  CounterpartyUpsertRequest,
  Counterparty,
  FinanceCounterpartyListItem,
  FinanceCounterpartyListResponse,
  CounterpartyListFilters,
  CounterpartyListResponse,
  CounterpartyStatusUpdatePayload,
} from '../models/counterparty.model';

@Injectable({
  providedIn: 'root'
})
export class CounterpartiesService {
  private readonly baseUrl = '/api/counterparties';
  private readonly defaultListFilters: CounterpartyListFilters = {
    pageNumber: 1,
    pageSize: 25
  };

  constructor(private readonly httpClient: HttpClient) {}

  getCounterparties(filters: Partial<CounterpartyListFilters> = {}): Observable<CounterpartyListResponse> {
    return this.httpClient.get<CounterpartyListResponse>(this.baseUrl, {
      params: this.buildListParams(filters)
    });
  }

  getFinanceCounterparties(filters: Partial<CounterpartyListFilters> = {}): Observable<FinanceCounterpartyListResponse> {
    return this.httpClient.get<unknown>(this.baseUrl, {
      params: this.buildListParams(filters)
    }).pipe(
      map(payload => this.mapFinanceCounterpartyListResponse(payload))
    );
  }

  getCounterpartyById(id: number | string): Observable<Counterparty> {
    return this.httpClient.get<Counterparty>(`${this.baseUrl}/${id}`);
  }

  createCounterparty(payload: CounterpartyUpsertRequest): Observable<Counterparty> {
    return this.httpClient.post<Counterparty>(this.baseUrl, payload);
  }

  updateCounterparty(id: number | string, payload: CounterpartyUpsertRequest): Observable<Counterparty> {
    return this.httpClient.put<Counterparty>(`${this.baseUrl}/${id}`, payload);
  }

  updateCounterpartyStatus(id: number | string, payload: CounterpartyStatusUpdatePayload): Observable<string> {
    return this.httpClient.patch(`${this.baseUrl}/${id}/status`, payload, {
      responseType: 'text'
    });
  }

  private buildListParams(filters: Partial<CounterpartyListFilters>): HttpParams {
    const mergedFilters = {
      ...this.defaultListFilters,
      ...filters
    };

    let params = new HttpParams()
      .set('pageNumber', String(mergedFilters.pageNumber))
      .set('pageSize', String(mergedFilters.pageSize));

    if (typeof mergedFilters.search === 'string' && mergedFilters.search.trim()) {
      params = params.set('search', mergedFilters.search.trim());
    }

    if (typeof mergedFilters.type === 'string' && mergedFilters.type.trim()) {
      params = params.set('type', mergedFilters.type.trim());
    }

    if (typeof mergedFilters.status === 'string' && mergedFilters.status.trim()) {
      params = params.set('status', mergedFilters.status.trim());
    }

    if (typeof mergedFilters.isActive === 'boolean') {
      params = params.set('isActive', String(mergedFilters.isActive));
    }

    return params;
  }

  private mapFinanceCounterpartyListResponse(payload: unknown): FinanceCounterpartyListResponse {
    const record = this.toRecord(payload);
    const rawItems = Array.isArray(record['items']) ? record['items'] : [];
    const items = rawItems.map(item => this.mapFinanceCounterparty(item));

    return {
      items,
      pageNumber: this.toNumber(record['pageNumber']) ?? 1,
      pageSize: this.toNumber(record['pageSize']) ?? items.length,
      totalCount: this.toNumber(record['totalCount']) ?? items.length,
      totalPages: this.toNumber(record['totalPages']) ?? (items.length > 0 ? 1 : 0)
    };
  }

  private mapFinanceCounterparty(value: unknown): FinanceCounterpartyListItem {
    const record = this.toRecord(value);
    const id = this.toNumber(record['id']);
    const name = this.toText(record['name']);
    const status = this.toText(record['status']);
    const hasActiveBankAccount = record['hasActiveBankAccount'];
    const activeBankAccountCount = this.toNumber(record['activeBankAccountCount']);

    if (id == null || !name || !status || typeof hasActiveBankAccount !== 'boolean' || activeBankAccountCount == null) {
      throw new Error('Counterparty bank-account status is unavailable from the backend response.');
    }

    return {
      id,
      name,
      status,
      hasActiveBankAccount,
      activeBankAccountCount
    };
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
      const parsedValue = Number(value);
      return Number.isFinite(parsedValue) ? parsedValue : null;
    }

    return null;
  }
}
