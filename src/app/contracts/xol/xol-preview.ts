import { XolDecimal } from '../../shared/models/xol.model';
const units = 100000000n;
function decimal(value: XolDecimal | null): bigint | null {
  if (value === null || value === '') return null;
  const m = /^(\d+)(?:\.(\d{1,8}))?$/.exec(String(value));
  return m ? BigInt(m[1]) * units + BigInt((m[2] ?? '').padEnd(8, '0')) : null;
}
function display(value: bigint): string {
  const negative = value < 0n;
  const n = negative ? -value : value;
  return (
    (negative ? '-' : '') + (n / units).toString() + '.' + (n % units).toString().padStart(8, '0')
  );
}
export function xolPreview(
  cover: XolDecimal | null,
  retention: XolDecimal | null,
  rate: XolDecimal | null,
  epi: XolDecimal | null,
): { capacity: string | null; rolPct: string | null } {
  const c = decimal(cover),
    r = decimal(retention),
    p = decimal(rate),
    e = decimal(epi);
  return {
    capacity: c !== null && r !== null ? display(c + r) : null,
    rolPct:
      c !== null && c > 0n && p !== null && e !== null
        ? display((p * e) / c + (((p * e) % c) * 2n >= c ? 1n : 0n))
        : null,
  };
}

export function xolDecimalLabel(value: XolDecimal | null): string {
  if (value === null) return 'Not provided';
  const [whole, fraction = ''] = String(value).split('.');
  const trimmed = fraction.replace(/0+$/, '');
  return whole.replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + (trimmed ? '.' + trimmed : '');
}

// Temporary decimal-text preview. Saved financial values remain backend-authoritative.
export function xolSharePreview(
  amount: XolDecimal | null,
  signedShare: XolDecimal | null,
  precision: number,
): string | null {
  const a = decimal(amount),
    share = decimal(signedShare);
  if (a === null || share === null || share > 100n * units) return null;
  const places = Math.max(0, Math.min(4, Math.trunc(precision)));
  const quantum = 10n ** BigInt(8 - places);
  const denominator = units * 100n * quantum;
  const numerator = a * share;
  const rounded =
    numerator / denominator + ((numerator % denominator) * 2n >= denominator ? 1n : 0n);
  return display(rounded * quantum);
}
