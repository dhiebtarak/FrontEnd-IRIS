import { HttpClient, HttpResponse } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';
import {
  DocumentContext,
  DocumentDownload,
  DocumentListItem,
  DocumentUploadRequest
} from '../models/document.model';

@Injectable({ providedIn: 'root' })
export class DocumentsService {
  private readonly baseUrl = 'http://localhost:5151/api';

  constructor(private readonly httpClient: HttpClient) {}

  getDocuments(context: DocumentContext): Observable<DocumentListItem[]> {
    return this.httpClient.get<DocumentListItem[]>(this.getContextDocumentsUrl(context));
  }

  uploadDocument(context: DocumentContext, request: DocumentUploadRequest): Observable<DocumentListItem> {
    return this.httpClient.post<DocumentListItem>(this.getContextDocumentsUrl(context), request);
  }

  downloadDocument(idDocument: number): Observable<DocumentDownload> {
    return this.httpClient.get(`${this.baseUrl}/documents/${idDocument}/download`, {
      observe: 'response',
      responseType: 'blob'
    }).pipe(
      map(response => ({
        blob: response.body ?? new Blob(),
        fileName: this.getFilenameFromContentDisposition(response.headers.get('Content-Disposition'))
      }))
    );
  }

  archiveDocument(documentId: number): Observable<void> {
    return this.httpClient.delete<void>(`${this.baseUrl}/documents/${documentId}`);
  }

  private getContextDocumentsUrl(context: DocumentContext): string {
    if (context.scope === 'placement') {
      return `${this.baseUrl}/contracts/${context.contractId}/panels/${context.panelId}/documents`;
    }

    return `${this.baseUrl}/contracts/${context.contractId}/documents`;
  }

  private getFilenameFromContentDisposition(contentDisposition: string | null): string | null {
    if (!contentDisposition) {
      return null;
    }

    const utf8Match = /filename\*=UTF-8''([^;]+)/i.exec(contentDisposition);
    if (utf8Match?.[1]) {
      return decodeURIComponent(utf8Match[1].replace(/^"|"$/g, ''));
    }

    const filenameMatch = /filename="?([^";]+)"?/i.exec(contentDisposition);
    return filenameMatch?.[1] ?? null;
  }
}
