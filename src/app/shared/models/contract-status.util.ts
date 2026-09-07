export function getContractStatusDisplay(status: string | null | undefined): string {
  const normalizedStatus = normalizeContractStatus(status);

  if (normalizedStatus === 'placementinprogress') {
    return 'Placement in progress';
  }

  if (normalizedStatus === 'readyforplacement') {
    return 'Ready for placement';
  }

  return status?.trim() || 'Not provided';
}

export function getContractStatusClasses(status: string | null | undefined): string {
  const normalizedStatus = normalizeContractStatus(status);

  if (normalizedStatus === 'draft') {
    return 'border-amber-200 bg-amber-50 text-amber-800';
  }

  if (normalizedStatus === 'readyforplacement') {
    return 'border-blue-200 bg-blue-50 text-blue-800';
  }

  if (normalizedStatus === 'placementinprogress') {
    return 'border-violet-200 bg-violet-50 text-violet-800';
  }

  if (normalizedStatus === 'bound') {
    return 'border-emerald-200 bg-emerald-50 text-emerald-800';
  }

  if (normalizedStatus === 'expired' || normalizedStatus === 'cancelled') {
    return 'border-slate-200 bg-slate-50 text-slate-700';
  }

  return 'border-slate-200 bg-slate-50 text-slate-700';
}

export function normalizeContractStatus(status: string | null | undefined): string {
  return (status ?? '').trim().replace(/[\s_-]+/g, '').toLowerCase();
}
