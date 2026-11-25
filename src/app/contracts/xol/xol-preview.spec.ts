import { xolPreview, xolSharePreview } from './xol-preview';
describe('XOL decimal previews', () => {
  it('calculates capacity and percentage-point ROL exactly', () => {
    expect(xolPreview('4000000', '1000000', '5.26', '2000000')).toEqual({
      capacity: '5000000.00000000',
      rolPct: '2.63000000',
    });
  });
  it('keeps incomplete fields unset and avoids division by zero', () => {
    expect(xolPreview(null, '0', null, null)).toEqual({ capacity: null, rolPct: null });
    expect(xolPreview('0', '1', '5', '2').rolPct).toBeNull();
  });
  it('rounds percentage previews to eight places like the backend', () => {
    expect(xolPreview('3', '0', '1', '2').rolPct).toBe('0.66666667');
  });
});

describe('XOL signed-share previews', () => {
  it('uses percentage points and currency precision, including zero', () => {
    expect(xolSharePreview('5000000', '10', 3)).toBe('500000.00000000');
    expect(xolSharePreview('1.005', '100', 2)).toBe('1.01000000');
    expect(xolSharePreview('123.45', '0', 3)).toBe('0.00000000');
    expect(xolSharePreview('0', '10', 3)).toBe('0.00000000');
  });
  it('leaves missing or invalid signed shares unset', () => {
    expect(xolSharePreview('1000', null, 3)).toBeNull();
    expect(xolSharePreview('1000', '101', 3)).toBeNull();
    expect(xolSharePreview(null, '10', 3)).toBeNull();
  });
});
