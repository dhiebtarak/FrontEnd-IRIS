import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import {
  ClaimContext,
  ClaimPage,
  ClaimRecord,
  ClaimRequest,
  ClaimReceipt,
} from '../models/claim.model';

@Injectable({ providedIn: 'root' })
export class ClaimsService {
  private readonly http = inject(HttpClient);
  list(contractId: number | null, page = 1) {
    let params = new HttpParams().set('page', page).set('pageSize', 20);
    if (contractId != null) params = params.set('contractId', contractId);
    return this.http.get<ClaimPage>('/api/claims', { params });
  }
  context(contractId: number) {
    return this.http.get<ClaimContext>(`/api/claims/contracts/${contractId}/context`);
  }
  save(contractId: number, claimId: number | null, request: ClaimRequest) {
    return claimId == null
      ? this.http.post<ClaimRecord>(`/api/claims/contracts/${contractId}`, request)
      : this.http.put<ClaimRecord>(`/api/claims/contracts/${contractId}/${claimId}`, request);
  }
  issue(claimId: number, processingMode: string) {
    return this.http.post<ClaimRecord>(`/api/claims/${claimId}/collection-note`, {
      processingMode,
    });
  }
  receipts(claimId: number) {
    return this.http.get<ClaimReceipt[]>(`/api/claims/${claimId}/receipts`);
  }
  pair(claimId: number, bankReceiptId: number) {
    return this.http.post<ClaimRecord>(`/api/claims/${claimId}/pair`, { bankReceiptId });
  }
  close(claimId: number) {
    return this.http.post<ClaimRecord>(`/api/claims/${claimId}/close`, {});
  }
  pdf(claimId: number) {
    return this.http.get(`/api/claims/${claimId}/collection-note/pdf`, {
      observe: 'response',
      responseType: 'blob',
    });
  }
}
