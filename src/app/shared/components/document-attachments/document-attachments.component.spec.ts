import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { of, Subject, throwError } from 'rxjs';
import { ToastrService } from 'ngx-toastr';
import { DocumentAttachmentsComponent } from './document-attachments.component';
import { DocumentListItem } from '../../models/document.model';
import { DocumentsService } from '../../services/documents.service';

describe('DocumentAttachmentsComponent', () => {
  let fixture: ComponentFixture<DocumentAttachmentsComponent>;
  let component: DocumentAttachmentsComponent;
  let documentsService: Pick<DocumentsService, 'getDocuments' | 'uploadDocument' | 'downloadDocument' | 'archiveDocument'>;
  let toastr: Pick<ToastrService, 'success' | 'error'>;

  const documents: DocumentListItem[] = [
    {
      idDocument: 7,
      fileName: 'signed-slip.pdf',
      mimeType: 'application/pdf',
      fileSize: 1024,
      documentType: 'Slip',
      createdAt: '2026-09-10T10:00:00Z',
      createdByName: 'Front Officer'
    },
    {
      idDocument: 8,
      fileName: 'placement-note.pdf',
      mimeType: 'application/pdf',
      fileSize: 2048,
      documentType: 'Note',
      createdAt: '2026-09-10T11:00:00Z',
      createdByName: null
    }
  ];

  beforeEach(async () => {
    documentsService = {
      getDocuments: vi.fn().mockReturnValue(of(documents)),
      uploadDocument: vi.fn().mockReturnValue(of({})),
      downloadDocument: vi.fn().mockReturnValue(of({ blob: new Blob(['file']), fileName: 'file.pdf' })),
      archiveDocument: vi.fn().mockReturnValue(of(void 0))
    };
    toastr = { success: vi.fn(), error: vi.fn() };
    vi.spyOn(window.URL, 'createObjectURL').mockReturnValue('blob:document');
    vi.spyOn(window.URL, 'revokeObjectURL').mockImplementation(() => undefined);
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);

    await TestBed.configureTestingModule({
      imports: [DocumentAttachmentsComponent],
      providers: [
        { provide: DocumentsService, useValue: documentsService },
        { provide: ToastrService, useValue: toastr }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(DocumentAttachmentsComponent);
    component = fixture.componentInstance;
    component.context = { scope: 'placement', contractId: 123, panelId: 45 };
    component.title = 'Reinsurer documents';
    fixture.detectChanges();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('opens a responsive dialog for the supplied placement context', () => {
    openDocuments();

    expect(component.isOpen()).toBe(true);
    expect(fixture.nativeElement.textContent).toContain('Reinsurer documents');
    expect(documentsService.getDocuments).toHaveBeenCalledWith({ scope: 'placement', contractId: 123, panelId: 45 });
    expect(fixture.nativeElement.querySelector('[role="dialog"]')).not.toBeNull();
  });

  it('shows only the selected filename and rejects unsupported files before upload', () => {
    component.openDocuments({ currentTarget: fixture.nativeElement.querySelector('button') } as unknown as Event);
    fixture.detectChanges();
    const openInput = fixture.nativeElement.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['content'], 'C:\\fakepath\\notes.txt', { type: 'text/plain' });
    Object.defineProperty(openInput, 'files', { value: { item: () => file } });

    component.onFileSelected({ target: openInput } as unknown as Event);
    fixture.detectChanges();

    expect(component.selectedFileName()).toBe('');
    expect(component.selectedFileError()).toContain('Unsupported file format');
  });

  it('displays Download and Archive actions for every active file', () => {
    openDocuments();

    expect(getButtonsByText('Download')).toHaveLength(2);
    expect(getArchiveButtons()).toHaveLength(2);
    expect(getButtonsByText('Archive')).toHaveLength(2);
    expect(getButtonsByText('Download')[0].getAttribute('aria-label')).toBe('Download signed-slip.pdf');
    expect(getArchiveButtons()[0].getAttribute('title')).toBe('Archive file');
    expect(getArchiveButtons()[0].getAttribute('aria-label')).toBe('Archive signed-slip.pdf');
  });

  it('does not hide Archive when frontend permissions are unavailable', () => {
    openDocuments();

    expect(getButtonsByText('Download')).toHaveLength(2);
    expect(getArchiveButtons()).toHaveLength(2);
  });

  it('opens the archive confirmation dialog from the selected file row', async () => {
    openDocuments();
    const archiveButton = getArchiveButtons()[0];

    archiveButton.click();
    await flushQueuedFocus();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[role="alertdialog"]')).not.toBeNull();
    expect(fixture.nativeElement.textContent).toContain('Archive this file?');
    expect(fixture.nativeElement.textContent).toContain('signed-slip.pdf');
  });

  it('cancels archive without sending an API request and restores focus to the Archive button', async () => {
    openDocuments();
    const archiveButton = getArchiveButtons()[0];
    archiveButton.click();
    await flushQueuedFocus();
    fixture.detectChanges();

    getButtonsByText('Cancel')[0].click();
    await flushQueuedFocus();
    fixture.detectChanges();

    expect(documentsService.archiveDocument).not.toHaveBeenCalled();
    expect(fixture.nativeElement.querySelector('[role="alertdialog"]')).toBeNull();
    expect(document.activeElement).toBe(archiveButton);
  });

  it('sends exactly one archive request with the selected idDocument', () => {
    openDocuments();
    getArchiveButtons()[0].click();
    fixture.detectChanges();

    const archiveButtons = getButtonsByText('Archive');
    archiveButtons[archiveButtons.length - 1].click();
    archiveButtons[archiveButtons.length - 1].click();

    expect(documentsService.archiveDocument).toHaveBeenCalledTimes(1);
    expect(documentsService.archiveDocument).toHaveBeenCalledWith(7);
  });

  it('removes only the archived file after success and keeps Mister Clippy open', () => {
    openDocuments();
    getArchiveButtons()[0].click();
    fixture.detectChanges();

    getButtonsByText('Archive').at(-1)?.click();
    fixture.detectChanges();

    expect(component.documents().map(document => document.idDocument)).toEqual([8]);
    expect(component.isOpen()).toBe(true);
    expect(fixture.nativeElement.textContent).not.toContain('signed-slip.pdf');
    expect(fixture.nativeElement.textContent).toContain('placement-note.pdf');
    expect(toastr.success).toHaveBeenCalledWith('File archived successfully', 'Success');
  });

  it('keeps the file visible and offers Retry after archive failure', () => {
    vi.mocked(documentsService.archiveDocument).mockReturnValue(throwError(() => new HttpErrorResponse({ error: { message: 'Document was not found.' }, status: 404 })));
    openDocuments();
    getArchiveButtons()[0].click();
    fixture.detectChanges();

    getButtonsByText('Archive').at(-1)?.click();
    fixture.detectChanges();

    expect(component.documents().map(document => document.idDocument)).toEqual([7, 8]);
    expect(fixture.nativeElement.textContent).toContain('signed-slip.pdf');
    expect(fixture.nativeElement.textContent).toContain('Document was not found.');
    expect(getButtonsByText('Retry')).toHaveLength(1);
    expect(getArchiveButtons()[0].disabled).toBe(false);
  });

  it('disables only the selected row Archive button while archiving and leaves downloads available', () => {
    const archiveSubject = new Subject<void>();
    vi.mocked(documentsService.archiveDocument).mockReturnValue(archiveSubject.asObservable());
    openDocuments();
    getArchiveButtons()[0].click();
    fixture.detectChanges();

    getButtonsByText('Archive').at(-1)?.click();
    fixture.detectChanges();

    expect(component.archivingDocumentId).toBe(7);
    expect(getArchiveButtons()[0].disabled).toBe(true);
    expect(getArchiveButtons()[1].disabled).toBe(false);
    expect(getButtonsByText('Download').every(button => !button.disabled)).toBe(true);

    archiveSubject.next();
    archiveSubject.complete();
  });

  it('works from the contract context with the same shared modal', () => {
    component.context = { scope: 'contract', contractId: 123 };
    openDocuments();
    getArchiveButtons()[1].click();
    fixture.detectChanges();

    getButtonsByText('Archive').at(-1)?.click();

    expect(documentsService.getDocuments).toHaveBeenCalledWith({ scope: 'contract', contractId: 123 });
    expect(documentsService.archiveDocument).toHaveBeenCalledWith(8);
  });

  it('continues to download active documents', () => {
    openDocuments();

    getButtonsByText('Download')[0].click();

    expect(documentsService.downloadDocument).toHaveBeenCalledWith(7);
    expect(documentsService.archiveDocument).not.toHaveBeenCalled();
  });

  it('supports Escape cancellation and traps keyboard focus inside the archive confirmation', async () => {
    openDocuments();
    getArchiveButtons()[0].click();
    await flushQueuedFocus();
    fixture.detectChanges();

    const confirmDialog = fixture.nativeElement.querySelector('[role="alertdialog"]') as HTMLElement;
    const cancelButton = getButtonsByText('Cancel')[0];
    const confirmButton = getButtonsByText('Archive').at(-1) as HTMLButtonElement;
    confirmButton.focus();
    component.handleFocusTrap(new KeyboardEvent('keydown', { key: 'Tab' }));
    expect(document.activeElement).toBe(cancelButton);

    component.handleEscape();
    await flushQueuedFocus();
    fixture.detectChanges();
    expect(confirmDialog.isConnected).toBe(false);
  });

  function openDocuments(): void {
    const trigger = fixture.nativeElement.querySelector('button') as HTMLButtonElement;
    component.openDocuments({ currentTarget: trigger } as unknown as Event);
    fixture.detectChanges();
  }

  function getButtonsByText(text: string): HTMLButtonElement[] {
    return Array.from(fixture.nativeElement.querySelectorAll('button'))
      .filter((button): button is HTMLButtonElement => button instanceof HTMLButtonElement && button.textContent?.trim() === text);
  }

  function getArchiveButtons(): HTMLButtonElement[] {
    return Array.from(fixture.nativeElement.querySelectorAll('button[title="Archive file"]'));
  }

  function flushQueuedFocus(): Promise<void> {
    return new Promise(resolve => queueMicrotask(resolve));
  }
});
