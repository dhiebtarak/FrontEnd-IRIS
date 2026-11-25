import { ContractStyleDirective } from '../shared/contract-style.directive';
import { CommonModule } from '@angular/common';
import { Component, Inject } from '@angular/core';
import { FormArray, FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { XolDecimal, XolLayer, XOL_REINSTATEMENT_CONDITIONS } from '../../shared/models/xol.model';
import { xolDecimalLabel, xolPreview } from './xol-preview';
const amount = (value: XolDecimal | null) =>
  new FormControl<XolDecimal | null>(value, [
    Validators.min(0),
    Validators.pattern(/^\d+(\.\d{1,4})?$/),
  ]);
export const installmentForm = (row: {
  sequence: number;
  expectedSettlementDate: string | null;
  amount: XolDecimal | null;
  settlementDate: string | null;
}) =>
  new FormGroup({
    sequence: new FormControl(row.sequence, { nonNullable: true }),
    expectedSettlementDate: new FormControl(row.expectedSettlementDate),
    amount: amount(row.amount),
    settlementDate: new FormControl(row.settlementDate),
  });
export const reinstatementForm = (row: { sequence: number; condition: string }) =>
  new FormGroup({
    sequence: new FormControl(row.sequence, { nonNullable: true }),
    condition: new FormControl(row.condition, {
      nonNullable: true,
      validators: [Validators.required],
    }),
  });
@Component({
  selector: 'app-xol-layer-modal',
  standalone: true,
  imports: [ContractStyleDirective, CommonModule, ReactiveFormsModule, MatDialogModule],
  templateUrl: './xol-layer-modal.component.html',
})
export class XolLayerModalComponent {
  readonly conditions = XOL_REINSTATEMENT_CONDITIONS;
  readonly form: ReturnType<typeof this.build>;
  error = '';
  readonly numberLabel = xolDecimalLabel;
  constructor(
    @Inject(MAT_DIALOG_DATA)
    readonly data: { layer: XolLayer; inception: string | null; expiry: string | null },
    readonly dialog: MatDialogRef<XolLayerModalComponent, XolLayer>,
  ) {
    this.form = this.build(data.layer);
  }
  private build(l: XolLayer) {
    return new FormGroup({
      cover: new FormControl<XolDecimal | null>(l.cover, [
        Validators.required,
        Validators.min(0.0001),
        Validators.pattern(/^\d+(\.\d{1,4})?$/),
      ]),
      retention: amount(l.retention),
      annualTreatyCapacity: amount(l.annualTreatyCapacity),
      epi: amount(l.epi),
      mdp: amount(l.mdp),
      adjustablePremiumRatePct: new FormControl<XolDecimal | null>(l.adjustablePremiumRatePct, [
        Validators.min(0),
        Validators.max(100),
        Validators.pattern(/^\d+(\.\d{1,8})?$/),
      ]),
      loading: new FormControl(l.loading, [Validators.maxLength(100)]),
      cashLoss: amount(l.cashLoss),
      numberOfInstallments: new FormControl(l.numberOfInstallments, {
        nonNullable: true,
        validators: [Validators.min(0), Validators.max(120), Validators.pattern(/^\d+$/)],
      }),
      numberOfReinstatements: new FormControl(l.numberOfReinstatements, {
        nonNullable: true,
        validators: [Validators.min(0), Validators.max(100), Validators.pattern(/^\d+$/)],
      }),
      installments: new FormArray(l.installments.map(installmentForm)),
      reinstatements: new FormArray(l.reinstatements.map(reinstatementForm)),
    });
  }
  get installments() {
    return this.form.controls.installments;
  }
  get reinstatements() {
    return this.form.controls.reinstatements;
  }
  get preview() {
    const f = this.form.getRawValue();
    return xolPreview(f.cover, f.retention, f.adjustablePremiumRatePct, f.epi);
  }
  resize(kind: 'installments' | 'reinstatements'): void {
    const count =
      kind === 'installments'
        ? this.form.controls.numberOfInstallments
        : this.form.controls.numberOfReinstatements;
    if (count.invalid) return;
    if (kind === 'installments') {
      while (this.installments.length > count.value)
        this.installments.removeAt(this.installments.length - 1);
      while (this.installments.length < count.value)
        this.installments.push(
          installmentForm({
            sequence: this.installments.length + 1,
            expectedSettlementDate: null,
            amount: null,
            settlementDate: null,
          }),
        );
    } else {
      while (this.reinstatements.length > count.value)
        this.reinstatements.removeAt(this.reinstatements.length - 1);
      while (this.reinstatements.length < count.value)
        this.reinstatements.push(
          reinstatementForm({ sequence: this.reinstatements.length + 1, condition: '' }),
        );
    }
  }
  save(): void {
    this.form.markAllAsTouched();
    this.error = '';
    const f = this.form.getRawValue();
    if (this.form.invalid || f.retention === null || f.retention === '') {
      this.error =
        'Enter a positive cover, a nonnegative retention and valid amounts, percentages and counts.';
      return;
    }
    if (
      f.installments.length !== f.numberOfInstallments ||
      f.reinstatements.length !== f.numberOfReinstatements
    ) {
      this.error = 'Row counts must match their rows.';
      return;
    }
    if (
      f.installments.some((i) =>
        [i.expectedSettlementDate, i.settlementDate].some(
          (date) =>
            date &&
            ((this.data.inception && date < this.data.inception) ||
              (this.data.expiry && date > this.data.expiry)),
        ),
      )
    ) {
      this.error = 'Installment dates must be within the contract period.';
      return;
    }
    const blank = (value: XolDecimal | null) => (value === '' ? null : value);
    this.dialog.close({
      ...this.data.layer,
      ...f,
      cover: blank(f.cover),
      retention: blank(f.retention),
      annualTreatyCapacity: blank(f.annualTreatyCapacity),
      epi: blank(f.epi),
      mdp: blank(f.mdp),
      cashLoss: blank(f.cashLoss),
      adjustablePremiumRatePct: blank(f.adjustablePremiumRatePct),
      installments: f.installments.map((i) => ({
        ...i,
        amount: blank(i.amount),
        expectedSettlementDate: i.expectedSettlementDate || null,
        settlementDate: i.settlementDate || null,
      })),
    });
  }
}
