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
});
