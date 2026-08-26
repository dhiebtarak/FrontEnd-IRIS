import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { ContractsService } from '../../shared/services/contracts.service';
import { ContractsListComponent } from './contracts-list.component';

describe('ContractsListComponent', () => {
  let fixture: ComponentFixture<ContractsListComponent>;
  let contractsService: Pick<ContractsService, 'getContractTypes' | 'getCurrencies' | 'searchCedents'>;

  beforeEach(async () => {
    contractsService = {
      getContractTypes: vi.fn().mockReturnValue(of([
        { code: 'FAC', name: 'Facultative', description: '', categoryTags: [], isImplemented: true }
      ])),
      getCurrencies: vi.fn().mockReturnValue(of([
        { id: 1, code: 'USD', name: 'US Dollar', symbol: '$', decimalPlaces: 2, isDefault: true }
      ])),
      searchCedents: vi.fn().mockReturnValue(of({
        items: [{ id: 8, name: 'Atlas Cedent', country: null, city: null }],
        pageNumber: 1,
        pageSize: 50,
        totalCount: 1,
        totalPages: 1
      }))
    };

    await TestBed.configureTestingModule({
      imports: [ContractsListComponent],
      providers: [
        provideRouter([]),
        { provide: ContractsService, useValue: contractsService }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(ContractsListComponent);
    fixture.detectChanges();
  });

  it('loads existing reference APIs for contract filters', () => {
    expect(contractsService.getContractTypes).toHaveBeenCalledOnce();
    expect(contractsService.getCurrencies).toHaveBeenCalledOnce();
    expect(contractsService.searchCedents).toHaveBeenCalledWith(null, 1, 50);
  });

  it('shows an honest unavailable state instead of placeholder contracts', () => {
    expect(fixture.nativeElement.textContent).toContain('Portfolio data source required');
    expect(fixture.nativeElement.querySelectorAll('tbody tr')).toHaveLength(0);
  });
});
