import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { ToastrService } from 'ngx-toastr';
import { CounterpartiesService } from '../../shared/services/counterparties.service';
import { CounterpartyListComponent } from './counterparty-list.component';

describe('CounterpartyListComponent', () => {
  let fixture: ComponentFixture<CounterpartyListComponent>;
  let counterpartiesService: Pick<CounterpartiesService, 'getCounterparties' | 'updateCounterpartyStatus'>;

  beforeEach(async () => {
    counterpartiesService = {
      getCounterparties: vi.fn().mockReturnValue(of({
        items: [
          {
            id: 7,
            legacyClientId: null,
            legacyCompanyCode: 'CED-7',
            name: 'Atlas Re',
            types: ['Cedent', 'Reinsurer'],
            email: 'atlas@example.com',
            status: 'Active',
            isActive: true
          }
        ],
        pageNumber: 1,
        pageSize: 25,
        totalCount: 1,
        totalPages: 1
      })),
      updateCounterpartyStatus: vi.fn().mockReturnValue(of(''))
    };

    await TestBed.configureTestingModule({
      imports: [CounterpartyListComponent],
      providers: [
        provideRouter([]),
        { provide: CounterpartiesService, useValue: counterpartiesService },
        { provide: ToastrService, useValue: { success: vi.fn(), error: vi.fn() } }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(CounterpartyListComponent);
    fixture.detectChanges();
  });

  it('loads the first server-side page with URL-backed filter defaults', () => {
    expect(counterpartiesService.getCounterparties).toHaveBeenCalledWith({
      pageNumber: 1,
      pageSize: 25,
      search: '',
      type: '',
      status: ''
    });
  });

  it('renders backend counterparty records in the responsive directory', () => {
    expect(fixture.nativeElement.textContent).toContain('Atlas Re');
    expect(fixture.nativeElement.textContent).toContain('CED-7');
    expect(fixture.nativeElement.textContent).toContain('Cedent');
    expect(fixture.nativeElement.textContent).toContain('Reinsurer');
    expect(fixture.nativeElement.textContent).toContain('Partner');
  });
});
