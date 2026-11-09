import { TestBed } from '@angular/core/testing';
import { of, Subject, throwError } from 'rxjs';
import { CounterpartiesService } from '../../services/counterparties.service';
import { CounterpartyAutocompleteComponent } from './counterparty-autocomplete.component';
import { CounterpartyListResponse } from '../../models/counterparty.model';
describe('Counterparty autocomplete', () => {
  const choice = {
    id: 7,
    name: 'Acme Cedent',
    types: ['Cedent'] as const,
    email: 'accounts@example.test',
    legacyClientId: null,
    legacyCompanyCode: 'ACME',
    status: 'Active',
    isActive: true,
  };
  let search: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    vi.useFakeTimers();
    search = vi
      .fn()
      .mockReturnValue(
        of({ items: [choice], pageNumber: 1, pageSize: 20, totalCount: 1, totalPages: 1 }),
      );
    TestBed.configureTestingModule({
      imports: [CounterpartyAutocompleteComponent],
      providers: [{ provide: CounterpartiesService, useValue: { getCounterparties: search } }],
    });
  });
  afterEach(() => vi.useRealTimers());
  it('debounces lookup and displays human-readable choices', async () => {
    const f = TestBed.createComponent(CounterpartyAutocompleteComponent);
    f.detectChanges();
    f.componentInstance.search.setValue('a');
    await vi.advanceTimersByTimeAsync(200);
    f.componentInstance.search.setValue('acme');
    await vi.advanceTimersByTimeAsync(299);
    expect(search).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    f.detectChanges();
    expect(search).toHaveBeenCalledTimes(1);
    expect(search).toHaveBeenCalledWith(expect.objectContaining({ search: 'acme', pageSize: 20 }));
    expect(f.nativeElement.textContent).toContain('Acme Cedent');
    expect(f.nativeElement.textContent).toContain('ACME');
  });
  it('cancels obsolete requests and clears IDs immediately while typing', async () => {
    const first = new Subject<CounterpartyListResponse>();
    search
      .mockReturnValueOnce(first)
      .mockReturnValue(
        of({ items: [], pageNumber: 1, pageSize: 20, totalCount: 0, totalPages: 0 }),
      );
    const f = TestBed.createComponent(CounterpartyAutocompleteComponent);
    f.detectChanges();
    const c = f.componentInstance;
    const emit = vi.spyOn(c.selectionChange, 'emit');
    c.search.setValue('old');
    await vi.advanceTimersByTimeAsync(300);
    expect(first.observed).toBe(true);
    c.search.setValue('new');
    expect(first.observed).toBe(false);
    expect(emit).toHaveBeenLastCalledWith(null);
    await vi.advanceTimersByTimeAsync(300);
    expect(c.options()).toHaveLength(0);
  });
  it('selects with the keyboard and provides a clear action', async () => {
    const f = TestBed.createComponent(CounterpartyAutocompleteComponent);
    f.detectChanges();
    const c = f.componentInstance;
    c.open();
    await vi.advanceTimersByTimeAsync(300);
    c.keydown(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(c.search.value).toBe('Acme Cedent');
    expect(c.selected?.id).toBe(7);
    const emit = vi.spyOn(c.selectionChange, 'emit');
    c.clear();
    expect(c.search.value).toBe('');
    expect(emit).toHaveBeenLastCalledWith(null);
  });
  it('shows loading and retryable errors', async () => {
    search.mockReturnValue(throwError(() => new Error('offline')));
    const f = TestBed.createComponent(CounterpartyAutocompleteComponent);
    f.detectChanges();
    f.componentInstance.open();
    f.detectChanges();
    expect(f.nativeElement.textContent).toContain('Searching counterparties');
    await vi.advanceTimersByTimeAsync(300);
    f.detectChanges();
    expect(f.nativeElement.textContent).toContain('Counterparties could not be loaded');
  });
});
