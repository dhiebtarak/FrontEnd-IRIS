import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { DocumentsService } from './documents.service';

describe('DocumentsService', () => {
  let service: DocumentsService;
  let httpTesting: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [DocumentsService, provideHttpClient(), provideHttpClientTesting()]
    });
    service = TestBed.inject(DocumentsService);
    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpTesting.verify());

  it('uses the contract document route and forwards raw Base64 JSON', () => {
    const request = {
      fileName: 'signed-slip.pdf',
      mimeType: 'application/pdf',
      contentBase64: 'JVBERi0xLjQK'
    };

    service.uploadDocument({ scope: 'contract', contractId: 123 }, request).subscribe();
    const httpRequest = httpTesting.expectOne('http://localhost:5151/api/contracts/123/documents');

    expect(httpRequest.request.method).toBe('POST');
    expect(httpRequest.request.body).toEqual(request);
    expect(httpRequest.request.body).not.toHaveProperty('dataUrl');
    httpRequest.flush({ idDocument: 7, ...request, fileSize: 10, documentType: 'Slip', createdAt: '', createdByName: null });
  });

  it('uses both contract and panel IDs for placement documents', () => {
    service.getDocuments({ scope: 'placement', contractId: 123, panelId: 45 }).subscribe();
    const httpRequest = httpTesting.expectOne('http://localhost:5151/api/contracts/123/panels/45/documents');

    expect(httpRequest.request.method).toBe('GET');
    httpRequest.flush([]);
  });

  it('requests document downloads as Blobs and reads the server filename', () => {
    let result: { blob: Blob; fileName: string | null } | undefined;
    service.downloadDocument(7).subscribe(value => result = value);
    const httpRequest = httpTesting.expectOne('http://localhost:5151/api/documents/7/download');

    expect(httpRequest.request.responseType).toBe('blob');
    httpRequest.flush(new Blob(['file'], { type: 'application/pdf' }), {
      headers: { 'Content-Disposition': 'attachment; filename="signed-slip.pdf"' }
    });

    expect(result?.fileName).toBe('signed-slip.pdf');
    expect(result?.blob.type).toBe('application/pdf');
  });

  it('archives a document through the document-owned route', () => {
    service.archiveDocument(7).subscribe();
    const httpRequest = httpTesting.expectOne('http://localhost:5151/api/documents/7');

    expect(httpRequest.request.method).toBe('DELETE');
    expect(httpRequest.request.body).toBeNull();
    httpRequest.flush(null, { status: 204, statusText: 'No Content' });
  });
});
