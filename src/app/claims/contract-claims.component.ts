import { CommonModule } from '@angular/common';
import { Component, DestroyRef, Input, OnChanges, ViewChild, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { finalize, of, Subscription, switchMap } from 'rxjs';
import { ClaimsService } from '../shared/services/claims.service';
import { Auth } from '../shared/services/auth';
import { ClaimContext, ClaimRecord, ClaimStatus, ClaimReceipt } from '../shared/models/claim.model';
import { calendarDateValidator } from '../shared/models/calendar-date.util';
import { DocumentAttachmentsComponent } from '../shared/components/document-attachments/document-attachments.component';

@Component({
  selector: 'app-contract-claims',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink, DocumentAttachmentsComponent],
  templateUrl: './contract-claims.component.html',
  styleUrl: './contract-claims.component.css',
})
export class ContractClaimsComponent implements OnChanges {
  @Input() contractId: number | null = null;
  @ViewChild('formDocuments') formDocuments?: DocumentAttachmentsComponent;
  private readonly api = inject(ClaimsService);
  private readonly auth = inject(Auth);
  private readonly destroy = inject(DestroyRef);
  private listRequest?: Subscription;
  private contextRequest?: Subscription;
  readonly records = signal<ClaimRecord[]>([]);
  readonly context = signal<ClaimContext | null>(null);
  readonly selected = signal<ClaimRecord | null>(null);
  readonly draftDocuments = signal(false);
  readonly savedForAttachments = signal<ClaimRecord | null>(null);
  readonly receipts = signal<ClaimReceipt[]>([]);
  readonly mode = signal<'form' | 'issue' | 'pair' | null>(null);
  readonly loading = signal(false);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly page = signal(1);
  readonly totalPages = signal(0);
  readonly total = signal(0);
  readonly canRead = () => this.auth.hasModule('Claims') || this.auth.hasModule('BackOffice');
  readonly canManage = () => this.auth.hasModule('Claims');
  readonly backOffice = () => this.auth.hasModule('BackOffice');
  readonly statusLabels: Record<ClaimStatus, string> = {
    Outstanding: 'Outstanding claim',
    PaidLoss: 'Paid loss',
    Closed: 'Closed',
    UnderDeductible: 'Under-deductible',
  };
  readonly moneyFields = [
    { key: 'reserve', label: 'Reserve amount' },
    { key: 'paidLoss', label: 'Paid loss' },
    { key: 'expertFees', label: 'Expert fees' },
    { key: 'otherFees', label: 'Other fees' },
  ] as const;
  readonly form = new FormGroup({
    dateOfLoss: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, calendarDateValidator],
    }),
    notificationDate: new FormControl('', {
      nonNullable: true,
      validators: [calendarDateValidator],
    }),
    natureOfLoss: new FormControl('', {
      nonNullable: true,
      validators: [Validators.maxLength(10000)],
    }),
    currencyId: new FormControl<number | null>(null, Validators.required),
    reserve: new FormControl<number | null>(null, Validators.min(0)),
    paidLoss: new FormControl<number | null>(null, Validators.min(0)),
    expertFees: new FormControl<number | null>(null, Validators.min(0)),
    otherFees: new FormControl<number | null>(null, Validators.min(0)),
    status: new FormControl<ClaimStatus>('Outstanding', { nonNullable: true }),
  });
  readonly processingMode = new FormControl('DIRECT_TO_REMITTANCES', { nonNullable: true });
  readonly receiptId = new FormControl<number | null>(null, Validators.required);
  get grossPreview() {
    const v = this.form.getRawValue();
    return Number(v.paidLoss ?? 0) + Number(v.expertFees ?? 0) + Number(v.otherFees ?? 0);
  }
  get readOnly() {
    return this.selected() != null && !this.selected()!.canEdit;
  }
  ngOnChanges() {
    this.contextRequest?.unsubscribe();
    this.listRequest?.unsubscribe();
    this.busy.set(false);
    this.mode.set(null);
    this.context.set(null);
    this.selected.set(null);
    this.savedForAttachments.set(null);
    this.draftDocuments.set(false);
    this.error.set('');
    this.records.set([]);
    this.page.set(1);
    this.load();
  }
  load(page = this.page()) {
    if (!this.canRead()) return;
    this.listRequest?.unsubscribe();
    this.loading.set(true);
    this.error.set('');
    const contractId = this.contractId;
    this.listRequest = this.api
      .list(contractId, page)
      .pipe(
        finalize(() => this.loading.set(false)),
        takeUntilDestroyed(this.destroy),
      )
      .subscribe({
        next: (result) => {
          this.records.set(result.items);
          this.page.set(result.pageNumber);
          this.total.set(result.totalCount);
          this.totalPages.set(result.totalPages);
        },
        error: (e) => this.fail(e),
      });
  }
  openCreate() {
    if (this.canManage() && this.contractId != null && !this.busy())
      this.openForm(this.contractId, null);
  }
  openEdit(row: ClaimRecord) {
    if (!this.busy()) this.openForm(row.contractId, row);
  }
  private openForm(contractId: number, row: ClaimRecord | null) {
    this.contextRequest?.unsubscribe();
    this.error.set('');
    this.selected.set(row);
    this.draftDocuments.set(row == null);
    this.savedForAttachments.set(null);
    this.context.set(null);
    this.form.enable({ emitEvent: false });
    this.busy.set(true);
    this.contextRequest = this.api
      .context(contractId)
      .pipe(
        finalize(() => this.busy.set(false)),
        takeUntilDestroyed(this.destroy),
      )
      .subscribe({
        next: (context) => {
          if (!row && !context.canCreate) {
            this.error.set('Claims can only be added to a Bound contract with Claims access.');
            return;
          }
          this.context.set(context);
          this.form.reset({
            dateOfLoss: row?.dateOfLoss ?? '',
            notificationDate: row?.notificationDate ?? '',
            natureOfLoss: row?.natureOfLoss ?? '',
            currencyId: row?.currencyId ?? context.currencyId,
            reserve: row?.reserve ?? null,
            paidLoss: row?.paidLoss ?? null,
            expertFees: row?.expertFees ?? null,
            otherFees: row?.otherFees ?? null,
            status: row?.status ?? 'Outstanding',
          });
          if (row && !row.canEdit) this.form.disable({ emitEvent: false });
          this.mode.set('form');
        },
        error: (e) => this.fail(e),
      });
  }
  save() {
    if (this.busy() || this.readOnly || this.savedForAttachments() || !this.context() || this.formDocuments?.isUploading()) return;
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    const v = this.form.getRawValue();
    this.busy.set(true);
    this.error.set('');
    this.api
      .save(this.context()!.contractId, this.selected()?.claimId ?? null, {
        ...v,
        currencyId: v.currencyId!,
        notificationDate: v.notificationDate || null,
        natureOfLoss: v.natureOfLoss.trim() || null,
      })
      .pipe(
        switchMap(row => {
          this.savedForAttachments.set(row);
          this.selected.set(row);
          this.form.disable({ emitEvent: false });
          return this.formDocuments?.uploadPending({ scope: 'claim', claimId: row.claimId }) ?? of(void 0);
        }),
        finalize(() => this.busy.set(false)),
        takeUntilDestroyed(this.destroy),
      )
      .subscribe({
        next: () => {
          this.savedForAttachments.set(null);
          this.mode.set(null);
          this.load(1);
        },
        error: (e) => this.saveError(e),
      });
  }
  retryAttachments() {
    const row = this.savedForAttachments();
    if (!row || this.busy() || this.formDocuments?.isUploading()) return;
    this.busy.set(true);
    this.error.set('');
    (this.formDocuments?.uploadPending({ scope: 'claim', claimId: row.claimId }) ?? of(void 0))
      .pipe(finalize(() => this.busy.set(false)), takeUntilDestroyed(this.destroy))
      .subscribe({
        next: () => {
          this.savedForAttachments.set(null);
          this.mode.set(null);
          this.load(1);
        },
        error: e => this.saveError(e),
      });
  }
  private saveError(e: any) {
    this.fail(e);
    if (this.savedForAttachments())
      this.error.set('The claim was saved, but some files could not be uploaded. Retry the remaining attachments. ' + this.error());
  }
  openIssue(row: ClaimRecord) {
    if (!this.busy() && row.canIssue) {
      this.error.set('');
      this.selected.set(row);
      this.processingMode.setValue('DIRECT_TO_REMITTANCES');
      this.mode.set('issue');
    }
  }
  issue() {
    if (this.busy() || !this.selected()?.canIssue) return;
    this.busy.set(true);
    this.error.set('');
    this.api
      .issue(this.selected()!.claimId, this.processingMode.value)
      .pipe(
        finalize(() => this.busy.set(false)),
        takeUntilDestroyed(this.destroy),
      )
      .subscribe({
        next: (row) => {
          this.mode.set(null);
          this.download(row);
          this.load();
        },
        error: (e) => this.fail(e),
      });
  }
  openPair(row: ClaimRecord) {
    if (this.busy() || !row.canPair) return;
    this.error.set('');
    this.selected.set(row);
    this.receiptId.reset();
    this.receipts.set([]);
    this.busy.set(true);
    this.mode.set('pair');
    this.api
      .receipts(row.claimId)
      .pipe(
        finalize(() => this.busy.set(false)),
        takeUntilDestroyed(this.destroy),
      )
      .subscribe({ next: (rows) => this.receipts.set(rows), error: (e) => this.fail(e) });
  }
  pair() {
    if (this.busy() || !this.receiptId.value || !this.selected()?.canPair) return;
    this.busy.set(true);
    this.error.set('');
    this.api
      .pair(this.selected()!.claimId, this.receiptId.value)
      .pipe(
        finalize(() => this.busy.set(false)),
        takeUntilDestroyed(this.destroy),
      )
      .subscribe({
        next: () => {
          this.mode.set(null);
          this.load();
        },
        error: (e) => this.fail(e),
      });
  }
  close(row: ClaimRecord) {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    this.api
      .close(row.claimId)
      .pipe(
        finalize(() => this.busy.set(false)),
        takeUntilDestroyed(this.destroy),
      )
      .subscribe({ next: () => this.load(), error: (e) => this.fail(e) });
  }
  download(row: ClaimRecord) {
    this.api
      .pdf(row.claimId)
      .pipe(takeUntilDestroyed(this.destroy))
      .subscribe({
        next: async (response) => {
          const blob = response.body;
          if (!blob || (await blob.slice(0, 5).text()) !== '%PDF-') {
            this.error.set('The backend did not return a PDF.');
            return;
          }
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `${row.collectionReference}.pdf`;
          a.click();
          setTimeout(() => URL.revokeObjectURL(url), 1000);
        },
        error: (e) => this.fail(e),
      });
  }
  dismiss() {
    if (!this.busy()) {
      this.mode.set(null);
      this.error.set('');
      if (this.savedForAttachments()) {
        this.savedForAttachments.set(null);
        this.load(1);
      }
    }
  }
  money(
    value: number | null | undefined,
    code = this.context()?.currencyCode ?? '',
    precision = this.context()?.currencyDecimalPlaces ?? 2,
  ) {
    return value == null
      ? 'Not provided'
      : `${code} ${new Intl.NumberFormat(undefined, { minimumFractionDigits: precision, maximumFractionDigits: precision }).format(value)}`;
  }
  contractRoute(row: ClaimRecord) {
    return this.backOffice()
      ? '/workspace/reassurance/back-officer/contracts/overview'
      : '/workspace/reassurance/front-officer/contracts/new/overview';
  }
  private fail(e: any) {
    this.error.set(
      [
        e?.error?.message || 'The claim request failed.',
        ...(Array.isArray(e?.error?.errors) ? e.error.errors : []),
      ].join(' '),
    );
  }
}
