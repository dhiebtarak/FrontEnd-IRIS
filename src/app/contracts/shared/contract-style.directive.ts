import { Directive, HostBinding, Input } from '@angular/core';
// Existing Facultative utility classes, shared without generating a separate theme.
export const CONTRACT_UI = {
  surface: 'min-h-screen bg-iris-bg font-calibri text-iris-navy',
  intakeContainer: 'mx-auto max-w-7xl px-4 py-8 md:px-8',
  overviewContainer: 'mx-auto max-w-[1500px] px-4 py-6 md:px-7 lg:px-10',
  intakeHeader: 'border-b border-iris-border/70 bg-white/90 backdrop-blur',
  overviewHeader: 'border-b border-iris-divider bg-gradient-to-r from-white via-sky-50 to-white',
  intakeHeaderInner: 'mx-auto max-w-7xl px-4 py-6 md:px-8',
  overviewHeaderInner:
    'border-b border-iris-divider bg-gradient-to-r from-white via-sky-50 to-white px-5 py-5 md:px-7',
  breadcrumb: 'flex flex-wrap gap-2 text-sm text-iris-slate',
  heading1: 'mt-2 font-cambria text-3xl font-bold leading-tight text-iris-navy md:text-4xl',
  heading2: 'mb-6 border-b border-iris-divider pb-5 font-cambria text-2xl font-bold text-iris-navy',
  heading3: 'font-cambria text-xl font-bold text-iris-navy',
  eyebrow: 'mb-2 text-[11px] font-bold uppercase tracking-[0.24em] text-iris-teal',
  card: 'rounded-[28px] border border-iris-border/80 bg-white p-6 shadow-[0_24px_60px_rgba(13,47,79,0.08)] md:p-7',
  workspace:
    'overflow-hidden rounded-[24px] border border-iris-border/80 bg-white shadow-[0_18px_45px_rgba(13,47,79,0.08)]',
  grid: 'mt-6 grid gap-5 md:grid-cols-2',
  layout: 'mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]',
  field: 'flex flex-col gap-2 text-sm font-semibold text-iris-navy',
  input:
    'min-w-0 w-full rounded-2xl border border-iris-border bg-white px-4 py-3 text-sm text-iris-navy outline-none transition focus:border-iris-teal focus:ring-4 focus:ring-sky-100 read-only:bg-iris-bg',
  hint: 'text-sm font-normal text-iris-slate',
  button:
    'inline-flex items-center justify-center gap-2 rounded-xl border border-iris-border bg-white px-5 py-3 text-sm font-semibold text-iris-navy transition hover:border-iris-navy-light disabled:cursor-not-allowed disabled:opacity-60',
  primary:
    'inline-flex items-center justify-center gap-2 rounded-xl bg-iris-teal px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-sky-200 transition hover:bg-iris-teal-light disabled:cursor-not-allowed disabled:opacity-60',
  toolbar: 'flex flex-wrap items-center justify-between gap-3',
  badges: 'mt-3 flex flex-wrap items-center gap-2 text-sm text-iris-slate',
  statusPill: 'inline-flex rounded-full border px-3 py-1 text-sm font-bold',
  pill: 'inline-flex rounded-full border border-iris-border bg-white px-3 py-1 text-sm font-bold text-iris-navy',
  umr: 'inline-flex rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-sm font-bold text-iris-teal',
  error:
    'my-6 whitespace-pre-line rounded-3xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-900',
  validation: 'mt-2 text-sm text-rose-700',
  scroll: 'overflow-x-auto rounded-xl border border-iris-border',
  table: 'w-full min-w-[620px] text-left text-sm',
  column: 'bg-iris-bg px-4 py-3 text-xs uppercase text-iris-slate',
  cell: 'border-b border-iris-divider px-4 py-3 text-iris-navy',
  modal: 'max-h-[85vh] overflow-auto p-6 font-calibri text-iris-navy md:p-7',
  info: 'grid gap-4 text-sm md:grid-cols-2 xl:grid-cols-3',
  dataLabel: 'text-xs font-semibold uppercase tracking-[0.16em] text-iris-slate',
  dataValue: 'mt-1 font-semibold text-iris-navy',
  picker: 'rounded-2xl border border-iris-border bg-white',
  pickerSummary: 'cursor-pointer break-words px-4 py-3 text-sm',
  pickerOptions: 'max-h-64 overflow-auto px-4 pb-3',
  countryOption: 'my-2 flex items-center gap-2 text-sm font-semibold text-iris-navy',
  countryCheckbox: 'h-4 w-4 flex-none accent-[var(--color-iris-teal)]',
  empty:
    'rounded-2xl border border-dashed border-iris-border bg-iris-bg/70 px-4 py-5 text-sm text-iris-slate',
  snapshotItem: 'rounded-2xl bg-iris-bg/70 px-4 py-3',
  snapshotTitle: 'mt-2 font-cambria text-2xl font-bold text-iris-navy',
  loading: 'flex flex-col items-center justify-center gap-4 py-14 text-center',
  spinner: 'h-11 w-11 animate-spin rounded-full border-4 border-iris-divider border-t-iris-teal',
  snapshot:
    'self-start rounded-[28px] border border-iris-border/80 bg-white p-5 shadow-[0_24px_60px_rgba(13,47,79,0.08)]',
  tabs: 'flex gap-1 overflow-x-auto border-b border-iris-divider bg-iris-bg/70 px-4 pt-3',
  tab: 'shrink-0 rounded-t-2xl border px-5 py-3 text-sm font-bold transition',
  tabActive: 'border-iris-border border-b-white bg-white text-iris-navy',
  tabInactive:
    'border-transparent bg-transparent text-iris-slate hover:bg-white/70 hover:text-iris-navy',
} as const;
@Directive({ selector: '[contractStyle]', standalone: true })
export class ContractStyleDirective {
  @Input({ required: true }) contractStyle!: keyof typeof CONTRACT_UI;
  @Input() contractActive = false;
  @HostBinding('class') get classes(): string {
    return (
      CONTRACT_UI[this.contractStyle] +
      (this.contractStyle === 'tab'
        ? ' ' + (this.contractActive ? CONTRACT_UI.tabActive : CONTRACT_UI.tabInactive)
        : '')
    );
  }
}
