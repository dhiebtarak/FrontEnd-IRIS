export type DocumentContext =
  | {
      scope: 'contract';
      contractId: number;
    }
  | {
      scope: 'placement';
      contractId: number;
      panelId: number;
    };

export interface DocumentListItem {
  idDocument: number;
  fileName: string;
  mimeType: string;
  fileSize: number | null;
  documentType: string;
  createdAt: string;
  createdByName: string | null;
}

export interface DocumentUploadRequest {
  fileName: string;
  mimeType: string;
  contentBase64: string;
}

export interface DocumentDownload {
  blob: Blob;
  fileName: string | null;
}
