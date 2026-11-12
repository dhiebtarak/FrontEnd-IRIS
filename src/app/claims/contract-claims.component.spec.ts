import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { ToastrService } from 'ngx-toastr';
import { By } from '@angular/platform-browser';
import { DocumentAttachmentsComponent } from '../shared/components/document-attachments/document-attachments.component';
import { provideRouter } from '@angular/router';
import { of, Subject, throwError } from 'rxjs';
import { ContractClaimsComponent } from './contract-claims.component';
import { ClaimsService } from '../shared/services/claims.service';
import { Auth } from '../shared/services/auth';
import { ClaimContext, ClaimRecord } from '../shared/models/claim.model';
import { DocumentsService } from '../shared/services/documents.service';

describe('ContractClaimsComponent', () => {
  let api: any;
  let documentsApi: any;
  const context: ClaimContext = {
    contractId: 7,
    contractName: 'Factory',
    umr: 'UMR-7',
    underwritingYear: 2026,
    deductible: 1000,
    signedSharePercentage: 10,
    currencyId: 1,
    currencyCode: 'TND',
    currencyDecimalPlaces: 3,
    canCreate: true,
  };
  const row = {
    claimId: 4,
    claimNumber: 'CL-2026-000004',
    contractId: 7,
    contractName: 'Factory',
    umr: 'UMR-7',
    dateOfLoss: '2026-10-01',
    notificationDate: '2026-10-02',
    natureOfLoss: 'Storm',
    currencyId: 1,
    currencyCode: 'TND',
    currencyDecimalPlaces: 3,
    status: 'PaidLoss',
    paidLoss: 10000,
    expertFees: 500,
    otherFees: 0,
    reserve: 99999,
    deductible: 1000,
    signedSharePercentage: 10,
    amount100Percent: 10500,
    collectionAmount: 950,
    canEdit: true,
    canIssue: true,
    canPair: false,
    isClosed: false,
    includeInSoa: false,
    collectionIssuedAt: null,
  } as ClaimRecord;
  beforeEach(async () => {
    documentsApi = {
      getDocuments: vi.fn().mockReturnValue(of([])),
      uploadDocument: vi.fn().mockReturnValue(of({ idDocument: 11 })),
      downloadDocument: vi.fn(), archiveDocument: vi.fn(),
    };
    api = {
      list: vi
        .fn()
        .mockReturnValue(of({ items: [row], totalCount: 1, pageNumber: 1, totalPages: 1 })),
      context: vi.fn().mockReturnValue(of(context)),
      save: vi.fn().mockReturnValue(of(row)),
      issue: vi.fn().mockReturnValue(of({ ...row, collectionReference: 'CCN-1' })),
      receipts: vi.fn().mockReturnValue(of([])),
      pair: vi.fn().mockReturnValue(of(row)),
      close: vi.fn().mockReturnValue(of(row)),
      pdf: vi.fn().mockReturnValue(new Subject()),
    };
    await TestBed.configureTestingModule({
      imports: [ContractClaimsComponent],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        { provide: ToastrService, useValue: { success: vi.fn(), error: vi.fn() } },
        { provide: ClaimsService, useValue: api },
        { provide: DocumentsService, useValue: documentsApi },
        { provide: Auth, useValue: { hasModule: () => true } },
      ],
    }).compileComponents();
  });
  function fixture() {
    const f = TestBed.createComponent(ContractClaimsComponent);
    f.componentRef.setInput('contractId', 7);
    f.detectChanges();
    return f;
  }
  async function addFile(clip: DocumentAttachmentsComponent, name: string) {
    vi.spyOn(clip as any, 'readFileAsBase64').mockResolvedValue('AQID');
    const file = new File(['evidence'], name, { type: 'application/zip' });
    clip.onFileSelected({ target: { files: { item: () => file } } } as unknown as Event);
    clip.upload();
    await Promise.resolve();
  }
  it('shows Mr Clippy in Add Claim and uploads pending files only after the claim is saved', async () => {
    const f = fixture(), c = f.componentInstance;
    c.openCreate(); f.detectChanges();
    const clip = c.formDocuments!;
    expect(clip).toBeDefined();
    expect(clip.isDraft).toBe(true);
    await addFile(clip, 'loss.zip');
    expect(documentsApi.uploadDocument).not.toHaveBeenCalled();
    expect(documentsApi.getDocuments).not.toHaveBeenCalled();
    c.form.controls.dateOfLoss.setValue('2026-10-01');
    api.save.mockReturnValue(of({ ...row, claimId: 91 }));
    c.save();
    expect(documentsApi.uploadDocument).toHaveBeenCalledWith(
      { scope: 'claim', claimId: 91 }, expect.objectContaining({ fileName: 'loss.zip' }));
    expect(c.mode()).toBeNull();
  });
  it('retries only failed files without creating the claim twice', async () => {
    const f = fixture(), c = f.componentInstance;
    c.openCreate(); f.detectChanges();
    await addFile(c.formDocuments!, 'first.zip');
    await addFile(c.formDocuments!, 'second.zip');
    c.form.controls.dateOfLoss.setValue('2026-10-01');
    documentsApi.uploadDocument.mockReturnValueOnce(of({ idDocument: 11 }))
      .mockReturnValueOnce(throwError(() => ({ error: { message: 'Upload unavailable' } })))
      .mockReturnValue(of({ idDocument: 12 }));
    c.save();
    expect(c.error()).toContain('The claim was saved');
    expect(c.formDocuments!.documents().map(file => file.fileName)).toEqual(['second.zip']);
    expect(c.mode()).toBe('form');
    c.retryAttachments();
    expect(api.save).toHaveBeenCalledTimes(1);
    expect(documentsApi.uploadDocument.mock.calls.map((call: any[]) => call[1].fileName))
      .toEqual(['first.zip', 'second.zip', 'second.zip']);
    expect(c.mode()).toBeNull();
  });
  it('keeps queued files when claim validation fails and discards them on cancel', async () => {
    const f = fixture(), c = f.componentInstance;
    c.openCreate(); f.detectChanges();
    await addFile(c.formDocuments!, 'evidence.zip');
    c.form.controls.dateOfLoss.setValue('2026-10-01');
    api.save.mockReturnValue(throwError(() => ({ error: { message: 'Invalid date' } })));
    c.save();
    expect(c.formDocuments!.documents()).toHaveLength(1);
    expect(documentsApi.uploadDocument).not.toHaveBeenCalled();
    c.dismiss(); f.detectChanges();
    c.openCreate(); f.detectChanges();
    expect(c.formDocuments!.documents()).toHaveLength(0);
  });
  it('uses the saved claim context directly when editing an existing claim', () => {
    const f = fixture(), c = f.componentInstance;
    c.openEdit(row); f.detectChanges();
    expect(c.formDocuments!.context).toEqual({ scope: 'claim', claimId: row.claimId });
    expect(c.formDocuments!.isDraft).toBe(false);
  });
  it('renders the claim history and required columns', () => {
    const f = fixture();
    expect(api.list).toHaveBeenCalledWith(7, 1);
    for (const text of [
      'Claims History',
      'Claim ID',
      'Date of loss',
      'UY',
      'Reserve',
      'Paid loss',
      'CL-2026-000004',
    ])
      expect(f.nativeElement.textContent).toContain(text);
  });
  it('gives each claim its own paperclip using the claim ID', () => {
    api.list.mockReturnValue(of({ items: [row, { ...row, claimId: 9, claimNumber: 'CL-9' }], totalCount: 2, pageNumber: 1, totalPages: 1 }));
    const f = fixture();
    const clips = f.debugElement.queryAll(By.directive(DocumentAttachmentsComponent));
    expect(clips.map(clip => clip.componentInstance.context)).toEqual([
      { scope: 'claim', claimId: 4 }, { scope: 'claim', claimId: 9 },
    ]);
    expect(clips[0].componentInstance.title).toContain(row.claimNumber);
  });
  it('uses only the contract currency and sends complete dates while reserve stays separate', () => {
    const f = fixture(),
      c = f.componentInstance;
    c.openCreate();
    f.detectChanges();
    c.form.patchValue({
      dateOfLoss: '2026-10-01',
      notificationDate: '2026-10-02',
      natureOfLoss: 'Storm',
      reserve: 99999,
      paidLoss: 10000,
      expertFees: 500,
      otherFees: 0,
      status: 'PaidLoss',
    });
    expect(c.grossPreview).toBe(10500);
    expect(f.nativeElement.querySelector('[formControlName="currencyId"]').options.length).toBe(1);
    c.save();
    expect(api.save).toHaveBeenCalledWith(
      7,
      null,
      expect.objectContaining({
        dateOfLoss: '2026-10-01',
        currencyId: 1,
        reserve: 99999,
        paidLoss: 10000,
        expertFees: 500,
      }),
    );
    expect(api.save.mock.calls[0][2]).not.toHaveProperty('deductible');
    expect(api.save.mock.calls[0][2]).not.toHaveProperty('collectionAmount');
  });
  it('prevents double submit and keeps backend errors visible', () => {
    const c = fixture().componentInstance;
    c.openCreate();
    c.form.controls.dateOfLoss.setValue('2026-10-01');
    api.save.mockReturnValue(new Subject());
    c.save();
    c.save();
    expect(api.save).toHaveBeenCalledTimes(1);
  });
  it('shows server validation and does not allow creation when the contract is not Bound', () => {
    const c = fixture().componentInstance;
    api.context.mockReturnValue(of({ ...context, canCreate: false }));
    c.openCreate();
    expect(c.mode()).toBeNull();
    expect(c.error()).toContain('Bound');
    api.context.mockReturnValue(of(context));
    c.openCreate();
    c.form.controls.dateOfLoss.setValue('2026-10-01');
    api.save.mockReturnValue(
      throwError(() => ({ error: { message: 'Invalid claim', errors: ['CurrencyId: mismatch'] } })),
    );
    c.save();
    expect(c.error()).toContain('mismatch');
    expect(c.busy()).toBe(false);
  });
  it('supports both collection-note modes and pairs using actual receipt IDs', () => {
    const c = fixture().componentInstance;
    c.openIssue(row);
    c.processingMode.setValue('PAIR_WITH_ENCAISSEMENT');
    c.issue();
    expect(api.issue).toHaveBeenCalledWith(4, 'PAIR_WITH_ENCAISSEMENT');
    c.openPair({ ...row, canPair: true });
    c.receiptId.setValue(55);
    c.pair();
    expect(api.pair).toHaveBeenCalledWith(4, 55);
  });
  it('cancels stale context responses when switching contracts', () => {
    const f = fixture(),
      c = f.componentInstance;
    const pending = new Subject<ClaimContext>();
    api.context.mockReturnValue(pending);
    c.openCreate();
    f.componentRef.setInput('contractId', 8);
    f.detectChanges();
    pending.next(context);
    expect(c.context()).toBeNull();
    expect(c.mode()).toBeNull();
    expect(api.list).toHaveBeenLastCalledWith(8, 1);
  });
  it('opens issued claims read-only', () => {
    const c = fixture().componentInstance;
    c.openEdit({ ...row, canEdit: false });
    expect(c.form.disabled).toBe(true);
    c.save();
    expect(api.save).not.toHaveBeenCalled();
  });
});
