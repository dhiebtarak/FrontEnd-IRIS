import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { CounterpartiesService } from './counterparties.service';

describe('CounterpartiesService', () => {
  let service: CounterpartiesService;
  let httpTesting: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()]
    });

    service = TestBed.inject(CounterpartiesService);
    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpTesting.verify());

  it('sends only Swagger-supported list query parameters', () => {
    service.getCounterparties({
      pageNumber: 2,
      pageSize: 50,
      search: 'atlas',
      type: 'Cedent',
      status: 'Active',
      isActive: true
    }).subscribe();

    const request = httpTesting.expectOne(req => req.url === 'http://localhost:5151/api/counterparties');

    expect(request.request.method).toBe('GET');
    expect(request.request.params.get('pageNumber')).toBe('2');
    expect(request.request.params.get('pageSize')).toBe('50');
    expect(request.request.params.get('search')).toBe('atlas');
    expect(request.request.params.get('type')).toBe('Cedent');
    expect(request.request.params.get('status')).toBe('Active');
    expect(request.request.params.get('isActive')).toBe('true');

    request.flush({ items: [], pageNumber: 2, pageSize: 50, totalCount: 0, totalPages: 0 });
  });

  it('maps Finance counterparty bank-account status from exact backend JSON properties', () => {
    service.getFinanceCounterparties({ pageNumber: 1, pageSize: 50 }).subscribe(response => {
      expect(response.items).toEqual([
        {
          id: 22,
          name: 'Ami',
          status: 'Active',
          hasActiveBankAccount: true,
          activeBankAccountCount: 1
        },
        {
          id: 23,
          name: 'Inactive Only',
          status: 'Active',
          hasActiveBankAccount: false,
          activeBankAccountCount: 0
        }
      ]);
    });

    const request = httpTesting.expectOne(req => req.url === 'http://localhost:5151/api/counterparties');
    expect(request.request.method).toBe('GET');

    request.flush({
      items: [
        {
          id: 22,
          name: 'Ami',
          status: 'Active',
          hasActiveBankAccount: true,
          activeBankAccountCount: 1
        },
        {
          id: 23,
          name: 'Inactive Only',
          status: 'Active',
          hasActiveBankAccount: false,
          activeBankAccountCount: 0
        }
      ],
      pageNumber: 1,
      pageSize: 50,
      totalCount: 2,
      totalPages: 1
    });
  });

  it('does not treat a missing Finance bank-account status property as false', () => {
    let message = '';

    service.getFinanceCounterparties({ pageNumber: 1, pageSize: 50 }).subscribe({
      error: error => {
        message = error instanceof Error ? error.message : '';
      }
    });

    const request = httpTesting.expectOne(req => req.url === 'http://localhost:5151/api/counterparties');
    request.flush({
      items: [
        {
          id: 22,
          name: 'Ami',
          status: 'Active',
          activeBankAccountCount: 1
        }
      ],
      pageNumber: 1,
      pageSize: 50,
      totalCount: 1,
      totalPages: 1
    });

    expect(message).toBe('Counterparty bank-account status is unavailable from the backend response.');
  });
});
