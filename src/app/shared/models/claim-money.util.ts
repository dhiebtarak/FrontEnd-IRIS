// Decimal text -> integer minor units. No floating-point arithmetic in approval totals.
export function claimMinorUnits(value: string, places: number): bigint | null {
  if (!Number.isInteger(places) || places < 0 || places > 4) return null;
  const match = /^(\d+)(?:\.(\d+))?$/.exec(value.trim());
  if (!match || (match[2]?.length ?? 0) > places) return null;
  return BigInt(match[1]) * 10n ** BigInt(places) + BigInt((match[2] ?? '').padEnd(places, '0') || '0');
}
export function claimDecimalText(units: bigint, places: number): string {
  const sign = units < 0n ? '-' : '';
  const value = (units < 0n ? -units : units).toString().padStart(places + 1, '0');
  return sign + (places ? value.slice(0, -places) + '.' + value.slice(-places) : value);
}
