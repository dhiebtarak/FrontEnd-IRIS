import {
  Component,
  DestroyRef,
  Input,
  OnChanges,
  SimpleChanges,
  Output,
  EventEmitter,
  inject,
  signal,
} from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subject, catchError, of, switchMap, timer } from 'rxjs';
import { CounterpartiesService } from '../../services/counterparties.service';
import { CounterpartyListItem } from '../../models/counterparty.model';

@Component({
  selector: 'app-counterparty-autocomplete',
  standalone: true,
  imports: [ReactiveFormsModule],
  template: `<div class="relative" (focusout)="onFocusOut($event)">
    <label [for]="inputId" class="block text-sm font-semibold text-iris-navy">{{ label }}</label>
    <div
      class="mt-1 flex rounded-xl border border-iris-border bg-white focus-within:border-iris-teal"
    >
      <input
        [id]="inputId"
        type="search"
        [formControl]="search"
        (focus)="open()"
        (keydown)="keydown($event)"
        role="combobox"
        aria-autocomplete="list"
        [attr.aria-expanded]="expanded()"
        [attr.aria-controls]="inputId + '-options'"
        [attr.aria-activedescendant]="
          expanded() && options().length ? inputId + '-option-' + highlighted() : null
        "
        placeholder="Search name, business code or email"
        class="min-w-0 flex-1 rounded-l-xl px-4 py-3 text-sm outline-none"
        autocomplete="off"
      />
      @if (search.value) {
        <button
          type="button"
          (click)="clear()"
          aria-label="Clear counterparty"
          class="px-3 font-bold text-iris-teal"
        >
          Clear
        </button>
      }
    </div>
    @if (expanded()) {
      <div
        [id]="inputId + '-options'"
        role="listbox"
        class="absolute z-30 mt-1 max-h-72 w-full overflow-auto rounded-xl border border-iris-border bg-white p-2 text-sm shadow-xl"
      >
        @if (loading()) {
          <p role="status" class="p-3">Searching counterparties...</p>
        } @else if (error()) {
          <p role="alert" class="p-3 text-rose-700">
            {{ error() }} <button type="button" (click)="open()">Retry</button>
          </p>
        } @else {
          @for (item of options(); track item.id; let index = $index) {
            <button
              type="button"
              role="option"
              [id]="inputId + '-option-' + index"
              [attr.aria-selected]="selected?.id === item.id"
              [class.bg-slate-100]="highlighted() === index"
              (click)="choose(item)"
              class="block w-full rounded-lg px-3 py-2 text-left hover:bg-iris-bg"
            >
              <strong class="block text-iris-navy">{{ item.name }}</strong
              ><span class="text-xs text-iris-slate"
                >{{ item.types.join(', ') }}
                {{
                  item.legacyCompanyCode
                    ? '? ' + item.legacyCompanyCode
                    : item.legacyClientId
                      ? '? ' + item.legacyClientId
                      : ''
                }}</span
              >
            </button>
          } @empty {
            <p class="p-3 text-iris-slate">No matching counterparties.</p>
          }
          @if (hasMore()) {
            <button type="button" (click)="more()" class="w-full p-2 font-bold text-iris-teal">
              Load more counterparties
            </button>
          }
        }
      </div>
    }
    @if (search.value && !selected && !expanded()) {
      <p class="mt-1 text-xs text-iris-slate">Select a result to apply the counterparty.</p>
    }
  </div>`,
})
export class CounterpartyAutocompleteComponent implements OnChanges {
  private readonly service = inject(CounterpartiesService);
  private readonly destroy = inject(DestroyRef);
  private pendingTextChange = false;
  private readonly requests = new Subject<{ search: string; page: number } | null>();
  private page = 1;
  private static nextId = 0;
  @Input() inputId = 'counterparty-search-' + CounterpartyAutocompleteComponent.nextId++;
  @Input() resetKey = 0;
  @Input() label = 'Counterparty';
  @Input() selected: CounterpartyListItem | null = null;
  @Input() activeOnly = false;
  @Output() readonly selectionChange = new EventEmitter<CounterpartyListItem | null>();
  readonly search = new FormControl('', { nonNullable: true });
  readonly options = signal<CounterpartyListItem[]>([]);
  readonly loading = signal(false);
  readonly error = signal('');
  readonly expanded = signal(false);
  readonly highlighted = signal(0);
  readonly hasMore = signal(false);
  constructor() {
    this.search.valueChanges.pipe(takeUntilDestroyed(this.destroy)).subscribe((value) => {
      this.pendingTextChange = true;
      this.selected = null;
      this.selectionChange.emit(null);
      this.expanded.set(true);
      this.options.set([]);
      this.page = 1;
      this.requests.next({ search: value.trim(), page: 1 });
    });
    // switchMap cancels both the debounce timer and any obsolete HTTP request immediately.
    this.requests
      .pipe(
        switchMap((query) => {
          if(!query){this.loading.set(false);return of(null);}
          this.loading.set(true);
          this.error.set('');
          this.highlighted.set(0);
          return timer(300).pipe(
            switchMap(() =>
              this.service.getCounterparties({
                search: query.search,
                pageNumber: query.page,
                pageSize: 20,
                ...(this.activeOnly ? { isActive: true } : {}),
              }),
            ),
            catchError(() => {
              this.error.set('Counterparties could not be loaded.');
              return of(null);
            }),
          );
        }),
        takeUntilDestroyed(this.destroy),
      )
      .subscribe((response) => {
        this.loading.set(false);
        if (response) {
          this.options.set(
            this.page === 1 ? response.items : [...this.options(), ...response.items],
          );
          this.hasMore.set(response.pageNumber < response.totalPages);
        } else {
          this.options.set([]);
          this.hasMore.set(false);
        }
      });
  }
  ngOnChanges(changes: SimpleChanges): void {
    if (changes['resetKey'] && !changes['resetKey'].firstChange) {
      this.pendingTextChange = false;
      this.search.setValue('', { emitEvent: false });
      this.expanded.set(false);
      this.requests.next(null);
    } else if (this.pendingTextChange && !this.selected) {
      this.pendingTextChange = false;
    } else this.search.setValue(this.selected?.name ?? '', { emitEvent: false });
  }
  open(): void {
    this.expanded.set(true);
    this.page = 1;
    this.requests.next({ search: this.selected ? '' : this.search.value.trim(), page: 1 });
  }
  more(): void {
    if (this.loading() || !this.hasMore()) return;
    this.page++;
    this.requests.next({ search: this.selected ? '' : this.search.value.trim(), page: this.page });
  }
  choose(item: CounterpartyListItem): void {
    this.pendingTextChange = false;
    this.selected = item;
    this.search.setValue(item.name, { emitEvent: false });
    this.expanded.set(false);
    this.selectionChange.emit(item);
  }
  clear(): void {
    this.search.setValue('');
  }
  onFocusOut(event: FocusEvent): void {
    if (!(event.currentTarget as HTMLElement).contains(event.relatedTarget as Node | null))
      this.expanded.set(false);
  }
  keydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      this.expanded.set(false);
      event.preventDefault();
      return;
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!this.expanded()) {
        this.open();
        return;
      }
      this.highlighted.update((i) =>
        Math.max(0, Math.min(this.options().length - 1, i + (event.key === 'ArrowDown' ? 1 : -1))),
      );
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      if (this.expanded() && this.options()[this.highlighted()])
        this.choose(this.options()[this.highlighted()]);
    }
  }
}
