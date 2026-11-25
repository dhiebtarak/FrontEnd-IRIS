import { XolLayerModalComponent } from './xol-layer-modal.component';
import { emptyXolLayer } from '../../shared/models/xol.model';
import { MatDialogRef } from '@angular/material/dialog';
describe('XOL layer modal', () => {
  let c: XolLayerModalComponent;
  const close = vi.fn();
  beforeEach(() => {
    close.mockClear();
    c = new XolLayerModalComponent(
      { layer: emptyXolLayer(), inception: '2026-01-01', expiry: '2026-12-31' },
      { close } as unknown as MatDialogRef<XolLayerModalComponent>,
    );
  });
  it('generates and edits installment and reinstatement rows while retaining entered rows', () => {
    c.form.controls.numberOfInstallments.setValue(2);
    c.resize('installments');
    c.installments.at(0).controls.amount.setValue('123.4500');
    c.form.controls.numberOfInstallments.setValue(3);
    c.resize('installments');
    expect(c.installments.at(0).controls.amount.value).toBe('123.4500');
    c.form.controls.numberOfReinstatements.setValue(2);
    c.resize('reinstatements');
    expect(c.reinstatements.length).toBe(2);
  });
  it('supports add/edit, calculates live previews and rejects dates outside the period', () => {
    c.form.patchValue({
      cover: '4000000',
      retention: '1000000',
      epi: '2000000',
      adjustablePremiumRatePct: '5.26',
    });
    expect(c.preview.rolPct).toBe('2.63000000');
    c.form.controls.numberOfInstallments.setValue(1);
    c.resize('installments');
    c.installments.at(0).controls.expectedSettlementDate.setValue('2027-01-01');
    c.save();
    expect(close).not.toHaveBeenCalled();
    c.installments.at(0).controls.expectedSettlementDate.setValue('2026-03-01');
    c.save();
    expect(close).toHaveBeenCalledWith(
      expect.objectContaining({ cover: '4000000', retention: '1000000' }),
    );
  });
  it('rejects negative amounts, invalid percentage and a missing retention', () => {
    c.form.patchValue({ cover: '10', retention: null, adjustablePremiumRatePct: '101' });
    c.save();
    expect(close).not.toHaveBeenCalled();
    c.form.patchValue({ retention: '0', adjustablePremiumRatePct: '5', mdp: '-1' });
    expect(c.form.invalid).toBe(true);
  });
});
