import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import {
  CounterpartyUpsertRequest,
  Counterparty,
  CounterpartyListFilters,
  CounterpartyListResponse,
  CounterpartyStatusUpdatePayload,
} from '../models/counterparty.model';

@Injectable({
  providedIn: 'root'
})
export class CounterpartiesService {
  private readonly baseUrl = 'http://localhost:5151/api/counterparties';
  private readonly defaultListFilters: CounterpartyListFilters = {
    pageNumber: 1,
    pageSize: 25
  };

  constructor(private readonly httpClient: HttpClient) {}

  getCounterparties(filters: Partial<CounterpartyListFilters> = {}): Observable<CounterpartyListResponse> {
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

    return this.httpClient.get<CounterpartyListResponse>(this.baseUrl, {
      params
    });
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
}
