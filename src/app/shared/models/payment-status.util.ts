export type InvoicePaymentStatus = 'Settled' | 'PartiallySettled' | 'Unsettled';

export function normalizePaymentStatus(status: string | null | undefined): string {
  return (status ?? '').trim().toLowerCase().replace(/[\s_-]+/g, '');
}

export function getInvoicePaymentStatusValue(status: string | null | undefined): InvoicePaymentStatus | null {
  const normalized = normalizePaymentStatus(status);
  if (normalized === 'settled' || normalized === 'paired') {
    return 'Settled';
  }

  if (normalized === 'partiallysettled' || normalized === 'partiallypaired') {
    return 'PartiallySettled';
  }

  if (normalized === 'unsettled' || normalized === 'unpaired') {
    return 'Unsettled';
  }

  return null;
}

export function getInvoicePaymentStatusDisplay(status: string | null | undefined): string | null {
  const value = getInvoicePaymentStatusValue(status);
  if (value === 'PartiallySettled') {
    return 'Partially settled';
  }

  return value;
}

export function getInvoicePaymentStatusClasses(status: string | null | undefined): string {
  const value = getInvoicePaymentStatusValue(status);
  if (value === 'Settled') {
    return 'border-emerald-200 bg-emerald-50 text-emerald-800';
  }

  if (value === 'PartiallySettled') {
    return 'border-sky-200 bg-sky-50 text-sky-800';
  }

  return 'border-amber-200 bg-amber-50 text-amber-800';
}
