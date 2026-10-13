import { CommonModule } from '@angular/common';
import { Component, ElementRef, HostListener, Input, OnDestroy, Optional, ViewChild, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { ToastrService } from 'ngx-toastr';
import { finalize } from 'rxjs';
import { DocumentContext, DocumentListItem, DocumentUploadRequest } from '../../models/document.model';
import { DocumentsService } from '../../services/documents.service';

const maxDocumentSizeBytes = 10 * 1024 * 1024;
const allowedDocumentExtensions = new Set(['.pdf', '.png', '.jpg', '.jpeg']);

@Component({
  selector: 'app-document-attachments',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './document-attachments.component.html'
})
export class DocumentAttachmentsComponent implements OnDestroy {
  @Input({ required: true }) context!: DocumentContext;
  @Input() title = 'Contract documents';
  @Input() readOnly = false;
  @ViewChild('dialog') private dialog?: ElementRef<HTMLElement>;
  @ViewChild('confirmDialog') private confirmDialog?: ElementRef<HTMLElement>;
  @ViewChild('fileInput') private fileInput?: ElementRef<HTMLInputElement>;

  readonly isOpen = signal(false);
  readonly documents = signal<DocumentListItem[]>([]);
  readonly isLoading = signal(false);
  readonly isUploading = signal(false);
  readonly errorMessage = signal('');
  readonly selectedFileName = signal('');
  readonly selectedFileError = signal('');
  readonly downloadingIds = signal<Set<number>>(new Set());
  readonly previewingIds = signal<Set<number>>(new Set());
  private readonly documentToArchiveSignal = signal<DocumentListItem | null>(null);
  private readonly archivingDocumentIdSignal = signal<number | null>(null);
  readonly archiveErrorMessage = signal('');
  private selectedFile: File | null = null;
  private restoreFocusElement: HTMLElement | null = null;
  private restoreArchiveFocusElement: HTMLElement | null = null;
  private previousBodyOverflow = '';

  constructor(
    private readonly documentsService: DocumentsService,
    @Optional() private readonly toastr: ToastrService | null
  ) {}

  get documentToArchive(): DocumentListItem | null {
    return this.documentToArchiveSignal();
  }

  set documentToArchive(document: DocumentListItem | null) {
    this.documentToArchiveSignal.set(document);
  }

  get archivingDocumentId(): number | null {
    return this.archivingDocumentIdSignal();
  }

  set archivingDocumentId(documentId: number | null) {
    this.archivingDocumentIdSignal.set(documentId);
  }

  openDocuments(event: Event): void {
    this.restoreFocusElement = event.currentTarget instanceof HTMLElement ? event.currentTarget : null;
    this.isOpen.set(true);
    this.previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    this.loadDocuments();
    queueMicrotask(() => this.dialog?.nativeElement.focus());
  }

  closeDocuments(): void {
    this.isOpen.set(false);
    document.body.style.overflow = this.previousBodyOverflow;
    this.documentToArchive = null;
    this.archiveErrorMessage.set('');
    this.clearSelection();
    queueMicrotask(() => this.restoreFocusElement?.focus());
  }

  openFilePicker(): void {
    if (this.readOnly) {
      return;
    }

    this.fileInput?.nativeElement.click();
  }

  onFileSelected(event: Event): void {
    if (this.readOnly) {
      this.clearSelection();
      return;
    }

    const input = event.target as HTMLInputElement | null;
    const file = input?.files?.item(0) ?? null;
    this.selectedFileError.set('');

    if (!file) {
      return;
    }

    const extension = file.name.includes('.') ? `.${file.name.split('.').pop()?.toLowerCase()}` : '';
    if (!allowedDocumentExtensions.has(extension)) {
      this.clearSelection();
      this.selectedFileError.set('Unsupported file format. Choose a PDF, PNG, JPG, or JPEG file.');
      return;
    }

    if (file.size > maxDocumentSizeBytes) {
      this.clearSelection();
      this.selectedFileError.set('This file exceeds the 10 MB upload limit.');
      return;
    }

    this.selectedFile = file;
    this.selectedFileName.set(file.name);
  }

  upload(): void {
    if (this.readOnly || this.isUploading() || !this.selectedFile) {
      return;
    }

    this.isUploading.set(true);
    this.selectedFileError.set('');
    this.readFileAsBase64(this.selectedFile).then(contentBase64 => {
      const file = this.selectedFile;
      if (!file) {
        return;
      }

      const request: DocumentUploadRequest = {
        fileName: file.name,
        mimeType: file.type || 'application/octet-stream',
        contentBase64
      };

      this.documentsService.uploadDocument(this.context, request).pipe(
        finalize(() => this.isUploading.set(false))
      ).subscribe({
        next: () => {
          this.clearSelection();
          this.toastr?.success('Document uploaded successfully.', 'Success');
          this.loadDocuments();
        },
        error: (error: HttpErrorResponse) => this.selectedFileError.set(this.getErrorMessage(error))
      });
    }).catch(() => {
      this.isUploading.set(false);
      this.selectedFileError.set('The selected file could not be read. Please choose it again.');
    });
  }

  retry(): void {
    this.loadDocuments();
  }

  preview(document: DocumentListItem): void {
    if (this.previewingIds().has(document.idDocument)) {
      return;
    }

    this.previewingIds.update(ids => new Set(ids).add(document.idDocument));
    this.documentsService.downloadDocument(document.idDocument, this.context).pipe(
      finalize(() => this.previewingIds.update(ids => {
        const next = new Set(ids);
        next.delete(document.idDocument);
        return next;
      }))
    ).subscribe({
      next: result => this.openBlobPreview(result.blob),
      error: (error: HttpErrorResponse) => this.errorMessage.set(this.getErrorMessage(error))
    });
  }

  download(document: DocumentListItem): void {
    if (this.downloadingIds().has(document.idDocument)) {
      return;
    }

    this.downloadingIds.update(ids => new Set(ids).add(document.idDocument));
    this.documentsService.downloadDocument(document.idDocument, this.context).pipe(
      finalize(() => this.downloadingIds.update(ids => {
        const next = new Set(ids);
        next.delete(document.idDocument);
        return next;
      }))
    ).subscribe({
      next: result => this.saveBlob(result.blob, result.fileName ?? document.fileName),
      error: (error: HttpErrorResponse) => this.errorMessage.set(this.getErrorMessage(error))
    });
  }

  openArchiveConfirmation(document: DocumentListItem, event: Event): void {
    event.preventDefault();
    event.stopPropagation();

    if (this.readOnly || this.archivingDocumentId === document.idDocument) {
      return;
    }

    this.restoreArchiveFocusElement = event.currentTarget instanceof HTMLElement ? event.currentTarget : null;
    this.archiveErrorMessage.set('');
    this.documentToArchive = document;
    queueMicrotask(() => this.confirmDialog?.nativeElement.focus());
  }

  cancelArchive(): void {
    this.documentToArchive = null;
    this.archiveErrorMessage.set('');
    queueMicrotask(() => this.restoreArchiveFocusElement?.focus());
  }

  confirmArchive(): void {
    const document = this.documentToArchive;
    if (this.readOnly || !document || this.archivingDocumentId === document.idDocument) {
      return;
    }

    this.archivingDocumentId = document.idDocument;
    this.archiveErrorMessage.set('');
    this.documentsService.archiveDocument(document.idDocument, this.context).pipe(
      finalize(() => this.archivingDocumentId = null)
    ).subscribe({
      next: () => {
        this.documentToArchive = null;
        this.archiveErrorMessage.set('');
        this.toastr?.success('File archived successfully', 'Success');
        this.loadDocuments();
        queueMicrotask(() => this.dialog?.nativeElement.focus());
      },
      error: (error: HttpErrorResponse) => {
        this.archiveErrorMessage.set(this.getArchiveErrorMessage(error));
      }
    });
  }

  formatFileSize(fileSize: number | null): string {
    if (fileSize == null) {
      return 'Size unavailable';
    }

    if (fileSize < 1024) {
      return `${fileSize} B`;
    }

    return `${(fileSize / 1024 / 1024).toFixed(1)} MB`;
  }

  formatDate(value: string): string {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(date);
  }

  isDownloading(idDocument: number): boolean {
    return this.downloadingIds().has(idDocument);
  }

  isPreviewing(idDocument: number): boolean {
    return this.previewingIds().has(idDocument);
  }

  @HostListener('document:keydown.escape')
  handleEscape(): void {
    if (this.documentToArchive) {
      this.cancelArchive();
    } else if (this.isOpen()) {
      this.closeDocuments();
    }
  }

  @HostListener('document:keydown', ['$event'])
  handleFocusTrap(event: KeyboardEvent): void {
    if (!this.isOpen() || event.key !== 'Tab') {
      return;
    }

    const container = this.documentToArchive ? this.confirmDialog?.nativeElement : this.dialog?.nativeElement;
    if (!container) {
      return;
    }

    const focusable = Array.from(container.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'
    ));
    if (!focusable.length) {
      return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  ngOnDestroy(): void {
    document.body.style.overflow = this.previousBodyOverflow;
  }

  private loadDocuments(): void {
    this.isLoading.set(true);
    this.errorMessage.set('');
    this.documentsService.getDocuments(this.context).pipe(
      finalize(() => this.isLoading.set(false))
    ).subscribe({
      next: documents => this.documents.set(documents),
      error: (error: HttpErrorResponse) => this.errorMessage.set(this.getErrorMessage(error))
    });
  }

  private clearSelection(): void {
    this.selectedFile = null;
    this.selectedFileName.set('');
    this.selectedFileError.set('');
    if (this.fileInput) {
      this.fileInput.nativeElement.value = '';
    }
  }

  private readFileAsBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result !== 'string') {
          reject(new Error('Invalid file reader result.'));
          return;
        }

        resolve(reader.result.replace(/^data:[^;]+;base64,/, ''));
      };
      reader.onerror = () => reject(reader.error ?? new Error('Unable to read file.'));
      reader.readAsDataURL(file);
    });
  }

  private saveBlob(blob: Blob, fileName: string): void {
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    link.click();
    window.URL.revokeObjectURL(url);
  }

  private openBlobPreview(blob: Blob): void {
    const url = window.URL.createObjectURL(blob);
    const previewWindow = window.open(url, '_blank', 'noopener');
    if (!previewWindow) {
      window.URL.revokeObjectURL(url);
      this.errorMessage.set('The document preview could not be opened. Please allow pop-ups or use Download.');
      return;
    }

    window.setTimeout(() => window.URL.revokeObjectURL(url), 60_000);
  }

  private getErrorMessage(error: HttpErrorResponse): string {
    if (error.status === 400) return 'The document file or Base64 content was rejected.';
    if (error.status === 401) return 'Your session has expired. Sign in again to manage documents.';
    if (error.status === 403) return 'You do not have permission to manage these documents.';
    if (error.status === 404) return 'The requested document context or file was not found.';
    if (error.status === 413) return 'The document is too large for the server.';
    if (error.status >= 500) return 'The document service returned a server error.';
    return 'Documents could not be loaded. Please try again.';
  }

  private getArchiveErrorMessage(error: HttpErrorResponse): string {
    const backendMessage = this.getBackendErrorMessage(error);
    if (backendMessage) return backendMessage;
    if (error.status === 401) return 'Your session has expired. Sign in again to archive documents.';
    if (error.status === 403) return 'You do not have permission to archive this document.';
    if (error.status === 404) return 'This document is unavailable or already outside your accessible scope.';
    if (error.status >= 500) return 'The document service returned an unexpected error while archiving.';
    return 'The file could not be archived. Please try again.';
  }

  private getBackendErrorMessage(error: HttpErrorResponse): string {
    const body = error.error;
    if (!body) {
      return '';
    }

    if (typeof body === 'string') {
      return body;
    }

    if (typeof body === 'object') {
      const record = body as Record<string, unknown>;
      const message = record['message'] ?? record['title'] ?? record['detail'];
      return typeof message === 'string' ? message : '';
    }

    return '';
  }
}
