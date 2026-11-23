import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { ToastrService } from 'ngx-toastr';
import { By } from '@angular/platform-browser';
import { DocumentAttachmentsComponent } from '../shared/components/document-attachments/document-attachments.component';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { of, Subject, throwError } from 'rxjs';
import { ContractClaimsComponent } from './contract-claims.component';
import { ContractsService } from '../shared/services/contracts.service';
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
    canIssue: false,
    canPassToInvoicing: true,
    version: 1,
    invoicingStatus: 'Ready',
    cedentName: 'Cedent',
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
      detail: vi.fn().mockReturnValue(of(row)),
      list: vi
        .fn()
        .mockReturnValue(of({ items: [row], totalCount: 1, pageNumber: 1, totalPages: 1 })),
      context: vi.fn().mockReturnValue(of(context)),
      save: vi.fn().mockReturnValue(of(row)),
      preview: vi.fn().mockReturnValue(of({claim:row,paidLossText:'10000.000',allocationTotalText:'950.000',totalSignedShare:10,panels:[{panelId:11,reinsurerName:'AMI',signedShare:10,amountText:'950.000',suggestedAmount:950}]})),
      approve: vi.fn().mockReturnValue(of({claimId:4,avoirId:9,avoirNumber:'AV-2026-000001',label:'Storm settlement',documents:[]})),
      documents: vi.fn().mockReturnValue(new Subject()),
      invoicing: vi.fn(),
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
        { provide: ContractsService, useValue: {getCurrencies:vi.fn().mockReturnValue(of([{id:1,code:'TND',name:'Dinar',symbol:'DT',decimalPlaces:3},{id:2,code:'USD',name:'US Dollar',symbol:'$',decimalPlaces:2}]))} },
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
    expect(api.list).toHaveBeenCalledWith(7, 1, expect.any(Object));
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
  it('loads active currencies and submits the chosen currency and optional deductible while reserve stays separate', () => {
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
    expect(c.netPreview).toBe(10500);
    expect(f.nativeElement.querySelector('[formControlName="currencyId"]').options.length).toBe(3);
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
    expect(api.save.mock.calls[0][2].deductible).toBeNull();
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
  it('keeps the existing receipt pairing action for previously issued claims', () => {
    const c = fixture().componentInstance;
    c.openPair({ ...row, canPair: true }); c.receiptId.setValue(55); c.pair();
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
    expect(api.list).toHaveBeenLastCalledWith(8, 1, expect.any(Object));
  });
  it('opens issued claims read-only', () => {
    const c = fixture().componentInstance;
    c.openEdit({ ...row, canEdit: false });
    expect(c.form.disabled).toBe(true);
    c.save();
    expect(api.save).not.toHaveBeenCalled();
  });
  it('restores independent currency and preserves null versus zero deductible', () => {
    const c = fixture().componentInstance;
    c.openEdit({...row,currencyId:2,currencyCode:'USD',deductible:0});
    expect(c.form.controls.currencyId.value).toBe(2); expect(c.form.controls.deductible.value).toBe(0);
    c.save(); expect(api.save).toHaveBeenLastCalledWith(7,4,expect.objectContaining({currencyId:2,deductible:0}));
    c.openEdit({...row,deductible:null});expect(c.form.controls.deductible.value).toBeNull();
  });
  it('validates label and exact allocation totals before approval and offers the saved bundle', () => {
    const f=fixture(),c=f.componentInstance;
    c.openInvoicing(row);f.detectChanges();expect(c.mode()).toBe('invoicing');
    expect(c.canApprove).toBe(false);c.invoiceLabel.setValue('   ');expect(c.canApprove).toBe(false);
    c.invoiceLabel.setValue(' Storm settlement ');c.allocations.at(0).setValue('949.999');
    expect(c.allocationTotals?.remaining).toBe('0.001');expect(c.canApprove).toBe(false);
    c.allocations.at(0).setValue('950.000');expect(c.canApprove).toBe(true);c.approve();
    expect(api.approve).toHaveBeenCalledWith(4,{label:'Storm settlement',version:1,allocations:[{panelId:11,amount:'950.000'}]});
    expect(c.mode()).toBe('documents');expect(api.documents).toHaveBeenCalledWith(4,'bundle',undefined);
  });
  it('blocks repeated approval while pending and surfaces a conflict without downloading', () => {
    const c=fixture().componentInstance;c.openInvoicing(row);c.invoiceLabel.setValue('Storm settlement');
    const pending=new Subject();api.approve.mockReturnValue(pending);c.approve();c.approve();expect(api.approve).toHaveBeenCalledTimes(1);
    pending.error({status:409,error:{message:'Claim changed'}});expect(c.busy()).toBe(false);
    expect(c.error()).toContain('Claim changed'); expect(c.preview()).toBeNull();
    expect(api.documents).not.toHaveBeenCalled();
  });
  it('does not expose invoicing for a completed claim', () => {
    const c=fixture().componentInstance;c.openInvoicing({...row,canPassToInvoicing:false,invoicingStatus:'Invoiced'});
    expect(api.preview).not.toHaveBeenCalled();
  });

  it('fetches and opens the claim from the notification query parameter', () => {
    TestBed.overrideProvider(ActivatedRoute,{useValue:{queryParamMap:of(convertToParamMap({claimId:'4'}))}});
    const c=fixture().componentInstance;
    expect(api.detail).toHaveBeenCalledWith(4);expect(c.selected()?.claimId).toBe(4);expect(c.mode()).toBe('form');
  });

  it('shows net loss after the claim deductible and the separate contract terms below Status', () => {
    const f=fixture(), c=f.componentInstance;c.openCreate();
    c.form.patchValue({currencyId:2,paidLoss:15000,expertFees:1000,otherFees:150,deductible:1000});f.detectChanges();
    expect(c.netPreview).toBe(15150);
    const text=f.nativeElement.textContent;
    expect(text).toContain('Net loss');expect(text).not.toContain('Gross loss');
    const modal=f.nativeElement.querySelector('.claim-modal');
    expect(modal.textContent).toContain('Contract signed share');expect(modal.textContent).toContain('10%');
    expect(modal.textContent).toContain('Contract deductible');expect(modal.textContent).toMatch(/TND\s+1[,\s]?000[.,]000/);
    expect(Array.from(modal.querySelectorAll('select,dl') as NodeListOf<Element>).at(-1)?.tagName).toBe('DL');
    c.form.controls.deductible.setValue(null);expect(c.netPreview).toBe(16150);
    c.form.controls.deductible.setValue(0);expect(c.netPreview).toBe(16150);
    c.form.controls.deductible.setValue(17000);expect(c.netPreview).toBe(-850);
  });
  it('preserves decimal precision when subtracting a claim deductible', () => {
    const c=fixture().componentInstance;c.openCreate();
    c.form.patchValue({paidLoss:0.1,expertFees:0.2,otherFees:0,deductible:0.1});
    expect(c.netPreview).toBe(0.2);
  });

  it('approves two actual 5% shares as 750 each on net loss 15000, not half of the full loss', () => {
    const f=fixture(), c=f.componentInstance;
    api.preview.mockReturnValue(of({claim:{...row,paidLoss:15000,expertFees:2500,otherFees:0,deductible:2500,netLoss:15000},paidLossText:'15000.000',allocationTotalText:'1500.000',totalSignedShare:10,panels:[
      {panelId:11,reinsurerName:'STAR',signedShare:5,amountText:'750.000',suggestedAmount:750},
      {panelId:12,reinsurerName:'AMI',signedShare:5,amountText:'750.000',suggestedAmount:750}
    ]}));
    c.openInvoicing(row);c.invoiceLabel.setValue('Shared claim');f.detectChanges();
    expect(c.allocations.getRawValue()).toEqual(['750.000','750.000']);
    expect(c.allocationTotals).toEqual({total:'1500.000',allocated:'1500.000',remaining:'0.000',valid:true});
    expect(c.canApprove).toBe(true);expect(f.nativeElement.textContent).toContain('Reinsured total (10%)');
    c.allocations.at(0).setValue('7500.000');c.allocations.at(1).setValue('7500.000');
    expect(c.canApprove).toBe(false);
  });

  it('blocks approval if the running backend still returns the old full-loss preview', () => {
    const c=fixture().componentInstance;
    api.preview.mockReturnValue(of({claim:row,paidLossText:'15000.000',panels:[]}));
    c.openInvoicing(row);
    expect(c.canApprove).toBe(false);expect(c.error()).toContain('previous allocation calculation');
    expect(api.approve).not.toHaveBeenCalled();
  });

});
