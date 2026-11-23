import { claimMinorUnits, claimDecimalText } from './claim-money.util';
describe('claim allocation minor units', () => {
  it('sums 0.1 and 0.2 exactly and preserves large decimal values', () => {
    expect(claimMinorUnits('0.1', 2)! + claimMinorUnits('0.2', 2)!).toBe(claimMinorUnits('0.30', 2));
    expect(claimDecimalText(claimMinorUnits('999999999999999.9999', 4)!, 4)).toBe('999999999999999.9999');
  });
  it('rejects negative, missing, exponent and excessive precision inputs', () => {
    for (const value of ['-1', '', '1e3', '0.001', 'NaN']) expect(claimMinorUnits(value, 2)).toBeNull();
    expect(claimMinorUnits('0', 0)).toBe(0n); expect(claimMinorUnits('10.01', 2)).toBe(1001n);
    expect(claimDecimalText(-1n, 3)).toBe('-0.001');
  });
});
