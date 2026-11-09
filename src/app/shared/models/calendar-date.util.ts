import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';
export function isCalendarDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const y = +match[1],
    m = +match[2],
    d = +match[3];
  const leap = y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0);
  return (
    y > 0 &&
    m >= 1 &&
    m <= 12 &&
    d >= 1 &&
    d <= [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1]
  );
}
export const calendarDateValidator: ValidatorFn = (
  control: AbstractControl,
): ValidationErrors | null =>
  !control.value || isCalendarDate(control.value) ? null : { calendarDate: true };
export const receiptFilterValidator: ValidatorFn = (
  control: AbstractControl,
): ValidationErrors | null => {
  const { operationFrom, operationTo, minAmount, maxAmount } = control.value;
  const errors = {
    ...(operationFrom && operationTo && operationFrom > operationTo ? { dateRange: true } : {}),
    ...(minAmount != null && maxAmount != null && minAmount > maxAmount
      ? { amountRange: true }
      : {}),
  };
  return Object.keys(errors).length ? errors : null;
};
export function formatCalendarDate(value: string | null | undefined, locale = 'en-US'): string {
  if (!value || !isCalendarDate(value.slice(0, 10))) return 'Not provided';
  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(value.slice(0, 10) + 'T00:00:00Z'));
}
